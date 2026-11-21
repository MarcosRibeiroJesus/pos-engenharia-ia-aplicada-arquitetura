#!/usr/bin/env node
import { writeFileSync } from 'node:fs';

// node:sqlite ainda emite aviso de recurso experimental em algumas versões do Node; o resto dos avisos segue.
const emitir = process.emitWarning;
process.emitWarning = (aviso, ...resto) => (String(aviso).includes('SQLite') ? undefined : emitir.call(process, aviso, ...resto));
const { configuracao, iniciar } = await import('../src/app.js');
const { Persistencia } = await import('../src/persistencia.js');
const { relatorio } = await import('../src/relatorio.js');

const AJUDA = `pos-painel-ia: painel local, em tempo real, do uso de IA nas sessões do Claude Code.

Uso:
  pos-painel-ia [--porta 4317] [--host 127.0.0.1] [--transcripts <dir>] [--registro <csv>] [--banco <arquivo.db>]
  pos-painel-ia relatorio [--formato md|csv] [--saida <arquivo>] [--banco <arquivo.db>]

Variáveis de ambiente:
  PORTA, HOST, CLAUDE_PROJECTS_DIR, REGISTRO_CSV, INTERVALO_MS, HOSTS_PERMITIDOS
  DADOS_DIR (padrão ~/.pos-painel-ia) ou BANCO   onde o histórico fica guardado
  MONDAY_TOKEN + MONDAY_BOARD_ID   aprovações pendentes do board do Monday (opcional)
  GITHUB_REPO [+ GITHUB_TOKEN]     PRs abertos e checks (opcional)
`;

const args = process.argv.slice(2);
const subcomando = args[0] === 'relatorio' ? args.shift() : null;
if (args.includes('-h') || args.includes('--help')) { process.stdout.write(AJUDA); process.exit(0); }
const env = { ...process.env };
const mapa = { '--porta': 'PORTA', '--host': 'HOST', '--transcripts': 'CLAUDE_PROJECTS_DIR', '--registro': 'REGISTRO_CSV',
  '--banco': 'BANCO', '--formato': 'FORMATO', '--saida': 'SAIDA' };
for (let i = 0; i < args.length; i++) {
  const chave = mapa[args[i]];
  if (!chave || args[i + 1] === undefined) { process.stderr.write(`argumento inválido: ${args[i]}\n${AJUDA}`); process.exit(2); }
  env[chave] = args[++i];
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
