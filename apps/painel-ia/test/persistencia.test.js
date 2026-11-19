import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Agregador } from '../src/agregador.js';
import { Persistencia } from '../src/persistencia.js';
import { relatorio } from '../src/relatorio.js';

const T0 = '2026-11-18T22:00:00.000Z';
const ev = (id, model, usage, content = [], sessionId = 's1', gitBranch = 'modulo/03-mcp/05-legado') => ({
  type: 'assistant', sessionId, timestamp: T0, gitBranch, message: { id, model, usage, content },
});

function sessaoComTarefa(a) {
  a.ingerir(ev('m1', 'claude-opus-5-5', { input_tokens: 1, output_tokens: 1 },
    [{ type: 'tool_use', id: 'tu1', name: 'TaskCreate', input: { subject: 'Fachada MCP' } }]));
  a.ingerir({ type: 'user', sessionId: 's1', timestamp: T0,
    message: { content: [{ type: 'tool_result', tool_use_id: 'tu1', content: 'Task #1 created successfully' }] } });
  a.ingerir(ev('m2', 'claude-opus-5-5', { input_tokens: 0, output_tokens: 1 },
    [{ type: 'tool_use', id: 'tu2', name: 'TaskUpdate', input: { taskId: '1', status: 'in_progress' } }]));
  a.ingerir(ev('m3', 'claude-sonnet-5-5', { input_tokens: 5, output_tokens: 200, cache_read_input_tokens: 1000 }));
  a.ingerir(ev('m4', 'claude-opus-5-5', { input_tokens: 0, output_tokens: 1 },
    [{ type: 'tool_use', id: 'tu3', name: 'TaskUpdate', input: { taskId: '1', status: 'completed' } }]));
}

async function banco() {
  return join(await mkdtemp(join(tmpdir(), 'painel-db-')), 'painel.db');
}

test('o estado sobrevive a um reinício mesmo sem os transcripts', async () => {
  const caminho = await banco();
  const a = new Agregador();
  sessaoComTarefa(a);
  const p = new Persistencia(caminho);
  p.salvar(a);
  p.fechar();

  const p2 = new Persistencia(caminho);
  const b = new Agregador();
  p2.restaurar(b);
  const e1 = a.estado();
  const e2 = b.estado();
  assert.deepEqual(e2.totais, e1.totais);
  assert.deepEqual(e2.modelos, e1.modelos);
  const tarefa = e2.tarefas.find((t) => t.titulo === 'Fachada MCP');
  assert.equal(tarefa.status, 'completed');
  assert.equal(tarefa.output, 201); // m2 (abre) + m3; m4 conclui e não conta
  assert.equal(tarefa.projeto, '03.05-legado');
  p2.fechar();
});

test('reler os mesmos transcripts depois de restaurar não duplica', async () => {
  const caminho = await banco();
  const a = new Agregador();
  sessaoComTarefa(a);
  const p = new Persistencia(caminho);
  p.salvar(a);
  const b = new Agregador();
  p.restaurar(b);
  sessaoComTarefa(b);
  assert.deepEqual(b.estado().totais, a.estado().totais);
  p.fechar();
});

test('salvar só grava o que mudou e guarda o histórico de status', async () => {
  const caminho = await banco();
  const a = new Agregador();
  const p = new Persistencia(caminho);
  sessaoComTarefa(a);
  assert.ok(p.salvar(a) > 0);
  assert.equal(p.salvar(a), 0);
  const historico = p.historicoStatus();
  assert.deepEqual(historico.map((h) => h.status), ['pending', 'in_progress', 'completed']);
  p.fechar();
});

test('relatório final em Markdown e CSV a partir do banco', async () => {
  const caminho = await banco();
  const a = new Agregador();
  sessaoComTarefa(a);
  a.ingerir(ev('x1', 'claude-haiku-5-5', { input_tokens: 1, output_tokens: 10 }, [], 's2', 'modulo/01-fundamentos-ia-llms/04-jogos'));
  const p = new Persistencia(caminho);
  p.salvar(a);
  const md = relatorio(p, { formato: 'md' });
  assert.match(md, /# Uso de IA no projeto/);
  assert.match(md, /03\.05-legado/);
  assert.match(md, /01\.04-jogos/);
  assert.match(md, /claude-sonnet-5-5/);
  assert.match(md, /Fachada MCP/);
  const csv = relatorio(p, { formato: 'csv' });
  const linhas = csv.trim().split('\n');
  assert.match(linhas[0], /^data,sessao,projeto,disciplina,unidade,tarefa,modelo,requisicoes,input,cache_write,cache_read,output,fonte,observacao$/);
  assert.ok(linhas.some((l) => l.includes(',03.05-legado,03,05,') && l.includes('claude-sonnet-5-5') && l.endsWith(',transcript,')));
  p.fechar();
});
