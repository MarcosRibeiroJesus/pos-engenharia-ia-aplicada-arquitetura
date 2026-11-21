import { randomUUID } from 'crypto';
import { RecommendedItem, LimitSchema, UserIdSchema, MergedCandidate } from '../domain/candidate';
import { IDynamoDbBatchRepository } from '../infrastructure/dynamodb/dynamodb-batch-candidate.repository';
import { IMemoryDbVectorRepository } from '../infrastructure/memorydb/memorydb-vector-candidate.repository';
import { ISageMakerScoringClient } from '../infrastructure/sagemaker/sagemaker-scoring.client';
import { ICuratedFallbackProvider, CuratedFallbackProvider } from '../infrastructure/fallback/curated-fallback.provider';
import { ICloudWatchMetricsPublisher } from '../infrastructure/monitoring/cloudwatch-metrics';
import { IInventoryEligibilityRepository } from '../infrastructure/cache/inventory-eligibility.repository';
import { BusinessFilterEngine } from './business-filter-engine';
import { OutOfStockFilterRule, RecentPurchaseSuppressionRule } from '../domain/filter-rule';
import { mergeCandidates } from './candidate-merger';
import { SageMakerReranker } from './reranker';
import { HeuristicReranker } from './heuristic-reranker';
import { baseLogger, StageTimer } from '../infrastructure/logging/logger';
import { IRecommendationExplainer, ExplanationOutcome } from './recommendation-explainer';

export interface RecommendationRequestParams {
  userId: string;
  limit?: number;
  category?: string;
  sessionItemIds?: string[];
  userCountry?: string;
  requestId?: string;
  /** Pede a explicação com Claude. Fora do SLO de 60 ms (ADR-0004). */
  explain?: boolean;
}

export type ExplanationSummary =
  | { status: 'not_requested' }
  | { status: 'ok'; modelId: string; attempts: number }
  | { status: 'unavailable'; reason: string; attempts: number };

export interface RecommendationResponse {
  requestId: string;
  userId: string;
  timestamp: string;
  degradedMode: boolean;
  executionDurationMs: number;
  recommendations: RecommendedItem[];
  explanation: ExplanationSummary;
}

export interface IGetRecommendationsUseCase {
  execute(params: RecommendationRequestParams): Promise<RecommendationResponse>;
}

export interface UseCaseDependencies {
  batchRepo: IDynamoDbBatchRepository;
  vectorRepo: IMemoryDbVectorRepository;
  scoringClient: ISageMakerScoringClient;
  fallbackProvider?: ICuratedFallbackProvider;
  metricsPublisher?: ICloudWatchMetricsPublisher;
  filterEngine?: BusinessFilterEngine;
  inventoryRepo?: IInventoryEligibilityRepository;
  explainer?: IRecommendationExplainer;
}

export class GetRecommendationsUseCase implements IGetRecommendationsUseCase {
  private batchRepo: IDynamoDbBatchRepository;
  private vectorRepo: IMemoryDbVectorRepository;
  private reranker: SageMakerReranker;
  private fallbackProvider: ICuratedFallbackProvider;
  private metricsPublisher?: ICloudWatchMetricsPublisher;
  private filterEngine: BusinessFilterEngine;
  private inventoryRepo?: IInventoryEligibilityRepository;
  private explainer?: IRecommendationExplainer;

  constructor(deps: UseCaseDependencies) {
    this.batchRepo = deps.batchRepo;
    this.vectorRepo = deps.vectorRepo;
    this.reranker = new SageMakerReranker(deps.scoringClient);
    this.fallbackProvider = deps.fallbackProvider || new CuratedFallbackProvider();
    this.metricsPublisher = deps.metricsPublisher;
    this.filterEngine =
      deps.filterEngine ||
      new BusinessFilterEngine([
        new OutOfStockFilterRule(),
        new RecentPurchaseSuppressionRule(),
      ]);
    this.inventoryRepo = deps.inventoryRepo;
    this.explainer = deps.explainer;
  }

