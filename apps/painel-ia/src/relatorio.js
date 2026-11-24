// Relatório a partir do banco: Markdown para o fechamento da pós e CSV no formato de docs/uso/uso-tokens.csv.
// Inclui as visões agregadas de consumo interno (sem conteúdo de mensagem).
import { Agregador, equivalente } from './agregador.js';

const CAB_CSV = ['data', 'sessao', 'projeto', 'disciplina', 'unidade', 'tarefa', 'modelo', 'requisicoes', 'input',
  'cache_write', 'cache_read', 'output', 'fonte', 'observacao'];

const fmt = (n) => Math.round(n || 0).toLocaleString('pt-BR');
const dia = (ms) => (ms ? new Date(ms).toISOString().slice(0, 10) : '');
const csvCampo = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replaceAll('"', '""')}"` : String(v));

function partes(projeto) {
  const m = String(projeto).match(/^(\d+)\.(\d+)-/) || String(projeto).match(/^(\d+)-/);
  return { disciplina: m?.[1] || '', unidade: m?.[2] || '' };
}

const SOMA = `COUNT(*) AS requisicoes, SUM(m.input) AS input, SUM(m.cache_write) AS cache_write,
  SUM(m.cache_read) AS cache_read, SUM(m.output) AS output, MIN(m.quando) AS primeiro, MAX(m.quando) AS ultimo`;

function tabela(titulo, linhas, rotulo) {
  if (!linhas.length) return `## ${titulo}\n\nSem dados.\n`;
  const corpo = linhas
    .map((l) => ({ ...l, eq: equivalente(l) }))
    .sort((a, b) => b.eq - a.eq)
    .map((l) => `| ${l[rotulo]} | ${fmt(l.requisicoes)} | ${fmt(l.input)} | ${fmt(l.cache_write)} | ${fmt(l.cache_read)} | ${fmt(l.output)} | ${fmt(l.eq)} |`)
    .join('\n');
  return `## ${titulo}\n\n| ${rotulo[0].toUpperCase() + rotulo.slice(1)} | Requisições | Entrada | Cache escrito | Cache lido | Saída | Equivalentes |\n|---|---:|---:|---:|---:|---:|---:|\n${corpo}\n`;
}

export function relatorio(p, { formato = 'md' } = {}) {
  if (formato === 'csv') {
    const linhas = p.consulta(`SELECT s.id AS sessao, s.projeto, s.branch, m.modelo, ${SOMA}
      FROM mensagens m JOIN sessoes s ON s.id = m.sessao GROUP BY s.id, m.modelo ORDER BY primeiro`);
    const saida = [CAB_CSV.join(',')];
    for (const l of linhas) {
      const { disciplina, unidade } = partes(l.projeto);
      const valores = [dia(l.primeiro), l.sessao, l.projeto, disciplina, unidade, `Sessão ${l.branch || l.sessao.slice(0, 8)}`,
        l.modelo, l.requisicoes, l.input, l.cache_write, l.cache_read, l.output, 'transcript', ''];
      saida.push(valores.map(csvCampo).join(','));
    }
    return `${saida.join('\n')}\n`;
  }

  const total = p.consulta(`SELECT ${SOMA}, COUNT(DISTINCT m.sessao) AS sessoes FROM mensagens m`)[0];
  const porProjeto = p.consulta(`SELECT s.projeto, ${SOMA} FROM mensagens m JOIN sessoes s ON s.id = m.sessao GROUP BY s.projeto`);
  const porModelo = p.consulta(`SELECT m.modelo, ${SOMA} FROM mensagens m GROUP BY m.modelo`);
  const tarefas = p.consulta(`SELECT t.projeto, t.titulo, t.status, ${SOMA} FROM tarefas t LEFT JOIN mensagens m ON m.tarefa = t.chave
    WHERE t.status != 'deleted' GROUP BY t.chave ORDER BY t.projeto, t.criado`);
  const contagem = p.consulta("SELECT status, COUNT(*) AS n FROM tarefas WHERE status != 'deleted' GROUP BY status");
  const porStatus = Object.fromEntries(contagem.map((c) => [c.status, c.n]));

  // Recalcula as visões detalhadas a partir dos fatos persistidos (sem texto de mensagem).
  const ag = new Agregador();
  p.restaurar(ag);
  const est = ag.estado();

  const linhasTipo = est.porTipo
    .map((t) => `| ${t.rotulo} | ${fmt(t.tokens)} | ${fmt(t.equivalente)} | ${t.pct}% |`)
    .join('\n');

  const linhasDia = est.porDia
    .map((d) => `| ${d.nome} | ${fmt(d.requisicoes)} | ${fmt(d.cache_read)} | ${fmt(d.cache_write)} | ${fmt(d.output)} | ${fmt(d.equivalente)} |`)
    .join('\n');

  const linhasAtrib = est.consumo.atribuicao.slice(0, 15)
    .map((a) => `| ${a.origem} | ${fmt(a.delta_tokens)} | ${fmt(a.token_reqs)} | ${fmt(a.custo_carr_equiv)} |`)
    .join('\n');

  const linhasOps = est.consumo.oportunidades.slice(0, 15)
    .map((o) => `| ${o.sessao} | ${o.titulo} | ${o.evidencia.replaceAll('|', '/')} | ${fmt(o.economia_estimada_equiv)} (${o.rotulo}) |`)
    .join('\n');

  const linhasTarefas = tarefas.map((t) => `| ${t.projeto} | ${t.titulo.replaceAll('|', '/')} | ${t.status} | ${fmt(t.requisicoes && t.input != null ? equivalente(t) : 0)} |`).join('\n');

  return `# Uso de IA no projeto

Período: ${dia(total.primeiro) || '—'} a ${dia(total.ultimo) || '—'} · ${fmt(total.sessoes || 0)} sessões · ${fmt(total.requisicoes || 0)} requisições ao modelo.

Tokens equivalentes: ${fmt(equivalente(total))} (cache lido pesa 0,1, cache escrito 2 e saída 5, em relação a um token de entrada comum; é medida de esforço, não preço).

Tarefas: ${porStatus.completed || 0} concluídas, ${porStatus.in_progress || 0} em andamento, ${porStatus.pending || 0} pendentes.

## Por tipo de token

| Tipo | Tokens | Equivalentes | Participação |
|---|---:|---:|---:|
${linhasTipo || '| — | — | — | — |'}

## Por dia

| Dia | Requisições | Cache lido | Cache escrito | Saída | Equivalentes |
|---|---:|---:|---:|---:|---:|
${linhasDia || '| — | — | — | — | — | — |'}

${tabela('Por projeto', porProjeto, 'projeto')}
${tabela('Por modelo', porModelo, 'modelo')}
## Atribuição de crescimento de contexto (estimativa proporcional por bytes)

| Origem | Delta de contexto | Token-requisições | Custo de carregamento (eq.) |
|---|---:|---:|---:|
${linhasAtrib || '| — | — | — | — |'}

## Oportunidades de economia

| Sessão | Oportunidade | Evidência | Economia estimada |
|---|---|---|---:|
${linhasOps || '| — | — | — | — |'}

## Tarefas

| Projeto | Tarefa | Status | Equivalentes |
|---|---|---|---:|
${linhasTarefas || '| — | — | — | — |'}
`;
}
