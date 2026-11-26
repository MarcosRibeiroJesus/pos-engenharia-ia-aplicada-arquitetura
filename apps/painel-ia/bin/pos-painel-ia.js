#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';

// node:sqlite ainda emite aviso de recurso experimental em algumas versões do Node; o resto dos avisos segue.
const emitir = process.emitWarning;
process.emitWarning = (aviso, ...resto) => (String(aviso).includes('SQLite') ? undefined : emitir.call(process, aviso, ...resto));
const { configuracao, iniciar } = await import('../src/app.js');
const { Persistencia } = await import('../src/persistencia.js');
const { relatorio } = await import('../src/relatorio.js');
const { salvarSnapshotUsage, parsearTextoUsage } = await import('../src/snapshot-usage.js');

const AJUDA = `pos-painel-ia: painel local, em tempo real, do uso de IA nas sessões do Claude Code e Antigravity.

Uso:
  pos-painel-ia [--porta 4317] [--host 127.0.0.1] [--transcripts <dir>] [--registro <csv>] [--banco <arquivo.db>]
  pos-painel-ia relatorio [--formato md|csv] [--saida <arquivo>] [--banco <arquivo.db>]
  pos-painel-ia snapshot --agente <antigravity|claude-code|copilot> [--colar] [--sessao-pct N] [--semana-pct N] [--reset-sessao ISO] [--reset-semana ISO] [--nota "..."]

Variáveis de ambiente:
  PORTA, HOST, CLAUDE_PROJECTS_DIR, ANTIGRAVITY_BRAIN_DIR, REGISTRO_CSV, INTERVALO_MS, HOSTS_PERMITIDOS
  DADOS_DIR (padrão ~/.pos-painel-ia) ou BANCO   onde o histórico fica guardado
  SNAPSHOT_USAGE_JSON              snapshot manual do /usage (padrão <dados>/usage-snapshot.json)
  MONDAY_TOKEN + MONDAY_BOARD_ID   aprovações pendentes do board do Monday (opcional)
  GITHUB_REPO [+ GITHUB_TOKEN]     PRs abertos e checks (opcional)
`;

const args = process.argv.slice(2);
const subcomando = (args[0] === 'relatorio' || args[0] === 'snapshot') ? args.shift() : null;
if (args.includes('-h') || args.includes('--help')) { process.stdout.write(AJUDA); process.exit(0); }
const env = { ...process.env };
const snapOpts = {};
let colarStdin = false;
const mapa = { '--porta': 'PORTA', '--host': 'HOST', '--transcripts': 'CLAUDE_PROJECTS_DIR', '--registro': 'REGISTRO_CSV',
  '--banco': 'BANCO', '--formato': 'FORMATO', '--saida': 'SAIDA', '--snapshot': 'SNAPSHOT_USAGE_JSON' };
const mapaSnap = { '--agente': 'agente', '--sessao-pct': 'sessaoPct', '--semana-pct': 'semanaPct',
  '--reset-sessao': 'resetSessaoEm', '--reset-semana': 'resetSemanaEm', '--nota': 'nota' };
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--colar') { colarStdin = true; continue; }
  const chave = mapa[args[i]];
  const chaveSnap = mapaSnap[args[i]];
  if ((!chave && !chaveSnap) || args[i + 1] === undefined) { process.stderr.write(`argumento inválido: ${args[i]}\n${AJUDA}`); process.exit(2); }
  if (chave) env[chave] = args[++i];
  else snapOpts[chaveSnap] = args[++i];
}

if (subcomando === 'snapshot') {
  try {
    const caminho = configuracao(env).snapshotUsage;
    const dados = colarStdin
      ? { ...parsearTextoUsage(readFileSync(0, 'utf8')), ...snapOpts }
      : snapOpts;
    const reg = salvarSnapshotUsage(caminho, dados);
    process.stdout.write(`Snapshot salvo em ${caminho} (${dados.agente}): ${JSON.stringify(reg)}\n`);
    process.exit(0);
  } catch (e) {
    process.stderr.write(`erro ao salvar snapshot: ${e.message}\n`);
    process.exit(2);
  }
}

if (subcomando === 'relatorio') {
  const banco = new Persistencia(configuracao(env).banco);
  const texto = relatorio(banco, { formato: env.FORMATO || 'md' });
  banco.fechar();
  if (env.SAIDA) writeFileSync(env.SAIDA, texto); else process.stdout.write(texto);
  process.exit(0);
}

const { parar } = await iniciar(configuracao(env));
for (const sinal of ['SIGINT', 'SIGTERM']) process.on(sinal, () => { parar(); process.exit(0); });
