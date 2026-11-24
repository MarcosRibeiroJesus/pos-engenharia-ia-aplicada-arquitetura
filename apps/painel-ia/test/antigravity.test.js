import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Agregador } from '../src/agregador.js';
import { LeitorTranscripts } from '../src/transcripts.js';
import { Persistencia } from '../src/persistencia.js';
import { relatorio } from '../src/relatorio.js';
import { parseProgresso } from '../src/progresso.js';

function criarTranscriptAntigravity(raiz, convId) {
  const logsDir = join(raiz, convId, '.system_generated', 'logs');
  mkdirSync(logsDir, { recursive: true });
  const linhas = [
    JSON.stringify({ step_index: 0, type: 'USER_INPUT', status: 'DONE', created_at: '2026-11-24T10:00:00Z', content: 'implementar tarefa T001' }),
    JSON.stringify({
      step_index: 1, type: 'PLANNER_RESPONSE', status: 'DONE', created_at: '2026-11-24T10:00:05Z',
      model: 'gemini-4-neon-medium', input_tokens: 15000, cache_read_tokens: 0, output_tokens: 400,
      thinking: 't'.repeat(500), content: 'ok',
      tool_calls: [{ name: 'read_file', args: { Path: '/repo/a.js' } }],
    }),
    // Duplicata do mesmo step_index com output maior (streaming/atualizacao)
    JSON.stringify({
      step_index: 1, type: 'PLANNER_RESPONSE', status: 'DONE', created_at: '2026-11-24T10:00:06Z',
      model: 'gemini-4-neon-medium', input_tokens: 15000, cache_read_tokens: 0, output_tokens: 450,
      thinking: 't'.repeat(500), content: 'ok',
      tool_calls: [{ name: 'read_file', args: { Path: '/repo/a.js' } }],
    }),
    JSON.stringify({ step_index: 2, type: 'GENERIC', status: 'DONE', created_at: '2026-11-24T10:00:08Z', content: 'x'.repeat(2000) }),
    JSON.stringify({
      step_index: 3, type: 'PLANNER_RESPONSE', status: 'DONE', created_at: '2026-11-24T10:00:12Z',
      model: 'gemini-4-neon-medium', input_tokens: 2500, cache_read_tokens: 15000, output_tokens: 300,
      content: 'concluido', tool_calls: [],
    }),
  ];
  writeFileSync(join(logsDir, 'transcript.jsonl'), `${linhas.join('\n')}\n`, 'utf8');
  // transcript_full.jsonl deve ser ignorado para nao duplicar
  writeFileSync(join(logsDir, 'transcript_full.jsonl'), `${linhas.join('\n')}\n`, 'utf8');
}

