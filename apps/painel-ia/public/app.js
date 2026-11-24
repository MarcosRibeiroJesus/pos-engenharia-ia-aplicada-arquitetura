// Interface do painel. Cada texto vindo dos dados entra por textContent (nunca innerHTML).
'use strict';

const SVG_NS = 'http://www.w3.org/2000/svg';
const $ = (id) => document.getElementById(id);

function h(tag, attrs = {}, ...filhos) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v);
  }
  for (const f of filhos.flat()) if (f != null) el.append(f instanceof Node ? f : String(f));
  return el;
}

function svgEl(tag, attrs = {}, ...filhos) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, String(v));
  for (const f of filhos.flat()) if (f != null) el.append(f instanceof Node ? f : document.createTextNode(String(f)));
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
let filtroAgenteGlobal = 'todos';
let filtroProjetoComp = 'todos';
let abaAtiva = 'geral';

const passaAgente = (ag) => filtroAgenteGlobal === 'todos' || (ag || 'claude-code') === filtroAgenteGlobal;
let ultimo = null;
let sessaoSelecionada = null;
let detalheAtual = null;

function trocarAba(nova) {
  abaAtiva = nova;
  for (const b of $('abas').querySelectorAll('button')) {
    b.setAttribute('aria-selected', String(b.dataset.aba === nova));
  }
  for (const p of document.querySelectorAll('.painel-aba')) {
    p.classList.toggle('oculto', p.dataset.painel !== nova);
  }
  if ((nova === 'sessao' || nova === 'atribuicao') && sessaoSelecionada) carregarDetalhe(sessaoSelecionada);
  if (nova === 'comparativo') carregarComparativo();
}

function resumoFiltrado(e) {
  if (filtroAgenteGlobal === 'todos') return { totais: e.totais, porTipo: e.porTipo || [] };
  const ag = (e.porAgente || []).find((a) => a.agente === filtroAgenteGlobal) || { requisicoes: 0, input: 0, cache_write: 0, cache_read: 0, output: 0, equivalente: 0, sessoes: 0 };
  const eq = ag.equivalente || 1;
  const porTipo = [
    { tipo: 'cache_read', rotulo: 'Cache lido (×0,1)', tokens: ag.cache_read, equivalente: Math.round(ag.cache_read * 0.1), pct: Number(((100 * ag.cache_read * 0.1) / eq).toFixed(1)) },
    { tipo: 'cache_write', rotulo: 'Cache escrito (×2)', tokens: ag.cache_write, equivalente: Math.round(ag.cache_write * 2), pct: Number(((100 * ag.cache_write * 2) / eq).toFixed(1)) },
    { tipo: 'output', rotulo: 'Saída (×5)', tokens: ag.output, equivalente: Math.round(ag.output * 5), pct: Number(((100 * ag.output * 5) / eq).toFixed(1)) },
    { tipo: 'input', rotulo: 'Entrada nova (×1)', tokens: ag.input, equivalente: Math.round(ag.input), pct: Number(((100 * ag.input) / eq).toFixed(1)) },
  ].sort((a, b) => b.equivalente - a.equivalente);
  const sessoesAtivas = (e.sessoes || []).filter((s) => s.ativa && passaAgente(s.agente)).length;
  return { totais: { ...e.totais, ...ag, sessoesAtivas }, porTipo };
}

function tiles(e) {
  const { totais, porTipo } = resumoFiltrado(e);
  const tarefasFilt = (e.tarefas || []).filter((t) => passaAgente(t.agente));
  const c = { in_progress: 0, completed: 0, pending: 0 };
  for (const t of tarefasFilt) c[t.status] = (c[t.status] || 0) + 1;
  const sessoesFilt = (e.sessoes || []).filter((s) => passaAgente(s.agente));
  const opsFilt = (e.consumo?.oportunidades || []).filter((o) => passaAgente(o.agente));
  const abertas = (e.aprovacoes?.itens || []).filter((i) => !/feito|done|conclu/i.test(i.status)).length;
  const maiorTipo = porTipo[0];
  const itens = [
    ['Tokens equivalentes', fmt(totais.equivalente), `${fmt(totais.requisicoes)} requisições${filtroAgenteGlobal !== 'todos' ? ` · ${filtroAgenteGlobal}` : ''}`],
    ['Maior peso', maiorTipo ? `${maiorTipo.pct}%` : '—', maiorTipo ? maiorTipo.rotulo : 'sem dados'],
    ['Ritmo agora', `${fmt(e.totais.porMinuto5)}/min`, 'média global dos últimos 5 minutos'],
    ['Sessões ativas', String(totais.sessoesAtivas), `${sessoesFilt.length} com uso registrado`],
    ['Tarefas em andamento', String(c.in_progress || 0), `${c.completed || 0} concluídas · ${c.pending || 0} pendentes`],
    ['Oportunidades', String(opsFilt.length), 'regras de economia disparadas'],
  ];
  if (e.aprovacoes?.ativo) itens.push(['Aprovações abertas', String(abertas), 'no board do Monday']);
  $('tiles').replaceChildren(...itens.map(([r, v, s]) => h('div', { class: 'tile' }, h('span', {}, r), h('b', {}, v), h('small', {}, s))));
}

