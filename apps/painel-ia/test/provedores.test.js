import test from 'node:test';
import assert from 'node:assert/strict';
import { buscarAnthropic, buscarCopilot, montarPainelAgentes, calcularCustoPorToken } from '../src/provedores.js';

test('Anthropic Admin API: agrega uso e custo real sem vazar a chave', async () => {
  const segredo = 'chave-sintetica-teste-anthropic';
  const fetchMock = async (url, opts) => {
    assert.equal(opts.headers['x-api-key'], segredo);
    if (String(url).includes('usage_report')) {
      return {
        ok: true,
        json: async () => ({
          data: [{
            results: [
              { uncached_input_tokens: 1000, cache_creation: { ephemeral_5m_input_tokens: 2000, ephemeral_1h_input_tokens: 0 }, cache_read_input_tokens: 50000, output_tokens: 500 },
            ],
          }],
        }),
      };
    }
    return {
      ok: true,
      json: async () => ({
        data: [{ results: [{ amount: '1.25', currency: 'USD' }] }],
      }),
    };
  };

  const res = await buscarAnthropic({ apiKey: segredo, fetchImpl: fetchMock, agora: () => Date.parse('2026-11-24T15:00:00Z') });
  assert.equal(res.ativo, true);
  assert.equal(res.fonte, 'provedor');
  assert.equal(res.semana.custoUsd, 1.25);
  assert.equal(res.semana.cache_read, 50000);
  assert.ok(!JSON.stringify(res).includes(segredo), 'chave nunca vaza na resposta');
});

test('GitHub Copilot API: le billing de org sem vazar token', async () => {
  const token = 'token-sintetico-teste-github';
  const fetchMock = async (url, opts) => {
    assert.equal(opts.headers.Authorization, `Bearer ${token}`);
    if (String(url).includes('/copilot/billing')) {
      return { ok: true, json: async () => ({ seat_breakdown: { active_this_cycle: 1, total: 1 } }) };
    }
    return { ok: true, json: async () => ([{ date: '2026-11-24', total_active_users: 1, total_engaged_users: 1 }]) };
  };

  const res = await buscarCopilot({ token, org: 'minha-org', fetchImpl: fetchMock });
  assert.equal(res.ativo, true);
  assert.equal(res.fonte, 'provedor');
  assert.equal(res.semana.ativos, 1);
  assert.ok(!JSON.stringify(res).includes(token), 'token nunca vaza na resposta');
});

test('painelAgentes calcula % da sessao e % da semana por Code Agent e custo por token rotulado', () => {
  const estado = {
    janelas: {
      'claude-code': { sessao5h: 250_000, semana7d: 4_000_000 },
      antigravity: { sessao5h: 500_000, semana7d: 2_000_000 },
    },
    sessoes: [
      { id: 's1', agente: 'claude-code', ativa: true, equivalente: 250_000, ultimo: 2000 },
      { id: 'agy:c1', agente: 'antigravity', ativa: true, equivalente: 500_000, ultimo: 2000 },
    ],
    porSemana: [
      {
        semana: '2026-W48',
        agentes: {
          'claude-code': { equivalente: 4_000_000, requisicoes: 100 },
          antigravity: { equivalente: 2_000_000, requisicoes: 50 },
        },
      },
    ],
    modelos: [
      { nome: 'claude-opus-5-5', input: 1000, cache_write: 100_000, cache_read: 1_000_000, output: 10_000, equivalente: 351_000 },
      { nome: 'gemini-4-neon-medium', input: 200_000, cache_write: 0, cache_read: 1_000_000, output: 20_000, equivalente: 400_000 },
    ],
  };

  const cotas = {
    'claude-code': { sessao: 1_000_000, semana: 10_000_000 },
    antigravity: { sessao: 1_000_000, semana: 10_000_000 },
    copilot: { sessao: 1_000_000, semana: 10_000_000 },
  };

  const paineis = montarPainelAgentes(estado, cotas, {});
  assert.equal(paineis.length, 3);
  const cc = paineis.find((p) => p.agente === 'claude-code');
  const agy = paineis.find((p) => p.agente === 'antigravity');
  assert.equal(cc.sessao.pct, 25);
  assert.equal(cc.semana.pct, 40);
  assert.equal(agy.sessao.pct, 50);
  assert.equal(agy.semana.pct, 20);

  const custos = calcularCustoPorToken(estado.modelos, {});
  assert.equal(custos.length, 2);
  assert.equal(custos[0].rotulo, 'estimativa de referência');
  assert.ok(custos[0].totalUsd > 0);
  assert.ok(custos[0].efetivoPorMilhaoUsd > 0);
});
