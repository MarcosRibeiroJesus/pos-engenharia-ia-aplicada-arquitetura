import { describe, it, expect, vi } from 'vitest';
import type Redis from 'ioredis';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { GetRecommendationsUseCase } from '../../src/serving/src/application/get-recommendations.use-case';
import { DynamoDbBatchCandidateRepository } from '../../src/serving/src/infrastructure/dynamodb/dynamodb-batch-candidate.repository';
import { MemoryDbVectorCandidateRepository } from '../../src/serving/src/infrastructure/memorydb/memorydb-vector-candidate.repository';
import { IMemoryDbVectorRepository } from '../../src/serving/src/infrastructure/memorydb/memorydb-vector-candidate.repository';
import { ISageMakerScoringClient } from '../../src/serving/src/infrastructure/sagemaker/sagemaker-scoring.client';
import { ICloudWatchMetricsPublisher } from '../../src/serving/src/infrastructure/monitoring/cloudwatch-metrics';
import { DependencyError, isValidationError } from '../../src/serving/src/domain/dependency-error';
import { InvalidUserIdError } from '../../src/serving/src/domain/candidate';
import { InvalidCategoryError } from '../../src/serving/src/domain/category';
import { RecommendationController } from '../../src/serving/src/presentation/controllers/recommendation.controller';

// VT-05 e VT-06 (T073, RF-106, RF-006, E4, ADR-0011): a falha de dependência chega ao caso de uso.
// Aqui os adaptadores são os reais; só os clientes de baixo nível (DynamoDB `send` e Redis `call`)
// são simulados. "Sem dados" continua lista vazia, sem degradação, e erro de validação não conta
// como queda do MemoryDB.

const vector = new Float32Array(128).fill(0.1);

function dynamoWith(send: ReturnType<typeof vi.fn>) {
  return new DynamoDbBatchCandidateRepository({ send } as unknown as DynamoDBDocumentClient, 'tabela-teste');
}

// T072 (RF-105): a busca vetorial só roda com sessão; o pipeline simulado devolve o vetor `v` de
// cada item da sessão, para o FT.SEARCH (o `call`) ser o ponto da falha ou da resposta.
const sessionVector = Buffer.from(new Float32Array(128).fill(0.1).buffer);
const session = ['SESSAO-1'];

function redisWith(call: ReturnType<typeof vi.fn>) {
  const pipeline = () => {
    const p = { hgetBuffer: () => p, exec: async () => [[null, sessionVector]] };
    return p;
  };
  return new MemoryDbVectorCandidateRepository({ call, pipeline } as unknown as Redis);
}

function metrics(): ICloudWatchMetricsPublisher & Record<string, ReturnType<typeof vi.fn>> {
  return {
    publishDegradedMode: vi.fn().mockResolvedValue(undefined),
    publishSageMakerFallback: vi.fn().mockResolvedValue(undefined),
    publishMemoryDbFallback: vi.fn().mockResolvedValue(undefined),
    publishDynamoDbFallback: vi.fn().mockResolvedValue(undefined),
  };
}

const scoring: ISageMakerScoringClient = {
  scoreCandidates: vi.fn().mockImplementation(async (input: { candidates: { itemId: string }[] }) =>
    input.candidates.map((c, i) => ({ itemId: c.itemId, score: 1 - i / 100 }))
  ),
};

const dynamoItem = {
  Item: {
    userId: 'u-1',
    recommendations: [
      { itemId: 'BATCH-1', score: 0.9, rank: 1, title: 'Lote 1' },
      { itemId: 'BATCH-2', score: 0.8, rank: 2, title: 'Lote 2' },
    ],
  },
};

const redisReply = [1, 'item:VEC-1', ['vector_score', '0.1', 'cat', 'Livros', 'inStock', 'true']];

