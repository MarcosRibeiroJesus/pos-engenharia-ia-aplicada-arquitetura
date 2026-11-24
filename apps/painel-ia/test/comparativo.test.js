// Comparativo A x B: antes e depois do revisor único (D-075). Só dados sintéticos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Persistencia } from '../src/persistencia.js';
import {
  CORTE_AB, AMOSTRA_MINIMA, comparativo, resumirCoderabbit, lerTestesAb, CAB_TESTES_AB,
} from '../src/comparativo.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const corteMs = Date.parse(CORTE_AB);
const DIA = 86_400_000;

function banco() {
  const p = new Persistencia(':memory:');
  const msg = p.db.prepare('INSERT INTO mensagens (id, sessao, modelo, quando, tarefa, input, cache_write, cache_read, output) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?)');
  const sub = p.db.prepare("INSERT INTO chamadas_subagente (id, sessao, subagent_type, model_solicitado, briefing_bytes, quando) VALUES (?, ?, ?, 'opus', 10, ?)");
  // Sessão a1 começa antes do corte e termina depois: conta inteira em A (grupo pela primeira mensagem).
  msg.run('m1', 'a1', 'opus', corteMs - DIA, 100, 1000, 10000, 50);
  msg.run('m2', 'a1', 'opus', corteMs + 1000, 100, 0, 10000, 50);
  msg.run('m3', 'a2', 'sonnet', corteMs - 2 * DIA, 200, 0, 0, 100);
  msg.run('m4', 'b1', 'opus', corteMs + DIA, 50, 500, 5000, 25);
  sub.run('s1', 'a1', 'revisor-independente', corteMs - DIA);
  sub.run('s2', 'a1', 'revisor-independente', corteMs - DIA + 10);
  sub.run('s3', 'a2', 'engenheiro-terraform', corteMs - 2 * DIA);
  sub.run('s4', 'b1', 'engenheiro-terraform', corteMs + DIA);
  return p;
}

test('a data de corte é uma constante única, ISO com fuso', () => {
  assert.equal(CORTE_AB, '2026-11-23T00:00:00-03:00');
  assert.ok(Number.isFinite(corteMs));
  const fonte = readFileSync(join(RAIZ, 'src', 'comparativo.js'), 'utf8');
  assert.equal(fonte.match(/2026-11-23/g).length, 1, 'o corte aparece uma vez só no código');
});

test('agrupa sessões pela primeira mensagem e soma tokens por tipo', () => {
  const c = comparativo(banco());
  assert.equal(c.corte, CORTE_AB);
  assert.deepEqual(
    { s: c.grupos.A.sessoes, i: c.grupos.A.input, w: c.grupos.A.cache_write, r: c.grupos.A.cache_read, o: c.grupos.A.output, q: c.grupos.A.requisicoes },
    { s: 2, i: 400, w: 1000, r: 20000, o: 200, q: 3 },
  );
  assert.equal(c.grupos.B.sessoes, 1);
  assert.equal(c.grupos.B.input, 50);
  // equivalente: entrada 1, cache escrito 2, cache lido 0,1, saída 5
  assert.equal(c.grupos.A.equivalente, 400 + 2000 + 2000 + 1000);
  assert.equal(c.grupos.B.equivalente, 50 + 1000 + 500 + 125);
  assert.equal(c.grupos.A.mediaPorSessao, (400 + 2000 + 2000 + 1000) / 2);
});

test('conta chamadas de subagente por tipo e destaca o revisor-independente', () => {
  const c = comparativo(banco());
  assert.deepEqual(c.grupos.A.subagentes, { 'revisor-independente': 2, 'engenheiro-terraform': 1 });
  assert.deepEqual(c.grupos.B.subagentes, { 'engenheiro-terraform': 1 });
  assert.equal(c.grupos.A.revisorIndependente, 2);
  assert.equal(c.grupos.B.revisorIndependente, 0);
  assert.equal(c.grupos.A.chamadasSubagente, 3);
});

test('variação de B contra A em percentual, com amostra pequena marcada', () => {
  const c = comparativo(banco());
  const eqA = 5400, eqB = 1675;
  assert.equal(c.variacao.equivalente, Number((((eqB - eqA) / eqA) * 100).toFixed(1)));
  assert.equal(c.variacao.mediaPorSessao, Number((((eqB - eqA / 2) / (eqA / 2)) * 100).toFixed(1)));
  assert.equal(c.variacao.revisorIndependente, -100);
  assert.equal(c.amostraPequena, true);
  assert.ok(AMOSTRA_MINIMA > 2);
  assert.match(c.leitura, /amostra pequena/);
});

test('sem base em A a variação é nula, nunca um número inventado', () => {
  const p = new Persistencia(':memory:');
  p.db.prepare("INSERT INTO mensagens VALUES ('x', 'b', 'opus', ?, NULL, 1, 0, 0, 0)").run(corteMs + 1);
  const c = comparativo(p);
  assert.equal(c.grupos.A.sessoes, 0);
  assert.equal(c.variacao.equivalente, null);
  assert.equal(c.variacao.mediaPorSessao, null);
});

