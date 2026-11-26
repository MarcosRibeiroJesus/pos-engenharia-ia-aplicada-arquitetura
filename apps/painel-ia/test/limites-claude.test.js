import test from 'node:test';
import assert from 'node:assert/strict';
import { buscarLimites, aplicarLimitesConta, lerToken } from '../src/limites-claude.js';

const TOKEN_SINTETICO = 'token-sintetico-teste-nao-real';

// Resposta gravada no formato do endpoint de uso da conta (dados sintéticos).
const RESPOSTA_GRAVADA = {
  five_hour: { utilization: 37.5, resets_at: '2026-11-26T18:00:00Z' },
  seven_day: { utilization: 62, resets_at: '2026-11-30T12:00:00Z' },
  limits: [
    { kind: 'weekly_scoped', percent: 12, resets_at: '2026-11-30T12:00:00Z', scope: { model: { display_name: 'Fable' } } },
  ],
  seven_day_breakdown: {
    rows: [
      { display_name: 'Claude Code', percent: 48 },
      { display_name: 'Chats', percent: 14 },
    ],
  },
};

test('buscarLimites chama o endpoint com o token só no cabeçalho e lê os % e os resets', async () => {
  const chamadas = [];
  const fetchMock = async (url, opts) => {
    chamadas.push({ url, opts });
    return { ok: true, status: 200, headers: new Map(), json: async () => RESPOSTA_GRAVADA };
  };

  const res = await buscarLimites({ accessToken: TOKEN_SINTETICO, fetchImpl: fetchMock, agora: () => Date.parse('2026-11-26T15:00:00Z') });

  assert.equal(chamadas.length, 1);
  assert.equal(chamadas[0].url, 'https://api.anthropic.com/api/oauth/usage');
  assert.equal(chamadas[0].opts.headers.Authorization, `Bearer ${TOKEN_SINTETICO}`);
  assert.equal(chamadas[0].opts.headers['anthropic-beta'], 'oauth-2025-04-20');
  assert.equal(res.ativo, true);
  assert.equal(res.sessao.pct, 37.5);
  assert.equal(res.sessao.restantePct, 62.5);
  assert.equal(res.semana.pct, 62);
  assert.equal(res.semana.restantePct, 38);
  assert.equal(res.semana.resetEm, '2026-11-30T12:00:00.000Z');
  assert.equal(res.produtos[0].label, 'Claude Code');
  assert.equal(res.escopos[0].label, 'Fable');
});

test('buscarLimites nunca devolve nem põe o token em mensagem de erro', async () => {
  const fetchMock = async () => ({ ok: false, status: 401, headers: new Map(), json: async () => ({ error: 'expired' }) });
  await assert.rejects(
    () => buscarLimites({ accessToken: TOKEN_SINTETICO, fetchImpl: fetchMock }),
    (e) => {
      assert.equal(e.status, 401);
      assert.ok(!String(e.message).includes(TOKEN_SINTETICO));
      return true;
    },
  );
});

test('buscarLimites sem token não chama a rede e fica inativo', async () => {
  let chamou = false;
  const res = await buscarLimites({ accessToken: '', fetchImpl: async () => { chamou = true; } });
  assert.equal(chamou, false);
  assert.equal(res.ativo, false);
});

test('lerToken lê o accessToken do arquivo local e não falha com arquivo ausente', () => {
  const arquivo = JSON.stringify({ access_token: TOKEN_SINTETICO, refresh_token: 'x', expires_at: 1 });
  assert.equal(lerToken('/caminho', () => arquivo), TOKEN_SINTETICO);
  assert.equal(lerToken('/caminho', () => { throw Object.assign(new Error('nope'), { code: 'ENOENT' }); }), '');
});

test('aplicarLimitesConta troca o % do Claude Code pelo da conta e mantém os outros agentes', () => {
  const paineis = [
    { agente: 'claude-code', sessao: { pct: 5, cota: 1 }, semana: { pct: 6, cota: 1 }, provedor: {} },
    { agente: 'copilot', sessao: { pct: 9 }, semana: { pct: 9 }, provedor: {} },
  ];
  const limites = { ativo: true, sessao: { pct: 37.5, restantePct: 62.5, resetEm: null }, semana: { pct: 62, restantePct: 38, resetEm: null }, produtos: [], escopos: [], fonte: 'conta' };
  const out = aplicarLimitesConta(paineis, limites);
  assert.equal(out[0].sessao.pct, 37.5);
  assert.equal(out[0].sessao.restantePct, 62.5);
  assert.equal(out[0].semana.pct, 62);
  assert.equal(out[0].fontePct, 'conta');
  assert.equal(out[1].sessao.pct, 9);
  assert.equal(out[1].fontePct, undefined);
});

test('aplicarLimitesConta sem limites da conta mantém a estimativa por logs', () => {
  const paineis = [{ agente: 'claude-code', sessao: { pct: 5 }, semana: { pct: 6 }, provedor: {} }];
  const out = aplicarLimitesConta(paineis, { ativo: false });
  assert.equal(out[0].sessao.pct, 5);
  assert.equal(out[0].fontePct, 'estimativa');
});