function renderPorTipo(e) {
  const { porTipo: lista } = resumoFiltrado(e);
  if (!lista.length) { $('por-tipo').replaceChildren(h('p', { class: 'vazio' }, 'Sem dados ainda.')); return; }
  const max = Math.max(1, ...lista.map((t) => t.equivalente));
  $('por-tipo').replaceChildren(...lista.map((t) => h('div', {
    class: 'barra',
    title: `${t.rotulo}: ${fmt(t.tokens)} tokens → ${fmt(t.equivalente)} equivalentes (${t.pct}%)`,
  },
  h('span', { class: 'nome' }, t.rotulo),
  h('span', { class: 'trilho' }, h('i', { style: { width: `${(100 * t.equivalente) / max}%` } })),
  h('span', { class: 'valor' }, `${t.pct}%`),
  h('span', { class: 'sub' }, `${fmt(t.tokens)} tokens · ${fmt(t.equivalente)} equivalentes`))));
}

function renderPorDia(e) {
  const dias = (e.porDia || []).slice(-14);
  if (!dias.length) { $('por-dia').replaceChildren(h('p', { class: 'vazio' }, 'Sem dados ainda.')); return; }
  const W = 520, H = 140, padL = 8, padB = 22, padT = 10;
  const max = Math.max(1, ...dias.map((d) => d.equivalente));
  const bw = Math.max(10, Math.floor((W - padL * 2) / dias.length) - 4);
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'svg-grafico', role: 'img', 'aria-label': 'Consumo diário em tokens equivalentes' });
  dias.forEach((d, i) => {
    const x = padL + i * ((W - padL * 2) / dias.length);
    const bh = Math.max(2, ((H - padB - padT) * d.equivalente) / max);
    const y = H - padB - bh;
    const rect = svgEl('rect', { x, y, width: bw, height: bh, rx: 3, class: 'svg-barra' },
      svgEl('title', {}, `${d.nome}: ${fmt(d.equivalente)} equivalentes (${d.requisicoes} reqs)`));
    const txt = svgEl('text', { x: x + bw / 2, y: H - 6, 'text-anchor': 'middle', class: 'svg-rotulo' }, d.nome.slice(5));
    svg.append(rect, txt);
  });
  $('por-dia').replaceChildren(svg);
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
  const lista = e.tarefas.filter((t) => (filtro === 'todas' || t.status === filtro) && passaAgente(t.agente));
  const corpo = $('tarefas').tBodies[0];
  if (!lista.length) { corpo.replaceChildren(h('tr', {}, h('td', { colspan: '6', class: 'vazio' }, 'Nenhuma tarefa neste filtro.'))); return; }
  corpo.replaceChildren(...lista.slice(0, 400).map((t) => {
    const [icone, rotulo] = STATUS[t.status] || ['·', t.status];
    const modelos = Object.entries(t.modelos || {}).sort((a, b) => b[1] - a[1]).map(([m]) => h('span', { class: 'chip' }, m.replace('claude-', '')));
    return h('tr', {},
      h('td', {}, h('span', { class: `status ${t.status}` }, `${icone} ${rotulo}`)),
      h('td', {}, t.titulo),
      h('td', {}, t.projeto, h('div', { class: 'dica' }, `${t.fonte === 'progresso' ? 'progresso' : 'sessão'} ${t.sessao}`)),
      h('td', {}, h('span', { class: 'chip chip-info' }, t.agente || 'claude-code')),
      h('td', {}, modelos.length ? modelos : h('span', { class: 'dica' }, '—')),
      h('td', { class: 'num' }, t.equivalente ? fmt(t.equivalente) : '—'));
  }));
}

function sessoes(e) {
  const lista = e.sessoes.filter((s) => passaAgente(s.agente));
  if (!lista.length) { $('sessoes').replaceChildren(h('p', { class: 'vazio' }, 'Nenhuma sessão neste filtro.')); }
  else {
    $('sessoes').replaceChildren(...lista.slice(0, 30).map((s) => h('div', {
      class: 'sessao clicavel',
      onclick: () => { sessaoSelecionada = s.idCompleto || s.id; $('seletor-sessao').value = sessaoSelecionada; trocarAba('sessao'); },
    },
    h('div', { class: 'linha1' }, h('b', {}, `${s.projeto} (${s.id})`), h('span', { class: 'chip chip-info' }, s.agente || 'claude-code'), h('span', { class: s.ativa ? 'ativa' : 'inativa' }, s.ativa ? '● ativa' : `última atividade ${quando(s.ultimo)}`)),
    h('div', { class: 'linha2' }, `${s.branch || 'sem branch'} · ${s.modelos.join(', ')} · ${fmt(s.equivalente)} equivalentes`),
    s.tarefaAtiva ? h('div', { class: 'linha2' }, `◐ ${s.tarefaAtiva}`) : null)));
  }

  const sel = $('seletor-sessao');
  const atual = sessaoSelecionada || (lista[0]?.idCompleto || lista[0]?.id || '');
  sel.replaceChildren(...lista.map((s) => h('option', { value: s.idCompleto || s.id }, `[${s.agente || 'claude-code'}] ${s.projeto} · ${s.id} (${fmt(s.equivalente)} eq.)`)));
  if (atual && lista.some((s) => (s.idCompleto || s.id) === atual)) { sel.value = atual; sessaoSelecionada = sel.value; }
  else if (lista[0]) { sel.value = lista[0].idCompleto || lista[0].id; sessaoSelecionada = sel.value; }
}

