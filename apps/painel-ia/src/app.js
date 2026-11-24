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

export function configuracao(env = process.env) {
  const numero = (v, padrao) => (Number.isFinite(Number(v)) && v !== undefined && v !== '' ? Number(v) : padrao);
  return {
    host: env.HOST || '127.0.0.1',
    porta: numero(env.PORTA ?? env.PORT, 4317),
    transcripts: env.CLAUDE_PROJECTS_DIR || join(homedir(), '.claude', 'projects'),
    antigravity: env.ANTIGRAVITY_BRAIN_DIR || join(homedir(), '.gemini', 'antigravity-cli', 'brain'),
    banco: env.BANCO || join(env.DADOS_DIR || join(homedir(), '.pos-painel-ia'), 'painel.db'),
    registro: env.REGISTRO_CSV || '',
    progresso: env.PROGRESSO_MD || (env.REGISTRO_CSV ? join(env.REGISTRO_CSV, '..', '..', '..', 'harness', 'progresso.md') : ''),
    intervaloMs: numero(env.INTERVALO_MS, 1500),
    hostsPermitidos: (env.HOSTS_PERMITIDOS || '').split(',').map((h) => h.trim()).filter(Boolean),
    monday: env.MONDAY_TOKEN && env.MONDAY_BOARD_ID ? { token: env.MONDAY_TOKEN, quadro: env.MONDAY_BOARD_ID } : null,
    github: env.GITHUB_REPO ? { repo: env.GITHUB_REPO, token: env.GITHUB_TOKEN || '' } : null,
  };
}

export async function iniciar(cfg = configuracao(), log = console) {
  const agregador = new Agregador();
  const banco = new Persistencia(cfg.banco);
  banco.restaurar(agregador);
  const externos = {
    aprovacoes: { ativo: !!cfg.monday, itens: [], erro: null, atualizado: null },
    prs: { ativo: !!cfg.github, itens: [], erro: null, atualizado: null },
    fontes: { transcripts: cfg.transcripts, antigravity: cfg.antigravity, arquivos: 0, linhasInvalidas: 0, registro: cfg.registro || null, banco: cfg.banco, salvoEm: null },
  };
  const leitor = new LeitorTranscripts(cfg.transcripts, (ev, meta) => agregador.ingerir(ev, meta));
  const leitorAgy = cfg.antigravity
    ? new LeitorTranscripts(cfg.antigravity, (ev, meta) => agregador.ingerir(ev, meta), { origem: 'antigravity', somenteNome: 'transcript.jsonl' })
    : null;
  const estado = () => ({ ...agregador.estado(), ...externos,
    fontes: {
      ...externos.fontes,
      arquivos: leitor.arquivos + (leitorAgy?.arquivos || 0),
      linhasInvalidas: leitor.erros + (leitorAgy?.erros || 0),
    } });

  const srv = criarServidor({
    estado,
    detalheSessao: (id) => agregador.detalheSessao(id),
    hostsPermitidos: cfg.hostsPermitidos,
    extras: {
      '/api/relatorio.md': () => [relatorio(banco, { formato: 'md' }), 'text/markdown; charset=utf-8', 'relatorio-uso-ia.md'],
      '/api/relatorio.csv': () => [relatorio(banco, { formato: 'csv' }), 'text/csv; charset=utf-8', 'uso-tokens.csv'],
    },
  });
  let versaoEnviada = -1;
  const ciclo = async () => {
    try {
      await leitor.varrer();
      if (leitorAgy) await leitorAgy.varrer();
      if (cfg.registro) agregador.ingerirRegistro(await lerRegistro(cfg.registro));
      if (cfg.progresso) agregador.ingerirProgresso(await lerProgresso(cfg.progresso));
      if (banco.salvar(agregador)) externos.fontes.salvoEm = Date.now();
    } catch (e) { log.error('falha ao ler as fontes:', e.message); }
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