  public async execute(params: RecommendationRequestParams): Promise<RecommendationResponse> {
    const startTime = process.hrtime.bigint();
    const requestId = params.requestId || `req-${randomUUID()}`;
    const logger = baseLogger.child({ requestId, userId: params.userId });

    // 1. Validation
    UserIdSchema.parse(params.userId);
    const limit = LimitSchema.parse(params.limit ?? 10);

    let degradedMode = false;

    // 2. Parallel candidate retrieval
    const retrievalTimer = new StageTimer(logger, 'parallel-retrieval');
    const [batchResult, vectorResult] = await Promise.allSettled([
      this.batchRepo.getBatchCandidates(params.userId),
      this.vectorRepo.searchSimilarItems(new Float32Array(128), params.category, 50),
    ]);

    const batchCandidates = batchResult.status === 'fulfilled' ? batchResult.value : [];
    const vectorCandidates = vectorResult.status === 'fulfilled' ? vectorResult.value : [];

    if (batchResult.status === 'rejected') {
      degradedMode = true;
      void this.metricsPublisher?.publishDynamoDbFallback();
      logger.warn({ err: batchResult.reason }, 'DynamoDB batch candidate retrieval failed');
    }

    if (vectorResult.status === 'rejected') {
      degradedMode = true;
      void this.metricsPublisher?.publishMemoryDbFallback();
      logger.warn({ err: vectorResult.reason }, 'MemoryDB vector search failed');
    }

    retrievalTimer.end({
      batchCount: batchCandidates.length,
      vectorCount: vectorCandidates.length,
      degradedMode,
    });

    // 3. Candidate Merging & Deduplication
    const mergeTimer = new StageTimer(logger, 'candidate-merging');
    const mergedCandidates = mergeCandidates(batchCandidates, vectorCandidates);
    mergeTimer.end({ mergedCount: mergedCandidates.length });

    // 4. Inventory lookup & Business Filtering
    const filterTimer = new StageTimer(logger, 'business-filtering');
    let filteredCandidates: MergedCandidate[] = mergedCandidates;

    if (this.inventoryRepo && mergedCandidates.length > 0) {
      const itemIds = mergedCandidates.map((c) => c.itemId);
      const [stockMap, recentPurchases] = await Promise.all([
        this.inventoryRepo.checkStock(itemIds),
        this.inventoryRepo.getRecentPurchases(params.userId),
      ]);

      // Enrich candidates with real-time stock status
      for (const candidate of mergedCandidates) {
        if (stockMap.has(candidate.itemId)) {
          candidate.inStock = stockMap.get(candidate.itemId);
        }
      }

      const filterResult = this.filterEngine.filter(mergedCandidates, {
        userId: params.userId,
        userCountry: params.userCountry,
        recentPurchases,
      });
      filteredCandidates = filterResult.candidates;
    } else {
      const filterResult = this.filterEngine.filter(mergedCandidates, {
        userId: params.userId,
        userCountry: params.userCountry,
      });
      filteredCandidates = filterResult.candidates;
    }
    filterTimer.end({
      beforeCount: mergedCandidates.length,
      afterCount: filteredCandidates.length,
    });

    let recommendations: RecommendedItem[] = [];

    // Complete downstream outage or empty filtered candidate check
    if (filteredCandidates.length === 0) {
      degradedMode = true;
      void this.metricsPublisher?.publishDegradedMode();
      logger.warn('Eligible candidate pool is empty; triggering curated fallback provider');
      recommendations = this.fallbackProvider.getFallbackRecommendations(limit);
    } else {
      // 5. ML Reranking via SageMaker (with Graceful Degradation)
      const rerankTimer = new StageTimer(logger, 'sagemaker-reranking');
      try {
        recommendations = await this.reranker.rerank({
          userId: params.userId,
          candidates: filteredCandidates,
          limit,
          sessionItemIds: params.sessionItemIds,
        });
      } catch (error) {
        degradedMode = true;
        void this.metricsPublisher?.publishSageMakerFallback();
        void this.metricsPublisher?.publishDegradedMode();
        logger.warn(
          { error },
          'SageMaker scoring unavailable or timed out; activating weighted heuristic fallback'
        );

        // Fallback to weighted heuristic reranker: (0.6 * batch) + (0.4 * vector)
        recommendations = HeuristicReranker.rerank(filteredCandidates, limit);
      }
      rerankTimer.end({ finalCount: recommendations.length });
    }

    if (degradedMode) {
      void this.metricsPublisher?.publishDegradedMode();
    }

    // 6. Explicação com Claude (opcional). Falha aqui nunca derruba a recomendação.
    let explanation: ExplanationSummary = { status: 'not_requested' };
    if (params.explain) {
      const explainTimer = new StageTimer(logger, 'claude-explanation');
      const evidence = new Map(filteredCandidates.map((c) => [c.itemId, c]));
      let outcome: ExplanationOutcome;
      if (!this.explainer) {
        outcome = { status: 'unavailable', attempts: 0, errorCategory: 'internal_error', retryable: false, detail: 'explicações desligadas' };
      } else {
        try {
          outcome = await this.explainer.explain({
            userId: params.userId,
            sessionItemIds: params.sessionItemIds,
            items: recommendations.map((r) => {
              const c = evidence.get(r.itemId);
              return {
                itemId: r.itemId,
                title: r.title,
                category: r.category,
                provenance: r.provenance,
                batchScore: c?.batchScore,
                vectorScore: c?.vectorScore,
              };
            }),
          });
        } catch (err) {
          logger.error({ err }, 'Explainer lançou exceção; respondendo sem explicação');
          outcome = { status: 'unavailable', attempts: 0, errorCategory: 'internal_error', retryable: false, detail: String(err) };
        }
      }

      if (outcome.status === 'ok') {
        const byId = new Map(outcome.explanations.map((e) => [e.itemId, e]));
        recommendations = recommendations.map((r) => {
          const e = byId.get(r.itemId);
          return e ? { ...r, explanation: { reason: e.reason, signals: e.signals, source: e.source } } : r;
        });
        explanation = { status: 'ok', modelId: outcome.modelId, attempts: outcome.attempts };
      } else {
        logger.warn({ category: outcome.errorCategory, detail: outcome.detail }, 'Explicação indisponível; resposta segue sem explicação');
        explanation = { status: 'unavailable', reason: outcome.errorCategory, attempts: outcome.attempts };
      }
      explainTimer.end({ status: explanation.status });
    }

    const endTime = process.hrtime.bigint();
    const executionDurationMs = Math.round(Number(endTime - startTime) / 1_000_000);

    return {
      requestId,
      userId: params.userId,
      timestamp: new Date().toISOString(),
      degradedMode,
      executionDurationMs,
      recommendations,
      explanation,
    };
  }
}
