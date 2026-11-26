import test from 'node:test';
import assert from 'node:assert/strict';
import { Agregador } from '../src/agregador.js';
import { montarPainelAgentes } from '../src/provedores.js';

const H = 3_600_000;
const AGORA = Date.parse('2026-11-25T12:00:00Z');

function mensagem(id, quandoMs, input) {
  return {
    type: 'assistant', sessionId: 'sess-janela', timestamp: new Date(quandoMs).toISOString(), cwd: '/repo',
    message: { id, model: 'claude-opus-5-5', role: 'assistant', usage: { input_tokens: input, output_tokens: 0 }, content: [] },
  };
}

test('janelas: sessao de 5 h e semana de 7 dias sao janelas corridas por agente', () => {
  const ag = new Agregador({ agora: () => AGORA });
  ag.ingerir(mensagem('m1', AGORA - 8 * 24 * H, 1000), { agente: 'claude-code' }); // fora das duas janelas
  ag.ingerir(mensagem('m2', AGORA - 6 * H, 2000), { agente: 'claude-code' });      // so na semana
  ag.ingerir(mensagem('m3', AGORA - 1 * H, 4000), { agente: 'claude-code' });      // nas duas
  const j = ag.estado().janelas['claude-code'];
  assert.equal(j.sessao5h, 4000);
  assert.equal(j.semana7d, 6000);
});

test('painel: percentuais usam as janelas corridas, nao a ultima sessao do transcript', () => {
  const estado = {
    janelas: { 'claude-code': { sessao5h: 4_000_000, semana7d: 20_000_000 } },
    sessoes: [{ id: 'abc', agente: 'claude-code', ativa: false, equivalente: 9_000_000 }],
    porSemana: [],
  };
  const painel = montarPainelAgentes(estado, { 'claude-code': { sessao: 10_000_000, semana: 50_000_000 } }, {});
  const cc = painel.find((p) => p.agente === 'claude-code');
  assert.equal(cc.sessao.pct, 40);
  assert.equal(cc.semana.pct, 40);
});
