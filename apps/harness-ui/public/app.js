(() => {
  const { Terminal } = window;
  const { FitAddon } = window.FitAddon;

  const estado = {
    token: '',
    perfis: [],
    harness: { raiz: '', projetos: [], tarefas: [] },
    abas: new Map(), // id -> { info, pane, term, fit, ws, naoLido }
    ativaId: null,
  };

  const el = {
    btnInicio: document.getElementById('btn-inicio'),
    tabStrip: document.getElementById('tab-strip'),
    btnNovaAba: document.getElementById('btn-nova-aba'),
    linkPainelIa: document.getElementById('link-painel-ia'),
    tabToolbar: document.getElementById('tab-toolbar'),
    metaAgente: document.getElementById('meta-agente'),
    metaStatus: document.getElementById('meta-status'),
    metaProjeto: document.getElementById('meta-projeto'),
    metaCwd: document.getElementById('meta-cwd'),
    btnEnviarPrompt: document.getElementById('btn-enviar-prompt'),
    btnLimparTerm: document.getElementById('btn-limpar-term'),
    btnFecharAtiva: document.getElementById('btn-fechar-ativa'),
    emptyState: document.getElementById('empty-state'),
    quickCards: document.getElementById('quick-cards'),
    terminalsContainer: document.getElementById('terminals-container'),
    statusConexao: document.getElementById('status-conexao'),
    statusAbas: document.getElementById('status-abas'),
    statusRaiz: document.getElementById('status-raiz'),
    formHome: document.getElementById('form-home'),
    homePerfil: document.getElementById('home-perfil'),
    homeProjeto: document.getElementById('home-projeto'),
    homeTarefa: document.getElementById('home-tarefa'),
    homeTitulo: document.getElementById('home-titulo'),
    homeComPrompt: document.getElementById('home-com-prompt'),
    modal: document.getElementById('modal-nova-aba'),
    formModal: document.getElementById('form-modal'),
    modalPerfisRapidos: document.getElementById('modal-perfis-rapidos'),
    modalPerfil: document.getElementById('modal-perfil'),
    modalProjeto: document.getElementById('modal-projeto'),
    modalTarefa: document.getElementById('modal-tarefa'),
    modalTitulo: document.getElementById('modal-titulo'),
    modalComPrompt: document.getElementById('modal-com-prompt'),
    btnFecharModal: document.getElementById('btn-fechar-modal'),
    btnCancelarModal: document.getElementById('btn-cancelar-modal'),
    toast: document.getElementById('toast'),
  };

  let timerToast = null;
  function avisar(texto) {
    el.toast.textContent = texto;
    el.toast.classList.remove('hidden');
    clearTimeout(timerToast);
    timerToast = setTimeout(() => el.toast.classList.add('hidden'), 3500);
  }

  async function api(caminho, opts = {}) {
    const headers = { ...(opts.headers || {}) };
    if (estado.token) headers['X-Harness-Token'] = estado.token;
    if (opts.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    const res = await fetch(caminho, { ...opts, headers });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.erro || `HTTP ${res.status}`);
    return json;
  }

  function preencherSelect(select, opcoes, opcaoVazia = null) {
    select.textContent = '';
    if (opcaoVazia !== null) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = opcaoVazia;
      select.appendChild(opt);
    }
    for (const item of opcoes) {
      const opt = document.createElement('option');
      opt.value = item.value;
      opt.textContent = item.label;
      if (item.disabled) opt.disabled = true;
      select.appendChild(opt);
    }
  }

  function renderizarCardsEFormularios() {
    el.quickCards.textContent = '';
    el.modalPerfisRapidos.textContent = '';

    for (const p of estado.perfis) {
      // Card da tela inicial
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'agent-card';
      card.disabled = !p.disponivel;

      const head = document.createElement('div');
      head.className = 'agent-card-head';

      const badge = document.createElement('span');
      badge.className = 'agent-badge';
      badge.style.background = p.cor;
      badge.textContent = p.icone;

      const st = document.createElement('span');
      st.className = `agent-state${p.disponivel ? '' : ' off'}`;
      st.textContent = p.disponivel ? 'Disponível' : 'Não encontrado no PATH';

      head.append(badge, st);

      const titulo = document.createElement('div');
      titulo.className = 'agent-card-title';
      titulo.textContent = p.nome;

      const desc = document.createElement('div');
      desc.className = 'agent-card-desc';
      desc.textContent = p.descricao;

      card.append(head, titulo, desc);
      card.addEventListener('click', () => abrirNovaAba({ perfilId: p.id }));
      el.quickCards.appendChild(card);

      // Botão rápido no modal
      const rapido = document.createElement('button');
      rapido.type = 'button';
      rapido.className = 'btn-small';
      rapido.disabled = !p.disponivel;
      rapido.textContent = `+ ${p.nome}`;
      rapido.addEventListener('click', () => {
        el.modal.close();
        abrirNovaAba({ perfilId: p.id });
      });
      el.modalPerfisRapidos.appendChild(rapido);
    }

    const opcoesPerfis = estado.perfis.map((p) => ({
      value: p.id,
      label: p.disponivel ? p.nome : `${p.nome} (indisponível)`,
      disabled: !p.disponivel,
    }));
    const opcoesProjetos = (estado.harness.projetos || []).map((pr) => ({
      value: pr.chave,
      label: `${pr.chave} · ${pr.fase}`,
    }));
    const opcoesTarefas = (estado.harness.tarefas || ['codigo', 'arquitetura', 'teste', 'pesquisa']).map((t) => ({
      value: t,
      label: t,
    }));

    preencherSelect(el.homePerfil, opcoesPerfis);
    preencherSelect(el.modalPerfil, opcoesPerfis);
    preencherSelect(el.homeProjeto, opcoesProjetos, '(Raiz do repositório)');
    preencherSelect(el.modalProjeto, opcoesProjetos, '(Raiz do repositório)');
    preencherSelect(el.homeTarefa, opcoesTarefas);
    preencherSelect(el.modalTarefa, opcoesTarefas);
  }

  function renderizarBarraAbas() {
    el.tabStrip.textContent = '';
    for (const [id, item] of estado.abas.entries()) {
      const tab = document.createElement('div');
      tab.className = `tab${id === estado.ativaId ? ' active' : ''}`;
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', String(id === estado.ativaId));

      const dot = document.createElement('span');
      dot.className = `tab-dot${item.info.status === 'exited' ? ' exited' : ''}`;
      dot.style.background = item.info.cor;

      const titulo = document.createElement('span');
      titulo.className = 'tab-title';
      titulo.textContent = item.info.titulo;
      titulo.title = `${item.info.titulo} (duplo clique para renomear)`;

      tab.append(dot, titulo);

      if (item.naoLido && id !== estado.ativaId) {
        const unread = document.createElement('span');
        unread.className = 'tab-unread';
        unread.title = 'Nova saída neste terminal';
        tab.appendChild(unread);
      }

      const fechar = document.createElement('button');
      fechar.type = 'button';
      fechar.className = 'tab-close';
      fechar.textContent = '×';
      fechar.title = 'Encerrar e fechar aba';
      fechar.addEventListener('click', (ev) => {
        ev.stopPropagation();
        fecharAba(id);
      });
      tab.appendChild(fechar);

      tab.addEventListener('click', () => ativarAba(id));
      titulo.addEventListener('dblclick', (ev) => {
        ev.stopPropagation();
        renomearAba(id);
      });

      el.tabStrip.appendChild(tab);
    }

    const total = estado.abas.size;
    const ativas = Array.from(estado.abas.values()).filter((a) => a.info.status === 'running').length;
    el.statusAbas.textContent = `${total} aba${total === 1 ? '' : 's'} (${ativas} em execução)`;
  }

  function atualizarToolbarAtiva() {
    const item = estado.ativaId ? estado.abas.get(estado.ativaId) : null;
    el.btnInicio.classList.toggle('active', !item);
    if (!item) {
      el.tabToolbar.classList.add('hidden');
      el.terminalsContainer.classList.add('hidden');
      el.emptyState.classList.remove('hidden');
      return;
    }

    el.emptyState.classList.add('hidden');
    el.terminalsContainer.classList.remove('hidden');
    el.tabToolbar.classList.remove('hidden');

    el.metaAgente.textContent = item.info.nomePerfil;
    el.metaAgente.style.borderColor = item.info.cor;

    el.metaStatus.textContent = item.info.status === 'running'
      ? `Em execução${item.info.pid ? ` · PID ${item.info.pid}` : ''}`
      : `Encerrado (${item.info.exitCode ?? '?'})`;
    el.metaStatus.className = `pill pill-status ${item.info.status}`;

    if (item.info.projeto) {
      el.metaProjeto.textContent = item.info.projeto;
      el.metaProjeto.classList.remove('hidden');
    } else {
      el.metaProjeto.classList.add('hidden');
    }

    el.metaCwd.textContent = item.info.cwd;
    el.btnEnviarPrompt.classList.toggle('hidden', !item.info.promptInicial);
  }

  function ajustarTerminalAtivo() {
    const item = estado.ativaId ? estado.abas.get(estado.ativaId) : null;
    if (!item) return;
    try {
      item.fit.fit();
      if (item.ws && item.ws.readyState === WebSocket.OPEN) {
        item.ws.send(JSON.stringify({ tipo: 'resize', cols: item.term.cols, rows: item.term.rows }));
      }
    } catch { /* container ainda sem dimensões */ }
  }

  function mostrarInicio() {
    estado.ativaId = null;
    for (const item of estado.abas.values()) {
      item.pane.classList.remove('active');
    }
    renderizarBarraAbas();
    atualizarToolbarAtiva();
  }

  function ativarAba(id) {
    if (!estado.abas.has(id)) return;
    estado.ativaId = id;
    for (const [abaId, item] of estado.abas.entries()) {
      const ehAtiva = abaId === id;
      item.pane.classList.toggle('active', ehAtiva);
      if (ehAtiva) item.naoLido = false;
    }
    renderizarBarraAbas();
    atualizarToolbarAtiva();
    requestAnimationFrame(() => {
      ajustarTerminalAtivo();
      estado.abas.get(id)?.term.focus();
    });
  }

  function montarAba(info) {
    if (estado.abas.has(info.id)) return estado.abas.get(info.id);

    const pane = document.createElement('div');
    pane.className = 'terminal-pane';
    el.terminalsContainer.appendChild(pane);

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13.5,
      fontFamily: '"Cascadia Code", "JetBrains Mono", Consolas, monospace',
      scrollback: 5000,
      theme: {
        background: '#0b0e14',
        foreground: '#e6edf3',
        cursor: '#58a6ff',
        selectionBackground: 'rgba(88, 166, 255, 0.28)',
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(pane);

    const item = { info, pane, term, fit, ws: null, naoLido: false };
    estado.abas.set(info.id, item);

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${proto}//${window.location.host}/ws/terminais/${encodeURIComponent(info.id)}?token=${encodeURIComponent(estado.token)}`;
    const ws = new WebSocket(wsUrl);
    item.ws = ws;

    term.onData((dados) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ tipo: 'entrada', dados }));
      }
    });

    ws.addEventListener('open', () => {
      if (estado.ativaId === info.id) ajustarTerminalAtivo();
    });

    ws.addEventListener('message', (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.tipo === 'init') {
        item.info = msg.terminal;
        if (msg.buffer) term.write(msg.buffer);
        renderizarBarraAbas();
        if (estado.ativaId === info.id) atualizarToolbarAtiva();
      } else if (msg.tipo === 'saida') {
        term.write(msg.dados);
        if (estado.ativaId !== info.id && !item.naoLido) {
          item.naoLido = true;
          renderizarBarraAbas();
        }
      } else if (msg.tipo === 'status') {
        item.info = msg.terminal;
        renderizarBarraAbas();
        if (estado.ativaId === info.id) atualizarToolbarAtiva();
      } else if (msg.tipo === 'removido') {
        desmontarAbaLocal(info.id);
      }
    });

    ws.addEventListener('close', () => {
      if (estado.abas.has(info.id) && item.info.status === 'running') {
        el.statusConexao.textContent = 'WebSocket desconectado — recarregue para reconectar';
      }
    });

    return item;
  }

  function desmontarAbaLocal(id) {
    const item = estado.abas.get(id);
    if (!item) return;
    try { item.ws?.close(); } catch { /* ignore */ }
    item.term.dispose();
    item.pane.remove();
    estado.abas.delete(id);

    if (estado.ativaId === id) {
      const proximas = Array.from(estado.abas.keys());
      estado.ativaId = proximas.length > 0 ? proximas[proximas.length - 1] : null;
      if (estado.ativaId) ativarAba(estado.ativaId);
    }
    renderizarBarraAbas();
    atualizarToolbarAtiva();
  }

  async function abrirNovaAba({ perfilId, projeto = '', tarefa = 'codigo', titulo = '', comPrompt = false }) {
    try {
      let promptInicial = null;
      if (comPrompt) {
        const resPrompt = await api(
          `/api/prompt?agente=${encodeURIComponent(perfilId)}&tarefa=${encodeURIComponent(tarefa)}&projeto=${encodeURIComponent(projeto)}`,
        );
        promptInicial = resPrompt.prompt;
      }
      const { terminal } = await api('/api/terminais', {
        method: 'POST',
        body: JSON.stringify({
          perfilId,
          projeto: projeto || null,
          titulo: titulo || undefined,
          promptInicial,
        }),
      });
      montarAba(terminal);
      ativarAba(terminal.id);
    } catch (e) {
      avisar(`Erro ao abrir terminal: ${e.message}`);
    }
  }

  async function fecharAba(id) {
    try {
      await api(`/api/terminais/${encodeURIComponent(id)}`, { method: 'DELETE' });
      desmontarAbaLocal(id);
    } catch (e) {
      avisar(`Erro ao fechar aba: ${e.message}`);
    }
  }

  async function renomearAba(id) {
    const item = estado.abas.get(id);
    if (!item) return;
    const novo = window.prompt('Novo título para a aba:', item.info.titulo);
    if (!novo || !novo.trim()) return;
    try {
      const { terminal } = await api(`/api/terminais/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ titulo: novo.trim() }),
      });
      item.info = terminal;
      renderizarBarraAbas();
    } catch (e) {
      avisar(`Erro ao renomear: ${e.message}`);
    }
  }

  // Eventos de UI
  el.btnInicio.addEventListener('click', () => mostrarInicio());
  el.btnNovaAba.addEventListener('click', () => el.modal.showModal());
  el.btnFecharModal.addEventListener('click', () => el.modal.close());
  el.btnCancelarModal.addEventListener('click', () => el.modal.close());

  el.formHome.addEventListener('submit', (ev) => {
    ev.preventDefault();
    abrirNovaAba({
      perfilId: el.homePerfil.value,
      projeto: el.homeProjeto.value,
      tarefa: el.homeTarefa.value,
      titulo: el.homeTitulo.value.trim(),
      comPrompt: el.homeComPrompt.checked,
    });
    el.homeTitulo.value = '';
  });

  el.formModal.addEventListener('submit', (ev) => {
    ev.preventDefault();
    el.modal.close();
    abrirNovaAba({
      perfilId: el.modalPerfil.value,
      projeto: el.modalProjeto.value,
      tarefa: el.modalTarefa.value,
      titulo: el.modalTitulo.value.trim(),
      comPrompt: el.modalComPrompt.checked,
    });
    el.modalTitulo.value = '';
  });

  el.btnLimparTerm.addEventListener('click', () => {
    const item = estado.ativaId ? estado.abas.get(estado.ativaId) : null;
    item?.term.clear();
  });

  el.btnFecharAtiva.addEventListener('click', () => {
    if (estado.ativaId) fecharAba(estado.ativaId);
  });

  el.btnEnviarPrompt.addEventListener('click', () => {
    const item = estado.ativaId ? estado.abas.get(estado.ativaId) : null;
    if (!item || !item.info.promptInicial || !item.ws || item.ws.readyState !== WebSocket.OPEN) return;
    item.ws.send(JSON.stringify({ tipo: 'entrada', dados: item.info.promptInicial }));
    item.term.focus();
    avisar('Prompt de passagem inserido no terminal (pressione Enter para enviar).');
  });

  window.addEventListener('resize', () => ajustarTerminalAtivo());
  window.addEventListener('keydown', (ev) => {
    if (ev.altKey && ev.key.toLowerCase() === 't') {
      ev.preventDefault();
      el.modal.showModal();
    }
  });

  // Inicialização
  async function iniciar() {
    try {
      const dados = await api('/api/bootstrap');
      estado.token = dados.token;
      estado.perfis = dados.perfis || [];
      estado.harness = dados.harness || estado.harness;
      if (dados.painelIaUrl) el.linkPainelIa.href = dados.painelIaUrl;
      el.statusRaiz.textContent = estado.harness.raiz || '';

      renderizarCardsEFormularios();

      for (const termInfo of dados.terminais || []) {
        montarAba(termInfo);
      }
      if (estado.abas.size > 0) {
        const primeira = Array.from(estado.abas.keys())[0];
        ativarAba(primeira);
      } else {
        renderizarBarraAbas();
        atualizarToolbarAtiva();
      }
    } catch (e) {
      el.statusConexao.textContent = `Falha ao conectar: ${e.message}`;
      avisar(`Erro na inicialização: ${e.message}`);
    }
  }

  iniciar();
})();
