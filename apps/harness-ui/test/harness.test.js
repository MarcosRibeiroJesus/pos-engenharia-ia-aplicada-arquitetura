import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { lerEstadoHarness, montarPromptPassagem } from '../src/harness.js';

test('lê projetos, agentes e especialistas do diretório harness/', () => {
  const dir = mkdtempSync(join(tmpdir(), 'harness-ui-test-'));
  try {
    mkdirSync(join(dir, 'harness'), { recursive: true });
    writeFileSync(join(dir, 'harness', 'estado.json'), JSON.stringify({
      projetos: [{ chave: '03-mcp-regras-cdb', titulo: 'MCP CDB', fase: 'implementar', branch: 'modulo/03-mcp/mcp-regras-cdb', pastas: ['modulos/03-mcp/arquitetura/'] }],
    }));
    writeFileSync(join(dir, 'harness', 'agentes.json'), JSON.stringify({
      agentes: { 'claude-code': { nome: 'Claude Code' }, antigravity: { nome: 'Google Antigravity' } },
      tarefas: { codigo: 'maximo', teste: 'equilibrado' },
    }));
    writeFileSync(join(dir, 'harness', 'especialistas.json'), JSON.stringify({
      especialistas: { 'engenheiro-codigo': { tarefas: ['codigo'] } },
    }));

    const estado = lerEstadoHarness(dir);
    assert.equal(estado.projetos.length, 1);
    assert.equal(estado.projetos[0].chave, '03-mcp-regras-cdb');
    assert.deepEqual(estado.tarefas, ['codigo', 'teste']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('monta prompt de passagem contendo projeto, tarefa e agente', () => {
  const prompt = montarPromptPassagem({ agente: 'antigravity', tarefa: 'codigo', projeto: '00-plataforma-agentes' });
  assert.match(prompt, /00-plataforma-agentes/);
  assert.match(prompt, /antigravity/);
  assert.match(prompt, /codigo/);
  assert.match(prompt, /AGENTS\.md/);
});
