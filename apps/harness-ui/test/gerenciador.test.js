import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { GerenciadorTerminais } from '../src/gerenciador.js';

function criarPtyFake() {
  const instancias = [];
  const factory = (comando, args, opts) => {
    let onDataCb = null;
    let onExitCb = null;
    const inst = {
      pid: 1000 + instancias.length,
      comando,
      args,
      opts,
      escritas: [],
      redimensionamentos: [],
      morto: false,
      onData(cb) { onDataCb = cb; return { dispose() {} }; },
      onExit(cb) { onExitCb = cb; return { dispose() {} }; },
      write(dados) { this.escritas.push(dados); },
      resize(cols, rows) { this.redimensionamentos.push({ cols, rows }); },
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
  const mapa = {
    'claude-code': { perfil: { id: 'claude-code', nome: 'Claude Code', cor: '#d97757' }, comando: 'claude', args: [] },
    antigravity: { perfil: { id: 'antigravity', nome: 'Antigravity', cor: '#60a5fa' }, comando: 'agy', args: [] },
    shell: { perfil: { id: 'shell', nome: 'Shell', cor: '#34d399' }, comando: 'powershell.exe', args: [] },
  };
  if (!mapa[id]) throw new Error(`perfil desconhecido: ${id}`);
  return mapa[id];
};

test('mantém múltiplas abas isoladas em execução simultânea e fecha individualmente', () => {
  const { factory, instancias } = criarPtyFake();
  const raiz = resolve('.');
  const mgr = new GerenciadorTerminais({ ptyFactory: factory, raizPadrao: raiz, resolverPerfil: resolverFake });

  const aba1 = mgr.criar({ perfilId: 'claude-code', titulo: 'Claude · D03' });
  const aba2 = mgr.criar({ perfilId: 'antigravity', titulo: 'Antigravity · Plataforma' });

  assert.equal(mgr.listar().length, 2);
  assert.notEqual(aba1.id, aba2.id);
  assert.equal(aba1.status, 'running');
  assert.equal(aba2.status, 'running');

  mgr.escrever(aba1.id, 'oi claude\r');
  assert.deepEqual(instancias[0].escritas, ['oi claude\r']);
  assert.deepEqual(instancias[1].escritas, []);

  assert.equal(mgr.fechar(aba1.id), true);
  assert.equal(instancias[0].morto, true);
  assert.equal(instancias[1].morto, false);
  assert.equal(mgr.listar().length, 1);
  assert.equal(mgr.listar()[0].id, aba2.id);

  mgr.fecharTodos();
  assert.equal(instancias[1].morto, true);
});

test('preserva scrollback com limite de buffer (ring buffer) e atualiza status ao sair', () => {
  const { factory, instancias } = criarPtyFake();
  const mgr = new GerenciadorTerminais({
    ptyFactory: factory,
    raizPadrao: resolve('.'),
    resolverPerfil: resolverFake,
    limiteBufferBytes: 32,
  });

  const aba = mgr.criar({ perfilId: 'shell' });
  instancias[0].simularSaida('0123456789abcdefghij');
  instancias[0].simularSaida('KLMNOPQRSTUVWXYZ012345');

  const buf = mgr.lerBuffer(aba.id);
  assert.equal(Buffer.byteLength(buf, 'utf8') <= 32, true);
  assert.equal(buf.endsWith('KLMNOPQRSTUVWXYZ012345'), true);

  mgr.redimensionar(aba.id, 140, 40);
  assert.deepEqual(instancias[0].redimensionamentos, [{ cols: 140, rows: 40 }]);

  instancias[0].simularSaidaProcesso(0);
  assert.equal(mgr.obter(aba.id).status, 'exited');
  assert.equal(mgr.obter(aba.id).exitCode, 0);
});

test('bloqueia cwd fora da raiz permitida do repositório', () => {
  const { factory } = criarPtyFake();
  const mgr = new GerenciadorTerminais({
    ptyFactory: factory,
    raizPadrao: resolve('.'),
    resolverPerfil: resolverFake,
  });
  assert.throws(() => mgr.criar({ perfilId: 'shell', cwd: resolve('..', '..') }), /fora do diretório permitido/i);
});
