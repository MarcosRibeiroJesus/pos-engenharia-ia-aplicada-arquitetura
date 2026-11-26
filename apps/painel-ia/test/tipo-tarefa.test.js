import test from 'node:test';
import assert from 'node:assert/strict';
import { mapaDeEspecialistas, tipoDaLinha, NAO_ATRIBUIDO } from '../src/tipos.js';
import { parseProgresso } from '../src/progresso.js';
import { Agregador } from '../src/agregador.js';

const CATALOGO = {
  especialistas: {
    'engenheiro-terraform': { tarefas: ['codigo'] },
    'arquiteto-aws': { tarefas: ['arquitetura'] },
    'revisor-seguranca': { tarefas: ['seguranca'] },
  },
};
const MAPA = mapaDeEspecialistas(CATALOGO);

test('mapa de especialistas: cada especialista leva ao primeiro tipo da sua lista', () => {
  assert.equal(MAPA.get('engenheiro-terraform'), 'codigo');
  assert.equal(MAPA.get('arquiteto-aws'), 'arquitetura');
});

test('tipo explícito na linha (tipo: x) vence o especialista citado', () => {
  const linha = '2026-11-27 · 01-recomendacao · antigravity (Gemini 4 Neon, tipo: teste) · T005 ajuste (engenheiro-terraform)';
  assert.equal(tipoDaLinha(linha, MAPA), 'teste');
});

test('sem tipo explícito, usa o especialista citado entre parênteses', () => {
  const linha = '2026-11-21 · 00-plataforma · executar-tarefas (coordenador) · T018 contrato (engenheiro-terraform; revisor-independente APROVADO)';
  assert.equal(tipoDaLinha(linha, MAPA), 'codigo');
});

test('sem nenhuma pista, o tipo é "não atribuído", nunca um chute', () => {
  assert.equal(tipoDaLinha('2026-11-21 · x · antigravity (Gemini) · fez algo', MAPA), NAO_ATRIBUIDO);
});

test('parseProgresso leva o tipo em cada tarefa concluída', () => {
  const md = '- 2026-11-21 · 00-plataforma · executar-tarefas (coordenador) · T018 contrato (engenheiro-terraform) · próxima: T019';
  const [t] = parseProgresso(md, MAPA);
  assert.equal(t.tipo, 'codigo');
});

test('tarefas vindas do transcript (TodoWrite) saem como "não atribuído"', () => {
  const ag = new Agregador();
  ag.ingerir({ type: 'assistant', sessionId: 's9', timestamp: '2026-11-26T10:00:00.000Z', uuid: 'a1',
    message: { id: 'm9', role: 'assistant', model: 'claude-opus-5-5', content: [{ type: 'tool_use', id: 'tu1', name: 'TodoWrite', input: { todos: [{ content: 'Algo', status: 'pending' }] } }], usage: { input_tokens: 1, output_tokens: 1 } } });
  const t = ag.estado().tarefas.find((x) => x.fonte === 'transcript');
  assert.ok(t, 'há tarefa de transcript');
  assert.equal(t.tipo, NAO_ATRIBUIDO);
});
