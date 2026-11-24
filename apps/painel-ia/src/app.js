// Compõe as fontes (transcripts, registro, Monday, GitHub) e o servidor.
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Agregador } from './agregador.js';
import { LeitorTranscripts } from './transcripts.js';
import { lerRegistro } from './registro.js';
import { lerProgresso } from './progresso.js';
import { itensMonday } from './monday.js';
import { prsGithub } from './github.js';
import { criarServidor } from './servidor.js';
import { Persistencia } from './persistencia.js';
import { relatorio } from './relatorio.js';
import { buscarAnthropic, buscarCopilot, montarPainelAgentes, calcularCustoPorToken } from './provedores.js';
import { comparativo, lerArquivoTestesAb, lerColetaCoderabbit } from './comparativo.js';

export function configuracao(env = process.env) {
  const numero = (v, padrao) => (Number.isFinite(Number(v)) && v !== undefined && v !== '' ? Number(v) : padrao);
  const dados = env.DADOS_DIR || join(homedir(), '.pos-painel-ia');
  return {
    host: env.HOST || '127.0.0.1',
    porta: numero(env.PORTA ?? env.PORT, 4317),
    transcripts: env.CLAUDE_PROJECTS_DIR || join(homedir(), '.claude', 'projects'),
    antigravity: env.ANTIGRAVITY_BRAIN_DIR || join(homedir(), '.gemini', 'antigravity-cli', 'brain'),
    banco: env.BANCO || join(dados, 'painel.db'),
    registro: env.REGISTRO_CSV || '',
    progresso: env.PROGRESSO_MD || (env.REGISTRO_CSV ? join(env.REGISTRO_CSV, '..', '..', '..', 'harness', 'progresso.md') : ''),
    testesAb: env.TESTES_AB_CSV || '',
    coderabbit: env.CODERABBIT_JSON || join(dados, 'coderabbit-ab.json'),
    intervaloMs: numero(env.INTERVALO_MS, 1500),
    hostsPermitidos: (env.HOSTS_PERMITIDOS || '').split(',').map((h) => h.trim()).filter(Boolean),
    monday: env.MONDAY_TOKEN && env.MONDAY_BOARD_ID ? { token: env.MONDAY_TOKEN, quadro: env.MONDAY_BOARD_ID } : null,
    github: env.GITHUB_REPO ? { repo: env.GITHUB_REPO, token: env.GITHUB_TOKEN || '' } : null,
    anthropic: env.ANTHROPIC_ADMIN_API_KEY ? { apiKey: env.ANTHROPIC_ADMIN_API_KEY } : null,
    copilot: env.GITHUB_TOKEN && (env.GITHUB_ORG || env.GITHUB_USER)
      ? { token: env.GITHUB_TOKEN, org: env.GITHUB_ORG || '', user: env.GITHUB_USER || '' }
      : null,
    cotas: {
      'claude-code': { sessao: numero(env.COTA_SESSAO_CLAUDE, 10_000_000), semana: numero(env.COTA_SEMANA_CLAUDE, 50_000_000) },
      antigravity: { sessao: numero(env.COTA_SESSAO_ANTIGRAVITY, 10_000_000), semana: numero(env.COTA_SEMANA_ANTIGRAVITY, 50_000_000) },
      copilot: { sessao: numero(env.COTA_SESSAO_COPILOT, 5_000_000), semana: numero(env.COTA_SEMANA_COPILOT, 25_000_000) },
    },
  };
}

