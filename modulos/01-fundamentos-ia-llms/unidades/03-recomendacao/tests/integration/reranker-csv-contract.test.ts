import { describe, it, expect, vi } from 'vitest';
import type { SageMakerRuntimeClient } from '@aws-sdk/client-sagemaker-runtime';
import { GetRecommendationsUseCase } from '../../src/serving/src/application/get-recommendations.use-case';
import { SageMakerScoringClient } from '../../src/serving/src/infrastructure/sagemaker/sagemaker-scoring.client';
import { IDynamoDbBatchRepository } from '../../src/serving/src/infrastructure/dynamodb/dynamodb-batch-candidate.repository';
import { IMemoryDbVectorRepository } from '../../src/serving/src/infrastructure/memorydb/memorydb-vector-candidate.repository';
import { StageTimer } from '../../src/serving/src/infrastructure/logging/logger';

// VT-09 (T075, RF-005, ADR-0008), ponta a ponta no caso de uso: o cliente real do re-ranker, sobre um
// runtime do SageMaker simulado. Com o contrato CSV respeitado, a ordem é a do modelo; com quantidade
// de scores diferente da de candidatos, a resposta é 200 pela heurística, com `degradedMode: true`.

function buildUseCase(responseText: string) {
  const batchRepo: IDynamoDbBatchRepository = {
    getBatchCandidates: vi.fn().mockResolvedValue([
      { itemId: 'PROD-A', score: 0.8, rank: 1, title: 'Item A', priceCents: 1000 },
      { itemId: 'PROD-B', score: 0.6, rank: 2, title: 'Item B', priceCents: 2000 },
    ]),
  };
  const vectorRepo: IMemoryDbVectorRepository = {
    searchBySession: vi.fn().mockResolvedValue([
      { itemId: 'PROD-A', vectorScore: 0.9, title: 'Item A', priceCents: 1000 },
      { itemId: 'PROD-C', vectorScore: 0.7, title: 'Item C', priceCents: 3000 },
    ]),
  };
  const send = vi.fn(async () => ({ Body: new Uint8Array(Buffer.from(responseText, 'utf-8')) }));
  const scoringClient = new SageMakerScoringClient(
    { send } as unknown as SageMakerRuntimeClient,
    'endpoint-teste',
    'xgb-teste-0001'
  );
  const metricsPublisher = {
    publishSageMakerFallback: vi.fn(),
    publishDegradedMode: vi.fn(),
    publishDynamoDbFallback: vi.fn(),
    publishMemoryDbFallback: vi.fn(),
  };
  const useCase = new GetRecommendationsUseCase({
    batchRepo,
    vectorRepo,
    scoringClient,
    metricsPublisher: metricsPublisher as never,
  });
  return { useCase, send, metricsPublisher };
}

describe('VT-09: contrato CSV do re-ranker no caso de uso', () => {
  it('com um score por candidato, a ordem vem do modelo e não há degradação', async () => {
    // Candidatos depois da junção: PROD-A (hybrid), PROD-B (batch), PROD-C (realtime).
    const { useCase, metricsPublisher } = buildUseCase('0.10\n0.95\n0.50\n');

    const res = await useCase.execute({ userId: 'u-12345', limit: 3, sessionItemIds: ['SESSAO-1'] });

    expect(res.degradedMode).toBe(false);
    expect(res.recommendations.map((r) => r.itemId)).toEqual(['PROD-B', 'PROD-C', 'PROD-A']);
    expect(res.recommendations[0].score).toBeCloseTo(0.95);
    expect(metricsPublisher.publishSageMakerFallback).not.toHaveBeenCalled();
  });

  it('com quantidade de scores diferente, cai na heurística com degradedMode: true', async () => {
    const { useCase, metricsPublisher } = buildUseCase('0.10\n0.95\n');

    const res = await useCase.execute({ userId: 'u-12345', limit: 3, sessionItemIds: ['SESSAO-1'] });

    expect(res.degradedMode).toBe(true);
    // Heurística 0,6 × batch + 0,4 × vector: A 0,84; C 0,7; B 0,6.
    expect(res.recommendations.map((r) => r.itemId)).toEqual(['PROD-A', 'PROD-C', 'PROD-B']);
    expect(res.recommendations[0].score).toBeCloseTo(0.84);
    expect(metricsPublisher.publishSageMakerFallback).toHaveBeenCalledTimes(1);
  });
});

describe('Origem do erro e modelId no log do re-ranking', () => {
  it('feature do lote fora de [0, 1] cai na heurística sem publicar o fallback do SageMaker', async () => {
    const batchRepo: IDynamoDbBatchRepository = {
      getBatchCandidates: vi.fn().mockResolvedValue([{ itemId: 'PROD-A', score: 1.5, rank: 1, title: 'Item A', priceCents: 1000 }]),
    };
    const vectorRepo: IMemoryDbVectorRepository = { searchBySession: vi.fn().mockResolvedValue([]) };
    const send = vi.fn(async () => ({ Body: new Uint8Array(Buffer.from('0.5', 'utf-8')) }));
    const metricsPublisher = {
      publishSageMakerFallback: vi.fn(),
      publishDegradedMode: vi.fn(),
      publishDynamoDbFallback: vi.fn(),
      publishMemoryDbFallback: vi.fn(),
    };
    const useCase = new GetRecommendationsUseCase({
      batchRepo,
      vectorRepo,
      scoringClient: new SageMakerScoringClient({ send } as unknown as SageMakerRuntimeClient, 'endpoint-teste', 'xgb-teste-0001'),
      metricsPublisher: metricsPublisher as never,
    });

    const res = await useCase.execute({ userId: 'u-12345', limit: 3 });

    expect(res.degradedMode).toBe(true);
    expect(res.recommendations.map((r) => r.itemId)).toEqual(['PROD-A']);
    expect(send).not.toHaveBeenCalled();
    expect(metricsPublisher.publishSageMakerFallback).not.toHaveBeenCalled();
    expect(metricsPublisher.publishDegradedMode).toHaveBeenCalled();
  });

  it('o estágio do re-ranking registra o modelId que ranqueou, sem dado do usuário', async () => {
    const end = vi.spyOn(StageTimer.prototype, 'end');
    const { useCase } = buildUseCase('0.10\n0.95\n0.50\n');

    await useCase.execute({ userId: 'u-12345', limit: 3, sessionItemIds: ['SESSAO-1'] });

    const rerankCall = end.mock.calls.find(([meta]) => (meta as { rerankerModelId?: string })?.rerankerModelId);
    expect(rerankCall?.[0]).toEqual({ finalCount: 3, rerankerModelId: 'xgb-teste-0001' });
    end.mockRestore();
  });
});
