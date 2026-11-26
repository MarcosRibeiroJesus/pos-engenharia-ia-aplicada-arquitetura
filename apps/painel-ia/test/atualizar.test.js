import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { criarServidor } from '../src/servidor.js';

function pedir(porta, caminho) {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port: porta, path: caminho, method: 'GET', headers: { Host: `127.0.0.1:${porta}` } }, (res) => {
      let corpo = '';
      res.on('data', (c) => { corpo += c; });
      res.on('end', () => resolve({ status: res.statusCode, corpo }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function subir(t, extras) {
  const srv = criarServidor({ estado: () => ({}), hostsPermitidos: [], extras });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  t.after(() => srv.fecharTudo());
  return srv.address().port;
}

test('rota extra assíncrona responde só depois de terminar (botão Atualizar)', async (t) => {
  let terminou = false;
  const porta = await subir(t, {
    '/api/atualizar': async () => {
      await new Promise((r) => setTimeout(r, 20));
      terminou = true;
      return ['{"ok":true}', 'application/json; charset=utf-8'];
    },
  });
  const res = await pedir(porta, '/api/atualizar');
  assert.equal(res.status, 200);
  assert.equal(terminou, true);
  assert.equal(res.corpo, '{"ok":true}');
});

test('falha dentro da rota extra vira 502 com JSON, sem derrubar o servidor', async (t) => {
  const porta = await subir(t, {
    '/api/atualizar': async () => { throw new Error('limites da conta HTTP 401'); },
  });
  const res = await pedir(porta, '/api/atualizar');
  assert.equal(res.status, 502);
  assert.equal(JSON.parse(res.corpo).erro, 'limites da conta HTTP 401');
  const ok = await pedir(porta, '/healthz');
  assert.equal(ok.status, 200);
});
