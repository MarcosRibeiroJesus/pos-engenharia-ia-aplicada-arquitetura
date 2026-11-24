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
let abaAtiva = 'geral';
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
  if (nova === 'modelos') carregarModelos(true);
}

function tiles(e) {
  const c = e.contagemTarefas || {};
  const abertas = (e.aprovacoes?.itens || []).filter((i) => !/feito|done|conclu/i.test(i.status)).length;
  const maiorTipo = (e.porTipo || [])[0];
  const itens = [
    ['Tokens equivalentes', fmt(e.totais.equivalente), `${fmt(e.totais.requisicoes)} requisições`],
    ['Maior peso', maiorTipo ? `${maiorTipo.pct}%` : '—', maiorTipo ? maiorTipo.rotulo : 'sem dados'],
    ['Ritmo agora', `${fmt(e.totais.porMinuto5)}/min`, 'média dos últimos 5 minutos'],
    ['Sessões ativas', String(e.totais.sessoesAtivas), `${e.sessoes.length} com uso registrado`],
    ['Tarefas em andamento', String(c.in_progress || 0), `${c.completed || 0} concluídas · ${c.pending || 0} pendentes`],
    ['Oportunidades', String((e.consumo?.oportunidades || []).length), 'regras de economia disparadas'],
  ];
  if (e.aprovacoes?.ativo) itens.push(['Aprovações abertas', String(abertas), 'no board do Monday']);
  $('tiles').replaceChildren(...itens.map(([r, v, s]) => h('div', { class: 'tile' }, h('span', {}, r), h('b', {}, v), h('small', {}, s))));
}

function renderPorTipo(e) {
  const lista = e.porTipo || [];
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
  $('sessoes').replaceChildren(...e.sessoes.slice(0, 30).map((s) => h('div', {
    class: 'sessao clicavel',
    onclick: () => { sessaoSelecionada = s.idCompleto || s.id; $('seletor-sessao').value = sessaoSelecionada; trocarAba('sessao'); },
  },
  h('div', { class: 'linha1' }, h('b', {}, `${s.projeto} (${s.id})`), h('span', { class: s.ativa ? 'ativa' : 'inativa' }, s.ativa ? '● ativa' : `última atividade ${quando(s.ultimo)}`)),
  h('div', { class: 'linha2' }, `${s.branch || 'sem branch'} · ${s.modelos.join(', ')} · ${fmt(s.equivalente)} equivalentes`),
  s.tarefaAtiva ? h('div', { class: 'linha2' }, `◐ ${s.tarefaAtiva}`) : null)));

  const sel = $('seletor-sessao');
  const atual = sessaoSelecionada || (e.sessoes[0]?.idCompleto || e.sessoes[0]?.id || '');
  sel.replaceChildren(...e.sessoes.map((s) => h('option', { value: s.idCompleto || s.id }, `${s.projeto} · ${s.id} (${fmt(s.equivalente)} eq.)`)));
  if (atual) { sel.value = atual; sessaoSelecionada = sel.value; }
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

  const corpo = $('tabela-subagentes').tBodies[0];
  if (!sub.top.length) { corpo.replaceChildren(h('tr', {}, h('td', { colspan: '7', class: 'vazio' }, 'Sem subagentes medidos.'))); return; }
  corpo.replaceChildren(...sub.top.map((s) => h('tr', {},
    h('td', {}, s.sessao),
    h('td', {}, s.fio),
    h('td', {}, s.modelos.map((m) => m.replace('claude-', '')).join(', ')),
    h('td', { class: 'num' }, String(s.requisicoes)),
    h('td', { class: 'num' }, fmt(s.ctx_max)),
    h('td', { class: 'num' }, String(s.arquivos_reabertos)),
    h('td', { class: 'num' }, fmt(s.equivalente)))));
}