function recentes(e) {
  const lista = e.recentes.filter((r) => passaAgente(r.agente));
  if (!lista.length) { $('recentes').replaceChildren(h('li', { class: 'vazio' }, 'Sem atividade neste filtro.')); return; }
  $('recentes').replaceChildren(...lista.map((r) => h('li', {},
    h('span', { class: 'hora' }, hora(r.quando)),
    h('span', {}, `${r.projeto} · `, h('span', { class: 'chip chip-info' }, r.agente || 'claude-code'), ` ${r.modelo.replace('claude-', '')}`, r.tarefa ? h('div', { class: 'dica' }, r.tarefa) : null),
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

async function carregarDetalhe(sid) {
  if (!sid) return;
  try {
    const resp = await fetch(`/api/sessao/${encodeURIComponent(sid)}`);
    if (!resp.ok) return;
    detalheAtual = await resp.json();
    renderTimeline(detalheAtual);
    renderCarregamento(detalheAtual);
  } catch { /* falha transitória */ }
}

function renderTimeline(det) {
  const principal = (det.timeline || []).filter((r) => !r.isSubagente);
  const pontos = principal.length ? principal : (det.timeline || []);
  const maxCtx = Math.max(1, ...pontos.map((p) => p.contexto));
  const frios = det.timeline.filter((r) => r.cache_frio).length;
  const comps = det.timeline.filter((r) => r.compactacao).length;
  $('resumo-sessao').textContent = `${det.timeline.length} requisições totais (${principal.length} no fio principal, ${det.subagentes.total_fios} subagentes) · contexto máx ${fmt(maxCtx)} · ${frios} cache(s) frio(s) · ${comps} compactação(ões).`;

  const W = 1080, H = 220, padL = 48, padR = 20, padT = 18, padB = 26;
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'svg-grafico', role: 'img', 'aria-label': 'Crescimento do contexto e taxa de cache por requisição' });
  if (pontos.length) {
    const xDe = (i) => padL + (pontos.length === 1 ? 0 : (i * (W - padL - padR)) / (pontos.length - 1));
    const yCtx = (v) => H - padB - ((H - padT - padB) * v) / maxCtx;
    const yCache = (t) => H - padB - (H - padT - padB) * t;

    const ptsCtx = pontos.map((p, i) => `${xDe(i).toFixed(1)},${yCtx(p.contexto).toFixed(1)}`).join(' ');
    const ptsCache = pontos.map((p, i) => `${xDe(i).toFixed(1)},${yCache(p.taxa_cache).toFixed(1)}`).join(' ');

    svg.append(
      svgEl('line', { x1: padL, y1: H - padB, x2: W - padR, y2: H - padB, class: 'svg-eixo' }),
      svgEl('text', { x: 4, y: padT + 4, class: 'svg-rotulo' }, fmt(maxCtx)),
      svgEl('text', { x: 4, y: H - padB, class: 'svg-rotulo' }, '0'),
      svgEl('polyline', { points: ptsCache, fill: 'none', class: 'svg-linha-cache' }),
      svgEl('polyline', { points: ptsCtx, fill: 'none', class: 'svg-linha-ctx' }),
    );
    pontos.forEach((p, i) => {
      const cx = xDe(i), cy = yCtx(p.contexto);
      if (p.cache_frio) svg.append(svgEl('circle', { cx, cy, r: 5, class: 'marc-frio' }, svgEl('title', {}, `Req #${i}: cache frio (${fmt(p.cache_write)} escrito)`)));
      if (p.compactacao) svg.append(svgEl('circle', { cx, cy: cy + 8, r: 4.5, class: 'marc-comp' }, svgEl('title', {}, `Req #${i}: compactação`)));
      if (p.retomada_longa) svg.append(svgEl('circle', { cx, cy: padT, r: 4.5, class: 'marc-pausa' }, svgEl('title', {}, `Req #${i}: pausa > 8h (${Math.round(p.pausa_s / 3600)}h)`)));
      if (p.subagente_disparado) svg.append(svgEl('circle', { cx, cy: H - padB - 4, r: 3, class: 'marc-sub' }, svgEl('title', {}, `Req #${i}: subagente disparado`)));
    });
  }
  $('svg-timeline').replaceChildren(svg);

  const agenteSessao = ultimo?.sessoes?.find((s) => (s.idCompleto || s.id) === det.sessao)?.agente || 'claude-code';
  const corpo = $('tabela-timeline').tBodies[0];
  corpo.replaceChildren(...det.timeline.slice(0, 400).map((r) => {
    const tags = [];
    if (r.cache_frio) tags.push(h('span', { class: 'chip chip-alerta' }, 'cache frio'));
    if (r.compactacao) tags.push(h('span', { class: 'chip chip-info' }, 'compactação'));
    if (r.retomada_longa) tags.push(h('span', { class: 'chip chip-alerta' }, `pausa ${Math.round(r.pausa_s / 3600)}h`));
    if (r.troca_modelo) tags.push(h('span', { class: 'chip' }, 'troca modelo'));
    if (r.subagente_disparado) tags.push(h('span', { class: 'chip chip-info' }, 'subagente'));
    if (r.hook_injetado) tags.push(h('span', { class: 'chip' }, 'hook'));
    for (const t of (r.tools || []).slice(0, 4)) tags.push(h('span', { class: 'chip' }, t));
    return h('tr', {},
      h('td', { class: 'num' }, String(r.idx)),
      h('td', {}, h('span', { class: 'chip chip-info' }, agenteSessao)),
      h('td', {}, r.fio),
      h('td', {}, r.modelo.replace('claude-', '')),
      h('td', { class: 'num' }, fmt(r.contexto)),
      h('td', { class: 'num' }, r.delta_contexto >= 0 ? `+${fmt(r.delta_contexto)}` : fmt(r.delta_contexto)),
      h('td', { class: 'num' }, `${Math.round(r.taxa_cache * 100)}%`),
      h('td', { class: 'num' }, fmt(r.equivalente)),
      h('td', {}, tags.length ? tags : h('span', { class: 'dica' }, '—')));
  }));
}

function renderAtribuicaoGlobal(e) {
  const lista = e.consumo?.atribuicao || [];
  if (!lista.length) { $('atribuicao-global').replaceChildren(h('p', { class: 'vazio' }, 'Sem dados de atribuição ainda.')); return; }
  const max = Math.max(1, ...lista.map((o) => o.token_reqs));
  $('atribuicao-global').replaceChildren(...lista.map((o) => h('div', {
    class: 'barra',
    title: `${o.origem}: +${fmt(o.delta_tokens)} tokens delta · ${fmt(o.token_reqs)} token-reqs · ~${fmt(o.custo_carr_equiv)} eq. (estimativa proporcional)`,
  },
  h('span', { class: 'nome' }, o.origem),
  h('span', { class: 'trilho' }, h('i', { style: { width: `${(100 * o.token_reqs) / max}%` } })),
  h('span', { class: 'valor' }, fmt(o.custo_carr_equiv)),
  h('span', { class: 'sub' }, `+${fmt(o.delta_tokens)} delta · ${fmt(o.token_reqs)} token-reqs · ${o.ocorrencias}× (proporcional)`))));
}

function renderCarregamento(det) {
  const corpo = $('tabela-carregamento').tBodies[0];
  const lista = det?.atribuicao?.ranking_carregamento || [];
  if (!lista.length) { corpo.replaceChildren(h('tr', {}, h('td', { colspan: '7', class: 'vazio' }, 'Selecione uma sessão com crescimento de contexto.'))); return; }
  corpo.replaceChildren(...lista.map((ev) => h('tr', {},
    h('td', {}, ev.fio),
    h('td', { class: 'num' }, `#${ev.req_idx}`),
    h('td', {}, ev.origem),
    h('td', { class: 'num' }, fmt(ev.delta_tokens)),
    h('td', { class: 'num' }, String(ev.reqs_seguintes)),
    h('td', { class: 'num' }, fmt(ev.token_reqs)),
    h('td', { class: 'num' }, `${fmt(ev.custo_carr_equiv)} (est.)`))));
}

function renderSubagentes(e) {
  const sub = e.consumo?.subagentes || { total_equivalente: 0, total_fios: 0, arquivos_reabertos: 0, por_tipo: {}, top: [] };
  const pctSub = e.totais.equivalente ? Math.round((100 * sub.total_equivalente) / e.totais.equivalente) : 0;
  $('tiles-subagentes').replaceChildren(
    h('div', { class: 'tile' }, h('span', {}, 'Custo em subagentes'), h('b', {}, fmt(sub.total_equivalente)), h('small', {}, `${pctSub}% do total equivalente`)),
    h('div', { class: 'tile' }, h('span', {}, 'Fios de subagente'), h('b', {}, String(sub.total_fios)), h('small', {}, 'transcripts em subagents/')),
    h('div', { class: 'tile' }, h('span', {}, 'Arquivos reabertos'), h('b', {}, String(sub.arquivos_reabertos)), h('small', {}, 'mesmo hash lido em mais de um fio')),
  );

  const tipos = Object.entries(sub.por_tipo || {}).sort((a, b) => b[1] - a[1]);
  if (!tipos.length) $('subagentes-tipos').replaceChildren(h('p', { class: 'vazio' }, 'Nenhuma chamada Agent registrada.'));
  else {
    const max = Math.max(1, ...tipos.map(([, n]) => n));
    $('subagentes-tipos').replaceChildren(...tipos.map(([tipo, n]) => h('div', { class: 'barra' },
      h('span', { class: 'nome' }, tipo),
      h('span', { class: 'trilho' }, h('i', { style: { width: `${(100 * n) / max}%` } })),
      h('span', { class: 'valor' }, `${n}×`))));
  }

  const topFiltrado = (sub.top || []).filter((s) => passaAgente(s.agente));
  const corpo = $('tabela-subagentes').tBodies[0];
  if (!topFiltrado.length) { corpo.replaceChildren(h('tr', {}, h('td', { colspan: '8', class: 'vazio' }, 'Sem subagentes medidos neste filtro.'))); return; }
  corpo.replaceChildren(...topFiltrado.map((s) => h('tr', {},
    h('td', {}, s.sessao),
    h('td', {}, h('span', { class: 'chip chip-info' }, s.agente || 'claude-code')),
    h('td', {}, s.fio),
    h('td', {}, s.modelos.map((m) => m.replace('claude-', '')).join(', ')),
    h('td', { class: 'num' }, String(s.requisicoes)),
    h('td', { class: 'num' }, fmt(s.ctx_max)),
    h('td', { class: 'num' }, String(s.arquivos_reabertos)),
    h('td', { class: 'num' }, fmt(s.equivalente)))));
}

function medidorPct(rotulo, pct, detalhe) {
  const largura = Math.min(100, Math.max(0, Number(pct) || 0));
  const classe = pct >= 100 ? 'critico' : (pct >= 80 ? 'alerta' : '');
  return h('div', { class: 'medidor', title: detalhe },
    h('div', { class: 'medidor-rotulo' }, h('span', {}, rotulo), h('b', {}, `${pct}%`)),
    h('div', { class: 'medidor-trilho' }, h('i', { class: classe, style: { width: `${largura}%` } })),
    h('div', { class: 'dica' }, detalhe));
}

function renderPaineisAgentes(e) {
  const paineis = (e.painelAgentes || []).filter((p) => passaAgente(p.agente));
  if (!paineis.length) { $('paineis-code-agents').replaceChildren(h('p', { class: 'vazio' }, 'Sem dados neste filtro.')); return; }
  $('paineis-code-agents').replaceChildren(...paineis.map((p) => h('div', { class: 'card-agente' },
    h('div', { class: 'card-agente-topo' },
      h('b', {}, p.titulo),
      h('span', { class: p.provedor.ativo ? 'chip chip-info' : 'chip' }, p.provedor.ativo ? 'API provedor' : p.provedor.fonte)),
    medidorPct('Sessão atual', p.sessao.pct, `${fmt(p.sessao.equivalente)} / ${fmt(p.sessao.cota)} eq.${p.sessao.id ? ` (${p.sessao.id})` : ''}`),
    medidorPct(`Semana ${p.semana.chave}`, p.semana.pct, `${fmt(p.semana.equivalente)} / ${fmt(p.semana.cota)} eq. · ${fmt(p.semana.requisicoes)} reqs`),
    p.provedor.custoUsd != null ? h('div', { class: 'dica' }, `Custo provedor (7d): US$ ${p.provedor.custoUsd.toFixed(2)}`) : null,
    p.provedor.erro ? h('div', { class: 'dica' }, `Provedor: ${p.provedor.erro}`) : null)));

  const custos = e.custoPorToken || [];
  const corpoCusto = $('tabela-custo-token').tBodies[0];
  if (!custos.length) { corpoCusto.replaceChildren(h('tr', {}, h('td', { colspan: '8', class: 'vazio' }, 'Sem modelos medidos ainda.'))); return; }
  corpoCusto.replaceChildren(...custos.map((c) => h('tr', {},
    h('td', {}, c.modelo),
    h('td', { class: 'num' }, `$${c.input1M}`),
    h('td', { class: 'num' }, `$${c.cacheWrite1M}`),
    h('td', { class: 'num' }, `$${c.cacheRead1M}`),
    h('td', { class: 'num' }, `$${c.output1M}`),
    h('td', { class: 'num' }, `$${c.efetivoPorMilhaoUsd.toFixed(3)}`),
    h('td', { class: 'num' }, `$${c.totalUsd.toFixed(2)}`),
    h('td', {}, h('span', { class: 'chip' }, c.rotulo)))));
}

function renderComparativoAgentes(e) {
  renderPaineisAgentes(e);
  const agentes = (e.porAgente || []).filter((a) => passaAgente(a.agente));
  if (!agentes.length) {
    $('tiles-agentes').replaceChildren();
    $('barras-agentes').replaceChildren(h('p', { class: 'vazio' }, 'Sem uso por agente neste filtro.'));
  } else {
    $('tiles-agentes').replaceChildren(...agentes.map((a) => h('div', { class: 'tile' },
      h('span', {}, a.agente),
      h('b', {}, fmt(a.equivalente)),
      h('small', {}, `${fmt(a.requisicoes)} reqs · média ${fmt(a.mediaPorReq)}/req · cache ${a.taxaCache}%`))));
    const max = Math.max(1, ...agentes.map((a) => a.equivalente));
    $('barras-agentes').replaceChildren(...agentes.map((a) => h('div', {
      class: 'barra',
      title: `${a.agente}: ${fmt(a.equivalente)} equivalentes · ${a.sessoes} sessões · ${a.requisicoes} reqs`,
    },
    h('span', { class: 'nome' }, a.agente),
    h('span', { class: 'trilho' }, h('i', { style: { width: `${(100 * a.equivalente) / max}%` } })),
    h('span', { class: 'valor' }, fmt(a.equivalente)),
    h('span', { class: 'sub' }, `${a.sessoes} sessões · ${fmt(a.requisicoes)} reqs · média ${fmt(a.mediaPorReq)}/req · cache ${a.taxaCache}%`))));
  }

  // Gráfico SVG e tabela por semana (respeitando filtro global de Code Agent)
  const semanas = (e.porSemana || []).slice(-12);
  const valorSemana = (s) => (filtroAgenteGlobal === 'todos' ? s.equivalente : (s.agentes?.[filtroAgenteGlobal]?.equivalente || 0));
  if (!semanas.length) {
    $('svg-semana').replaceChildren(h('p', { class: 'vazio' }, 'Sem dados semanais ainda.'));
  } else {
    const W = 520, H = 140, padL = 8, padB = 22, padT = 10;
    const maxS = Math.max(1, ...semanas.map(valorSemana));
    const bw = Math.max(12, Math.floor((W - padL * 2) / semanas.length) - 6);
    const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'svg-grafico', role: 'img', 'aria-label': 'Consumo semanal por Code Agent' });
    semanas.forEach((s, i) => {
      const val = valorSemana(s);
      const x = padL + i * ((W - padL * 2) / semanas.length);
      const bh = Math.max(2, ((H - padB - padT) * val) / maxS);
      const y = H - padB - bh;
      svg.append(
        svgEl('rect', { x, y, width: bw, height: bh, rx: 3, class: 'svg-barra' },
          svgEl('title', {}, `${s.semana}: ${fmt(val)} equivalentes`)),
        svgEl('text', { x: x + bw / 2, y: H - 6, 'text-anchor': 'middle', class: 'svg-rotulo' }, s.semana.slice(5)),
      );
    });
    $('svg-semana').replaceChildren(svg);
  }

  const corpoSem = $('tabela-semanas').tBodies[0];
  if (!semanas.length) {
    corpoSem.replaceChildren(h('tr', {}, h('td', { colspan: '6', class: 'vazio' }, 'Sem dados semanais ainda.')));
  } else {
    corpoSem.replaceChildren(...[...semanas].reverse().map((s) => {
      const cc = s.agentes?.['claude-code'];
      const agy = s.agentes?.antigravity;
      const outrosEq = Object.entries(s.agentes || {})
        .filter(([k]) => k !== 'claude-code' && k !== 'antigravity')
        .reduce((acc, [, v]) => acc + (v.equivalente || 0), 0);
      const reqs = filtroAgenteGlobal === 'todos' ? s.requisicoes : (s.agentes?.[filtroAgenteGlobal]?.requisicoes || 0);
      const tot = valorSemana(s);
      return h('tr', {},
        h('td', {}, s.semana),
        h('td', { class: 'num' }, fmt(reqs)),
        h('td', { class: 'num' }, cc ? `${fmt(cc.equivalente)} (${cc.requisicoes}r)` : '—'),
        h('td', { class: 'num' }, agy ? `${fmt(agy.equivalente)} (${agy.requisicoes}r)` : '—'),
        h('td', { class: 'num' }, outrosEq ? fmt(outrosEq) : '—'),
        h('td', { class: 'num' }, fmt(tot)));
    }));
  }

  // Tabela de consumo dos Code Agents por sessão (clicável para abrir a linha do tempo)
  const sessoesFilt = (e.sessoes || []).filter((s) => passaAgente(s.agente));
  const corpoSess = $('tabela-sessoes-agente').tBodies[0];
  if (!sessoesFilt.length) {
    corpoSess.replaceChildren(h('tr', {}, h('td', { colspan: '10', class: 'vazio' }, 'Nenhuma sessão neste filtro.')));
  } else {
    corpoSess.replaceChildren(...sessoesFilt.slice(0, 100).map((s) => h('tr', {
      class: 'clicavel',
      onclick: () => { sessaoSelecionada = s.idCompleto || s.id; $('seletor-sessao').value = sessaoSelecionada; trocarAba('sessao'); },
    },
    h('td', {}, s.id),
    h('td', {}, h('span', { class: 'chip chip-info' }, s.agente || 'claude-code')),
    h('td', {}, s.projeto),
    h('td', {}, (s.modelos || []).map((m) => m.replace('claude-', '')).join(', ')),
    h('td', { class: 'num' }, fmt(s.requisicoes)),
    h('td', { class: 'num' }, fmt(s.cache_read)),
    h('td', { class: 'num' }, fmt(s.cache_write)),
    h('td', { class: 'num' }, fmt(s.output)),
    h('td', { class: 'num' }, fmt(s.equivalente)),
    h('td', {}, h('span', { class: s.ativa ? 'ativa' : 'inativa' }, s.ativa ? '● ativa' : quando(s.ultimo))))));
  }

  const lista = e.comparativoTarefas || [];
  const projetosUnicos = [...new Set(lista.flatMap((t) => t.projetos || []))].sort();
  const sel = $('filtro-projeto-comp');
  const atual = filtroProjetoComp;
  sel.replaceChildren(h('option', { value: 'todos' }, 'Todos'), ...projetosUnicos.map((p) => h('option', { value: p }, p)));
  sel.value = projetosUnicos.includes(atual) ? atual : 'todos';
  filtroProjetoComp = sel.value;

  const filtrada = lista.filter((t) => filtroProjetoComp === 'todos' || (t.projetos || []).includes(filtroProjetoComp));
  const corpo = $('tabela-comparativo').tBodies[0];
  if (!filtrada.length) { corpo.replaceChildren(h('tr', {}, h('td', { colspan: '6', class: 'vazio' }, 'Nenhuma tarefa com uso registrado neste filtro.'))); return; }
  corpo.replaceChildren(...filtrada.slice(0, 300).map((t) => {
    const cc = t.agentes['claude-code'];
    const agy = t.agentes.antigravity;
    const outrosEq = Object.entries(t.agentes)
      .filter(([k]) => k !== 'claude-code' && k !== 'antigravity')
      .reduce((s, [, v]) => s + (v.equivalente || 0), 0);
    return h('tr', {},
      h('td', {}, t.tarefa),
      h('td', {}, (t.projetos || []).join(', ') || '—'),
      h('td', { class: 'num' }, cc ? `${fmt(cc.equivalente)} (${cc.requisicoes}r)` : '—'),
      h('td', { class: 'num' }, agy ? `${fmt(agy.equivalente)} (${agy.requisicoes}r)` : '—'),
      h('td', { class: 'num' }, outrosEq ? fmt(outrosEq) : '—'),
      h('td', { class: 'num' }, fmt(t.totalEquivalente)));
  }));
}

