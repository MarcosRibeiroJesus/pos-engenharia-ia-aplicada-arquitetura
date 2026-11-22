// Agrega eventos dos transcripts do Claude Code em métricas por modelo, projeto, sessão e tarefa.

const CAMPOS = ['input', 'cache_write', 'cache_read', 'output'];
const PESOS = { input: 1, cache_write: 2, cache_read: 0.1, output: 5 };
const MINUTO = 60_000;
const JANELA_ATIVA = 5 * MINUTO;

/** Tokens equivalentes: cada tipo pesado pelo custo relativo a um token de entrada comum. */
export function equivalente(u) {
  return CAMPOS.reduce((s, c) => s + (u[c] || 0) * PESOS[c], 0);
}

/** Chave do projeto: `NN.UU-slug` para branches de unidade, `NN-slug` para disciplina, `plataforma`, ou a pasta. */
export function chaveProjeto({ gitBranch, cwd } = {}) {
  const b = gitBranch || '';
  let m = b.match(/^modulo\/(\d+)-[^/]+\/(\d+)-([^/]+)$/);
  if (m) return `${m[1]}.${m[2]}-${m[3]}`;
  m = b.match(/^modulo\/(\d+-[^/]+)/);
  if (m) return m[1];
  if (b.startsWith('plataforma/') || b.startsWith('docs/')) return 'plataforma';
  if (cwd) return cwd.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || 'desconhecido';
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

export class Agregador {
  constructor({ agora = () => Date.now() } = {}) {
    this.agora = agora;
    this.mensagens = new Map(); // id -> uso já contado
    this.modelos = new Map();
    this.projetos = new Map();
    this.sessoes = new Map();
    this.tarefas = new Map(); // `${sessao}:${id}` -> tarefa
    this.criacoesPendentes = new Map(); // tool_use_id -> {sessao, subject, ...}
    this.ativa = new Map(); // sessao -> chave da tarefa ativa
    this.minutos = new Map(); // minuto (epoch/60000) -> equivalente
    this.recentes = [];
    this.registro = { linhas: [], naoMedidos: 0 };
    this.versao = 0;
    // Para a persistência: o que mudou desde o último salvamento.
    this.sujos = { mensagens: new Set(), tarefas: new Set(), sessoes: new Set(), status: [] };
  }

  /** Processa um evento (linha) de transcript. */
  ingerir(ev) {
    if (!ev || typeof ev !== 'object') return;
    const sessaoId = ev.sessionId || 'sem-sessao';
    const sessao = this.#sessao(sessaoId, ev);
    const msg = ev.message;
    if (!msg) return;
    const conteudo = Array.isArray(msg.content) ? msg.content : [];

    if (ev.type === 'user') {
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
    const registro = anterior || { id, sessao: sessaoId, modelo, quando: Date.parse(ev.timestamp) || this.agora(),
      tarefa: this.ativa.get(sessaoId) || null, uso: vazio() };
    for (const c of CAMPOS) registro.uso[c] = Math.max(novo[c], registro.uso[c]);
    this.mensagens.set(id, registro);
    this.sujos.mensagens.add(id);
    this.sujos.sessoes.add(sessaoId);
    this.#contar(registro, delta, !anterior);
  }

  /** Soma um delta de uso de uma mensagem em todos os agrupamentos. */
  #contar(reg, delta, nova) {
    const sessao = this.sessoes.get(reg.sessao);
    const req = nova ? 1 : 0;
    const tarefa = reg.tarefa && this.tarefas.get(reg.tarefa);
    const alvos = [this.#grupo(this.modelos, reg.modelo), this.#grupo(this.projetos, sessao.projeto), sessao.uso];
    if (tarefa) alvos.push(tarefa.uso);
    for (const a of alvos) { somar(a, delta); a.requisicoes += req; }
    const eq = equivalente(delta);
    if (tarefa) tarefa.modelos[reg.modelo] = (tarefa.modelos[reg.modelo] || 0) + eq;
    sessao.modelos.add(reg.modelo);
    sessao.ultimo = Math.max(sessao.ultimo, reg.quando);
    sessao.primeiro = Math.min(sessao.primeiro ?? reg.quando, reg.quando);
    const minuto = Math.floor(reg.quando / MINUTO);
    this.minutos.set(minuto, (this.minutos.get(minuto) || 0) + eq);
    if (nova) {
      this.recentes.unshift({ quando: reg.quando, sessao: reg.sessao.slice(0, 8), projeto: sessao.projeto, modelo: reg.modelo,
        tarefa: tarefa?.titulo || null, equivalente: Math.round(eq) });
      this.recentes.sort((x, y) => y.quando - x.quando);
      this.recentes.length = Math.min(this.recentes.length, 40);
    }
    this.versao++;
  }

  /** Reconstrói o estado a partir do que foi persistido (sessões, tarefas e mensagens). */
  restaurar({ sessoes = [], tarefas = [], mensagens = [] }) {
    for (const s of sessoes) {
      this.sessoes.set(s.id, { id: s.id, projeto: s.projeto, branch: s.branch || '', ultimo: 0, primeiro: undefined, uso: vazio(), modelos: new Set() });
      if (s.tarefaAtiva) this.ativa.set(s.id, s.tarefaAtiva);
    }
    for (const t of tarefas) {
      this.tarefas.set(t.chave, { chave: t.chave, sessao: t.sessao.slice(0, 8), sessaoId: t.sessao, projeto: t.projeto, titulo: t.titulo,
        status: t.status, uso: vazio(), modelos: {}, criado: t.criado, atualizado: t.atualizado });
    }
    for (const m of mensagens) {
      if (!this.sessoes.has(m.sessao)) this.#sessao(m.sessao, {});
      const reg = { id: m.id, sessao: m.sessao, modelo: m.modelo, quando: m.quando, tarefa: m.tarefa || null, uso: vazio() };
      for (const c of CAMPOS) reg.uso[c] = m[c] || 0;
      this.mensagens.set(m.id, reg);
      this.#contar(reg, reg.uso, true);
    }
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

  #sessao(id, ev) {
    let s = this.sessoes.get(id);
    if (!s) {
      s = { id, projeto: chaveProjeto(ev), branch: ev.gitBranch || '', ultimo: 0, primeiro: undefined, uso: vazio(), modelos: new Set() };
      this.sessoes.set(id, s);
      this.sujos.sessoes.add(id);
    } else if (ev.gitBranch && !s.branch) {
      s.branch = ev.gitBranch; s.projeto = chaveProjeto(ev);
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
    const t = { chave, sessao: sessaoId.slice(0, 8), sessaoId, projeto: sessao.projeto, titulo, status, uso: vazio(), modelos: {}, criado: agora, atualizado: agora };
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

  /** Fotografia serializável do estado, para a API e o SSE. */
  estado() {
    const agora = this.agora();
    const lista = (mapa) => [...mapa].map(([nome, u]) => ({ nome, ...u, equivalente: Math.round(equivalente(u)) }));
    const modelos = new Map(this.modelos);
    const projetos = new Map(this.projetos);
    for (const l of this.registro.linhas) {
      for (const [mapa, nome] of [[modelos, l.modelo], [projetos, l.projeto]]) {
        const g = { ...(mapa.get(nome) || vazio()) };
        somar(g, l); g.requisicoes += l.requisicoes || 0;
        mapa.set(nome, g);
      }
    }
    const ordenar = (a) => a.sort((x, y) => y.equivalente - x.equivalente);
    const listaModelos = ordenar(lista(modelos));
    const totais = vazio();
    for (const m of listaModelos) { somar(totais, m); totais.requisicoes += m.requisicoes; }

    const minutoAtual = Math.floor(agora / MINUTO);
    const linhaDoTempo = Array.from({ length: 60 }, (_, i) => {
      const minuto = minutoAtual - 59 + i;
      return { minuto: minuto * MINUTO, equivalente: Math.round(this.minutos.get(minuto) || 0) };
    });
    const ultimos5 = linhaDoTempo.slice(-5).reduce((s, p) => s + p.equivalente, 0);

    const tarefas = [...this.tarefas.values()]
      .filter((t) => t.status !== 'deleted')
      .map(({ uso, sessaoId, ...t }) => ({ ...t, ...uso, equivalente: Math.round(equivalente(uso)) }))
      .sort((a, b) => b.atualizado - a.atualizado);
    const contagem = { pending: 0, in_progress: 0, completed: 0 };
    for (const t of tarefas) contagem[t.status] = (contagem[t.status] || 0) + 1;

    const sessoes = [...this.sessoes.values()]
      .filter((s) => s.uso.requisicoes > 0)
      .map((s) => ({ id: s.id.slice(0, 8), projeto: s.projeto, branch: s.branch, ultimo: s.ultimo,
        ativa: agora - s.ultimo < JANELA_ATIVA, modelos: [...s.modelos], ...s.uso,
        equivalente: Math.round(equivalente(s.uso)), tarefaAtiva: this.tarefas.get(this.ativa.get(s.id))?.titulo || null }))
      .sort((a, b) => b.ultimo - a.ultimo);

    return {
      geradoEm: agora,
      totais: { ...totais, equivalente: Math.round(equivalente(totais)), porMinuto5: Math.round(ultimos5 / 5),
        sessoesAtivas: sessoes.filter((s) => s.ativa).length, naoMedidos: this.registro.naoMedidos },
      modelos: listaModelos,
      projetos: ordenar(lista(projetos)),
      tarefas,
      contagemTarefas: contagem,
      sessoes,
      linhaDoTempo,
      recentes: this.recentes,
    };
  }
}
