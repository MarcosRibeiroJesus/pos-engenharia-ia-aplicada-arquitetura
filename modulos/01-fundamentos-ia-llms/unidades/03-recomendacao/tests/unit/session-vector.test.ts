import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import type Redis from 'ioredis';
import { MemoryDbVectorCandidateRepository } from '../../src/serving/src/infrastructure/memorydb/memorydb-vector-candidate.repository';
import { GetRecommendationsUseCase } from '../../src/serving/src/application/get-recommendations.use-case';
import { IDynamoDbBatchRepository } from '../../src/serving/src/infrastructure/dynamodb/dynamodb-batch-candidate.repository';
import { ISageMakerScoringClient } from '../../src/serving/src/infrastructure/sagemaker/sagemaker-scoring.client';
import { ICloudWatchMetricsPublisher } from '../../src/serving/src/infrastructure/monitoring/cloudwatch-metrics';
import { InvalidSessionItemsError, MAX_SESSION_ITEMS } from '../../src/serving/src/domain/session';
import { DependencyError } from '../../src/serving/src/domain/dependency-error';
import { buildServer } from '../../src/serving/src/presentation/server';

// VT-04 (T072, RF-105, E5, ADR-0011): o vetor da busca em tempo real vem dos itens da sessão.
// Um pipeline `HGET item:<id> v` lê os vetores; a consulta usa a média normalizada em L2; id
// ausente é ignorado; sem sessão ou sem nenhum vetor, o FT.SEARCH não roda e não há degradação.
// Leitura e busca rodam sob o mesmo disjuntor de 15 ms. Só o cliente Redis é simulado.

const DIM = 128;

function vec(values: Record<number, number>): Buffer {
  const f = new Float32Array(DIM);
  for (const [i, v] of Object.entries(values)) f[Number(i)] = v;
  return Buffer.from(f.buffer);
}

function decode(buf: Buffer): number[] {
  const out: number[] = [];
  for (let i = 0; i < buf.byteLength / 4; i++) out.push(buf.readFloatLE(i * 4));
  return out;
}

interface FakeOptions {
  vectors?: Record<string, Buffer | null>;
  callReply?: unknown;
  execDelayMs?: number;
  callDelayMs?: number;
  execError?: Error;
}

function fakeRedis(opts: FakeOptions = {}) {
  const pipelines: Array<Array<[string, string]>> = [];
  const pipeline = vi.fn(() => {
    const ops: Array<[string, string]> = [];
    pipelines.push(ops);
    interface FakePipeline {
      hgetBuffer: (key: string, field: string) => FakePipeline;
      exec: () => Promise<Array<[Error | null, Buffer | null]>>;
    }
    const p: FakePipeline = {
      hgetBuffer: vi.fn((key: string, field: string): FakePipeline => {
        ops.push([key, field]);
        return p;
      }),
      exec: vi.fn(async (): Promise<Array<[Error | null, Buffer | null]>> => {
        if (opts.execDelayMs) await new Promise((r) => setTimeout(r, opts.execDelayMs));
        return ops.map(([key]) => {
          if (opts.execError) return [opts.execError, null];
          return [null, opts.vectors?.[key.replace(/^item:/, '')] ?? null];
        });
      }),
    };
    return p;
  });
  const call = vi.fn(async (..._args: unknown[]) => {
    if (opts.callDelayMs) await new Promise((r) => setTimeout(r, opts.callDelayMs));
    return opts.callReply ?? [1, 'item:VEC-1', ['vector_score', '0.1']];
  });
  return { redis: { pipeline, call } as unknown as Redis, pipeline, call, pipelines };
}

function metrics(): ICloudWatchMetricsPublisher & Record<string, ReturnType<typeof vi.fn>> {
  return {
    publishDegradedMode: vi.fn().mockResolvedValue(undefined),
    publishSageMakerFallback: vi.fn().mockResolvedValue(undefined),
    publishMemoryDbFallback: vi.fn().mockResolvedValue(undefined),
    publishDynamoDbFallback: vi.fn().mockResolvedValue(undefined),
  };
}

