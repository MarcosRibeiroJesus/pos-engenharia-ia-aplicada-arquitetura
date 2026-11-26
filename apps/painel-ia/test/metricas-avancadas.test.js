import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Agregador } from '../src/agregador.js';
import { montarPainelAgentes } from '../src/provedores.js';
import {
  classificarSaude,
  piorSaude,
  salvarSnapshotUsage,
  lerSnapshotsUsage,
  aplicarSnapshotsUsage,
  parsearTextoUsage,
  mesclarOverridesSnapshot,
} from '../src/snapshot-usage.js';

test('classificarSaude segue o semáforo <70% verde, 70-90% amarelo e >=90% vermelho', () => {
  assert.deepEqual(classificarSaude(0), { nivel: 'saudavel', rotulo: 'Saudável' });
  assert.deepEqual(classificarSaude(69.9), { nivel: 'saudavel', rotulo: 'Saudável' });
  assert.deepEqual(classificarSaude(70), { nivel: 'alerta', rotulo: 'Atenção' });
  assert.deepEqual(classificarSaude(89.9), { nivel: 'alerta', rotulo: 'Atenção' });
  assert.deepEqual(classificarSaude(90), { nivel: 'critico', rotulo: 'Crítico' });
  assert.equal(piorSaude(classificarSaude(40), classificarSaude(75)).nivel, 'alerta');
  assert.equal(piorSaude(classificarSaude(95), classificarSaude(75)).nivel, 'critico');
});

