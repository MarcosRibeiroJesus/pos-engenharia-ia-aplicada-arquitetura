import test from 'node:test';
import assert from 'node:assert/strict';
import { Agregador } from '../src/agregador.js';

const MODELO = 'claude-opus-5-5';
const usoSintetico = { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
const user = (ts, sessionId = 's1') => ({ type: 'user', sessionId, timestamp: ts, uuid: `u-${ts}`, message: { role: 'user', content: 'oi' } });
const resultado = (ts, sessionId = 's1') => ({ type: 'user', sessionId, timestamp: ts, uuid: `r-${ts}`,
  message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'x', content: 'ok' }] } });
const assistant = (ts, id, sessionId = 's1') => ({ type: 'assistant', sessionId, timestamp: ts, uuid: `a-${id}`,
  message: { id, role: 'assistant', model: MODELO, content: [{ type: 'text', text: 'resposta' }], usage: usoSintetico } });
const turno = (durationMs, sessionId = 's1') => ({ type: 'system', subtype: 'turn_duration', sessionId, durationMs, timestamp: '2026-11-26T10:00:00.000Z' });

test('latência de resposta: do último envio do usuário até a primeira mensagem do assistente', () => {
  const ag = new Agregador();
  ag.ingerir(user('2026-11-26T10:00:00.000Z'));
  ag.ingerir(assistant('2026-11-26T10:00:01.500Z', 'm1'));
  const lat = ag.estado().latencia.porModelo.find((m) => m.modelo === MODELO);
  assert.equal(lat.n, 1);
  assert.equal(lat.mediaMs, 1500);
  assert.equal(lat.p95Ms, 1500);
});

test('latência após resultado de ferramenta conta a partir do resultado, não do prompt original', () => {
  const ag = new Agregador();
  ag.ingerir(user('2026-11-26T10:00:00.000Z'));
  ag.ingerir(assistant('2026-11-26T10:00:02.000Z', 'm1'));
  ag.ingerir(resultado('2026-11-26T10:00:10.000Z'));
  ag.ingerir(assistant('2026-11-26T10:00:12.000Z', 'm2'));
  const lat = ag.estado().latencia.porModelo.find((m) => m.modelo === MODELO);
  assert.equal(lat.n, 2);
  assert.equal(lat.mediaMs, 2000); // (2000 + 2000) / 2
});

test('pausa longa (mais de 10 min) não vira latência: é o usuário pensando, não o modelo', () => {
  const ag = new Agregador();
  ag.ingerir(user('2026-11-26T10:00:00.000Z'));
  ag.ingerir(assistant('2026-11-26T10:30:00.000Z', 'm1'));
  const lat = ag.estado().latencia.porModelo.find((m) => m.modelo === MODELO);
  assert.equal(lat?.n ?? 0, 0);
});

test('duração do turno (evento turn_duration do Claude Code) entra à parte', () => {
  const ag = new Agregador();
  ag.ingerir(turno(14807));
  ag.ingerir(turno(3000));
  const { turnos } = ag.estado().latencia;
  assert.equal(turnos.n, 2);
  assert.equal(turnos.mediaMs, 8904);
  assert.equal(turnos.p95Ms, 14807);
});

test('mensagem repetida (streaming) não conta latência duas vezes', () => {
  const ag = new Agregador();
  ag.ingerir(user('2026-11-26T10:00:00.000Z'));
  ag.ingerir(assistant('2026-11-26T10:00:01.000Z', 'm1'));
  ag.ingerir(assistant('2026-11-26T10:00:01.200Z', 'm1'));
  const lat = ag.estado().latencia.porModelo.find((m) => m.modelo === MODELO);
  assert.equal(lat.n, 1);
});
