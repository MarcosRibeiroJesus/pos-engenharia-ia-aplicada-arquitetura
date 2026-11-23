import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildServer } from '../../src/serving/src/presentation/server';
import {
  IGetRecommendationsUseCase,
  GetRecommendationsUseCase,
} from '../../src/serving/src/application/get-recommendations.use-case';
import { IDynamoDbBatchRepository } from '../../src/serving/src/infrastructure/dynamodb/dynamodb-batch-candidate.repository';
import { IMemoryDbVectorRepository } from '../../src/serving/src/infrastructure/memorydb/memorydb-vector-candidate.repository';
import { ISageMakerScoringClient } from '../../src/serving/src/infrastructure/sagemaker/sagemaker-scoring.client';

describe('Recommendations API Contract Tests (OpenAPI 3.0)', () => {
  let app: FastifyInstance;

  const mockUseCase: IGetRecommendationsUseCase = {
    execute: async (params) => {
      return {
        requestId: params.requestId,
        userId: params.userId,
        timestamp: new Date().toISOString(),
        degradedMode: false,
        executionDurationMs: 35,
        recommendations: [
          {
            itemId: 'SKU-1001',
            rank: 1,
            score: 0.95,
            provenance: 'hybrid',
            title: 'Wireless Headphones',
            priceCents: 9999,
            category: 'Electronics',
          },
        ],
      };
    },
  };

  beforeAll(async () => {
    app = buildServer({ recommendationUseCase: mockUseCase });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should accept valid userId and limit and return 200 with RecommendationResponse schema', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/recommendations?userId=u-12345&limit=10',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);

    expect(body).toHaveProperty('requestId');
    expect(body.userId).toBe('u-12345');
    expect(body).toHaveProperty('timestamp');
    expect(body.degradedMode).toBe(false);
    expect(typeof body.executionDurationMs).toBe('number');
    expect(Array.isArray(body.recommendations)).toBe(true);

    const firstItem = body.recommendations[0];
    expect(firstItem).toMatchObject({
      itemId: 'SKU-1001',
      rank: 1,
      provenance: 'hybrid',
      title: 'Wireless Headphones',
      priceCents: 9999,
    });
    expect(['batch', 'realtime', 'hybrid', 'fallback']).toContain(firstItem.provenance);
  });

  it('should return 400 Bad Request if userId contains invalid characters (violates regex pattern)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/recommendations?userId=invalid$user*id',
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Bad Request');
    expect(body).toHaveProperty('message');
    expect(body).toHaveProperty('requestId');
  });

  it('should return 400 Bad Request if userId parameter is missing', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/recommendations',
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Bad Request');
  });

  it('should return 400 Bad Request if limit exceeds 50', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/recommendations?userId=u-12345&limit=100',
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Bad Request');
  });

  it('should return 400 Bad Request if limit is less than 1', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/recommendations?userId=u-12345&limit=0',
    });

    expect(res.statusCode).toBe(400);
  });

  // VT-01 (T070, RNF-104, ADR-0011): a `category` entra na expressão `(@cat:{...})` do RediSearch.
  // Fora de ^[A-Za-z0-9_]{1,40}$ a API responde 400 antes de qualquer chamada, e o repositório
  // vetorial nunca é acionado. O caso de uso aqui é o real, com repositórios simulados.
  describe('VT-01: category validada por lista de caracteres permitidos', () => {
    let guardedApp: FastifyInstance;
    // T072 (RF-105): a interface do repositório passou a ser a busca pela sessão.
    const searchBySession = vi.fn().mockResolvedValue([]);
    const getBatchCandidates = vi.fn().mockResolvedValue([
      { itemId: 'BATCH-1', score: 0.9, rank: 1, title: 'Item 1', priceCents: 1500 },
    ]);

    beforeAll(async () => {
      const vectorRepo: IMemoryDbVectorRepository = { searchBySession };
      const batchRepo: IDynamoDbBatchRepository = { getBatchCandidates };
      const scoringClient: ISageMakerScoringClient = {
        scoreCandidates: vi.fn().mockImplementation(async (input) =>
          input.candidates.map((c: { itemId: string }) => ({ itemId: c.itemId, score: 0.9 }))
        ),
      };
      guardedApp = buildServer({
        recommendationUseCase: new GetRecommendationsUseCase({ batchRepo, vectorRepo, scoringClient }),
      });
      await guardedApp.ready();
    });

    afterAll(async () => {
      await guardedApp.close();
    });

    beforeEach(() => {
      searchBySession.mockClear();
      getBatchCandidates.mockClear();
    });

    const forbidden: Array<[string, string]> = [
      ['chave de fechamento', 'Electronics}'],
      ['barra vertical', 'Books|Electronics'],
      ['asterisco', '*'],
      ['arroba', '@cat'],
      ['parêntese de fechamento', 'Electronics)'],
      ['espaço', 'Home Garden'],
      ['41 caracteres', 'A'.repeat(41)],
      ['quebra de linha antes de }', 'Electronics\n}'],
      ['quebra de linha no fim', 'a\n'],
      ['valor vazio', ''],
    ];

    it.each(forbidden)('rejeita category com %s: 400 com error, message e requestId, sem chamar o repositório', async (_nome, category) => {
      const res = await guardedApp.inject({
        method: 'GET',
        // Com sessão, o caso de uso chamaria o repositório: a asserção abaixo pode reprovar (T072).
        url: `/v1/recommendations?userId=u-12345&category=${encodeURIComponent(category)}&sessionItemIds=SKU-1`,
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('Bad Request');
      expect(typeof body.message).toBe('string');
      expect(body.message).toContain('category');
      expect(body).toHaveProperty('requestId');
      expect(searchBySession).not.toHaveBeenCalled();
      expect(getBatchCandidates).not.toHaveBeenCalled();
    });

    it('aceita category no padrão (40 caracteres com dígito e sublinhado) e a repassa ao repositório', async () => {
      const category = `Home_Garden_2${'x'.repeat(27)}`;
      expect(category).toHaveLength(40);

      const res = await guardedApp.inject({
        method: 'GET',
        url: `/v1/recommendations?userId=u-12345&category=${category}&sessionItemIds=SKU-1`,
      });

      expect(res.statusCode).toBe(200);
      expect(searchBySession).toHaveBeenCalledTimes(1);
      expect(searchBySession.mock.calls[0][1]).toBe(category);
    });
  });
});