describe('DependencyError: adaptadores reais lançam a falha com dependência, categoria e retentável', () => {
  it('DynamoDB: send que lança vira DependencyError indisponivel e retentável', async () => {
    const repo = dynamoWith(vi.fn().mockRejectedValue(new Error('ServiceUnavailable')));

    const err = await repo.getBatchCandidates('u-1').catch((e: unknown) => e);

    expect(err).toBeInstanceOf(DependencyError);
    expect(err).toMatchObject({ dependencia: 'dynamodb', categoria: 'indisponivel', retentavel: true });
  });

  it('DependencyError preserva a causa original e a mensagem não leva o userId (achado A1 da revisão da T073)', async () => {
    const original = new Error('ServiceUnavailable');
    const repo = dynamoWith(vi.fn().mockRejectedValue(original));

    const err = await repo.getBatchCandidates('usuario-sintetico-42').catch((e: unknown) => e);

    expect(err).toBeInstanceOf(DependencyError);
    expect((err as Error).cause).toBe(original);
    expect((err as Error).message).not.toContain('usuario-sintetico-42');
  });

  it('DynamoDB: userId fora do padrão vira erro de validação estruturado, sem eco e sem chamar o cliente (achado A2)', async () => {
    const send = vi.fn().mockResolvedValue(dynamoItem);
    const repo = dynamoWith(send);

    const err = await repo.getBatchCandidates('mal$formado}').catch((e: unknown) => e);

    expect(err).toBeInstanceOf(InvalidUserIdError);
    expect(err).not.toBeInstanceOf(DependencyError);
    expect(err).toMatchObject({ categoria: 'validacao', retentavel: false });
    expect(isValidationError(err)).toBe(true);
    expect((err as Error).message).toContain('userId');
    expect((err as Error).message).not.toContain('mal$formado}');
    expect(send).not.toHaveBeenCalled();
  });

  it('DynamoDB: userId inválido repetido não abre o disjuntor', async () => {
    const send = vi.fn().mockResolvedValue(dynamoItem);
    const repo = dynamoWith(send);

    for (let i = 0; i < 10; i++) {
      await repo.getBatchCandidates('mal formado').catch(() => undefined);
    }

    await expect(repo.getBatchCandidates('u-1')).resolves.toHaveLength(2);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('DynamoDB: send que não responde em 20 ms vira DependencyError timeout', async () => {
    const repo = dynamoWith(vi.fn().mockImplementation(() => new Promise(() => undefined)));

    const err = await repo.getBatchCandidates('u-1').catch((e: unknown) => e);

    expect(err).toMatchObject({ dependencia: 'dynamodb', categoria: 'timeout', retentavel: true });
  });

  it('DynamoDB: item ausente continua lista vazia, sem erro', async () => {
    const repo = dynamoWith(vi.fn().mockResolvedValue({}));

    await expect(repo.getBatchCandidates('u-1')).resolves.toEqual([]);
  });

  it('MemoryDB: call que lança vira DependencyError indisponivel e retentável', async () => {
    const repo = redisWith(vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    const err = await repo.searchSimilarItems(vector, undefined, 10).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(DependencyError);
    expect(err).toMatchObject({ dependencia: 'memorydb', categoria: 'indisponivel', retentavel: true });
  });

  it('MemoryDB: resposta sem documentos continua lista vazia, sem erro', async () => {
    const repo = redisWith(vi.fn().mockResolvedValue([0]));

    await expect(repo.searchSimilarItems(vector, undefined, 10)).resolves.toEqual([]);
  });

  it.each(['dynamodb', 'memorydb'] as const)('%s: o disjuntor conta a falha propagada e abre, sem chamar mais o cliente', async (dependencia) => {
    // Um repositório por vez, chamado várias vezes, para o disjuntor ver a sequência de falhas.
    const send = vi.fn().mockRejectedValue(new Error('fora do ar'));
    const fire =
      dependencia === 'dynamodb'
        ? ((r) => () => r.getBatchCandidates('u-1'))(dynamoWith(send))
        : ((r) => () => r.searchSimilarItems(vector, undefined, 10))(redisWith(send));

    const errors: unknown[] = [];
    for (let i = 0; i < 8; i++) {
      errors.push(await fire().catch((e: unknown) => e));
    }

    const callsWhenOpen = send.mock.calls.length;
    expect(callsWhenOpen).toBeLessThan(8);
    expect(errors.at(-1)).toMatchObject({ dependencia, categoria: 'circuito_aberto', retentavel: false });
  });
});

describe('VT-05: DynamoDB real fora do ar no caso de uso', () => {
  it('devolve resposta com degradedMode true e publica DynamoDbFallbackCount', async () => {
    const m = metrics();
    const useCase = new GetRecommendationsUseCase({
      batchRepo: dynamoWith(vi.fn().mockRejectedValue(new Error('ServiceUnavailable'))),
      vectorRepo: redisWith(vi.fn().mockResolvedValue(redisReply)),
      scoringClient: scoring,
      metricsPublisher: m,
    });

    const response = await useCase.execute({ userId: 'u-1', limit: 5, sessionItemIds: session });

    expect(response.degradedMode).toBe(true);
    expect(m.publishDynamoDbFallback).toHaveBeenCalledTimes(1);
    expect(m.publishMemoryDbFallback).not.toHaveBeenCalled();
    expect(response.recommendations.map((r) => r.itemId)).toEqual(['VEC-1']);
  });

  it('item ausente no DynamoDB não liga a degradação nem publica a métrica de queda', async () => {
    const m = metrics();
    const useCase = new GetRecommendationsUseCase({
      batchRepo: dynamoWith(vi.fn().mockResolvedValue({})),
      vectorRepo: redisWith(vi.fn().mockResolvedValue(redisReply)),
      scoringClient: scoring,
      metricsPublisher: m,
    });

    const response = await useCase.execute({ userId: 'u-1', limit: 5, sessionItemIds: session });

    expect(response.degradedMode).toBe(false);
    expect(m.publishDynamoDbFallback).not.toHaveBeenCalled();
    expect(m.publishDegradedMode).not.toHaveBeenCalled();
  });
});

describe('VT-06: MemoryDB real fora do ar no caso de uso', () => {
  it('devolve resposta com degradedMode true e publica MemoryDbFallbackCount', async () => {
    const m = metrics();
    const useCase = new GetRecommendationsUseCase({
      batchRepo: dynamoWith(vi.fn().mockResolvedValue(dynamoItem)),
      vectorRepo: redisWith(vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))),
      scoringClient: scoring,
      metricsPublisher: m,
    });

    const response = await useCase.execute({ userId: 'u-1', limit: 5, sessionItemIds: session });

    expect(response.degradedMode).toBe(true);
    expect(m.publishMemoryDbFallback).toHaveBeenCalledTimes(1);
    expect(m.publishDynamoDbFallback).not.toHaveBeenCalled();
    expect(response.recommendations.every((r) => r.provenance === 'batch')).toBe(true);
  });

  it('busca vetorial sem documentos não liga a degradação', async () => {
    const m = metrics();
    const useCase = new GetRecommendationsUseCase({
      batchRepo: dynamoWith(vi.fn().mockResolvedValue(dynamoItem)),
      vectorRepo: redisWith(vi.fn().mockResolvedValue([0])),
      scoringClient: scoring,
      metricsPublisher: m,
    });

    const response = await useCase.execute({ userId: 'u-1', limit: 5, sessionItemIds: session });

    expect(response.degradedMode).toBe(false);
    expect(m.publishMemoryDbFallback).not.toHaveBeenCalled();
  });
});

describe('Erro de validação não é queda do MemoryDB (nota da revisão da T070)', () => {
  it('InvalidCategoryError do repositório real sai do caso de uso sem degradação nem métrica de queda', async () => {
    const m = metrics();
    const call = vi.fn().mockResolvedValue(redisReply);
    const useCase = new GetRecommendationsUseCase({
      batchRepo: dynamoWith(vi.fn().mockResolvedValue(dynamoItem)),
      vectorRepo: redisWith(call),
      scoringClient: scoring,
      metricsPublisher: m,
    });

    const err = await useCase.execute({ userId: 'u-1', limit: 5, category: 'bad}', sessionItemIds: session }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(InvalidCategoryError);
    expect(err).toMatchObject({ categoria: 'validacao', retentavel: false });
    expect(call).not.toHaveBeenCalled();
    expect(m.publishMemoryDbFallback).not.toHaveBeenCalled();
    expect(m.publishDegradedMode).not.toHaveBeenCalled();
  });

  it('erros de validação repetidos não abrem o disjuntor do MemoryDB', async () => {
    const call = vi.fn().mockResolvedValue(redisReply);
    const repo = redisWith(call);

    for (let i = 0; i < 10; i++) {
      await repo.searchSimilarItems(vector, 'bad}', 10).catch(() => undefined);
    }

    await expect(repo.searchSimilarItems(vector, 'Livros', 10)).resolves.toHaveLength(1);
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('o controlador responde 400 (nunca 500) quando o caso de uso propaga erro de validação', async () => {
    const vectorRepo: IMemoryDbVectorRepository = {
      searchBySession: vi.fn().mockRejectedValue(new InvalidCategoryError()),
    };
    const useCase = new GetRecommendationsUseCase({
      batchRepo: dynamoWith(vi.fn().mockResolvedValue(dynamoItem)),
      vectorRepo,
      scoringClient: scoring,
    });
    const controller = new RecommendationController(useCase);
    const reply = { status: vi.fn(), send: vi.fn() };
    reply.status.mockReturnValue(reply);

    await controller.getRecommendations(
      { query: { userId: 'u-1', category: 'Livros', sessionItemIds: 'SESSAO-1' }, id: 'req-1' } as never,
      reply as never
    );

    expect(reply.status).toHaveBeenCalledWith(400);
    expect(reply.send.mock.calls[0][0]).toMatchObject({ error: 'Bad Request' });
  });
});
