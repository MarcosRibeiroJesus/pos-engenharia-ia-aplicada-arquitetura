import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lerCsv } from '../src/registro.js';
import { itensMonday } from '../src/monday.js';
import { prsGithub } from '../src/github.js';

test('CSV do registro com campos entre aspas e números', () => {
  const linhas = lerCsv('projeto,tarefa,modelo,requisicoes,output,fonte\nplataforma,"Orquestração: a, b",claude-opus-5-5,26,100,medido\n');
  assert.equal(linhas[0].tarefa, 'Orquestração: a, b');
  assert.equal(linhas[0].requisicoes, 26);
  assert.equal(linhas[0].output, 100);
});

test('Monday: itens com status e tipo, sem expor o token na resposta', async () => {
  let cabecalhos;
  const falso = async (_url, opts) => {
    cabecalhos = opts.headers;
    return { ok: true, json: async () => ({ data: { boards: [{ items_page: { items: [
      { id: '1', name: 'Escolher D03', url: 'https://x/1', column_values: [
        { text: 'Aberto', column: { title: 'Status' } }, { text: 'Decisão', column: { title: 'Tipo' } },
        { text: 'Alta', column: { title: 'Prioridade' } }] },
    ] } }] } }) };
  };
  const itens = await itensMonday({ token: 'segredo', quadro: '123', fetch: falso });
  assert.equal(cabecalhos.Authorization, 'segredo');
  assert.deepEqual(itens[0], { id: '1', nome: 'Escolher D03', url: 'https://x/1', status: 'Aberto', tipo: 'Decisão', prioridade: 'Alta' });
  assert.ok(!JSON.stringify(itens).includes('segredo'));
});

test('GitHub: PRs abertos com resumo dos checks quando há token', async () => {
  const falso = async (url) => ({
    ok: true,
    json: async () => (url.includes('/pulls')
      ? [{ number: 9, title: 'Esteira', draft: false, html_url: 'https://g/9', head: { sha: 'abc' } }]
      : { check_runs: [{ status: 'completed', conclusion: 'success' }, { status: 'completed', conclusion: 'failure' }, { status: 'in_progress', conclusion: null }] }),
  });
  const prs = await prsGithub({ repo: 'o/r', token: 't', fetch: falso });
  assert.deepEqual(prs[0].checks, { sucesso: 1, falha: 1, andamento: 1 });
});
