import { SageMakerRuntimeClient, InvokeEndpointCommand } from '@aws-sdk/client-sagemaker-runtime';
import { env } from '../../config/env';
import { DependencyError } from '../../domain/dependency-error';
import { baseLogger } from '../logging/logger';
import { createCircuitBreaker } from '../resilience/circuit-breaker';

/**
 * Contrato do re-ranker (RF-005, ADR-0008): o container nativo do XGBoost 1.7-1 recebe `text/csv`,
 * sem cabeçalho, uma linha por candidato com as features nesta ordem, e devolve um score por linha,
 * na mesma ordem. O treino (T042/T043) monta o CSV com as mesmas colunas e a mesma codificação:
 * - `batchScore` e `vectorScore` em [0, 1]; fonte ausente vale 0;
 * - `hibrido` é 1 quando o candidato veio das duas fontes (`provenance = hybrid`), senão 0.
 */
export const RERANKER_FEATURES = ['batchScore', 'vectorScore', 'hibrido'] as const;

/** Candidatos por chamada (RF-005). */
export const MAX_CANDIDATES_PER_CALL = 100;

/** Casas decimais fixas das features no CSV (bytes iguais para a mesma entrada). */
const FEATURE_DECIMALS = 6;

/** Lista permitida de um score na resposta: número decimal simples, sem NaN, Infinity nem texto. */
const SCORE_PATTERN = /^[0-9]+(\.[0-9]+)?([eE][-+]?[0-9]+)?$/;

export interface ScoringCandidateInput {
  itemId: string;
  initialScore: number;
  provenance: 'batch' | 'realtime' | 'hybrid';
  batchScore?: number;
  vectorScore?: number;
  category?: string;
  priceCents?: number;
}

export interface SageMakerScoringRequest {
  userId: string;
  sessionContext?: {
    recentItemIds?: string[];
    deviceType?: 'mobile' | 'desktop' | 'tablet';
  };
  candidates: ScoringCandidateInput[];
}

export interface ScoredPrediction {
  itemId: string;
  score: number;
}

export interface SageMakerScoringResponse {
  /** Versão do artefato, vinda de `RERANKER_MODEL_VERSION` (VT-16), não do endpoint. */
  modelId: string;
  predictions: ScoredPrediction[];
}

export interface ISageMakerScoringClient {
  scoreCandidates(input: SageMakerScoringRequest): Promise<ScoredPrediction[]>;
  /** Scores com o `modelId` que ranqueou. Opcional para os dublês que só têm `scoreCandidates`. */
  score?(input: SageMakerScoringRequest): Promise<SageMakerScoringResponse>;
}

/** Erro de contrato: a mensagem não leva a resposta do endpoint nem dado do usuário. */
function contractError(motivo: string): DependencyError {
  return new DependencyError('sagemaker', 'contrato', new Error(`Contrato CSV do re-ranker violado: ${motivo}`));
}

/**
 * Feature fora do contrato vinda do próprio serviço (ex.: score do lote fora de [0, 1]). O endpoint
 * não foi chamado, então o erro tem outra origem (`feature`) e não conta como queda do SageMaker:
 * o caso de uso cai na heurística sem publicar `SageMakerFallbackCount`. Não é `validacao` (não é
 * entrada do usuário e não pode virar 400). A mensagem não leva o valor nem o item.
 */
export class InvalidRerankerFeatureError extends Error {
  public readonly categoria = 'contrato' as const;
  public readonly origem = 'feature' as const;
  public readonly retentavel = false;

  constructor() {
    super('Feature do re-ranker fora de [0, 1]');
    this.name = 'InvalidRerankerFeatureError';
  }
}

function encodeFeature(value: number | undefined): string {
  const v = value ?? 0;
  if (!Number.isFinite(v) || v < 0 || v > 1) {
    throw new InvalidRerankerFeatureError();
  }
  return v.toFixed(FEATURE_DECIMALS);
}

/** Uma linha CSV por candidato, na ordem de `RERANKER_FEATURES`. Só números saem para o endpoint. */
export function encodeCandidatesCsv(candidates: ScoringCandidateInput[]): string {
  return candidates
    .map((c) =>
      [encodeFeature(c.batchScore), encodeFeature(c.vectorScore), c.provenance === 'hybrid' ? '1' : '0'].join(',')
    )
    .join('\n');
}

