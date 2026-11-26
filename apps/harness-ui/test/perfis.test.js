import test from 'node:test';
import assert from 'node:assert/strict';
import { listarPerfis, resolverPerfil, encontrarExecutavel } from '../src/perfis.js';

test('lista os 4 perfis esperados (claude-code, antigravity, copilot, shell)', () => {
  const perfis = listarPerfis({
    platform: 'win32',
    env: { PATH: 'C:\\bin', PATHEXT: '.EXE;.CMD' },
    existsSync: (p) => p.endsWith('claude.exe') || p.endsWith('powershell.exe'),
  });
  assert.deepEqual(perfis.map((p) => p.id), ['claude-code', 'antigravity', 'copilot', 'shell']);
  assert.equal(perfis.find((p) => p.id === 'claude-code').disponivel, true);
  assert.equal(perfis.find((p) => p.id === 'antigravity').disponivel, false);
  assert.equal(perfis.find((p) => p.id === 'shell').disponivel, true);
});

test('copilot faz fallback para gh copilot quando binário copilot não existe', () => {
  const res = resolverPerfil('copilot', {
    platform: 'linux',
    env: { PATH: '/usr/bin' },
    existsSync: (p) => p === '/usr/bin/gh',
  });
  assert.equal(res.comando, '/usr/bin/gh');
  assert.deepEqual(res.args, ['copilot']);
});

test('rejeita perfil fora da allowlist (proteção contra execução arbitrária)', () => {
  assert.throws(
    () => resolverPerfil('rm-rf', { platform: 'linux', env: { PATH: '/usr/bin' }, existsSync: () => true }),
    /perfil desconhecido/i,
  );
});

test('encontrarExecutavel retorna null quando PATH não contém o binário', () => {
  const res = encontrarExecutavel('inexistente', {
    platform: 'win32',
    env: { PATH: 'C:\\vazio', PATHEXT: '.EXE' },
    existsSync: () => false,
  });
  assert.equal(res, null);
});