test('corte é parâmetro: trocar a data muda os grupos', () => {
  const c = comparativo(banco(), { corte: '2026-11-30T00:00:00-03:00' });
  assert.equal(c.grupos.A.sessoes, 3);
  assert.equal(c.grupos.B.sessoes, 0);
});

test('registro manual: nao-medido só é contado; medido fica separado e não soma nos totais do banco', () => {
  const registro = [
    { data: '2026-11-18', fonte: 'nao-medido', input: 999, cache_write: 0, cache_read: 0, output: 0, requisicoes: 0 },
    { data: '2026-11-18', fonte: 'medido', input: 10, cache_write: 20, cache_read: 30, output: 40, requisicoes: 2 },
    { data: '2026-11-24', fonte: 'nao-medido', input: 5, cache_write: 0, cache_read: 0, output: 0, requisicoes: 0 },
    { data: '2026-11-24', fonte: 'transcript', input: 7, cache_write: 0, cache_read: 0, output: 0, requisicoes: 1 },
  ];
  const c = comparativo(banco(), { registro });
  assert.equal(c.registro.A.naoMedidos, 1);
  assert.equal(c.registro.B.naoMedidos, 1);
  assert.equal(c.registro.A.medido.input, 10);
  assert.equal(c.registro.A.medido.linhas, 1);
  assert.equal(c.registro.B.medido.linhas, 0);
  assert.equal(c.grupos.A.input, 400, 'registro manual não entra nos totais medidos pelo banco');
});

test('CodeRabbit sem coleta é nao-medido com motivo', () => {
  const c = comparativo(banco());
  assert.equal(c.coderabbit.status, 'nao-medido');
  assert.ok(c.coderabbit.motivo.length > 10);
  assert.equal(c.coderabbit.A, undefined);
});

test('CodeRabbit: reviews, comentários e rodadas por PR mergeado, agrupados pela data do merge', () => {
  const antes = new Date(corteMs - DIA).toISOString();
  const depois = new Date(corteMs + DIA).toISOString();
  const t = (ms) => new Date(ms).toISOString();
  const prs = [
    {
      numero: 1, mergedAt: antes,
      reviews: [
        { autor: 'coderabbitai', quando: t(corteMs - 3 * DIA), comentarios: 4 },
        { autor: 'coderabbitai', quando: t(corteMs - 2 * DIA), comentarios: 1 },
        { autor: 'pessoa', quando: t(corteMs - 2 * DIA), comentarios: 9 },
      ],
      comentarios: [{ autor: 'coderabbitai' }, { autor: 'pessoa' }],
      commits: [t(corteMs - 4 * DIA), t(corteMs - 2.5 * DIA), t(corteMs - 1.5 * DIA)],
    },
    { numero: 2, mergedAt: antes, reviews: [], comentarios: [], commits: [t(corteMs - 2 * DIA)] },
    {
      numero: 3, mergedAt: depois,
      reviews: [{ autor: 'coderabbitai[bot]', quando: t(corteMs + 0.5 * DIA), comentarios: 2 }],
      comentarios: [], commits: [t(corteMs + 0.2 * DIA)],
    },
  ];
  const r = resumirCoderabbit(prs, CORTE_AB);
  assert.deepEqual(r.A, { prs: 2, prsComReview: 1, reviews: 2, comentarios: 6, rodadas: 2 });
  assert.deepEqual(r.B, { prs: 1, prsComReview: 1, reviews: 1, comentarios: 2, rodadas: 0 });
  const c = comparativo(banco(), { coderabbit: { coletadoEm: depois, prs } });
  assert.equal(c.coderabbit.status, 'medido');
  assert.equal(c.coderabbit.A.reviews, 2);
});

test('testes A x B: cabeçalho fixo e tabela vazia sem linhas inventadas', () => {
  assert.deepEqual(CAB_TESTES_AB, ['id', 'data', 'versao_harness', 'grupo', 'tokens', 'observacao']);
  assert.deepEqual(lerTestesAb(`${CAB_TESTES_AB.join(',')}\n`), []);
  assert.deepEqual(lerTestesAb(''), []);
  const linhas = lerTestesAb(`${CAB_TESTES_AB.join(',')}\nt1,2026-12-01,abc123,B,1500,"rodada, com vírgula"\nt2,2026-12-01,abc123,X,1,grupo inválido\n`);
  assert.equal(linhas.length, 1);
  assert.deepEqual(linhas[0], { id: 't1', data: '2026-12-01', versao_harness: 'abc123', grupo: 'B', tokens: 1500, observacao: 'rodada, com vírgula' });
  const c = comparativo(banco());
  assert.deepEqual(c.testes, []);
});

test('a página tem a aba do comparativo e nenhum recurso externo', () => {
  const html = readFileSync(join(RAIZ, 'public', 'index.html'), 'utf8');
  assert.match(html, /data-aba="comparativo"[^>]*>Comparativo A x B</);
  assert.match(html, /data-painel="comparativo"/);
  assert.match(html, /id="tabela-testes-ab"/);
  assert.doesNotMatch(html, /(src|href)="(https?:)?\/\//);
  const js = readFileSync(join(RAIZ, 'public', 'app.js'), 'utf8');
  assert.match(js, /\/api\/comparativo/);
  assert.doesNotMatch(js, /fetch\(['"`]https?:/);
});
