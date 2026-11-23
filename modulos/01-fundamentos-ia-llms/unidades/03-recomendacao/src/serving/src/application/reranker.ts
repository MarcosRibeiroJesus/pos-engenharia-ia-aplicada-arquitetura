import { MergedCandidate, RecommendedItem } from '../domain/candidate';
import { ISageMakerScoringClient } from '../infrastructure/sagemaker/sagemaker-scoring.client';

export interface RerankOptions {
  userId: string;
  candidates: MergedCandidate[];
  limit: number;
  sessionItemIds?: string[];
}

export class SageMakerReranker {
  private scoringClient: ISageMakerScoringClient;

  constructor(scoringClient: ISageMakerScoringClient) {
    this.scoringClient = scoringClient;
  }

  public async rerank(options: RerankOptions): Promise<RecommendedItem[]> {
    return (await this.rerankWithModel(options)).items;
  }

  /** Como `rerank`, mais o `modelId` que ranqueou (quando o cliente informa), para o log do estágio. */
  public async rerankWithModel(options: RerankOptions): Promise<{ items: RecommendedItem[]; modelId?: string }> {
    const { userId, candidates, limit, sessionItemIds } = options;

    if (!candidates || candidates.length === 0) {
      return { items: [] };
    }

    const candidateInputs = candidates.map((c) => ({
      itemId: c.itemId,
      initialScore: c.initialCombinedScore,
      provenance: c.provenance === 'fallback' ? 'batch' : c.provenance,
      // Features do re-ranker (ADR-0008): o cliente monta o CSV a partir destes dois scores.
      batchScore: c.batchScore,
      vectorScore: c.vectorScore,
      category: c.category,
      priceCents: c.priceCents,
    }));

    const request = {
      userId,
      sessionContext: sessionItemIds ? { recentItemIds: sessionItemIds } : undefined,
      candidates: candidateInputs,
    };
    let predictions: { itemId: string; score: number }[];
    let modelId: string | undefined;
    if (this.scoringClient.score) {
      const response = await this.scoringClient.score(request);
      predictions = response.predictions;
      modelId = response.modelId;
    } else {
      predictions = await this.scoringClient.scoreCandidates(request);
    }

    const predictionMap = new Map<string, number>();
    for (const pred of predictions) {
      predictionMap.set(pred.itemId, pred.score);
    }

    // Join with metadata and assign scores
    const scoredCandidates = candidates.map((c) => {
      const modelScore = predictionMap.get(c.itemId) ?? c.initialCombinedScore;
      return {
        ...c,
        finalScore: modelScore,
      };
    });

    // Sort descending by finalScore
    scoredCandidates.sort((a, b) => b.finalScore - a.finalScore);

    // Truncate to limit and map to RecommendedItem
    const topN = scoredCandidates.slice(0, limit);

    const items = topN.map((item, index) => ({
      itemId: item.itemId,
      rank: index + 1,
      score: item.finalScore,
      provenance: item.provenance,
      title: item.title || `Product ${item.itemId}`,
      priceCents: item.priceCents ?? 0,
      category: item.category,
    }));
    return { items, modelId };
  }
}