function renderEconomia(e) {
  const ops = (e.consumo?.oportunidades || []).filter((o) => passaAgente(o.agente));
  if (!ops.length) { $('lista-economia').replaceChildren(h('p', { class: 'vazio' }, 'Nenhuma oportunidade de economia neste filtro.')); return; }
  $('lista-economia').replaceChildren(...ops.map((o) => h('div', { class: `oportunidade sev-${o.severidade}` },
    h('div', { class: 'op-topo' },
      h('b', {}, o.titulo),
      h('span', { class: 'chip chip-info' }, o.agente || 'claude-code'),
      h('span', { class: 'chip chip-alerta' }, `economia: ~${fmt(o.economia_estimada_equiv)} eq. (${o.rotulo})`)),
    h('div', { class: 'linha2' }, `Sessão ${o.sessao} · Regra: ${o.regra} · Evidência: ${o.evidencia}`),
    h('div', { class: 'op-acao' }, `Ação sugerida: ${o.acao}`))));
}

function atualizarFiltroAgenteGlobal(e) {
  const nomes = new Set([
    ...(e.porAgente || []).map((a) => a.agente),
    ...(e.tarefas || []).map((t) => t.agente),
    ...(e.sessoes || []).map((s) => s.agente),
  ].filter(Boolean));
  const lista = [...nomes].sort();
  const sel = $('filtro-agente-global');
  sel.replaceChildren(h('option', { value: 'todos' }, 'Todos'), ...lista.map((a) => h('option', { value: a }, a)));
  sel.value = lista.includes(filtroAgenteGlobal) ? filtroAgenteGlobal : 'todos';
  filtroAgenteGlobal = sel.value;
}

