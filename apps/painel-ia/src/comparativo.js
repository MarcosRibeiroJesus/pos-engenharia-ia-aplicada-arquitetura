// Comparativo A x B: consumo medido antes e depois do revisor único no CI (D-075).
// Só lê o banco (SELECT) e números medidos; o que não foi medido aparece como nao-medido, nunca estimado.
import { readFile } from 'node:fs/promises';
import { equivalente } from './agregador.js';
import { lerCsv } from './registro.js';

/** Data de corte entre os grupos (horário de Brasília). Troque só aqui. A: antes; B: a partir dela. */
export const CORTE_AB = '2026-11-23T00:00:00-03:00';
/** Abaixo disso, em qualquer grupo, o resultado é "amostra pequena", não conclusão. */
export const AMOSTRA_MINIMA = 15;
export const CAB_TESTES_AB = ['id', 'data', 'versao_harness', 'grupo', 'tokens', 'observacao'];

const CAMPOS = ['input', 'cache_write', 'cache_read', 'output'];
const REVISOR = 'revisor-independente';
const ehCoderabbit = (login) => /^coderabbitai(\[bot\])?$/i.test(String(login || ''));

const variacao = (a, b) => (a ? Number((((b - a) / a) * 100).toFixed(1)) : null);

function grupoVazio() {
  return { sessoes: 0, requisicoes: 0, input: 0, cache_write: 0, cache_read: 0, output: 0, equivalente: 0,
    mediaPorSessao: null, chamadasSubagente: 0, revisorIndependente: 0, subagentes: {} };
}

/** Grupo de uma data `AAAA-MM-DD` do registro manual, lida no mesmo fuso do corte. */
function grupoDaData(data, corte) {
  const ms = Date.parse(`${data}T00:00:00${corte.slice(19)}`);
  if (!Number.isFinite(ms)) return null;
  return ms < Date.parse(corte) ? 'A' : 'B';
}

/** Resume PRs mergeados (fatos já coletados do GitHub) em reviews, comentários e rodadas do CodeRabbit. */
export function resumirCoderabbit(prs, corte = CORTE_AB) {
  const corteMs = Date.parse(corte);
  const vazio = () => ({ prs: 0, prsComReview: 0, reviews: 0, comentarios: 0, rodadas: 0 });
  const out = { A: vazio(), B: vazio() };
  for (const pr of prs || []) {
    const merge = Date.parse(pr.mergedAt);
    if (!Number.isFinite(merge)) continue;
    const g = out[merge < corteMs ? 'A' : 'B'];
    g.prs++;
    const reviews = (pr.reviews || []).filter((r) => ehCoderabbit(r.autor));
    g.reviews += reviews.length;
    g.comentarios += reviews.reduce((s, r) => s + (Number(r.comentarios) || 0), 0)
      + (pr.comentarios || []).filter((c) => ehCoderabbit(c.autor)).length;
    if (!reviews.length) continue;
    g.prsComReview++;
    const primeiro = Math.min(...reviews.map((r) => Date.parse(r.quando)).filter(Number.isFinite));
    g.rodadas += (pr.commits || []).filter((c) => Date.parse(c) > primeiro).length;
  }
  return out;
}

/** Linhas válidas do registro de testes A x B (CSV com CAB_TESTES_AB). Linha com grupo fora de A/B é ignorada. */
export function lerTestesAb(texto) {
  return lerCsv(texto || '')
    .filter((l) => l.grupo === 'A' || l.grupo === 'B')
    .map((l) => Object.fromEntries(CAB_TESTES_AB.map((c) => [c, c === 'tokens' ? Number(l[c]) || 0 : String(l[c] ?? '')])));
}

export async function lerArquivoTestesAb(caminho) {
  if (!caminho) return [];
  try { return lerTestesAb(await readFile(caminho, 'utf8')); } catch { return []; }
}

export async function lerColetaCoderabbit(caminho) {
  if (!caminho) return null;
  try { return JSON.parse(await readFile(caminho, 'utf8')); } catch { return null; }
}

/**
 * Comparativo a partir do banco (objeto com `consulta(sql, ...params)`).
 * A sessão entra no grupo da sua primeira mensagem, inteira: uma sessão não se divide no corte.
 */
