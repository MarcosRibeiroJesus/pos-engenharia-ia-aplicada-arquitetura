import { describe, it, expect, vi } from 'vitest';
import { GetRecommendationsUseCase } from '../../src/serving/src/application/get-recommendations.use-case';
import { IRecommendationExplainer } from '../../src/serving/src/application/recommendation-explainer';
import { buildServer } from '../../src/serving/src/presentation/server';

const batchRepo = {
  getBatchCandidates: vi.fn().mockResolvedValue([
    { itemId: 'SKU-1', score: 0.8, rank: 1, title: 'Fone', priceCents: 1000, category: 'Audio' },
    { itemId: 'SKU-2', score: 0.6, rank: 2, title: 'Capa', priceCents: 500, category: 'Acessorios' },
  ]),
};
const vectorRepo = {
  searchBySession: vi.fn().mockResolvedValue([{ itemId: 'SKU-1', vectorScore: 0.9, title: 'Fone', priceCents: 1000 }]),
};
const scoringClient = {
  scoreCandidates: vi.fn().mockResolvedValue([
    { itemId: 'SKU-1', score: 0.95 },
    { itemId: 'SKU-2', score: 0.7 },
  ]),
};

function useCaseWith(explainer: IRecommendationExplainer) {
  return new GetRecommendationsUseCase({ batchRepo, vectorRepo, scoringClient, explainer });
}

describe('Explicações no fluxo de recomendação', () => {
  it('sem explain=true não chama o Claude e mantém o caminho de 60 ms', async () => {
    const explainer = { explain: vi.fn() };
    const res = await useCaseWith(explainer).execute({ userId: 'u-1', limit: 2 });
    expect(explainer.explain).not.toHaveBeenCalled();
    expect(res.explanation.status).toBe('not_requested');
    expect(res.recommendations[0].explanation).toBeUndefined();
  });

  it('com explain=true anexa a explicação a cada item, com proveniência', async () => {
    const explainer: IRecommendationExplainer = {
      explain: vi.fn().mockResolvedValue({
        status: 'ok',
        attempts: 1,
        modelId: 'anthropic.claude-haiku-5-5',
        explanations: [
          { itemId: 'SKU-1', reason: 'Combina com o seu histórico e com itens parecidos.', signals: ['purchase_history', 'similar_items'], source: 'claude' },
          { itemId: 'SKU-2', reason: 'Clientes com histórico parecido com o seu compraram.', signals: ['purchase_history'], source: 'claude' },
        ],
      }),
    };
    const res = await useCaseWith(explainer).execute({ userId: 'u-1', limit: 2, explain: true, sessionItemIds: ['SKU-9'] });

    expect(res.explanation).toMatchObject({ status: 'ok', modelId: 'anthropic.claude-haiku-5-5', attempts: 1 });
    expect(res.recommendations[0].explanation).toMatchObject({ source: 'claude', signals: ['purchase_history', 'similar_items'] });
    expect(res.degradedMode).toBe(false);

    const sent = (explainer.explain as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(sent.items.find((i: { itemId: string }) => i.itemId === 'SKU-1')).toMatchObject({ provenance: 'hybrid', batchScore: 0.8, vectorScore: 0.9 });
  });

  it('se a explicação falhar, a resposta sai igual, sem explicação e sem 500', async () => {
    const explainer: IRecommendationExplainer = {
      explain: vi.fn().mockResolvedValue({ status: 'unavailable', attempts: 2, errorCategory: 'validation', retryable: true, detail: 'x' }),
    };
    const res = await useCaseWith(explainer).execute({ userId: 'u-1', limit: 2, explain: true });
    expect(res.recommendations).toHaveLength(2);
    expect(res.recommendations[0].itemId).toBe('SKU-1');
    expect(res.recommendations.every((r) => r.explanation === undefined)).toBe(true);
    expect(res.explanation).toMatchObject({ status: 'unavailable', reason: 'validation' });
    // Explicação é enriquecimento opcional: não marca a recomendação como degradada.
    expect(res.degradedMode).toBe(false);
  });

  it('mesmo se o explainer lançar exceção, a API responde 200', async () => {
    const explainer: IRecommendationExplainer = { explain: vi.fn().mockRejectedValue(new Error('boom')) };
    const app = buildServer({ recommendationUseCase: useCaseWith(explainer) });
    const res = await app.inject({ method: 'GET', url: '/v1/recommendations?userId=u-1&limit=2&explain=true' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.explanation.status).toBe('unavailable');
    expect(body.explanation.reason).toBe('internal_error');
    await app.close();
  });

  it('o controller repassa explain=true e rejeita valor inválido', async () => {
    const useCase = { execute: vi.fn().mockResolvedValue({ requestId: 'r', userId: 'u-1', timestamp: '', degradedMode: false, executionDurationMs: 1, recommendations: [], explanation: { status: 'not_requested' } }) };
    const app = buildServer({ recommendationUseCase: useCase });
    await app.inject({ method: 'GET', url: '/v1/recommendations?userId=u-1&explain=true' });
    expect(useCase.execute.mock.calls[0][0].explain).toBe(true);
    const bad = await app.inject({ method: 'GET', url: '/v1/recommendations?userId=u-1&explain=talvez' });
    expect(bad.statusCode).toBe(400);
    await app.close();
  });
});