const batchRepo: IDynamoDbBatchRepository = {
  getBatchCandidates: vi.fn().mockResolvedValue([{ itemId: 'BATCH-1', score: 0.9, rank: 1, title: 'Lote 1', priceCents: 100 }]),
};

const scoring: ISageMakerScoringClient = {
  scoreCandidates: vi.fn().mockImplementation(async (input: { candidates: { itemId: string }[] }) =>
    input.candidates.map((c, i) => ({ itemId: c.itemId, score: 1 - i / 100 }))
  ),
};

describe('VT-04: repositório do MemoryDB deriva o vetor da consulta dos itens da sessão', () => {
  it('com dois ids faz um único pipeline HGET item:<id> v e consulta com a média normalizada em L2', async () => {
    const { redis, pipeline, pipelines, call } = fakeRedis({ vectors: { A: vec({ 0: 3 }), B: vec({ 1: 3 }) } });
    const repo = new MemoryDbVectorCandidateRepository(redis);

    const result = await repo.searchBySession(['A', 'B'], undefined, 10);

    expect(pipeline).toHaveBeenCalledTimes(1);
    expect(pipelines[0]).toEqual([
      ['item:A', 'v'],
      ['item:B', 'v'],
    ]);
    expect(call).toHaveBeenCalledTimes(1);
    const sent = decode(call.mock.calls[0][6] as unknown as Buffer);
    expect(sent).toHaveLength(DIM);
    expect(sent[0]).toBeCloseTo(Math.SQRT1_2, 6);
    expect(sent[1]).toBeCloseTo(Math.SQRT1_2, 6);
    expect(sent.slice(2).every((x) => x === 0)).toBe(true);
    expect(Math.hypot(...sent)).toBeCloseTo(1, 6);
    expect(result.map((c) => c.itemId)).toEqual(['VEC-1']);
  });

  it('id ausente no MemoryDB é ignorado na média', async () => {
    const { redis, call } = fakeRedis({ vectors: { A: vec({ 0: 1 }), B: vec({ 1: 1 }) } });
    const repo = new MemoryDbVectorCandidateRepository(redis);

    await repo.searchBySession(['A', 'NAO-EXISTE', 'B'], undefined, 10);

    const sent = decode(call.mock.calls[0][6] as unknown as Buffer);
    expect(sent[0]).toBeCloseTo(Math.SQRT1_2, 6);
    expect(sent[1]).toBeCloseTo(Math.SQRT1_2, 6);
  });

  it('vetor com tamanho diferente de 128 floats é ignorado como ausente', async () => {
    const { redis, call } = fakeRedis({ vectors: { A: vec({ 2: 5 }), B: Buffer.alloc(12) } });
    const repo = new MemoryDbVectorCandidateRepository(redis);

    await repo.searchBySession(['A', 'B'], undefined, 10);

    const sent = decode(call.mock.calls[0][6] as unknown as Buffer);
    expect(sent[2]).toBeCloseTo(1, 6);
  });

  it.each([
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
  ])('vetor com %s é ignorado como ausente', async (_nome, bad) => {
    const { redis, call } = fakeRedis({ vectors: { A: vec({ 2: 5 }), B: vec({ 0: 1, 3: bad }) } });
    const repo = new MemoryDbVectorCandidateRepository(redis);

    await repo.searchBySession(['A', 'B'], undefined, 10);

    const sent = decode(call.mock.calls[0][6] as unknown as Buffer);
    expect(sent.every((x) => Number.isFinite(x))).toBe(true);
    expect(sent[2]).toBeCloseTo(1, 6);
    expect(sent[0]).toBe(0);
  });

  it('ids repetidos: um HGET por id distinto e o mesmo vetor de [A, B]', async () => {
    const vectors = { A: vec({ 0: 1 }), B: vec({ 1: 3 }) };
    const dup = fakeRedis({ vectors });
    const ref = fakeRedis({ vectors });

    await new MemoryDbVectorCandidateRepository(dup.redis).searchBySession(['A', 'A', 'B'], undefined, 10);
    await new MemoryDbVectorCandidateRepository(ref.redis).searchBySession(['A', 'B'], undefined, 10);

    expect(dup.pipeline).toHaveBeenCalledTimes(1);
    expect(dup.pipelines[0]).toEqual([
      ['item:A', 'v'],
      ['item:B', 'v'],
    ]);
    const sentDup = decode(dup.call.mock.calls[0][6] as unknown as Buffer);
    const sentRef = decode(ref.call.mock.calls[0][6] as unknown as Buffer);
    expect(sentDup).toEqual(sentRef);
  });

  it('sem nenhum vetor encontrado o FT.SEARCH não roda e devolve lista vazia', async () => {
    const { redis, pipeline, call } = fakeRedis({ vectors: {} });
    const repo = new MemoryDbVectorCandidateRepository(redis);

    await expect(repo.searchBySession(['X', 'Y'], undefined, 10)).resolves.toEqual([]);
    expect(pipeline).toHaveBeenCalledTimes(1);
    expect(call).not.toHaveBeenCalled();
  });

  it('vetores que se anulam (norma zero) não viram consulta', async () => {
    const { redis, call } = fakeRedis({ vectors: { A: vec({ 0: 1 }), B: vec({ 0: -1 }) } });
    const repo = new MemoryDbVectorCandidateRepository(redis);

    await expect(repo.searchBySession(['A', 'B'], undefined, 10)).resolves.toEqual([]);
    expect(call).not.toHaveBeenCalled();
  });

  it.each([
    ['mais de 10 ids', Array.from({ length: MAX_SESSION_ITEMS + 1 }, (_, i) => `S-${i}`)],
    ['id fora do padrão do userId', ['A', 'item:x}']],
    ['id vazio', ['']],
  ])('%s: erro de validação estruturado, sem eco da entrada e sem chamar o Redis', async (_nome, ids) => {
    const { redis, pipeline, call } = fakeRedis();
    const repo = new MemoryDbVectorCandidateRepository(redis);

    const err = await repo.searchBySession(ids, undefined, 10).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(InvalidSessionItemsError);
    expect(err).toMatchObject({ categoria: 'validacao', retentavel: false });
    expect((err as Error).message).not.toContain('item:x}');
    expect(pipeline).not.toHaveBeenCalled();
    expect(call).not.toHaveBeenCalled();
  });

  it('erro de uma entrada do pipeline vira DependencyError do memorydb', async () => {
    const { redis, call } = fakeRedis({ execError: new Error('READONLY') });
    const repo = new MemoryDbVectorCandidateRepository(redis);

    const err = await repo.searchBySession(['A'], undefined, 10).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(DependencyError);
    expect(err).toMatchObject({ dependencia: 'memorydb', categoria: 'indisponivel' });
    expect(call).not.toHaveBeenCalled();
  });

  it('leitura e busca dividem o orçamento de 15 ms: 10 ms + 10 ms estoura o disjuntor', async () => {
    const { redis } = fakeRedis({ vectors: { A: vec({ 0: 1 }) }, execDelayMs: 10, callDelayMs: 10 });
    const repo = new MemoryDbVectorCandidateRepository(redis);

    const err = await repo.searchBySession(['A'], undefined, 10).catch((e: unknown) => e);

    expect(err).toMatchObject({ dependencia: 'memorydb', categoria: 'timeout' });
  });
});