export function comparativo(p, { corte = CORTE_AB, registro = [], coderabbit = null, testes = [] } = {}) {
  const corteMs = Date.parse(corte);
  const grupos = { A: grupoVazio(), B: grupoVazio() };
  const INICIO = 'SELECT sessao, MIN(quando) AS inicio FROM mensagens GROUP BY sessao';
  const GRUPO = `CASE WHEN i.inicio < ? THEN 'A' ELSE 'B' END`;

  for (const l of p.consulta(`SELECT ${GRUPO} AS g, COUNT(DISTINCT m.sessao) AS sessoes, COUNT(*) AS requisicoes,
      SUM(m.input) AS input, SUM(m.cache_write) AS cache_write, SUM(m.cache_read) AS cache_read, SUM(m.output) AS output
      FROM mensagens m JOIN (${INICIO}) i ON i.sessao = m.sessao GROUP BY g`, corteMs)) {
    const g = grupos[l.g];
    g.sessoes = l.sessoes; g.requisicoes = l.requisicoes;
    for (const c of CAMPOS) g[c] = l[c] || 0;
    g.equivalente = Math.round(equivalente(g));
    g.mediaPorSessao = g.sessoes ? g.equivalente / g.sessoes : null;
  }
  // Chamada de subagente segue o grupo da sessão que a disparou; sessão sem mensagem cai pela própria data.
  for (const l of p.consulta(`SELECT CASE WHEN COALESCE(i.inicio, c.quando) < ? THEN 'A' ELSE 'B' END AS g,
      c.subagent_type AS tipo, COUNT(*) AS n
      FROM chamadas_subagente c LEFT JOIN (${INICIO}) i ON i.sessao = c.sessao GROUP BY g, tipo ORDER BY n DESC`, corteMs)) {
    const g = grupos[l.g];
    g.subagentes[l.tipo] = l.n;
    g.chamadasSubagente += l.n;
    if (l.tipo === REVISOR) g.revisorIndependente = l.n;
  }

  const reg = () => ({ naoMedidos: 0, medido: { linhas: 0, requisicoes: 0, input: 0, cache_write: 0, cache_read: 0, output: 0 } });
  const regs = { A: reg(), B: reg() };
  for (const l of registro) {
    if (l.fonte === 'transcript') continue; // já está no banco
    const g = grupoDaData(l.data, corte);
    if (!g) continue;
    if (l.fonte === 'nao-medido') { regs[g].naoMedidos++; continue; }
    if (l.fonte !== 'medido') continue;
    const m = regs[g].medido;
    m.linhas++;
    for (const c of ['requisicoes', ...CAMPOS]) m[c] += Number(l[c]) || 0;
  }

  const amostraPequena = grupos.A.sessoes < AMOSTRA_MINIMA || grupos.B.sessoes < AMOSTRA_MINIMA;
  const cr = coderabbit?.prs
    ? { status: 'medido', coletadoEm: coderabbit.coletadoEm || null, ...resumirCoderabbit(coderabbit.prs, corte) }
    : { status: 'nao-medido', motivo: 'Coleta do GitHub não encontrada: rode `node bin/coderabbit-ab.js` (usa o gh em modo leitura). Os tokens do CodeRabbit não são visíveis ao painel e nunca são estimados.' };

  return {
    corte,
    amostraMinima: AMOSTRA_MINIMA,
    amostraPequena,
    leitura: amostraPequena
      ? `amostra pequena (menos de ${AMOSTRA_MINIMA} sessões em algum grupo): indício, não conclusão`
      : 'amostra suficiente para comparar, ainda sem controle de tamanho de tarefa',
    grupos,
    variacao: {
      ...Object.fromEntries(['requisicoes', ...CAMPOS, 'equivalente', 'sessoes', 'chamadasSubagente']
        .map((c) => [c, variacao(grupos.A[c], grupos.B[c])])),
      mediaPorSessao: variacao(grupos.A.mediaPorSessao, grupos.B.mediaPorSessao),
      revisorIndependente: variacao(grupos.A.revisorIndependente, grupos.B.revisorIndependente),
    },
    registro: regs,
    coderabbit: cr,
    testes,
  };
}