// ---- Comparativo A x B (D-075): lido de /api/comparativo ao abrir a aba e a cada atualização com ela aberta.
const NAO_MEDIDO = 'nao-medido';
const pct = (v) => (v == null ? 'sem base em A' : `${v > 0 ? '+' : ''}${String(v).replace('.', ',')}%`);
const inteiro = (n) => (n == null ? NAO_MEDIDO : Math.round(n).toLocaleString('pt-BR'));
let carregandoAb = false;

function linhaAb(rotulo, a, b, v) {
  return h('tr', {}, h('td', {}, rotulo), h('td', { class: 'num' }, a), h('td', { class: 'num' }, b), h('td', { class: 'num' }, v));
}

function renderComparativoAb(c) {
  const { A, B } = c.grupos;
  const corte = new Date(c.corte).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  $('ab-leitura').replaceChildren(
    `Corte: ${corte} (constante CORTE_AB em src/comparativo.js). `,
    h('span', { class: c.amostraPequena ? 'chip chip-alerta' : 'chip chip-info' }, c.leitura),
  );
  const metricas = [
    ['Sessões', 'sessoes'], ['Requisições', 'requisicoes'], ['Entrada', 'input'], ['Cache escrito', 'cache_write'],
    ['Cache lido', 'cache_read'], ['Saída', 'output'], ['Total equivalente', 'equivalente'],
    ['Equivalente por sessão', 'mediaPorSessao'], ['Chamadas de subagente', 'chamadasSubagente'],
    ['Chamadas de revisor-independente', 'revisorIndependente'],
  ];
  $('tabela-ab').querySelector('tbody').replaceChildren(...metricas.map(([r, k]) => linhaAb(r, inteiro(A[k]), inteiro(B[k]), pct(c.variacao[k]))));

  const tipos = [...new Set([...Object.keys(A.subagentes), ...Object.keys(B.subagentes)])]
    .sort((x, y) => ((A.subagentes[y] || 0) + (B.subagentes[y] || 0)) - ((A.subagentes[x] || 0) + (B.subagentes[x] || 0)));
  const corpoSub = $('tabela-ab-subagentes').querySelector('tbody');
  if (!tipos.length) corpoSub.replaceChildren(h('tr', {}, h('td', { colspan: 3, class: 'vazio' }, 'Nenhuma chamada de subagente medida.')));
  else corpoSub.replaceChildren(...tipos.map((t) => h('tr', {}, h('td', {}, t),
    h('td', { class: 'num' }, String(A.subagentes[t] || 0)), h('td', { class: 'num' }, String(B.subagentes[t] || 0)))));

  const cr = c.coderabbit;
  if (cr.status !== 'medido') {
    $('ab-coderabbit').replaceChildren(h('p', { class: 'vazio' }, `${NAO_MEDIDO}: ${cr.motivo}`));
  } else {
    const t = h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Métrica'), h('th', { class: 'num' }, 'A'), h('th', { class: 'num' }, 'B'))),
      h('tbody', {}, ...[['PRs mergeados', 'prs'], ['PRs com review do CodeRabbit', 'prsComReview'], ['Reviews', 'reviews'],
        ['Comentários', 'comentarios'], ['Rodadas (commits depois do 1º review)', 'rodadas']]
        .map(([r, k]) => h('tr', {}, h('td', {}, r), h('td', { class: 'num' }, String(cr.A[k])), h('td', { class: 'num' }, String(cr.B[k]))))));
    $('ab-coderabbit').replaceChildren(t, h('p', { class: 'dica' }, `Coletado em ${quando(Date.parse(cr.coletadoEm))}. Grupo pela data do merge.`));
  }

  const rg = c.registro;
  $('ab-registro').replaceChildren(h('p', { class: 'dica' },
    `A: ${rg.A.medido.linhas} linha(s) medida(s), ${inteiro(equivalenteReg(rg.A.medido))} equivalentes, ${rg.A.naoMedidos} ${NAO_MEDIDO} · `
    + `B: ${rg.B.medido.linhas} linha(s) medida(s), ${inteiro(equivalenteReg(rg.B.medido))} equivalentes, ${rg.B.naoMedidos} ${NAO_MEDIDO}. `
    + 'Linhas nao-medido não entram em número nenhum.'));

  const corpoT = $('tabela-testes-ab').querySelector('tbody');
  if (!c.testes.length) corpoT.replaceChildren(h('tr', {}, h('td', { colspan: 6, class: 'vazio' }, 'Nenhum teste registrado.')));
  else corpoT.replaceChildren(...c.testes.map((t) => h('tr', {}, h('td', {}, t.id), h('td', {}, t.data), h('td', {}, t.versao_harness),
    h('td', {}, t.grupo), h('td', { class: 'num' }, inteiro(t.tokens)), h('td', {}, t.observacao))));
}

