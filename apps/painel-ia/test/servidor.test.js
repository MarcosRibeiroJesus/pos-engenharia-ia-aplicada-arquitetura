import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { criarServidor } from '../src/servidor.js';

function pedir(porta, caminho, { method = 'GET', host = `127.0.0.1:${porta}`, ler = true } = {}) {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port: porta, path: caminho, method, headers: { Host: host } }, (res) => {
      if (!ler) { resolve({ res, corpo: '' }); return; }
      let corpo = '';
      res.on('data', (c) => { corpo += c; });
      res.on('end', () => resolve({ res, corpo }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function subir(t) {
  const estado = { totais: { output: 7 } };
  const srv = criarServidor({ estado: () => estado, hostsPermitidos: [] });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  t.after(() => srv.fecharTudo());
  return { srv, porta: srv.address().port };
}

test('serve a página com cabeçalhos de segurança', async (t) => {
  const { porta } = await subir(t);
  const { res, corpo } = await pedir(porta, '/');
  assert.equal(res.statusCode, 200);
  assert.match(corpo, /<title>/);
  const csp = res.headers['content-security-policy'];
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /script-src 'self'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
  assert.equal(res.headers['x-frame-options'], 'DENY');
  assert.equal(res.headers['referrer-policy'], 'no-referrer');
  assert.ok(res.headers['permissions-policy']);
  assert.equal(res.headers['cross-origin-opener-policy'], 'same-origin');
  assert.equal(res.headers['x-powered-by'], undefined);
});

test('API de estado e healthcheck', async (t) => {
  const { porta } = await subir(t);
  const api = await pedir(porta, '/api/estado');
  assert.equal(JSON.parse(api.corpo).totais.output, 7);
  assert.match(api.res.headers['cache-control'], /no-store/);
  const saude = await pedir(porta, '/healthz');
  assert.equal(saude.res.statusCode, 200);
});

test('nada fora da lista de arquivos públicos é servido', async (t) => {
  const { porta } = await subir(t);
  // inclui nomes herdados de Object.prototype: não podem virar chamada nem arquivo (CodeQL)
  for (const caminho of ['/../package.json', '/%2e%2e/package.json', '/src/servidor.js', '/package.json',
    '/constructor', '/__proto__', '/toString', '/hasOwnProperty']) {
    const { res } = await pedir(porta, caminho);
    assert.equal(res.statusCode, 404, caminho);
  }
});

test('só GET e HEAD', async (t) => {
  const { porta } = await subir(t);
  const { res } = await pedir(porta, '/api/estado', { method: 'POST' });
  assert.equal(res.statusCode, 405);
});

test('Host desconhecido é recusado (proteção contra DNS rebinding)', async (t) => {
  const { porta } = await subir(t);
  const { res } = await pedir(porta, '/api/estado', { host: 'atacante.exemplo:80' });
  assert.equal(res.statusCode, 421);
});

test('eventos em tempo real via SSE', async (t) => {
  const { srv, porta } = await subir(t);
  const { res } = await pedir(porta, '/eventos', { ler: false });
  assert.equal(res.headers['content-type'], 'text/event-stream');
  const primeiro = await new Promise((resolve) => res.once('data', (c) => resolve(String(c))));
  assert.match(primeiro, /event: estado/);
  const proximo = new Promise((resolve) => res.once('data', (c) => resolve(String(c))));
  srv.notificar();
  assert.match(await proximo, /"output":7/);
  res.destroy();
});