test('snapshot manual do /usage salva, relê, calcula delta em tempo real e respeita expiração', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'painel-snap-'));
  const arq = join(dir, 'usage-snapshot.json');
  try {
    const tCap = Date.parse('2026-11-26T10:00:00.000Z');
    const resetSess = '2026-11-26T15:00:00.000Z';
    const resetSem = '2026-12-01T00:00:00.000Z';
    salvarSnapshotUsage(arq, {
      agente: 'antigravity',
      sessaoPct: 72,
      semanaPct: 45,
      resetSessaoEm: resetSess,
      resetSemanaEm: resetSem,
      nota: 'Gemini Pro /usage',
    }, { agora: () => tCap });

    const lidos = await lerSnapshotsUsage(arq);
    assert.equal(lidos.antigravity.sessaoPct, 72);
    assert.equal(lidos.antigravity.semanaPct, 45);

    const base = montarPainelAgentes({ janelas: {}, sessoes: [] }, {}, {});
    // Simula Claude Code já com leitura direta da conta (não deve ser sobrescrito)
    base[0] = { ...base[0], fontePct: 'conta', sessao: { ...base[0].sessao, pct: 30 }, semana: { ...base[0].semana, pct: 20 } };

    const aplicados = aplicarSnapshotsUsage(base, lidos, (ag) => (ag === 'antigravity' ? 125_000 : 0), Date.parse('2026-11-26T11:00:00.000Z'));
    const agy = aplicados.find((p) => p.agente === 'antigravity');
    assert.equal(agy.fontePct, 'snapshot');
    assert.equal(agy.sessao.pct, 72);
    assert.equal(agy.sessao.restantePct, 28);
    assert.equal(agy.sessao.resetEm, resetSess);
    assert.equal(agy.saude.nivel, 'alerta');
    assert.equal(agy.snapshot.deltaEquivalente, 125_000);

    // Após o reset da sessão, mantém a semana válida mas cai para logs na sessão
    const posResetSessao = aplicarSnapshotsUsage(base, lidos, () => 50_000, Date.parse('2026-11-26T16:00:00.000Z'));
    const agyPos = posResetSessao.find((p) => p.agente === 'antigravity');
    assert.equal(agyPos.fontePct, 'snapshot');
    assert.equal(agyPos.snapshot.sessaoExpirada, true);
    assert.equal(agyPos.snapshot.semanaExpirada, false);
    assert.equal(agyPos.sessao.pct, 0);
    assert.equal(agyPos.semana.pct, 45);

    // Após ambos os resets, marca snapshot como expirado
    const posTudo = aplicarSnapshotsUsage(base, lidos, () => 0, Date.parse('2026-12-02T00:00:00.000Z'));
    const agyExp = posTudo.find((p) => p.agente === 'antigravity');
    assert.equal(agyExp.snapshot.expirado, true);
    assert.notEqual(agyExp.fontePct, 'snapshot');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('performance calcula throughput (tok/s) e pico de contexto por modelo', () => {
  const ag = new Agregador({ agora: () => Date.parse('2026-11-26T10:05:00.000Z') });
  ag.ingerir({ type: 'user', sessionId: 's1', timestamp: '2026-11-26T10:00:00.000Z', message: { role: 'user', content: 'oi' } }, { agente: 'antigravity' });
  ag.ingerir({
    type: 'assistant',
    sessionId: 's1',
    timestamp: '2026-11-26T10:00:02.000Z',
    message: {
      id: 'm1',
      model: 'gemini-4-neon',
      content: [{ type: 'text', text: 'ok' }],
      usage: { input_tokens: 1000, cache_creation_input_tokens: 0, cache_read_input_tokens: 9000, output_tokens: 200 },
    },
  }, { agente: 'antigravity' });

  const perf = ag.estado().performance.porModelo.find((m) => m.modelo === 'gemini-4-neon');
  assert.equal(perf.n, 1);
  assert.equal(perf.mediaMs, 2000);
  assert.equal(perf.tpsMedia, 100); // 200 tokens / 2s
  assert.equal(perf.ctxMax, 10_000); // 1000 + 9000
  assert.equal(perf.ctxMedio, 10_000);
});

test('heatmap por dia traz quebra por agente, participação percentual e rankings ordenados', () => {
  const ag = new Agregador({ agora: () => Date.parse('2026-11-26T12:00:00.000Z') });
  ag.ingerir({
    type: 'assistant',
    sessionId: 's-cc',
    gitBranch: 'plataforma/painel',
    timestamp: '2026-11-26T10:00:00.000Z',
    message: { id: 'm1', model: 'claude-sonnet-4-6', content: [], usage: { input_tokens: 1000, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 200 } },
  }, { agente: 'claude-code' });
  ag.ingerir({
    type: 'assistant',
    sessionId: 's-agy',
    gitBranch: 'modulo/03-mcp/01-regras',
    timestamp: '2026-11-26T11:00:00.000Z',
    message: { id: 'm2', model: 'gemini-4-neon', content: [], usage: { input_tokens: 3000, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 600 } },
  }, { agente: 'antigravity' });

  const est = ag.estado();
  const dia = est.porDia.find((d) => d.nome === '2026-11-26');
  assert.ok(dia.agentes['claude-code'].equivalente > 0);
  assert.ok(dia.agentes.antigravity.equivalente > 0);

  const agy = est.porAgente.find((a) => a.agente === 'antigravity');
  const cc = est.porAgente.find((a) => a.agente === 'claude-code');
  assert.equal(agy.participacaoPct, 75);
  assert.equal(cc.participacaoPct, 25);
  assert.equal(est.rankings.sessoes[0].idCompleto, 's-agy');
  assert.equal(est.rankings.projetos[0].nome, '03.01-regras');

  // Delta desde 10:30 deve incluir apenas a mensagem das 11:00 do Antigravity
  assert.equal(ag.equivalenteDesde('antigravity', Date.parse('2026-11-26T10:30:00.000Z')), 6000);
  assert.equal(ag.equivalenteDesde('claude-code', Date.parse('2026-11-26T10:30:00.000Z')), 0);
});

test('parsearTextoUsage converte saída colada do /usage em subgrupos e descarta e-mail da conta', () => {
  const textoSintetico = `
  Models & Quota

  Account: usuario.sintetico@example.com

GEMINI MODELS
  Models within this group: Gemini 4 Neon, Gemini 4 Carbon

  Weekly Limit Remaining
    [] 12.98%
    Refreshes in 4d 14h 57m

  Five Hour Limit Remaining
    [] 67.42%
    Refreshes in 1h 6m

CLAUDE AND GPT MODELS
  Models within this group: Claude Opus 5.5, Claude Sonnet 5.5

  Weekly Limit Remaining
    [] 0.00%
    Refreshes in 4d 17h 58m

  Five Hour Limit Remaining
    Disabled: You have hit your weekly limit, the 5-hour limit does not currently apply.
`;
  const baseMs = Date.parse('2026-11-26T05:53:00.000Z');
  const parsed = parsearTextoUsage(textoSintetico, { agora: () => baseMs });
  const serializado = JSON.stringify(parsed);
  assert.ok(!serializado.includes('usuario.sintetico') && !serializado.includes('@'), 'e-mail da conta nunca deve ser gravado');
  assert.equal(parsed.grupos.length, 2);
  assert.equal(parsed.grupos[0].nome, 'GEMINI MODELS');
  assert.equal(parsed.grupos[0].semana.pct, 87);
  assert.equal(parsed.grupos[0].semana.restantePct, 13);
  assert.equal(parsed.grupos[0].sessao.pct, 32.6);
  assert.equal(parsed.grupos[0].sessao.restantePct, 67.4);
  assert.equal(parsed.grupos[0].sessao.resetEm, new Date(baseMs + 66 * 60_000).toISOString());

  assert.equal(parsed.grupos[1].nome, 'CLAUDE AND GPT MODELS');
  assert.equal(parsed.grupos[1].semana.pct, 100);
  assert.equal(parsed.grupos[1].sessao.desabilitado, true);

  // Resumo principal herda o grupo ativo (GEMINI MODELS)
  assert.equal(parsed.sessaoPct, 32.6);
  assert.equal(parsed.semanaPct, 87);

  // Ao aplicar nos painéis, a saúde geral reflete o pior subgrupo (Crítico por Claude+GPT em 100%)
  const base = montarPainelAgentes({ janelas: {}, sessoes: [] }, {}, {});
  const aplicados = aplicarSnapshotsUsage(base, {
    antigravity: { capturadoEm: new Date(baseMs).toISOString(), ...parsed },
  }, () => 5000, baseMs + 60_000);
  const agy = aplicados.find((p) => p.agente === 'antigravity');
  assert.equal(agy.snapshot.grupos.length, 2);
  assert.equal(agy.snapshot.grupos[0].saude.nivel, 'alerta');
  assert.equal(agy.snapshot.grupos[1].saude.nivel, 'critico');
  assert.equal(agy.saude.nivel, 'critico');

  // Após o reset semanal de todos os grupos (inclusive o Disabled sem resetSessao próprio), tudo expira
  const aposResetSemanal = baseMs + 6 * 24 * 3600_000;
  const expirados = aplicarSnapshotsUsage(base, {
    antigravity: { capturadoEm: new Date(baseMs).toISOString(), ...parsed },
  }, () => 0, aposResetSemanal);
  const agyExp = expirados.find((p) => p.agente === 'antigravity');
  assert.equal(agyExp.snapshot.expirado, true);
  assert.equal(agyExp.snapshot.grupos.length, 0);
  assert.equal(agyExp.saude.nivel, 'saudavel');
});

test('mesclarOverridesSnapshot propaga overrides aos grupos e atualização manual sem --colar limpa grupos antigos', () => {
  const baseMs = Date.parse('2026-11-26T05:53:00.000Z');
  const parseado = parsearTextoUsage(`
GEMINI MODELS
  Weekly Limit Remaining
    [] 20%
    Refreshes in 2d 0h 0m
  Five Hour Limit Remaining
    [] 10%
    Refreshes in 2h 0m
`, { agora: () => baseMs });

  const novoResetSessao = '2026-11-26T12:00:00.000Z';
  const novoResetSemana = '2026-12-01T00:00:00.000Z';
  const mesclado = mesclarOverridesSnapshot(parseado, {
    agente: 'antigravity',
    sessaoPct: 25,
    semanaPct: 40,
    resetSessaoEm: novoResetSessao,
    resetSemanaEm: novoResetSemana,
  });
  assert.equal(mesclado.sessaoPct, 25);
  assert.equal(mesclado.semanaPct, 40);
  assert.equal(mesclado.grupos[0].sessao.pct, 25);
  assert.equal(mesclado.grupos[0].semana.pct, 40);
  assert.equal(mesclado.grupos[0].sessao.resetEm, novoResetSessao);
  assert.equal(mesclado.grupos[0].semana.resetEm, novoResetSemana);

  // Salva com grupos e depois sobrescreve manualmente sem --colar: grupos antigos devem ser limpos
  const dir = mkdtempSync(join(tmpdir(), 'painel-snap-override-'));
  try {
    const arq = join(dir, 'usage-snapshot.json');
    const comGrupos = salvarSnapshotUsage(arq, mesclado, { agora: () => baseMs });
    assert.equal(comGrupos.grupos.length, 1);

    const manual = salvarSnapshotUsage(arq, {
      agente: 'antigravity',
      sessaoPct: 15,
      semanaPct: 30,
    }, { agora: () => baseMs + 60_000 });
    assert.deepEqual(manual.grupos, []);
    assert.equal(manual.sessaoPct, 15);
    assert.equal(manual.semanaPct, 30);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
