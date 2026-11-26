// Agrega eventos dos transcripts do Claude Code e do Antigravity em métricas por modelo, agente, projeto, sessão e tarefa.

import { AnalisadorConsumo } from './consumo.js';

const CAMPOS = ['input', 'cache_write', 'cache_read', 'output'];
const PESOS = { input: 1, cache_write: 2, cache_read: 0.1, output: 5 };
import { NAO_ATRIBUIDO } from './tipos.js';

const MINUTO = 60_000;
const JANELA_ATIVA = 5 * MINUTO;

/** Tokens equivalentes: cada tipo pesado pelo custo relativo a um token de entrada comum. */
export function equivalente(u) {
  return CAMPOS.reduce((s, c) => s + (u[c] || 0) * PESOS[c], 0);
}

/** Chave de semana ISO-8601 (`AAAA-WSS`) a partir de um timestamp em ms. */
export function semanaISO(ms) {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return 'sem-data';
  const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const diaSemana = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - diaSemana);
  const inicioAno = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const numSemana = Math.ceil((((utc - inicioAno) / 86_400_000) + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(numSemana).padStart(2, '0')}`;
}

/** Infere o agente quando a linha vem do registro CSV (ou modelo sem metadado de origem). */
export function inferirAgente(modelo = '', observacao = '') {
  const m = String(modelo).toLowerCase();
  const o = String(observacao).toLowerCase();
  if (o.includes('antigravity') || m.includes('gemini')) return 'antigravity';
  if (o.includes('copilot') || m.startsWith('gpt-') || m.startsWith('o1') || m.startsWith('o3')) return 'copilot';
  if (m.includes('claude')) return 'claude-code';
  return 'outro';
}

/** Chave do projeto: `NN.UU-slug` para branches de unidade, `NN-slug` para disciplina, `plataforma`, ou a pasta. */
export function chaveProjeto({ gitBranch, cwd, agente } = {}) {
  const b = gitBranch || '';
  let m = b.match(/^modulo\/(\d+)-[^/]+\/(\d+)-([^/]+)$/);
  if (m) return `${m[1]}.${m[2]}-${m[3]}`;
  m = b.match(/^modulo\/(\d+-[^/]+)/);
  if (m) return m[1];
  if (b.startsWith('plataforma/') || b.startsWith('docs/')) return 'plataforma';
  if (cwd) return cwd.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || 'desconhecido';
  if (agente === 'antigravity') return 'antigravity';
  return 'desconhecido';
}

const vazio = () => ({ requisicoes: 0, input: 0, cache_write: 0, cache_read: 0, output: 0 });
const somar = (alvo, d) => { for (const c of CAMPOS) alvo[c] += d[c] || 0; };

function usoDe(u = {}) {
  return {
    input: u.input_tokens || 0,
    cache_write: u.cache_creation_input_tokens || 0,
    cache_read: u.cache_read_input_tokens || 0,
    output: u.output_tokens || 0,
  };
}

// Latência: amostras guardadas por modelo (as mais recentes) e teto para uma pausa não virar latência.
const LIMITE_AMOSTRAS = 500;
const LATENCIA_MAX_MS = 10 * MINUTO;

/** Média e percentis (nearest-rank) de uma lista de valores. Lista vazia: n = 0. */
function estatisticas(valores, decimais = 0) {
  const n = valores.length;
  if (!n) return { n: 0, mediaMs: null, p50Ms: null, p95Ms: null };
  const ord = [...valores].sort((a, b) => a - b);
  const nearest = (p) => ord[Math.min(n - 1, Math.ceil((p / 100) * n) - 1)];
  const soma = ord.reduce((s, v) => s + v, 0);
  const arred = (v) => (decimais > 0 ? Number(v.toFixed(decimais)) : Math.round(v));
  return { n, mediaMs: arred(soma / n), p50Ms: arred(nearest(50)), p95Ms: arred(nearest(95)) };
}

function estatisticasTps(valores) {
  const e = estatisticas(valores, 1);
  return { n: e.n, media: e.mediaMs, p50: e.p50Ms, p95: e.p95Ms };
}

export class Agregador {
  constructor({ agora = () => Date.now() } = {}) {
    this.agora = agora;
    this.ultimoEnvio = new Map(); // sessao -> ms do último envio ao modelo (prompt ou resultado de ferramenta)
    this.latencias = new Map(); // modelo -> [ms] do tempo até a primeira resposta
    this.throughput = new Map(); // modelo -> [tokens/s de saída]
    this.ctxModelo = new Map(); // modelo -> { max, soma, n }
    this.turnos = []; // ms de cada turno (evento turn_duration do Claude Code)
    this.mensagens = new Map(); // id -> uso já contado
    this.modelos = new Map();
    this.agentes = new Map();
    this.projetos = new Map();
    this.dias = new Map(); // YYYY-MM-DD -> uso
    this.diasAgente = new Map(); // YYYY-MM-DD -> Map(agente -> uso)
    this.semanas = new Map(); // YYYY-WSS -> { uso, agentes: Map(agente -> uso) }
    this.sessoes = new Map();
    this.tarefas = new Map(); // `${sessao}:${id}` -> tarefa
    this.criacoesPendentes = new Map(); // tool_use_id -> {sessao, subject, ...}
    this.ativa = new Map(); // sessao -> chave da tarefa ativa
    this.minutos = new Map(); // minuto (epoch/60000) -> equivalente
    this.janelasMinuto = new Map(); // agente -> Map(minuto -> equivalente), base das janelas corridas de 5 h e 7 dias
    this.recentes = [];
    this.registro = { linhas: [], naoMedidos: 0 };
    this.progresso = [];
    this.consumo = new AnalisadorConsumo();
    this.versao = 0;
    // Para a persistência: o que mudou desde o último salvamento.
    this.sujos = { mensagens: new Set(), tarefas: new Set(), sessoes: new Set(), status: [] };
  }

  /** Processa um evento (linha) de transcript. */
  ingerir(ev, meta = {}) {
    if (!ev || typeof ev !== 'object') return;
    const agente = meta.agente || 'claude-code';
    const sessaoId = meta.isSubagente && meta.sessaoPai ? meta.sessaoPai : (ev.sessionId || meta.sessaoPai || 'sem-sessao');
    const sessao = this.#sessao(sessaoId, { ...ev, agente });
    this.consumo.ingerir(ev, meta, this.agora());

    if (ev.type === 'system' && ev.subtype === 'turn_duration' && Number.isFinite(ev.durationMs)) {
      this.turnos.push(ev.durationMs);
      if (this.turnos.length > LIMITE_AMOSTRAS) this.turnos.shift();
      return;
    }

    const msg = ev.message;
    if (!msg) return;
    const conteudo = Array.isArray(msg.content) ? msg.content : [];

    if (ev.type === 'user') {
      const t = Date.parse(ev.timestamp);
      if (t) this.ultimoEnvio.set(sessaoId, t);
      for (const bloco of conteudo) if (bloco?.type === 'tool_result') this.#resultado(sessaoId, sessao, bloco);
      return;
    }
    if (ev.type !== 'assistant') return;

    // Ferramentas de tarefa mudam a tarefa ativa antes de contar o uso desta mensagem.
    for (const bloco of conteudo) if (bloco?.type === 'tool_use') this.#ferramenta(sessaoId, sessao, bloco);

    const modelo = msg.model;
    if (!msg.usage || !modelo || modelo === '<synthetic>') return;
    const novo = usoDe(msg.usage);
    const id = msg.id || ev.uuid;
    const anterior = this.mensagens.get(id);
    const delta = {};
    for (const c of CAMPOS) delta[c] = Math.max(0, novo[c] - (anterior?.uso[c] || 0));
    if (anterior && equivalente(delta) === 0) return;
    if (!anterior) this.#latencia(sessaoId, modelo, Date.parse(ev.timestamp), novo.output);
    const registro = anterior || { id, sessao: sessaoId, agente, modelo, quando: Date.parse(ev.timestamp) || this.agora(),
      tarefa: this.ativa.get(sessaoId) || null, uso: vazio() };
    for (const c of CAMPOS) registro.uso[c] = Math.max(novo[c], registro.uso[c]);
    this.mensagens.set(id, registro);
    this.sujos.mensagens.add(id);
    this.sujos.sessoes.add(sessaoId);
    this.#contar(registro, delta, !anterior);
  }

  /**
   * Latência de resposta: do último envio da sessão ao modelo até a primeira mensagem do assistente.
   * Pausa longa (acima de LATENCIA_MAX_MS) é o usuário pensando, não o modelo, então não entra.
   * Também registra throughput aproximado (tokens de saída / segundo) quando há saída e duração >= 100 ms.
   */
  #latencia(sessaoId, modelo, tResposta, outputTokens = 0) {
    const tEnvio = this.ultimoEnvio.get(sessaoId);
    this.ultimoEnvio.delete(sessaoId);
    if (!tEnvio || !(tResposta > tEnvio) || tResposta - tEnvio > LATENCIA_MAX_MS) return;
    const deltaMs = tResposta - tEnvio;
    const lista = this.latencias.get(modelo) || [];
    lista.push(deltaMs);
    if (lista.length > LIMITE_AMOSTRAS) lista.shift();
    this.latencias.set(modelo, lista);
    if (outputTokens > 0 && deltaMs >= 100) {
      const tps = outputTokens / (deltaMs / 1000);
      const listaTps = this.throughput.get(modelo) || [];
      listaTps.push(tps);
      if (listaTps.length > LIMITE_AMOSTRAS) listaTps.shift();
      this.throughput.set(modelo, listaTps);
    }
  }

  /** Soma um delta de uso de uma mensagem em todos os agrupamentos. */
  #contar(reg, delta, nova) {
    const sessao = this.sessoes.get(reg.sessao);
    const agente = reg.agente || sessao.agente || 'claude-code';
    const req = nova ? 1 : 0;
    const tarefa = reg.tarefa && this.tarefas.get(reg.tarefa);
    const diaChave = new Date(reg.quando).toISOString().slice(0, 10);
    let diaAgMap = this.diasAgente.get(diaChave);
    if (!diaAgMap) { diaAgMap = new Map(); this.diasAgente.set(diaChave, diaAgMap); }
    const semChave = semanaISO(reg.quando);
    let sem = this.semanas.get(semChave);
    if (!sem) { sem = { uso: vazio(), agentes: new Map() }; this.semanas.set(semChave, sem); }
    const alvos = [
      this.#grupo(this.modelos, reg.modelo),
      this.#grupo(this.agentes, agente),
      this.#grupo(this.projetos, sessao.projeto),
      this.#grupo(this.dias, diaChave),
      this.#grupo(diaAgMap, agente),
      sem.uso,
      this.#grupo(sem.agentes, agente),
      sessao.uso,
    ];
    if (tarefa) alvos.push(tarefa.uso);
    for (const a of alvos) { somar(a, delta); a.requisicoes += req; }
    if (nova) {
      const ctx = (reg.uso.input || 0) + (reg.uso.cache_write || 0) + (reg.uso.cache_read || 0);
      if (ctx > 0) {
        const cm = this.ctxModelo.get(reg.modelo) || { max: 0, soma: 0, n: 0 };
        cm.max = Math.max(cm.max, ctx);
        cm.soma += ctx;
        cm.n += 1;
        this.ctxModelo.set(reg.modelo, cm);
      }
    }
    const eq = equivalente(delta);
    if (tarefa) {
      tarefa.modelos[reg.modelo] = (tarefa.modelos[reg.modelo] || 0) + eq;
      if (!tarefa.agentes) tarefa.agentes = {};
      if (!tarefa.agentes[agente]) tarefa.agentes[agente] = { equivalente: 0, requisicoes: 0 };
      tarefa.agentes[agente].equivalente += eq;
      tarefa.agentes[agente].requisicoes += req;
    }
    sessao.modelos.add(reg.modelo);
    sessao.ultimo = Math.max(sessao.ultimo, reg.quando);
    sessao.primeiro = Math.min(sessao.primeiro ?? reg.quando, reg.quando);
    const minuto = Math.floor(reg.quando / MINUTO);
    this.minutos.set(minuto, (this.minutos.get(minuto) || 0) + eq);
    let porMinutoAgente = this.janelasMinuto.get(agente);
    if (!porMinutoAgente) { porMinutoAgente = new Map(); this.janelasMinuto.set(agente, porMinutoAgente); }
    porMinutoAgente.set(minuto, (porMinutoAgente.get(minuto) || 0) + eq);
    if (nova) {
      this.recentes.unshift({ quando: reg.quando, sessao: reg.sessao.slice(0, 8), agente, projeto: sessao.projeto, modelo: reg.modelo,
        tarefa: tarefa?.titulo || null, equivalente: Math.round(eq) });
      this.recentes.sort((x, y) => y.quando - x.quando);
      this.recentes.length = Math.min(this.recentes.length, 40);
    }
    this.versao++;
  }

  /** Reconstrói o estado a partir do que foi persistido (sessões, tarefas, mensagens e fatos de consumo). */
  restaurar({ sessoes = [], tarefas = [], mensagens = [], requisicoes = [], chamadas = [], leituras = [] }) {
    for (const s of sessoes) {
      this.sessoes.set(s.id, { id: s.id, agente: s.agente || 'claude-code', projeto: s.projeto, branch: s.branch || '', ultimo: 0, primeiro: undefined, uso: vazio(), modelos: new Set() });
      if (s.tarefaAtiva) this.ativa.set(s.id, s.tarefaAtiva);
    }
    for (const t of tarefas) {
      this.tarefas.set(t.chave, { chave: t.chave, sessao: t.sessao.slice(0, 8), sessaoId: t.sessao, projeto: t.projeto, titulo: t.titulo,
        status: t.status, uso: vazio(), modelos: {}, agentes: {}, criado: t.criado, atualizado: t.atualizado });
    }
    for (const m of mensagens) {
      if (!this.sessoes.has(m.sessao)) this.#sessao(m.sessao, { agente: m.agente || 'claude-code' });
      const reg = { id: m.id, sessao: m.sessao, agente: m.agente || 'claude-code', modelo: m.modelo, quando: m.quando, tarefa: m.tarefa || null, uso: vazio() };
      for (const c of CAMPOS) reg.uso[c] = m[c] || 0;
      this.mensagens.set(m.id, reg);
      this.#contar(reg, reg.uso, true);
    }
    this.consumo.restaurar({ requisicoes, chamadas, leituras });
  }

  /** Linhas do registro CSV: entram as medições manuais; as de transcript já vêm ao vivo. */
  ingerirRegistro(linhas) {
    this.registro = { linhas: [], naoMedidos: 0 };
    for (const l of linhas) {
      if (l.fonte === 'transcript') continue;
      if (l.fonte === 'nao-medido') { this.registro.naoMedidos++; continue; }
      this.registro.linhas.push(l);
    }
    this.versao++;
  }

  /** Tarefas concluídas lidas de harness/progresso.md (com Code Agent e modelo). */
  ingerirProgresso(linhas) {
    this.progresso = Array.isArray(linhas) ? linhas : [];
    this.versao++;
  }

  /** Detalhe aprofundado (timeline, atribuição, subagentes e economia) de uma sessão. */
  detalheSessao(sessaoId) {
    return this.consumo.analisarSessao(sessaoId);
  }

  #sessao(id, ev) {
    let s = this.sessoes.get(id);
    const agente = ev.agente || 'claude-code';
    if (!s) {
      s = { id, agente, projeto: chaveProjeto({ ...ev, agente }), branch: ev.gitBranch || '', ultimo: 0, primeiro: undefined, uso: vazio(), modelos: new Set() };
      this.sessoes.set(id, s);
      this.sujos.sessoes.add(id);
    } else if (ev.gitBranch && !s.branch) {
      s.branch = ev.gitBranch; s.projeto = chaveProjeto({ ...ev, agente: s.agente });
      this.sujos.sessoes.add(id);
    }
    return s;
  }

  #grupo(mapa, nome) {
    if (!mapa.has(nome)) mapa.set(nome, vazio());
    return mapa.get(nome);
  }

  #novaTarefa(chave, sessaoId, sessao, titulo, status = 'pending') {
    const agora = this.agora();
    const t = { chave, sessao: sessaoId.slice(0, 8), sessaoId, projeto: sessao.projeto, titulo, status, uso: vazio(), modelos: {}, agentes: {}, criado: agora, atualizado: agora };
    this.tarefas.set(chave, t);
    this.sujos.tarefas.add(chave);
    this.sujos.status.push({ tarefa: chave, status, quando: agora });
    return t;
  }

  #mudarStatus(sessaoId, chave, status) {
    const t = this.tarefas.get(chave);
    if (!t) return;
    if (t.status !== status) {
      t.status = status; t.atualizado = this.agora();
      this.sujos.tarefas.add(chave);
      this.sujos.status.push({ tarefa: chave, status, quando: t.atualizado });
    }
    if (status === 'in_progress') this.ativa.set(sessaoId, chave);
    else if (this.ativa.get(sessaoId) === chave) this.ativa.delete(sessaoId);
    this.sujos.sessoes.add(sessaoId);
  }

  #ferramenta(sessaoId, sessao, bloco) {
    const entrada = bloco.input || {};
    if (bloco.name === 'TaskCreate') {
      this.criacoesPendentes.set(bloco.id, { sessaoId, titulo: entrada.subject || entrada.description || 'tarefa' });
    } else if (bloco.name === 'TaskUpdate' && entrada.taskId != null) {
      const chave = `${sessaoId}:${entrada.taskId}`;
      if (!this.tarefas.has(chave)) this.#novaTarefa(chave, sessaoId, sessao, entrada.subject || `Tarefa #${entrada.taskId}`);
      if (entrada.subject) { this.tarefas.get(chave).titulo = entrada.subject; this.sujos.tarefas.add(chave); }
      if (entrada.status === 'deleted') { this.#mudarStatus(sessaoId, chave, 'deleted'); this.ativa.delete(sessaoId); return; }
      if (entrada.status) this.#mudarStatus(sessaoId, chave, entrada.status);
    } else if (bloco.name === 'TodoWrite' && Array.isArray(entrada.todos)) {
      this.ativa.delete(sessaoId);
      entrada.todos.forEach((todo, i) => {
        const chave = `${sessaoId}:todo:${todo.content || i}`;
        if (!this.tarefas.has(chave)) this.#novaTarefa(chave, sessaoId, sessao, todo.content || `Item ${i + 1}`);
        this.#mudarStatus(sessaoId, chave, todo.status || 'pending');
      });
    }
  }

  #resultado(sessaoId, sessao, bloco) {
    const pendente = this.criacoesPendentes.get(bloco.tool_use_id);
    if (!pendente) return;
    this.criacoesPendentes.delete(bloco.tool_use_id);
    const texto = typeof bloco.content === 'string' ? bloco.content
      : (Array.isArray(bloco.content) ? bloco.content.map((c) => c?.text || '').join(' ') : '');
    const m = texto.match(/#(\d+)/);
    const chave = `${sessaoId}:${m ? m[1] : bloco.tool_use_id}`;
    if (!this.tarefas.has(chave)) this.#novaTarefa(chave, sessaoId, sessao, pendente.titulo);
    this.versao++;
  }

  /** Tokens equivalentes acumulados por um agente desde um timestamp em ms (para delta após snapshot /usage). */
  equivalenteDesde(agente, desdeMs) {
    const porMinuto = this.janelasMinuto.get(agente);
    if (!porMinuto || !Number.isFinite(desdeMs)) return 0;
    const minCorte = Math.floor(desdeMs / MINUTO);
    let soma = 0;
    for (const [minuto, eqMin] of porMinuto) {
      if (minuto >= minCorte) soma += eqMin;
    }
    return Math.round(soma);
  }

  /** Fotografia serializável do estado, para a API e o SSE. */
  /** Consumo por agente nas janelas corridas que os planos usam: últimas 5 h e últimos 7 dias. */
  #janelas(agora) {
    const corte7d = agora - 7 * 24 * 60 * MINUTO;
    const corte5h = agora - 5 * 60 * MINUTO;
    const saida = {};
    for (const [agente, porMinuto] of this.janelasMinuto) {
      let sessao5h = 0;
      let semana7d = 0;
      for (const [minuto, eqMin] of porMinuto) {
        const ms = minuto * MINUTO;
        if (ms < corte7d) { porMinuto.delete(minuto); continue; } // poda o que já saiu da janela maior
        semana7d += eqMin;
        if (ms >= corte5h) sessao5h += eqMin;
      }
      saida[agente] = { sessao5h: Math.round(sessao5h), semana7d: Math.round(semana7d) };
    }
    return saida;
  }

  estado() {
    const agora = this.agora();
    const lista = (mapa) => [...mapa].map(([nome, u]) => ({ nome, ...u, equivalente: Math.round(equivalente(u)) }));
    const modelos = new Map(this.modelos);
    const projetos = new Map(this.projetos);
    const agentes = new Map(this.agentes);

    for (const l of this.registro.linhas) {
      const agNome = inferirAgente(l.modelo, l.observacao);
      for (const [mapa, nome] of [[modelos, l.modelo], [projetos, l.projeto], [agentes, agNome]]) {
        const g = { ...(mapa.get(nome) || vazio()) };
        somar(g, l); g.requisicoes += l.requisicoes || 0;
        mapa.set(nome, g);
      }
    }
    const ordenar = (a) => a.sort((x, y) => y.equivalente - x.equivalente);
    const listaModelos = ordenar(lista(modelos));
    const totais = vazio();
    for (const m of listaModelos) { somar(totais, m); totais.requisicoes += m.requisicoes; }

    const sessoesPorAgente = new Map();
    for (const s of this.sessoes.values()) {
      if (s.uso.requisicoes > 0) sessoesPorAgente.set(s.agente || 'claude-code', (sessoesPorAgente.get(s.agente || 'claude-code') || 0) + 1);
    }
    const eqTotalAgentes = [...agentes.values()].reduce((s, u) => s + equivalente(u), 0) || 1;
    const porAgente = [...agentes.entries()].map(([agente, u]) => {
      const ctxTotal = (u.input || 0) + (u.cache_write || 0) + (u.cache_read || 0);
      const eq = Math.round(equivalente(u));
      const nSessoes = sessoesPorAgente.get(agente) || 0;
      return {
        agente,
        ...u,
        equivalente: eq,
        participacaoPct: Number(((100 * eq) / eqTotalAgentes).toFixed(1)),
        sessoes: nSessoes,
        mediaPorSessao: nSessoes ? Math.round(eq / nSessoes) : 0,
        mediaPorReq: u.requisicoes ? Math.round(eq / u.requisicoes) : 0,
        taxaCache: ctxTotal > 0 ? Number(((100 * (u.cache_read || 0)) / ctxTotal).toFixed(1)) : 0,
      };
    }).sort((a, b) => b.equivalente - a.equivalente);

    const eqTotal = equivalente(totais) || 1;
    const porTipo = [
      { tipo: 'cache_read', rotulo: 'Cache lido (×0,1)', tokens: totais.cache_read, equivalente: Math.round(totais.cache_read * PESOS.cache_read), pct: Number(((100 * totais.cache_read * PESOS.cache_read) / eqTotal).toFixed(1)) },
      { tipo: 'cache_write', rotulo: 'Cache escrito (×2)', tokens: totais.cache_write, equivalente: Math.round(totais.cache_write * PESOS.cache_write), pct: Number(((100 * totais.cache_write * PESOS.cache_write) / eqTotal).toFixed(1)) },
      { tipo: 'output', rotulo: 'Saída (×5)', tokens: totais.output, equivalente: Math.round(totais.output * PESOS.output), pct: Number(((100 * totais.output * PESOS.output) / eqTotal).toFixed(1)) },
      { tipo: 'input', rotulo: 'Entrada nova (×1)', tokens: totais.input, equivalente: Math.round(totais.input * PESOS.input), pct: Number(((100 * totais.input * PESOS.input) / eqTotal).toFixed(1)) },
    ].sort((a, b) => b.equivalente - a.equivalente);

    // Consumo por dia com quebra por agente (transcripts + medições manuais do CSV) para o heatmap de calendário
    const diasMapa = new Map();
    for (const [nome, u] of this.dias.entries()) {
      const agMap = this.diasAgente.get(nome);
      const ags = {};
      if (agMap) {
        for (const [agNome, au] of agMap.entries()) {
          ags[agNome] = { equivalente: Math.round(equivalente(au)), requisicoes: au.requisicoes };
        }
      }
      diasMapa.set(nome, { nome, ...u, equivalente: Math.round(equivalente(u)), agentes: ags });
    }
    for (const l of this.registro.linhas) {
      if (!l.data) continue;
      const agNome = inferirAgente(l.modelo, l.observacao);
      const eqVal = Math.round(equivalente(l) || (l.total || 0));
      let d = diasMapa.get(l.data);
      if (!d) { d = { nome: l.data, ...vazio(), equivalente: 0, agentes: {} }; diasMapa.set(l.data, d); }
      somar(d, l);
      d.requisicoes += l.requisicoes || 0;
      d.equivalente += eqVal;
      if (!d.agentes[agNome]) d.agentes[agNome] = { equivalente: 0, requisicoes: 0 };
      d.agentes[agNome].equivalente += eqVal;
      d.agentes[agNome].requisicoes += l.requisicoes || 0;
    }
    const porDia = [...diasMapa.values()].sort((a, b) => a.nome.localeCompare(b.nome));

    // Consumo por semana ISO com quebra por Code Agent (transcripts + medições manuais do CSV)
    const semanasMapa = new Map();
    for (const [chave, s] of this.semanas.entries()) {
      const ags = {};
      for (const [agNome, u] of s.agentes.entries()) {
        ags[agNome] = { ...u, equivalente: Math.round(equivalente(u)) };
      }
      semanasMapa.set(chave, { semana: chave, ...s.uso, equivalente: Math.round(equivalente(s.uso)), agentes: ags });
    }
    for (const l of this.registro.linhas) {
      if (!l.data) continue;
      const ms = Date.parse(`${l.data}T12:00:00Z`);
      if (Number.isNaN(ms)) continue;
      const chave = semanaISO(ms);
      const agNome = inferirAgente(l.modelo, l.observacao);
      const eqVal = Math.round(equivalente(l) || (l.total || 0));
      let s = semanasMapa.get(chave);
      if (!s) { s = { semana: chave, ...vazio(), equivalente: 0, agentes: {} }; semanasMapa.set(chave, s); }
      somar(s, l);
      s.requisicoes += l.requisicoes || 0;
      s.equivalente += eqVal;
      if (!s.agentes[agNome]) s.agentes[agNome] = { ...vazio(), equivalente: 0 };
      somar(s.agentes[agNome], l);
      s.agentes[agNome].requisicoes += l.requisicoes || 0;
      s.agentes[agNome].equivalente += eqVal;
    }
    const porSemana = [...semanasMapa.values()].sort((a, b) => a.semana.localeCompare(b.semana));

    const minutoAtual = Math.floor(agora / MINUTO);
    const linhaDoTempo = Array.from({ length: 60 }, (_, i) => {
      const minuto = minutoAtual - 59 + i;
      return { minuto: minuto * MINUTO, equivalente: Math.round(this.minutos.get(minuto) || 0) };
    });
    const ultimos5 = linhaDoTempo.slice(-5).reduce((s, p) => s + p.equivalente, 0);

    const tarefasTranscript = [...this.tarefas.values()]
      .filter((t) => t.status !== 'deleted')
      .map(({ uso, sessaoId, ...t }) => {
        const s = this.sessoes.get(sessaoId);
        return { ...t, agente: s?.agente || 'claude-code', fonte: 'transcript', ...uso, equivalente: Math.round(equivalente(uso)) };
      });
    const tarefasRegistro = this.registro.linhas
      .filter((l) => l.tarefa)
      .map((l, idx) => ({
        chave: `reg:${l.sessao || idx}:${l.modelo}`,
        sessao: (l.sessao || 'csv').slice(0, 8),
        agente: inferirAgente(l.modelo, l.observacao),
        projeto: l.projeto || 'desconhecido',
        titulo: l.tarefa,
        status: 'completed',
        modelos: l.modelo ? { [l.modelo]: Math.round(equivalente(l) || l.total || 1) } : {},
        requisicoes: l.requisicoes || 0,
        equivalente: Math.round(equivalente(l) || l.total || 0),
        atualizado: Date.parse(`${l.data}T12:00:00Z`) || 0,
        fonte: 'registro',
      }));
    const tarefasProgresso = this.progresso.map((p, idx) => ({
      chave: `prog:${p.data}:${idx}`,
      sessao: p.data,
      agente: p.agente,
      projeto: p.projeto,
      titulo: p.titulo,
      status: 'completed',
      modelos: p.modelo && p.modelo !== '—' ? { [p.modelo]: 1 } : {},
      requisicoes: 0,
      equivalente: 0,
      atualizado: p.quando,
      fonte: 'progresso',
    }));
    const tarefas = [...tarefasTranscript, ...tarefasRegistro, ...tarefasProgresso]
      .map((t) => ({ tipo: NAO_ATRIBUIDO, ...t }))
      .sort((a, b) => (b.atualizado || 0) - (a.atualizado || 0));
    const contagem = { pending: 0, in_progress: 0, completed: 0 };
    for (const t of tarefas) contagem[t.status] = (contagem[t.status] || 0) + 1;

    // Comparativo de gasto por agente em tarefas (agrupado por projeto + tarefa, sem contar CSV duas vezes)
    const compMapa = new Map();
    const acumularComp = (titulo, projeto, agente, eqVal, reqs) => {
      const nomeTarefa = String(titulo || '').trim();
      const nomeProj = String(projeto || 'desconhecido').trim();
      if (!nomeTarefa || eqVal <= 0) return;
      const chave = `${nomeProj}::${nomeTarefa}`;
      let item = compMapa.get(chave);
      if (!item) { item = { tarefa: nomeTarefa, projeto: nomeProj, projetos: [nomeProj], agentes: {}, totalEquivalente: 0 }; compMapa.set(chave, item); }
      if (!item.agentes[agente]) item.agentes[agente] = { equivalente: 0, requisicoes: 0 };
      item.agentes[agente].equivalente += Math.round(eqVal);
      item.agentes[agente].requisicoes += reqs || 0;
      item.totalEquivalente += Math.round(eqVal);
    };
    for (const t of tarefasTranscript) {
      const ags = Object.entries(t.agentes || {});
      if (ags.length) {
        for (const [agNome, dados] of ags) acumularComp(t.titulo, t.projeto, agNome, dados.equivalente, dados.requisicoes);
      } else if (t.equivalente > 0) {
        acumularComp(t.titulo, t.projeto, t.agente || 'claude-code', t.equivalente, t.requisicoes);
      }
    }
    for (const l of this.registro.linhas) {
      if (!l.tarefa) continue;
      const eqVal = equivalente(l) || (l.total || 0);
      acumularComp(l.tarefa, l.projeto, inferirAgente(l.modelo, l.observacao), eqVal, l.requisicoes);
    }
    const comparativoTarefas = [...compMapa.values()]
      .sort((a, b) => b.totalEquivalente - a.totalEquivalente);

    const sessoes = [...this.sessoes.values()]
      .filter((s) => s.uso.requisicoes > 0)
      .map((s) => ({ id: s.id.slice(0, 8), idCompleto: s.id, agente: s.agente || 'claude-code', projeto: s.projeto, branch: s.branch, ultimo: s.ultimo,
        ativa: agora - s.ultimo < JANELA_ATIVA, modelos: [...s.modelos], ...s.uso,
        equivalente: Math.round(equivalente(s.uso)), tarefaAtiva: this.tarefas.get(this.ativa.get(s.id))?.titulo || null }))
      .sort((a, b) => b.ultimo - a.ultimo);

    const consumoGlobal = this.consumo.resumoGlobal();
    for (const sf of consumoGlobal.subagentes.top) {
      sf.agente = this.sessoes.get(sf.sessaoId)?.agente || 'claude-code';
    }
    for (const op of consumoGlobal.oportunidades) {
      op.agente = this.sessoes.get(op.sessaoId)?.agente || 'claude-code';
    }

    const nomesPerf = new Set([...this.latencias.keys(), ...this.throughput.keys(), ...this.ctxModelo.keys()]);
    const perfPorModelo = [...nomesPerf].map((modelo) => {
      const lat = estatisticas(this.latencias.get(modelo) || []);
      const tps = estatisticasTps(this.throughput.get(modelo) || []);
      const ctx = this.ctxModelo.get(modelo) || { max: 0, soma: 0, n: 0 };
      const usoMod = this.modelos.get(modelo);
      return {
        modelo,
        ...lat,
        tpsN: tps.n,
        tpsMedia: tps.media,
        tpsP50: tps.p50,
        tpsP95: tps.p95,
        ctxMax: ctx.max,
        ctxMedio: ctx.n ? Math.round(ctx.soma / ctx.n) : 0,
        outputTotal: usoMod?.output || 0,
      };
    }).sort((a, b) => (b.n - a.n) || (b.ctxMax - a.ctxMax));

    const listaProjetos = ordenar(lista(projetos));
    const sessoesTop = [...sessoes].sort((a, b) => b.equivalente - a.equivalente).slice(0, 15);

    return {
      geradoEm: agora,
      totais: { ...totais, equivalente: Math.round(equivalente(totais)), porMinuto5: Math.round(ultimos5 / 5),
        sessoesAtivas: sessoes.filter((s) => s.ativa).length, naoMedidos: this.registro.naoMedidos },
      porAgente,
      comparativoTarefas,
      porTipo,
      porDia,
      porSemana,
      janelas: this.#janelas(agora),
      latencia: {
        porModelo: [...this.latencias].map(([modelo, valores]) => ({ modelo, ...estatisticas(valores) }))
          .sort((a, b) => b.n - a.n),
        turnos: estatisticas(this.turnos),
      },
      performance: {
        porModelo: perfPorModelo,
        turnos: estatisticas(this.turnos),
      },
      rankings: {
        sessoes: sessoesTop,
        projetos: listaProjetos.slice(0, 15),
      },
      modelos: listaModelos,
      projetos: listaProjetos,
      tarefas,
      contagemTarefas: contagem,
      sessoes,
      linhaDoTempo,
      recentes: this.recentes,
      consumo: consumoGlobal,
    };
  }
}
