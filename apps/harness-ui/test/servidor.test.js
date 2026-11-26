import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { resolve } from 'node:path';
import WebSocket from 'ws';
import { GerenciadorTerminais } from '../src/gerenciador.js';
import { criarServidor } from '../src/servidor.js';

function criarPtyFake() {
  const instancias = [];
  const factory = (comando, args, opts) => {
    let onDataCb = null;
    let onExitCb = null;
    const inst = {
      pid: 2000 + instancias.length,
      comando,
      args,
      opts,
      escritas: [],
      redimensionamentos: [],
      morto: false,
      onData(cb) { onDataCb = cb; return { dispose() {} }; },
      onExit(cb) { onExitCb = cb; return { dispose() {} }; },
      write(d) { this.escritas.push(d); },
      resize(c, r) { this.redimensionamentos.push({ cols: c, rows: r }); },
      kill() { this.morto = true; },
      simularSaida(txt) { onDataCb?.(txt); },
      simularSaidaProcesso(exitCode = 0) { onExitCb?.({ exitCode }); },
    };
    instancias.push(inst);
    return inst;
  };
  return { factory, instancias };
}

const resolverFake = (id) => {
  if (id !== 'shell' && id !== 'claude-code') throw new Error(`perfil desconhecido: ${id}`);
  return { perfil: { id, nome: id, cor: '#34d399' }, comando: id, args: [] };
};

function requisicao(porta, { method = 'GET', path = '/', headers = {}, body = null } = {}) {
  return new Promise((ok, erro) => {
    const req = http.request({ host: '127.0.0.1', port: porta, method, path, headers }, (res) => {
      const pedacos = [];
      res.on('data', (c) => pedacos.push(c));
      res.on('end', () => ok({ status: res.statusCode, headers: res.headers, body: Buffer.concat(pedacos).toString('utf8') }));
    });
    req.on('error', erro);
    if (body) req.write(body);
    req.end();
  });
}

test('servidor aplica cabeçalhos de segurança, bloqueia Host/Origin inválidos e exige token', async (t) => {
  const { factory, instancias } = criarPtyFake();
  const mgr = new GerenciadorTerminais({ ptyFactory: factory, raizPadrao: resolve('.'), resolverPerfil: resolverFake });
  const srv = criarServidor({ gerenciador: mgr, raiz: resolve('.'), porta: 0, token: 'tok-teste-123' });
  const { porta } = await srv.iniciar();
  t.after(() => srv.parar());

  // 1. Healthz e cabeçalhos de segurança
  const h = await requisicao(porta, { path: '/healthz' });
  assert.equal(h.status, 200);
  assert.match(h.headers['content-security-policy'], /default-src 'self'/);
  assert.equal(h.headers['x-content-type-options'], 'nosniff');
  assert.equal(h.headers['x-frame-options'], 'DENY');

  // 2. Host inválido (DNS rebinding)
  const badHost = await requisicao(porta, { path: '/healthz', headers: { Host: 'evil.example:4318' } });
  assert.equal(badHost.status, 403);

  // 3. POST sem token é recusado
  const noTok = await requisicao(porta, {
    method: 'POST',
    path: '/api/terminais',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ perfilId: 'shell' }),
  });
  assert.equal(noTok.status, 401);

  // 4. POST com Origin externo é recusado
  const badOrigin = await requisicao(porta, {
    method: 'POST',
    path: '/api/terminais',
    headers: { 'Content-Type': 'application/json', 'X-Harness-Token': 'tok-teste-123', Origin: 'https://evil.example' },
    body: JSON.stringify({ perfilId: 'shell' }),
  });
  assert.equal(badOrigin.status, 403);

  // 5. POST válido cria aba e WebSocket transmite I/O + scrollback
  const criado = await requisicao(porta, {
    method: 'POST',
    path: '/api/terminais',
    headers: { 'Content-Type': 'application/json', 'X-Harness-Token': 'tok-teste-123', Origin: `http://127.0.0.1:${porta}` },
    body: JSON.stringify({ perfilId: 'shell', titulo: 'Meu Shell' }),
  });
  assert.equal(criado.status, 201);
  const { terminal } = JSON.parse(criado.body);
  instancias[0].simularSaida('bem-vindo\r\n');

  const ws = new WebSocket(`ws://127.0.0.1:${porta}/ws/terminais/${terminal.id}?token=tok-teste-123`, {
    headers: { Origin: `http://127.0.0.1:${porta}` },
  });
  const mensagens = [];
  await new Promise((ok, erro) => {
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      mensagens.push(msg);
      if (msg.tipo === 'init') {
        ws.send(JSON.stringify({ tipo: 'entrada', dados: 'ls\r' }));
        ws.send(JSON.stringify({ tipo: 'resize', cols: 100, rows: 30 }));
        const checar = setInterval(() => {
          if (instancias[0].escritas.length > 0 && instancias[0].redimensionamentos.length > 0) {
            clearInterval(checar);
            instancias[0].simularSaida('arquivo.txt\r\n');
          }
        }, 5);
      } else if (msg.tipo === 'saida' && msg.dados.includes('arquivo.txt')) {
        ok();
      }
    });
    ws.on('error', erro);
  });
  ws.close();

  assert.equal(mensagens[0].tipo, 'init');
  assert.equal(mensagens[0].buffer, 'bem-vindo\r\n');
  assert.deepEqual(instancias[0].escritas, ['ls\r']);
  assert.deepEqual(instancias[0].redimensionamentos, [{ cols: 100, rows: 30 }]);

  // 6. DELETE fecha a aba
  const del = await requisicao(porta, {
    method: 'DELETE',
    path: `/api/terminais/${terminal.id}`,
    headers: { 'X-Harness-Token': 'tok-teste-123', Origin: `http://127.0.0.1:${porta}` },
  });
  assert.equal(del.status, 200);
  assert.equal(instancias[0].morto, true);
});