test('antigravity: leitura em tempo real ignora transcript_full, conta tokens disjuntos e alimenta comparativo por agente', async () => {
  const dirAgy = mkdtempSync(join(tmpdir(), 'painel-agy-'));
  const dirClaude = mkdtempSync(join(tmpdir(), 'painel-cc-'));
  try {
    const convId = 'conv-agy-001';
    criarTranscriptAntigravity(dirAgy, convId);

    // Sessao sintetica do Claude Code com tarefa de mesmo nome para comparar lado a lado
    writeFileSync(join(dirClaude, 'sess-cc-001.jsonl'), [
      JSON.stringify({
        type: 'assistant', sessionId: 'sess-cc-001', gitBranch: 'plataforma/painel-antigravity-tempo-real',
        timestamp: '2026-11-24T09:50:00Z',
        message: {
          id: 'cc-1', model: 'claude-opus-5-5',
          content: [{ type: 'tool_use', id: 'tu-t1', name: 'TaskUpdate', input: { taskId: '1', subject: 'Implementar T001', status: 'in_progress' } }],
          usage: { input_tokens: 100, cache_creation_input_tokens: 10000, cache_read_input_tokens: 20000, output_tokens: 500 },
        },
      }),
    ].join('\n') + '\n', 'utf8');

    const ag = new Agregador({ agora: () => Date.parse('2026-11-24T10:01:00Z') });
    const leitorCC = new LeitorTranscripts(dirClaude, (ev, meta) => ag.ingerir(ev, meta));
    const leitorAgy = new LeitorTranscripts(dirAgy, (ev, meta) => ag.ingerir(ev, meta), { origem: 'antigravity', somenteNome: 'transcript.jsonl' });
    await leitorCC.varrer();
    await leitorAgy.varrer();

    // Deve ter lido apenas 1 arquivo do Antigravity (nao o transcript_full.jsonl)
    assert.equal(leitorAgy.arquivos, 1);

    const est = ag.estado();
    // 1 req Claude Code + 2 reqs Antigravity = 3 reqs
    assert.equal(est.totais.requisicoes, 3);

    const agy = est.porAgente.find((a) => a.agente === 'antigravity');
    const cc = est.porAgente.find((a) => a.agente === 'claude-code');
    assert.ok(agy, 'agente antigravity contabilizado');
    assert.ok(cc, 'agente claude-code contabilizado');
    assert.equal(agy.requisicoes, 2);
    assert.equal(agy.input, 17500);
    assert.equal(agy.cache_read, 15000);
    assert.equal(agy.output, 750);
    assert.equal(cc.requisicoes, 1);

    // Detalhe de sessao e timeline funcionam para Antigravity
    const det = ag.detalheSessao(convId);
    assert.ok(det);
    assert.equal(det.timeline.length, 2);
    assert.equal(det.timeline[0].contexto, 15000);
    assert.equal(det.timeline[1].contexto, 17500);
    assert.ok(det.atribuicao.delta_total_medido === 2500);

    // Comparativo por agente em tarefas inclui tarefas de transcripts e do CSV
    ag.ingerirRegistro([
      { projeto: '03-mcp-regras-cdb', tarefa: 'Implementar T001', modelo: 'gemini-4-neon-medium', requisicoes: 2, input: 1000, cache_write: 0, cache_read: 5000, output: 200, fonte: 'medido' },
    ]);
    const est2 = ag.estado();
    const linhaComp = est2.comparativoTarefas.find((t) => t.tarefa === 'Implementar T001');
    assert.ok(linhaComp, 'tarefa presente no comparativo');
    assert.ok(linhaComp.agentes['claude-code']?.equivalente > 0);
    assert.ok(linhaComp.agentes.antigravity?.equivalente > 0);

    // Persistencia preserva agente e relatorio MD inclui comparativo por agente
    const p = new Persistencia(':memory:');
    p.salvar(ag);
    const ag2 = new Agregador({ agora: () => Date.parse('2026-11-24T10:01:00Z') });
    p.restaurar(ag2);
    assert.equal(ag2.estado().porAgente.find((a) => a.agente === 'antigravity')?.requisicoes, 2);
    const md = relatorio(p, { formato: 'md' });
    assert.ok(md.includes('## Por agente'));
    p.fechar();
  } finally {
    rmSync(dirAgy, { recursive: true, force: true });
    rmSync(dirClaude, { recursive: true, force: true });
  }
});

test('progresso: inclui tasks concluidas com Code Agent e modelo no Agregador', () => {
  const md = [
    '# Progresso',
    '- 2026-11-22 · 03-mcp-regras-cdb · antigravity (Gemini 4 Argon, orquestração) · plan.md e ADRs 0001-0006 · 141 testes · próxima: T001',
    '- 2026-11-21 · 00-plataforma-agentes · claude-code (Claude Opus 5.5) · T018 módulo contrato · 93 testes · próxima: T019',
  ].join('\n');
  const itens = parseProgresso(md);
  assert.equal(itens.length, 2);
  assert.equal(itens[0].agente, 'antigravity');
  assert.equal(itens[0].modelo, 'Gemini 4 Argon');
  assert.equal(itens[1].agente, 'claude-code');
  assert.equal(itens[1].modelo, 'Claude Opus 5.5');

  const ag = new Agregador();
  ag.ingerirProgresso(itens);
  const est = ag.estado();
  assert.equal(est.tarefas.length, 2);
  assert.equal(est.contagemTarefas.completed, 2);
  assert.ok(est.tarefas.some((t) => t.agente === 'antigravity' && t.projeto === '03-mcp-regras-cdb'));
});