describe('VT-04: caso de uso usa a sessão e não consulta com vetor nulo', () => {
  it('sem sessionItemIds o repositório vetorial não é chamado e degradedMode fica false', async () => {
    const m = metrics();
    const { redis, pipeline, call } = fakeRedis();
    const vectorRepo = new MemoryDbVectorCandidateRepository(redis);
    const searchBySession = vi.spyOn(vectorRepo, 'searchBySession');
    const useCase = new GetRecommendationsUseCase({ batchRepo, vectorRepo, scoringClient: scoring, metricsPublisher: m });

    const response = await useCase.execute({ userId: 'u-1', limit: 5 });
    const emptySession = await useCase.execute({ userId: 'u-1', limit: 5, sessionItemIds: [] });

    expect(searchBySession).not.toHaveBeenCalled();
    expect(emptySession.degradedMode).toBe(false);
    expect(pipeline).not.toHaveBeenCalled();
    expect(call).not.toHaveBeenCalled();
    expect(response.degradedMode).toBe(false);
    expect(m.publishMemoryDbFallback).not.toHaveBeenCalled();
    expect(response.recommendations.every((r) => r.provenance === 'batch')).toBe(true);
  });

  it('sessão sem nenhum vetor: FT.SEARCH não roda e degradedMode fica false', async () => {
    const m = metrics();
    const { redis, call } = fakeRedis({ vectors: {} });
    const useCase = new GetRecommendationsUseCase({
      batchRepo,
      vectorRepo: new MemoryDbVectorCandidateRepository(redis),
      scoringClient: scoring,
      metricsPublisher: m,
    });

    const response = await useCase.execute({ userId: 'u-1', limit: 5, sessionItemIds: ['X'] });

    expect(call).not.toHaveBeenCalled();
    expect(response.degradedMode).toBe(false);
    expect(m.publishMemoryDbFallback).not.toHaveBeenCalled();
    expect(m.publishDegradedMode).not.toHaveBeenCalled();
  });

  it('com dois itens da sessão o vetor enviado é diferente de zero e entra candidato realtime', async () => {
    const { redis, call } = fakeRedis({ vectors: { A: vec({ 0: 1 }), B: vec({ 5: 1 }) } });
    const useCase = new GetRecommendationsUseCase({
      batchRepo,
      vectorRepo: new MemoryDbVectorCandidateRepository(redis),
      scoringClient: scoring,
    });

    const response = await useCase.execute({ userId: 'u-1', limit: 5, sessionItemIds: ['A', 'B'] });

    const sent = decode(call.mock.calls[0][6] as unknown as Buffer);
    expect(sent.some((x) => x !== 0)).toBe(true);
    expect(response.recommendations.find((r) => r.itemId === 'VEC-1')?.provenance).toBe('realtime');
  });

  it('o vetor de zeros `new Float32Array(128)` saiu do caso de uso', () => {
    const source = readFileSync(
      path.resolve(__dirname, '../../src/serving/src/application/get-recommendations.use-case.ts'),
      'utf8'
    );
    expect(source).not.toContain('new Float32Array(128)');
  });
});