export async function iniciar(cfg = configuracao(), log = console) {
  const agregador = new Agregador();
  const banco = new Persistencia(cfg.banco);
  banco.restaurar(agregador);
  const externos = {
    aprovacoes: { ativo: !!cfg.monday, itens: [], erro: null, atualizado: null },
    prs: { ativo: !!cfg.github, itens: [], erro: null, atualizado: null },
    provedores: {
      anthropic: { ativo: !!cfg.anthropic, fonte: 'local', semana: null, erro: null, atualizado: null },
      copilot: { ativo: !!cfg.copilot, fonte: 'local', semana: null, erro: null, atualizado: null },
    },
    fontes: { arquivos: 0, linhasInvalidas: 0, registroAtivo: Boolean(cfg.registro), progressoAtivo: Boolean(cfg.progresso), antigravityAtivo: Boolean(cfg.antigravity), salvoEm: null },
  };
  // Entradas do comparativo A x B, relidas a cada ciclo; a rota só monta a resposta (síncrona).
  const ab = { registro: [], testes: [], coderabbit: null };
  const leitor = new LeitorTranscripts(cfg.transcripts, (ev, meta) => agregador.ingerir(ev, meta));
  const leitorAgy = cfg.antigravity
    ? new LeitorTranscripts(cfg.antigravity, (ev, meta) => agregador.ingerir(ev, meta), { origem: 'antigravity', somenteNome: 'transcript.jsonl' })
    : null;
  const estado = () => {
    const base = agregador.estado();
    return {
      ...base,
      ...externos,
      painelAgentes: montarPainelAgentes(base, cfg.cotas, externos.provedores),
      custoPorToken: calcularCustoPorToken(base.modelos, externos.provedores),
      fontes: {
        ...externos.fontes,
        arquivos: leitor.arquivos + (leitorAgy?.arquivos || 0),
        linhasInvalidas: leitor.erros + (leitorAgy?.erros || 0),
      },
    };
  };

  const srv = criarServidor({
    estado,
    detalheSessao: (id) => agregador.detalheSessao(id),
    hostsPermitidos: cfg.hostsPermitidos,
    extras: {
      '/api/relatorio.md': () => [relatorio(banco, { formato: 'md' }), 'text/markdown; charset=utf-8', 'relatorio-uso-ia.md'],
      '/api/comparativo': () => [JSON.stringify(comparativo(banco, ab)), 'application/json; charset=utf-8'],
      '/api/relatorio.csv': () => [relatorio(banco, { formato: 'csv' }), 'text/csv; charset=utf-8', 'uso-tokens.csv'],
    },
  });
  let versaoEnviada = -1;
  const ciclo = async () => {
    const rodarFonte = async (nome, fn) => {
      try { await fn(); } catch (e) { log.error(`falha ao ler ${nome}:`, e.message); }
    };
    await rodarFonte('claude-code', () => leitor.varrer());
    if (leitorAgy) await rodarFonte('antigravity', () => leitorAgy.varrer());
    if (cfg.registro) await rodarFonte('registro', async () => { ab.registro = await lerRegistro(cfg.registro); agregador.ingerirRegistro(ab.registro); });
    if (cfg.progresso) await rodarFonte('progresso', async () => agregador.ingerirProgresso(await lerProgresso(cfg.progresso)));
    await rodarFonte('testes-ab', async () => { ab.testes = await lerArquivoTestesAb(cfg.testesAb); });
    await rodarFonte('coderabbit-ab', async () => { ab.coderabbit = await lerColetaCoderabbit(cfg.coderabbit); });
    try {
      if (banco.salvar(agregador)) externos.fontes.salvoEm = Date.now();
    } catch (e) { log.error('falha ao salvar no banco:', e.message); }
    if (agregador.versao !== versaoEnviada) { versaoEnviada = agregador.versao; srv.notificar(); }
  };

  const periodico = (fn, ms) => { fn(); const t = setInterval(fn, ms); t.unref(); return t; };
  const timers = [];
  const externo = (alvo, buscar, ms) => timers.push(periodico(async () => {
    try { alvo.itens = await buscar(); alvo.erro = null; alvo.atualizado = Date.now(); } catch (e) { alvo.erro = e.message; }
    srv.notificar();
  }, ms));
  if (cfg.monday) externo(externos.aprovacoes, () => itensMonday(cfg.monday), 60_000);
  if (cfg.github) externo(externos.prs, () => prsGithub(cfg.github), cfg.github.token ? 120_000 : 600_000);
  if (cfg.anthropic) timers.push(periodico(async () => {
    try { externos.provedores.anthropic = await buscarAnthropic(cfg.anthropic); }
    catch (e) { externos.provedores.anthropic = { ativo: true, fonte: 'local', semana: null, erro: e.message }; }
    srv.notificar();
  }, 300_000));
  if (cfg.copilot) timers.push(periodico(async () => {
    try { externos.provedores.copilot = await buscarCopilot(cfg.copilot); }
    catch (e) { externos.provedores.copilot = { ativo: true, fonte: 'local', semana: null, erro: e.message }; }
    srv.notificar();
  }, 300_000));

  await ciclo();
  timers.push(setInterval(ciclo, cfg.intervaloMs));
  await new Promise((resolve, reject) => { srv.once('error', reject); srv.listen(cfg.porta, cfg.host, resolve); });
  log.log(`Painel de IA em http://${cfg.host === '0.0.0.0' ? 'localhost' : cfg.host}:${srv.address().port} · lendo ${cfg.transcripts} · banco ${cfg.banco}`);

  const parar = () => {
    timers.forEach(clearInterval);
    try { banco.salvar(agregador); } finally { banco.fechar(); }
    srv.fecharTudo();
  };
  return { srv, parar, estado };
}