/**
 * Lê um score por linha. Se o corpo vier numa linha só com vírgulas, cada valor conta como um score:
 * a separação exata do container é conferida contra o endpoint real no DM-06 (lacuna registrada).
 */
export function decodeScoresCsv(raw: string, expected: number): number[] {
  const trimmed = raw.replace(/\r/g, '').replace(/\n+$/, '');
  if (trimmed.length === 0) {
    throw contractError('resposta vazia');
  }
  let tokens = trimmed.split('\n');
  if (tokens.length === 1 && expected > 1) {
    tokens = tokens[0].split(',');
  }
  if (tokens.length !== expected) {
    throw contractError(`esperados ${expected} scores, recebidos ${tokens.length}`);
  }
  return tokens.map((token) => {
    const t = token.trim();
    if (!SCORE_PATTERN.test(t)) {
      throw contractError('score não numérico');
    }
    const score = Number(t);
    if (!Number.isFinite(score) || score < 0 || score > 1) {
      throw contractError('score fora de [0, 1]');
    }
    return score;
  });
}

export class SageMakerScoringClient implements ISageMakerScoringClient {
  private client: SageMakerRuntimeClient;
  private endpointName: string;
  private modelVersion: string;
  private breaker: ReturnType<typeof createCircuitBreaker>;

  constructor(customClient?: SageMakerRuntimeClient, endpointName?: string, modelVersion?: string) {
    this.endpointName = endpointName || env.SAGEMAKER_ENDPOINT_NAME;
    this.modelVersion = modelVersion || env.RERANKER_MODEL_VERSION;
    this.client = customClient || new SageMakerRuntimeClient({ region: env.AWS_REGION });

    this.breaker = createCircuitBreaker(
      async (candidates: ScoringCandidateInput[], csv: string) => this.invokeEndpoint(candidates, csv),
      {
        timeout: 35, // 35ms timeout deadline per spec
        errorThresholdPercentage: 20,
        resetTimeout: 10000,
        name: 'sagemaker-scoring-client',
      }
    );
  }

  private async invokeEndpoint(candidates: ScoringCandidateInput[], csv: string): Promise<ScoredPrediction[]> {
    const command = new InvokeEndpointCommand({
      EndpointName: this.endpointName,
      ContentType: 'text/csv',
      Accept: 'text/csv',
      Body: Buffer.from(csv, 'utf-8'),
    });

    const response = await this.client.send(command);
    const rawBody = response.Body ? Buffer.from(response.Body).toString('utf-8') : '';
    const scores = decodeScoresCsv(rawBody, candidates.length);

    return candidates.map((c, i) => ({ itemId: c.itemId, score: scores[i] }));
  }

  /** Scores na ordem dos candidatos, com o `modelId` da configuração (VT-16). */
  public async score(input: SageMakerScoringRequest): Promise<SageMakerScoringResponse> {
    if (!input.candidates || input.candidates.length === 0) {
      return { modelId: this.modelVersion, predictions: [] };
    }

    const bounded = input.candidates.slice(0, MAX_CANDIDATES_PER_CALL);
    // Feature inválida é erro antes do disjuntor (origem `feature`): nada sai para o endpoint e o
    // disjuntor não conta essa falha contra o SageMaker.
    let csv: string;
    try {
      csv = encodeCandidatesCsv(bounded);
    } catch (error) {
      baseLogger.warn(
        { dependencia: 'sagemaker', origem: 'feature', categoria: 'contrato', retentavel: false, candidatos: bounded.length },
        'Feature do re-ranker fora do contrato; o endpoint não foi chamado'
      );
      throw error;
    }

    try {
      const predictions = (await this.breaker.fire(bounded, csv)) as ScoredPrediction[];
      return { modelId: this.modelVersion, predictions };
    } catch (error) {
      const dependencyError = DependencyError.fromBreaker('sagemaker', error);
      // Sem userId nem conteúdo da resposta no log: só a dependência e a categoria.
      baseLogger.warn(
        {
          dependencia: dependencyError.dependencia,
          origem: 'endpoint',
          categoria: dependencyError.categoria,
          retentavel: dependencyError.retentavel,
          candidatos: bounded.length,
        },
        'Re-ranker do SageMaker falhou; o caso de uso cai na heurística'
      );
      throw dependencyError;
    }
  }

  public async scoreCandidates(input: SageMakerScoringRequest): Promise<ScoredPrediction[]> {
    return (await this.score(input)).predictions;
  }
}
