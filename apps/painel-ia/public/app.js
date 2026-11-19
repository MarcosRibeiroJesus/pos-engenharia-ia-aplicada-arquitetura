// Interface do painel. Todo texto vindo dos dados entra por textContent (nunca innerHTML).
'use strict';

const $ = (id) => document.getElementById(id);
function h(tag, attrs = {}, ...filhos) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') Object.assign(el.style, v);
    else el.setAttribute(k, v);
  }
  for (const f of filhos.flat()) if (f != null) el.append(f instanceof Node ? f : String(f));
  return el;
}
const fmt = (n) => {
  const v = Number(n) || 0;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1).replace('.', ',')} mi`;
  if (v >= 1e3) return `${Math.round(v / 1e3)} mil`;
  return String(Math.round(v));
};
const hora = (ms) => (ms ? new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—');
const quando = (ms) => (ms ? new Date(ms).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
const STATUS = { completed: ['✓', 'Concluída'], in_progress: ['◐', 'Em andamento'], pending: ['○', 'Pendente'] };

let filtro = 'todas';
let ultimo = null;

function tiles(e) {
  const c = e.contagemTarefas || {};
  const abertas = (e.aprovacoes?.itens || []).filter((i) => !/feito|done|conclu/i.test(i.status)).length;
  const itens = [
    ['Tokens equivalentes', fmt(e.totais.equivalente), `${fmt(e.totais.requisicoes)} requisições`],
    ['Ritmo agora', `${fmt(e.totais.porMinuto5)}/min`, 'média dos últimos 5 minutos'],
    ['Sessões ativas', String(e.totais.sessoesAtivas), `${e.sessoes.length} com uso registrado`],
    ['Tarefas em andamento', String(c.in_progress || 0), `${c.completed || 0} concluídas · ${c.pending || 0} pendentes`],
    ['Saída gerada', fmt(e.totais.output), `cache lido ${fmt(e.totais.cache_read)}`],
  ];
  if (e.aprovacoes?.ativo) itens.push(['Aprovações abertas', String(abertas), 'no board do Monday']);
  $('tiles').replaceChildren(...itens.map(([r, v, s]) => h('div', { class: 'tile' }, h('span', {}, r), h('b', {}, v), h('small', {}, s))));
}

function tempo(e) {
  const max = Math.max(1, ...e.linhaDoTempo.map((p) => p.equivalente));
  $('tempo').replaceChildren(...e.linhaDoTempo.map((p) => h('div', { class: 'col', title: `${hora(p.minuto)} · ${fmt(p.equivalente)} equivalentes` },
    h('i', { style: { height: `${(100 * p.equivalente) / max}%` } }))));
}

function barras(alvo, grupos, detalhe) {
  if (!grupos.length) { $(alvo).replaceChildren(h('p', { class: 'vazio' }, 'Sem uso registrado ainda.')); return; }
  const max = Math.max(1, ...grupos.map((g) => g.equivalente));
  $(alvo).replaceChildren(...grupos.map((g) => h('div', {
    class: 'barra',
    title: `${g.nome}: ${fmt(g.equivalente)} equivalentes · entrada ${fmt(g.input)} · cache escrito ${fmt(g.cache_write)} · cache lido ${fmt(g.cache_read)} · saída ${fmt(g.output)} · ${g.requisicoes} requisições`,
  }, h('span', { class: 'nome' }, g.nome), h('span', { class: 'trilho' }, h('i', { style: { width: `${(100 * g.equivalente) / max}%` } })),
  h('span', { class: 'valor' }, fmt(g.equivalente)), detalhe ? h('span', { class: 'sub' }, detalhe(g)) : null)));
}

function tarefas(e) {
  const lista = e.tarefas.filter((t) => filtro === 'todas' || t.status === filtro);
  const corpo = $('tarefas').tBodies[0];
  if (!lista.length) { corpo.replaceChildren(h('tr', {}, h('td', { colspan: '5', class: 'vazio' }, 'Nenhuma tarefa neste filtro.'))); return; }
  corpo.replaceChildren(...lista.slice(0, 300).map((t) => {
    const [icone, rotulo] = STATUS[t.status] || ['·', t.status];
    const modelos = Object.entries(t.modelos || {}).sort((a, b) => b[1] - a[1]).map(([m]) => h('span', { class: 'chip' }, m.replace('claude-', '')));
    return h('tr', {},
      h('td', {}, h('span', { class: `status ${t.status}` }, `${icone} ${rotulo}`)),
      h('td', {}, t.titulo),
      h('td', {}, t.projeto, h('div', { class: 'dica' }, `sessão ${t.sessao}`)),
      h('td', {}, modelos.length ? modelos : h('span', { class: 'dica' }, '—')),
      h('td', { class: 'num' }, fmt(t.equivalente)));
  }));
}

function sessoes(e) {
  if (!e.sessoes.length) { $('sessoes').replaceChildren(h('p', { class: 'vazio' }, 'Nenhuma sessão lida ainda.')); return; }
  $('sessoes').replaceChildren(...e.sessoes.slice(0, 30).map((s) => h('div', { class: 'sessao' },
    h('div', { class: 'linha1' }, h('b', {}, s.projeto), h('span', { class: s.ativa ? 'ativa' : 'inativa' }, s.ativa ? '● ativa' : `última atividade ${quando(s.ultimo)}`)),
    h('div', { class: 'linha2' }, `${s.branch || 'sem branch'} · ${s.modelos.join(', ')} · ${fmt(s.equivalente)} equivalentes`),
    s.tarefaAtiva ? h('div', { class: 'linha2' }, `◐ ${s.tarefaAtiva}`) : null)));
}

function recentes(e) {
  if (!e.recentes.length) { $('recentes').replaceChildren(h('li', { class: 'vazio' }, 'Sem atividade.')); return; }
  $('recentes').replaceChildren(...e.recentes.map((r) => h('li', {},
    h('span', { class: 'hora' }, hora(r.quando)),
    h('span', {}, `${r.projeto} · ${r.modelo.replace('claude-', '')}`, r.tarefa ? h('div', { class: 'dica' }, r.tarefa) : null),
    h('span', { class: 'num' }, fmt(r.equivalente)))));
}

function externo(alvo, fonte, comoAtivar, linha) {
  if (!fonte?.ativo) { $(alvo).replaceChildren(h('p', { class: 'vazio' }, comoAtivar)); return; }
  const filhos = [];
  if (fonte.erro) filhos.push(h('p', { class: 'vazio' }, `Falha na última consulta: ${fonte.erro}`));
  if (!fonte.itens.length) filhos.push(h('p', { class: 'vazio' }, 'Nada em aberto.'));
  else filhos.push(h('table', {}, h('tbody', {}, fonte.itens.map(linha))));
  if (fonte.atualizado) filhos.push(h('p', { class: 'dica' }, `Atualizado às ${hora(fonte.atualizado)}`));
  $(alvo).replaceChildren(...filhos);
}

function render(e) {
  ultimo = e;
  tiles(e);
  tempo(e);
  barras('modelos', e.modelos, (g) => `${g.requisicoes} requisições · saída ${fmt(g.output)}`);
  barras('projetos', e.projetos);
  tarefas(e);
  sessoes(e);
  recentes(e);
  externo('aprovacoes', e.aprovacoes, 'Defina MONDAY_TOKEN e MONDAY_BOARD_ID para ver as aprovações do board.',
    (i) => h('tr', {}, h('td', {}, h('a', { href: i.url, rel: 'noopener noreferrer', target: '_blank' }, i.nome)), h('td', {}, i.tipo), h('td', {}, i.prioridade), h('td', {}, i.status)));
  externo('prs', e.prs, 'Defina GITHUB_REPO (e GITHUB_TOKEN para ver os checks).',
    (p) => h('tr', {}, h('td', {}, h('a', { href: p.url, rel: 'noopener noreferrer', target: '_blank' }, `#${p.numero} ${p.titulo}`)),
      h('td', {}, p.rascunho ? 'rascunho' : 'pronto'),
      h('td', {}, p.checks ? `✓ ${p.checks.sucesso} · ✗ ${p.checks.falha} · ◐ ${p.checks.andamento}` : '—')));
  const f = e.fontes || {};
  $('rodape').textContent = `${f.arquivos ?? 0} transcripts lidos em ${f.transcripts || '—'}${f.linhasInvalidas ? ` (${f.linhasInvalidas} linhas inválidas ignoradas)` : ''} · histórico em ${f.banco || '—'}${f.salvoEm ? `, salvo às ${hora(f.salvoEm)}` : ''}${e.totais.naoMedidos ? ` · ${e.totais.naoMedidos} trecho(s) sem medição no registro` : ''}. Tokens equivalentes: cache lido 0,1, cache escrito 2, saída 5.`;
}

$('filtros').addEventListener('click', (ev) => {
  const b = ev.target.closest('button');
  if (!b) return;
  filtro = b.dataset.f;
  for (const x of $('filtros').querySelectorAll('button')) x.setAttribute('aria-pressed', String(x === b));
  if (ultimo) tarefas(ultimo);
});

function conectar() {
  const fonte = new EventSource('/eventos');
  fonte.addEventListener('estado', (m) => {
    $('conexao').textContent = 'ao vivo';
    $('conexao').className = 'conexao ok';
    render(JSON.parse(m.data));
  });
  fonte.onerror = () => { $('conexao').textContent = 'reconectando…'; $('conexao').className = 'conexao erro'; };
}
conectar();
