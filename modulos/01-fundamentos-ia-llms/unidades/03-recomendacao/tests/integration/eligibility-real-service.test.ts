import { describe, it, expect, vi } from 'vitest';
import type Redis from 'ioredis';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { buildDefaultUseCase, buildServer } from '../../src/serving/src/presentation/server';
import { GetRecommendationsUseCase } from '../../src/serving/src/application/get-recommendations.use-case';
import { DynamoDbBatchCandidateRepository } from '../../src/serving/src/infrastructure/dynamodb/dynamodb-batch-candidate.repository';
import { ISageMakerScoringClient } from '../../src/serving/src/infrastructure/sagemaker/sagemaker-scoring.client';
import { ICloudWatchMetricsPublisher } from '../../src/serving/src/infrastructure/monitoring/cloudwatch-metrics';
import { IInventoryEligibilityRepository } from '../../src/serving/src/infrastructure/cache/inventory-eligibility.repository';
import { InvalidUserIdError } from '../../src/serving/src/domain/candidate';
import { BatchDataEligibilityRepository } from '../../src/serving/src/infrastructure/cache/inventory-eligibility.repository';
import { baseLogger } from '../../src/serving/src/infrastructure/logging/logger';

// VT-07 e VT-08 (T074, RF-104, RF-004, RF-006, E7, ADR-0012): a regra dos 30 dias e o estoque
// valem no serviço montado para produção (`buildDefaultUseCase`). Só os clientes de baixo nível
// (DynamoDB `send`, Redis `call`/`pipeline`) e o re-ranker são simulados. Compras e estoque vêm do
// lote, no mesmo GetItem e no mesmo FT.SEARCH: nenhuma chamada nova no caminho de 60 ms. O frescor
// é o do lote (diário).

const DAY_S = 86_400;
const nowS = () => Math.floor(Date.now() / 1000);

const sessionVector = Buffer.from(new Float32Array(128).fill(0.1).buffer);

function redisWith(call: ReturnType<typeof vi.fn>) {
  const pipeline = vi.fn(() => {
    const p = { hgetBuffer: () => p, exec: async () => [[null, sessionVector]] };
    return p;
  });
  return { redis: { call, pipeline } as unknown as Redis, pipeline };
}

function metrics(): ICloudWatchMetricsPublisher & Record<string, ReturnType<typeof vi.fn>> {
  return {
    publishDegradedMode: vi.fn().mockResolvedValue(undefined),
    publishSageMakerFallback: vi.fn().mockResolvedValue(undefined),
    publishMemoryDbFallback: vi.fn().mockResolvedValue(undefined),
    publishDynamoDbFallback: vi.fn().mockResolvedValue(undefined),
  };
}

const scoringClient: ISageMakerScoringClient = {
  scoreCandidates: vi.fn().mockImplementation(async (input: { candidates: { itemId: string }[] }) =>
    // O re-ranker daria a maior nota justamente aos inelegíveis, se eles chegassem até ele.
    input.candidates.map((c) => ({ itemId: c.itemId, score: c.itemId.startsWith('ELIGIVEL') ? 0.5 : 0.99 }))
  ),
};

function dynamoItem() {
  return {
    Item: {
      userId: 'u-1',
      recommendations: [
        { itemId: 'COMPRADO-10-DIAS', score: 0.99, rank: 1, title: 'Comprado', inStock: true },
        { itemId: 'SEM-ESTOQUE-LOTE', score: 0.98, rank: 2, title: 'Esgotado', inStock: false },
        { itemId: 'COMPRADO-40-DIAS', score: 0.7, rank: 3, title: 'Antigo', inStock: true },
        { itemId: 'ELIGIVEL-LOTE', score: 0.6, rank: 4, title: 'Elegível', inStock: true },
      ],
      recentPurchases: [
        { itemId: 'COMPRADO-10-DIAS', purchasedAt: nowS() - 10 * DAY_S },
        { itemId: 'COMPRADO-VETOR', purchasedAt: nowS() - 3 * DAY_S },
        { itemId: 'COMPRADO-40-DIAS', purchasedAt: nowS() - 40 * DAY_S },
      ],
    },
  };
}