function renderEconomia(e) {
  const ops = e.consumo?.oportunidades || [];
  if (!ops.length) { $('lista-economia').replaceChildren(h('p', { class: 'vazio' }, 'Nenhuma oportunidade de economia disparada ainda.')); return; }
  $('lista-economia').replaceChildren(...ops.map((o) => h('div', { class: `oportunidade sev-${o.severidade}` },
    h('div', { class: 'op-topo' },
      h('b', {}, o.titulo),
      h('span', { class: 'chip chip-alerta' }, `economia: ~${fmt(o.economia_estimada_equiv)} eq. (${o.rotulo})`)),
    h('div', { class: 'linha2' }, `Sessão ${o.sessao} · Regra: ${o.regra} · Evidência: ${o.evidencia}`),
    h('div', { class: 'op-acao' }, `Ação sugerida: ${o.acao}`))));
}

// ---------- ABA MODELOS ----------
const NAO_MEDIDO = 'nao-medido';
const ms = (v) => (v == null ? NAO_MEDIDO : (v >= 1000 ? `${(v / 1000).toFixed(1).replace('.', ',')} s` : `${Math.round(v)} ms`));
const usd = (v) => (v == null ? 'sem preço cadastrado' : `US$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: v < 1 ? 4 : 2 })}`);
const precoTxt = (v) => (v == null ? 'sem preço cadastrado' : String(v).replace('.', ','));
const NOMES_SEM_PRECO = { entrada: 'entrada', saida: 'saída', cache_escrita_5m: 'cache escrito 5m', cache_escrita_1h: 'cache escrito 1h',
  cache_leitura: 'cache lido', cache_escrita_sem_ttl: 'cache escrito sem TTL no transcript' };
let modelosBuscadoEm = 0;
let modelosEmVoo = false;

async function carregarModelos(forcar = false) {
  if (modelosEmVoo || (!forcar && Date.now() - modelosBuscadoEm < 5000)) return;
  modelosEmVoo = true;
  try {
    const resp = await fetch('/api/modelos');
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    renderModelos(await resp.json());
    modelosBuscadoEm = Date.now();
  } catch (err) {
    $('tabela-modelos-custo').tBodies[0].replaceChildren(h('tr', {}, h('td', { colspan: '10', class: 'vazio' }, `Falha ao carregar: ${err.message}`)));
  } finally { modelosEmVoo = false; }
}

function celulaLat(l, campo) {
  if (l.status !== 'medido') return h('td', { class: 'num', title: l.motivo }, NAO_MEDIDO);
  return h('td', { class: 'num' }, ms(l[campo]));
}

