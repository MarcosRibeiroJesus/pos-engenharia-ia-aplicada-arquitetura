import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Agregador, chaveProjeto, equivalente } from '../src/agregador.js';

const T0 = '2026-11-18T22:00:00.000Z';
const assistente = (id, model, usage, extra = {}) => ({
  type: 'assistant', sessionId: 's1', timestamp: T0, gitBranch: 'modulo/01-fundamentos-ia-llms/03-recomendacao',
  cwd: '/repo', message: { id, model, role: 'assistant', usage, content: extra.content ?? [] },
});
const resultado = (toolUseId, texto) => ({
  type: 'user', sessionId: 's1', timestamp: T0,
  message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: toolUseId, content: texto }] },
});

test('chave do projeto vem do branch da sessão', () => {
  assert.equal(chaveProjeto({ gitBranch: 'modulo/01-fundamentos-ia-llms/03-recomendacao' }), '01.03-recomendacao');
  assert.equal(chaveProjeto({ gitBranch: 'modulo/03-mcp/opcoes' }), '03-mcp');
  assert.equal(chaveProjeto({ gitBranch: 'plataforma/painel-ia' }), 'plataforma');
  assert.equal(chaveProjeto({ cwd: '/home/x/meu-repo' }), 'meu-repo');
});

test('equivalente pondera cache lido 0,1, cache escrito 2 e saída 5', () => {
  assert.equal(equivalente({ input: 10, cache_write: 10, cache_read: 100, output: 10 }), 10 + 20 + 10 + 50);
});

test('soma por modelo sem contar duas vezes linhas da mesma mensagem', () => {
  const a = new Agregador();
  a.ingerir(assistente('m1', 'claude-opus-5-5', { input_tokens: 10, output_tokens: 3, cache_read_input_tokens: 100 }));
  // a mesma mensagem reaparece com a saída final maior: conta só a diferença
  a.ingerir(assistente('m1', 'claude-opus-5-5', { input_tokens: 10, output_tokens: 8, cache_read_input_tokens: 100 }));
  a.ingerir(assistente('m2', 'claude-sonnet-5-5', { input_tokens: 1, output_tokens: 2 }));
  a.ingerir(assistente('m3', '<synthetic>', { input_tokens: 0, output_tokens: 0 }));
  const e = a.estado();
  const opus = e.modelos.find((m) => m.nome === 'claude-opus-5-5');
  assert.equal(opus.output, 8);
  assert.equal(opus.requisicoes, 1);
  assert.ok(!e.modelos.some((m) => m.nome === '<synthetic>'));
  assert.equal(e.totais.requisicoes, 2);
});

test('tarefas do TaskCreate/TaskUpdate com status e tokens atribuídos à tarefa ativa', () => {
  const a = new Agregador();
  a.ingerir(assistente('m1', 'claude-opus-5-5', { input_tokens: 1, output_tokens: 1 }, {
    content: [{ type: 'tool_use', id: 'tu1', name: 'TaskCreate', input: { subject: 'Escrever testes', description: 'x' } }],
  }));
  a.ingerir(resultado('tu1', 'Task #4 created successfully: Escrever testes'));
  a.ingerir(assistente('m2', 'claude-opus-5-5', { input_tokens: 1, output_tokens: 1 }, {
    content: [{ type: 'tool_use', id: 'tu2', name: 'TaskUpdate', input: { taskId: '4', status: 'in_progress' } }],
  }));
  a.ingerir(assistente('m3', 'claude-opus-5-5', { input_tokens: 0, output_tokens: 100 }));
  a.ingerir(assistente('m4', 'claude-opus-5-5', { input_tokens: 0, output_tokens: 1 }, {
    content: [{ type: 'tool_use', id: 'tu3', name: 'TaskUpdate', input: { taskId: '4', status: 'completed' } }],
  }));
  a.ingerir(assistente('m5', 'claude-opus-5-5', { input_tokens: 0, output_tokens: 50 }));
  const tarefa = a.estado().tarefas.find((t) => t.titulo === 'Escrever testes');
  assert.equal(tarefa.status, 'completed');
  assert.equal(tarefa.projeto, '01.03-recomendacao');
  // m3 e m4 caem na tarefa ativa; m5 vem depois da conclusão
  assert.equal(tarefa.output, 101);
  assert.equal(tarefa.modelos['claude-opus-5-5'] > 0, true);
});

test('TodoWrite também vira tarefa, com a ativa marcada por in_progress', () => {
  const a = new Agregador();
  a.ingerir(assistente('m1', 'claude-haiku-5-5', { input_tokens: 1, output_tokens: 1 }, {
    content: [{ type: 'tool_use', id: 't', name: 'TodoWrite', input: { todos: [
      { content: 'Formatar', status: 'in_progress', activeForm: 'Formatando' },
      { content: 'Publicar', status: 'pending', activeForm: 'Publicando' },
    ] } }],
  }));
  a.ingerir(assistente('m2', 'claude-haiku-5-5', { input_tokens: 0, output_tokens: 20 }));
  const tarefas = a.estado().tarefas;
  assert.equal(tarefas.length, 2);
  // a mensagem que abre a tarefa já conta para ela (1 + 20)
  assert.equal(tarefas.find((t) => t.titulo === 'Formatar').output, 21);
});

test('linha do tempo por minuto e sessões ativas', () => {
  const a = new Agregador({ agora: () => Date.parse('2026-11-18T22:03:00Z') });
  a.ingerir(assistente('m1', 'claude-opus-5-5', { input_tokens: 0, output_tokens: 10 }));
  const e = a.estado();
  assert.equal(e.linhaDoTempo.length, 60);
  assert.equal(e.linhaDoTempo.reduce((s, p) => s + p.equivalente, 0), 50);
  assert.equal(e.sessoes[0].ativa, true);
});

test('registro manual (CSV) entra nos totais, mas linhas de transcript não duplicam', () => {
  const a = new Agregador();
  a.ingerirRegistro([
    { projeto: 'plataforma', tarefa: 'Orquestração', modelo: 'claude-opus-5-5', fonte: 'medido',
      requisicoes: 26, input: 60, cache_write: 0, cache_read: 0, output: 100 },
    { projeto: 'x', tarefa: 'y', modelo: 'claude-opus-5-5', fonte: 'transcript',
      requisicoes: 1, input: 1, cache_write: 0, cache_read: 0, output: 1 },
    { projeto: 'z', tarefa: 'w', modelo: 'claude-opus-5-5', fonte: 'nao-medido',
      requisicoes: 0, input: 0, cache_write: 0, cache_read: 0, output: 0 },
  ]);
  const e = a.estado();
  assert.equal(e.totais.output, 100);
  assert.equal(e.totais.naoMedidos, 1);
});