const equivalenteReg = (m) => m.input + 2 * m.cache_write + 0.1 * m.cache_read + 5 * m.output;

async function carregarComparativo() {
  if (carregandoAb) return;
  carregandoAb = true;
  try {
    const r = await fetch('/api/comparativo');
    if (r.ok) renderComparativoAb(await r.json());
    else $('ab-leitura').textContent = `Falha ao ler o comparativo (${r.status}).`;
  } catch { $('ab-leitura').textContent = 'Falha ao ler o comparativo.'; } finally { carregandoAb = false; }
}

function render(e) {
  ultimo = e;
  atualizarFiltroAgenteGlobal(e);
  if (abaAtiva === 'comparativo') carregarComparativo();
  tiles(e);
  renderPorTipo(e);
  renderPorDia(e);
  tempo(e);
  barras('modelos', e.modelos, (g) => `${g.requisicoes} requisições · saída ${fmt(g.output)}`);
  barras('projetos', e.projetos);
  tarefas(e);
  sessoes(e);
  recentes(e);
  renderAtribuicaoGlobal(e);
  renderSubagentes(e);
  renderComparativoAgentes(e);
  renderEconomia(e);
  externo('aprovacoes', e.aprovacoes, 'Defina MONDAY_TOKEN e MONDAY_BOARD_ID para ver as aprovações do board.',
    (i) => h('tr', {}, h('td', {}, h('a', { href: i.url, rel: 'noopener noreferrer', target: '_blank' }, i.nome)), h('td', {}, i.tipo), h('td', {}, i.prioridade), h('td', {}, i.status)));
  externo('prs', e.prs, 'Defina GITHUB_REPO (e GITHUB_TOKEN para ver os checks).',
    (p) => h('tr', {}, h('td', {}, h('a', { href: p.url, rel: 'noopener noreferrer', target: '_blank' }, `#${p.numero} ${p.titulo}`)),
      h('td', {}, p.rascunho ? 'rascunho' : 'pronto'),
      h('td', {}, p.checks ? `✓ ${p.checks.sucesso} · ✗ ${p.checks.falha} · ◐ ${p.checks.andamento}` : '—')));
  const f = e.fontes || {};
  $('rodape').textContent = `${f.arquivos ?? 0} transcripts lidos${f.linhasInvalidas ? ` (${f.linhasInvalidas} linhas inválidas ignoradas)` : ''}${f.salvoEm ? ` · salvo às ${hora(f.salvoEm)}` : ''}${e.totais.naoMedidos ? ` · ${e.totais.naoMedidos} trecho(s) sem medição no registro` : ''}. Tokens equivalentes: cache lido 0,1, cache escrito 2, saída 5.`;
}

$('abas').addEventListener('click', (ev) => {
  const b = ev.target.closest('button[data-aba]');
  if (b) trocarAba(b.dataset.aba);
});

$('seletor-sessao').addEventListener('change', (ev) => {
  sessaoSelecionada = ev.target.value;
  carregarDetalhe(sessaoSelecionada);
});

$('filtro-agente-global').addEventListener('change', (ev) => {
  filtroAgenteGlobal = ev.target.value;
  if (ultimo) render(ultimo);
});

$('filtro-projeto-comp').addEventListener('change', (ev) => {
  filtroProjetoComp = ev.target.value;
  if (ultimo) renderComparativoAgentes(ultimo);
});

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