function renderModelos(r) {
  const nome = (m) => m.replace('claude-', '');
  const custo = $('tabela-modelos-custo').tBodies[0];
  const lat = $('tabela-modelos-latencia').tBodies[0];
  if (!r.modelos.length) {
    custo.replaceChildren(h('tr', {}, h('td', { colspan: '10', class: 'vazio' }, 'Nenhuma requisição medida ainda.')));
    lat.replaceChildren(h('tr', {}, h('td', { colspan: '9', class: 'vazio' }, 'Nenhuma requisição medida ainda.')));
  } else {
    custo.replaceChildren(...r.modelos.map((m) => {
      const t = m.tokens;
      const c = m.custo;
      let obs;
      if (c.usd == null) obs = `${c.status} (${c.motivo})`;
      else if (c.parcial) obs = `${c.rotulo}; parcial: ${Object.entries(c.sem_preco).map(([k, n]) => `${fmt(n)} de ${NOMES_SEM_PRECO[k] || k}`).join(', ')} sem preço cadastrado`;
      else obs = c.rotulo;
      return h('tr', {},
        h('td', {}, nome(m.modelo)),
        h('td', { class: 'num' }, fmt(m.requisicoes)),
        h('td', { class: 'num' }, fmt(t.input)),
        h('td', { class: 'num' }, fmt(t.cache_write_5m)),
        h('td', { class: 'num' }, fmt(t.cache_write_1h)),
        h('td', { class: 'num' }, fmt(t.cache_read)),
        h('td', { class: 'num' }, fmt(t.output)),
        h('td', { class: 'num' }, m.taxa_cache == null ? NAO_MEDIDO : `${(100 * m.taxa_cache).toFixed(1).replace('.', ',')}%`),
        h('td', { class: 'num' }, usd(c.usd)),
        h('td', {}, obs));
    }));
    lat.replaceChildren(...r.modelos.map((m) => {
      const d = m.latencia.descartes;
      return h('tr', {},
        h('td', {}, nome(m.modelo)),
        celulaLat(m.latencia.ferramenta, 'mediana_ms'), celulaLat(m.latencia.ferramenta, 'p90_ms'),
        h('td', { class: 'num' }, String(m.latencia.ferramenta.n ?? 0)),
        celulaLat(m.latencia.usuario, 'mediana_ms'), celulaLat(m.latencia.usuario, 'p90_ms'),
        h('td', { class: 'num' }, String(m.latencia.usuario.n ?? 0)),
        m.vazao.status === 'medido'
          ? h('td', { class: 'num' }, `${m.vazao.mediana_tps.toFixed(1).replace('.', ',')} (n=${m.vazao.n})`)
          : h('td', { class: 'num', title: m.vazao.motivo }, NAO_MEDIDO),
        h('td', {}, `negativo ${d.negativo} · pausa > 10 min ${d.pausa} · sem evento anterior ${d.sem_anterior}`));
    }));
  }
  const p = r.precos;
  $('precos-fonte').textContent = `${p.unidade} · fonte: ${p.fonte} · consultado em ${p.consultado_em} · status: ${p.status} (conferir na página oficial)`;
  $('tabela-precos').tBodies[0].replaceChildren(...p.modelos.flatMap((m) => m.faixas.map((f, i) => h('tr', {},
    h('td', {}, m.nome),
    h('td', {}, f.ate_tokens_entrada != null ? `até ${fmt(f.ate_tokens_entrada)}` : (i > 0 ? `acima de ${fmt(m.faixas[i - 1].ate_tokens_entrada)}` : 'única')),
    h('td', { class: 'num' }, precoTxt(f.entrada)),
    h('td', { class: 'num' }, precoTxt(f.saida)),
    h('td', { class: 'num' }, precoTxt(f.cache_escrita_5m)),
    h('td', { class: 'num' }, precoTxt(f.cache_escrita_1h)),
    h('td', { class: 'num' }, precoTxt(f.cache_leitura)),
    h('td', {}, m.status)))));
}

function render(e) {
  ultimo = e;
  if (abaAtiva === 'modelos') carregarModelos();
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
  renderEconomia(e);
  externo('aprovacoes', e.aprovacoes, 'Defina MONDAY_TOKEN e MONDAY_BOARD_ID para ver as aprovações do board.',
    (i) => h('tr', {}, h('td', {}, h('a', { href: i.url, rel: 'noopener noreferrer', target: '_blank' }, i.nome)), h('td', {}, i.tipo), h('td', {}, i.prioridade), h('td', {}, i.status)));
  externo('prs', e.prs, 'Defina GITHUB_REPO (e GITHUB_TOKEN para ver os checks).',
    (p) => h('tr', {}, h('td', {}, h('a', { href: p.url, rel: 'noopener noreferrer', target: '_blank' }, `#${p.numero} ${p.titulo}`)),
      h('td', {}, p.rascunho ? 'rascunho' : 'pronto'),
      h('td', {}, p.checks ? `✓ ${p.checks.sucesso} · ✗ ${p.checks.falha} · ◐ ${p.checks.andamento}` : '—')));
  const f = e.fontes || {};
  $('rodape').textContent = `${f.arquivos ?? 0} transcripts lidos em ${f.transcripts || '—'}${f.linhasInvalidas ? ` (${f.linhasInvalidas} linhas inválidas ignoradas)` : ''} · histórico em ${f.banco || '—'}${f.salvoEm ? `, salvo às ${hora(f.salvoEm)}` : ''}${e.totais.naoMedidos ? ` · ${e.totais.naoMedidos} trecho(s) sem medição no registro` : ''}. Tokens equivalentes: cache lido 0,1, cache escrito 2, saída 5.`;
}

$('abas').addEventListener('click', (ev) => {
  const b = ev.target.closest('button[data-aba]');
  if (b) trocarAba(b.dataset.aba);
});

$('seletor-sessao').addEventListener('change', (ev) => {
  sessaoSelecionada = ev.target.value;
  carregarDetalhe(sessaoSelecionada);
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