const redisReply = [
  3,
  'item:SEM-ESTOQUE-VETOR',
  ['vector_score', '0.05', 'cat', 'Livros', 'inStock', 'false'],
  'item:COMPRADO-VETOR',
  ['vector_score', '0.06', 'cat', 'Livros', 'inStock', 'true'],
  'item:ELIGIVEL-VETOR',
  ['vector_score', '0.2', 'cat', 'Livros', 'inStock', 'true'],
];

function build(opts: { send?: ReturnType<typeof vi.fn>; call?: ReturnType<typeof vi.fn> } = {}) {
  const send = opts.send ?? vi.fn().mockResolvedValue(dynamoItem());
  const call = opts.call ?? vi.fn().mockResolvedValue(redisReply);
  const { redis, pipeline } = redisWith(call);
  const metricsPublisher = metrics();
  const useCase = buildDefaultUseCase({
    dynamoDocClient: { send } as unknown as DynamoDBDocumentClient,
    redis,
    scoringClient,
    metricsPublisher,
  });
  return { useCase, send, call, pipeline, metricsPublisher };
}

describe('VT-07: compras recentes e estoque do lote no serviço real (buildDefaultUseCase)', () => {
  it('item comprado há 10 dias (recentPurchases do item do DynamoDB) não aparece', async () => {
    // A3: trava a injeção do repositório de produção no buildDefaultUseCase.
    const spy = vi.spyOn(BatchDataEligibilityRepository.prototype, 'getRecentPurchases');
    const { useCase } = build();

    const res = await useCase.execute({ userId: 'u-1', sessionItemIds: ['S-1'], limit: 50 });
    const ids = res.recommendations.map((r) => r.itemId);

    expect(ids).not.toContain('COMPRADO-10-DIAS');
    expect(ids).not.toContain('COMPRADO-VETOR');
    expect(ids).toContain('COMPRADO-40-DIAS');
    expect(res.degradedMode).toBe(false);
    expect(spy).toHaveBeenCalledTimes(1);
    // Restauração explícita: `vi.restoreAllMocks` zeraria também o dublê compartilhado do re-ranker.
    spy.mockRestore();
  });

  it('item com inStock false não aparece, venha do lote ou do vetor', async () => {
    const { useCase } = build();

    const res = await useCase.execute({ userId: 'u-1', sessionItemIds: ['S-1'], limit: 50 });
    const ids = res.recommendations.map((r) => r.itemId);

    expect(ids).not.toContain('SEM-ESTOQUE-LOTE');
    expect(ids).not.toContain('SEM-ESTOQUE-VETOR');
    expect(ids).toEqual(expect.arrayContaining(['ELIGIVEL-LOTE', 'ELIGIVEL-VETOR']));
  });

  it('hybrid: se uma das fontes diz inStock false, o item não aparece', async () => {
    const item = dynamoItem();
    item.Item.recommendations.push({ itemId: 'HIBRIDO', score: 0.95, rank: 5, title: 'Híbrido', inStock: true });
    const reply = [...redisReply, 'item:HIBRIDO', ['vector_score', '0.01', 'inStock', 'false']];
    reply[0] = 4;
    const { useCase } = build({ send: vi.fn().mockResolvedValue(item), call: vi.fn().mockResolvedValue(reply) });

    const res = await useCase.execute({ userId: 'u-1', sessionItemIds: ['S-1'], limit: 50 });

    expect(res.recommendations.map((r) => r.itemId)).not.toContain('HIBRIDO');
  });

  it('nenhuma chamada nova no caminho: um GetItem, um pipeline e um FT.SEARCH', async () => {
    const { useCase, send, call, pipeline } = build();

    await useCase.execute({ userId: 'u-1', sessionItemIds: ['S-1'], limit: 50 });

    expect(send).toHaveBeenCalledTimes(1);
    expect(pipeline).toHaveBeenCalledTimes(1);
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('o adaptador do DynamoDB lê recentPurchases e inStock no mesmo GetItem', async () => {
    const send = vi.fn().mockResolvedValue(dynamoItem());
    const repo = new DynamoDbBatchCandidateRepository({ send } as unknown as DynamoDBDocumentClient, 't');

    const data = await repo.getBatchUserData('u-1');

    expect(send).toHaveBeenCalledTimes(1);
    expect(data.candidates.find((c) => c.itemId === 'SEM-ESTOQUE-LOTE')?.inStock).toBe(false);
    expect(data.recentPurchases.map((p) => p.itemId)).toEqual(['COMPRADO-10-DIAS', 'COMPRADO-VETOR', 'COMPRADO-40-DIAS']);
    // `purchasedAt` em segundos (como `generatedAt`) vira milissegundos no domínio.
    expect(data.recentPurchases[0].purchaseTimestamp).toBe(dynamoItem().Item.recentPurchases[0].purchasedAt * 1000);
  });

  it('entradas malformadas de recentPurchases são ignoradas, e a lista fica limitada a 100', async () => {
    const item = dynamoItem();
    const purchases: unknown[] = [
      { itemId: 'SEM-DATA' },
      { purchasedAt: nowS() },
      { itemId: 'DATA-TEXTO', purchasedAt: 'ontem' },
      ...Array.from({ length: 150 }, (_, i) => ({ itemId: `P-${i}`, purchasedAt: nowS() - DAY_S })),
    ];
    (item.Item as Record<string, unknown>).recentPurchases = purchases;
    const repo = new DynamoDbBatchCandidateRepository({ send: vi.fn().mockResolvedValue(item) } as unknown as DynamoDBDocumentClient, 't');

    const data = await repo.getBatchUserData('u-1');

    expect(data.recentPurchases).toHaveLength(100);
    expect(data.recentPurchases.every((p) => /^P-\d+$/.test(p.itemId))).toBe(true);
  });

  describe('A1: contrato de leitura de recentPurchases (ADR-0012, nota de 2026-11-23)', () => {
    async function parse(purchases: unknown[]) {
      const item = dynamoItem();
      (item.Item as Record<string, unknown>).recentPurchases = purchases;
      const repo = new DynamoDbBatchCandidateRepository({ send: vi.fn().mockResolvedValue(item) } as unknown as DynamoDBDocumentClient, 't');
      return repo.getBatchUserData('u-1');
    }

    it('data em texto ISO é descartada e contada', async () => {
      const data = await parse([{ itemId: 'ISO', purchasedAt: new Date().toISOString() }, { itemId: 'OK', purchasedAt: nowS() - DAY_S }]);
      expect(data.recentPurchases.map((p) => p.itemId)).toEqual(['OK']);
      expect(data.discardedPurchases).toBe(1);
    });

    it('data em milissegundos por engano é descartada e contada', async () => {
      const data = await parse([{ itemId: 'MS', purchasedAt: Date.now() - DAY_S * 1000 }]);
      expect(data.recentPurchases).toEqual([]);
      expect(data.discardedPurchases).toBe(1);
    });

    it('data no futuro (além da tolerância) é descartada; dentro da tolerância é aceita', async () => {
      const data = await parse([
        { itemId: 'FUTURO', purchasedAt: nowS() + DAY_S },
        { itemId: 'RELOGIO', purchasedAt: nowS() + 30 },
      ]);
      expect(data.recentPurchases.map((p) => p.itemId)).toEqual(['RELOGIO']);
      expect(data.discardedPurchases).toBe(1);
    });

    it('limite de 100: só as 100 primeiras válidas entram', async () => {
      const data = await parse(Array.from({ length: 101 }, (_, i) => ({ itemId: `P-${i}`, purchasedAt: nowS() - DAY_S })));
      expect(data.recentPurchases).toHaveLength(100);
      expect(data.recentPurchases[99].itemId).toBe('P-99');
      expect(data.discardedPurchases).toBe(0);
    });

    it('descarte gera log estruturado com a contagem e sem dado do usuário', async () => {
      const warn = vi.spyOn(baseLogger, 'warn');
      await parse([{ itemId: 'ITEM-SECRETO', purchasedAt: 'ontem' }]);
      expect(warn).toHaveBeenCalledTimes(1);
      const [fields] = warn.mock.calls[0] as unknown as [Record<string, unknown>];
      expect(fields).toMatchObject({ descartadas: 1 });
      expect(JSON.stringify(warn.mock.calls[0])).not.toContain('ITEM-SECRETO');
      expect(JSON.stringify(warn.mock.calls[0])).not.toContain('u-1');
      warn.mockRestore();
    });
  });

  it('item do usuário só com recentPurchases (sem recommendations) ainda suprime o vetorial', async () => {
    const send = vi.fn().mockResolvedValue({
      Item: { userId: 'u-1', recentPurchases: [{ itemId: 'COMPRADO-VETOR', purchasedAt: nowS() - DAY_S }] },
    });
    const { useCase } = build({ send });

    const res = await useCase.execute({ userId: 'u-1', sessionItemIds: ['S-1'], limit: 50 });

    expect(res.recommendations.map((r) => r.itemId)).not.toContain('COMPRADO-VETOR');
    expect(res.recommendations.map((r) => r.itemId)).toContain('ELIGIVEL-VETOR');
  });
});

describe('VT-08: falha da fonte de elegibilidade dá 200 e degradedMode, nunca 500', () => {
  it('DynamoDB fora do ar: 200, degradedMode true, segue com os vetoriais elegíveis', async () => {
    const { useCase, metricsPublisher } = build({ send: vi.fn().mockRejectedValue(new Error('ServiceUnavailable')) });
    const app = buildServer({ recommendationUseCase: useCase });

    const res = await app.inject({ method: 'GET', url: '/v1/recommendations?userId=u-1&sessionItemIds=S-1&limit=50' });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.degradedMode).toBe(true);
    const ids = body.recommendations.map((r: { itemId: string }) => r.itemId);
    expect(ids).toContain('ELIGIVEL-VETOR');
    expect(ids).not.toContain('SEM-ESTOQUE-VETOR');
    expect(metricsPublisher.publishDynamoDbFallback).toHaveBeenCalled();
    await app.close();
  });

  function useCaseWithInventory(inventoryRepo: IInventoryEligibilityRepository, m = metrics()) {
    return new GetRecommendationsUseCase({
      batchRepo: {
        getBatchCandidates: vi.fn().mockResolvedValue([
          { itemId: 'ELIGIVEL-1', score: 0.9, rank: 1, title: 'a', inStock: true },
          { itemId: 'ESGOTADO-1', score: 0.95, rank: 2, title: 'b', inStock: false },
        ]),
      },
      vectorRepo: { searchBySession: vi.fn().mockResolvedValue([]) },
      scoringClient,
      metricsPublisher: m,
      inventoryRepo,
    });
  }

  it.each(['checkStock', 'getRecentPurchases'] as const)(
    'repositório de elegibilidade lançando em %s: 200, degradedMode true, estoque do lote ainda filtra',
    async (method) => {
      const inventoryRepo: IInventoryEligibilityRepository = {
        checkStock: vi.fn().mockResolvedValue(new Map()),
        getRecentPurchases: vi.fn().mockResolvedValue([]),
      };
      (inventoryRepo[method] as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('fonte fora'));
      const m = metrics();
      const app = buildServer({ recommendationUseCase: useCaseWithInventory(inventoryRepo, m) });

      const res = await app.inject({ method: 'GET', url: '/v1/recommendations?userId=u-1' });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.degradedMode).toBe(true);
      const ids = body.recommendations.map((r: { itemId: string }) => r.itemId);
      expect(ids).toContain('ELIGIVEL-1');
      expect(ids).not.toContain('ESGOTADO-1');
      expect(m.publishDegradedMode).toHaveBeenCalled();
      await app.close();
    }
  );

  it('A2: repositório dizendo inStock true não devolve estoque a item esgotado no lote', async () => {
    const inventoryRepo: IInventoryEligibilityRepository = {
      checkStock: vi.fn().mockResolvedValue(new Map([['ESGOTADO-1', true], ['ELIGIVEL-1', true]])),
      getRecentPurchases: vi.fn().mockResolvedValue([]),
    };

    const res = await useCaseWithInventory(inventoryRepo).execute({ userId: 'u-1' });

    const ids = res.recommendations.map((r) => r.itemId);
    expect(ids).toContain('ELIGIVEL-1');
    expect(ids).not.toContain('ESGOTADO-1');
    expect(res.degradedMode).toBe(false);
  });

  it('erro de validação do repositório de elegibilidade não conta como queda (nota da T073)', async () => {
    const inventoryRepo: IInventoryEligibilityRepository = {
      checkStock: vi.fn().mockRejectedValue(new InvalidUserIdError()),
      getRecentPurchases: vi.fn().mockResolvedValue([]),
    };
    const m = metrics();

    await expect(useCaseWithInventory(inventoryRepo, m).execute({ userId: 'u-1' })).rejects.toBeInstanceOf(InvalidUserIdError);
    expect(m.publishDegradedMode).not.toHaveBeenCalled();
  });
});