describe('VT-04: controlador recusa sessionItemIds fora do limite com 400', () => {
  function appWith() {
    const searchBySession = vi.fn().mockResolvedValue([]);
    const getBatchCandidates = vi.fn().mockResolvedValue([{ itemId: 'B-1', score: 0.9, rank: 1, title: 'x', priceCents: 1 }]);
    const app = buildServer({
      recommendationUseCase: new GetRecommendationsUseCase({
        batchRepo: { getBatchCandidates },
        vectorRepo: { searchBySession },
        scoringClient: scoring,
      }),
    });
    return { app, searchBySession, getBatchCandidates };
  }

  it.each([
    ['11 ids', Array.from({ length: 11 }, (_, i) => `S-${i}`).join(',')],
    ['id com caractere fora do padrão', 'A,b$c'],
    ['id com chave', 'A,x}'],
  ])('%s: 400 sem chamar repositório e sem eco da entrada', async (_nome, raw) => {
    const { app, searchBySession, getBatchCandidates } = appWith();

    const res = await app.inject({
      method: 'GET',
      url: `/v1/recommendations?userId=u-1&sessionItemIds=${encodeURIComponent(raw)}`,
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Bad Request');
    expect(body.message).toContain('sessionItemIds');
    expect(body.message).not.toContain('b$c');
    expect(body.message).not.toContain('x}');
    expect(searchBySession).not.toHaveBeenCalled();
    expect(getBatchCandidates).not.toHaveBeenCalled();
    await app.close();
  });

  it('10 ids no padrão passam e chegam ao repositório na ordem', async () => {
    const { app, searchBySession } = appWith();
    const ids = Array.from({ length: 10 }, (_, i) => `S-${i}`);

    const res = await app.inject({ method: 'GET', url: `/v1/recommendations?userId=u-1&sessionItemIds=${ids.join(',')}` });

    expect(res.statusCode).toBe(200);
    expect(searchBySession).toHaveBeenCalledTimes(1);
    expect(searchBySession.mock.calls[0][0]).toEqual(ids);
  });
});
