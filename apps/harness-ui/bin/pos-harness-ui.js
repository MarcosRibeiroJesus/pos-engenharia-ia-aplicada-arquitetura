#!/usr/bin/env node
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pty from 'node-pty';
import { GerenciadorTerminais } from '../src/gerenciador.js';
import { criarServidor } from '../src/servidor.js';

const DIR_REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const args = process.argv.slice(2);
const env = { ...process.env };
const mapa = { '--porta': 'PORTA', '--host': 'HOST', '--raiz': 'HARNESS_RAIZ', '--painel-ia': 'PAINEL_IA_URL' };

for (let i = 0; i < args.length; i++) {
  if (args[i] === '-h' || args[i] === '--help') {
    process.stdout.write(
      'pos-harness-ui: interface web local com abas de terminais PTY dedicados para code agents.\n' +
      'Uso: pos-harness-ui [--porta 4318] [--host 127.0.0.1] [--raiz <dir>] [--painel-ia http://localhost:4317]\n',
    );
    process.exit(0);
  }
  const chave = mapa[args[i]];
  if (!chave || args[i + 1] === undefined) {
    process.stderr.write(`argumento inválido: ${args[i]}\n`);
    process.exit(2);
  }
  env[chave] = args[++i];
}

const host = env.HOST || '127.0.0.1';
const porta = Number(env.PORTA || 4318);
const raiz = resolve(env.HARNESS_RAIZ || DIR_REPO);
const painelIaUrl = env.PAINEL_IA_URL || 'http://localhost:4317';

const gerenciador = new GerenciadorTerminais({
  ptyFactory: (cmd, cmdArgs, opts) => pty.spawn(cmd, cmdArgs, opts),
  raizPadrao: raiz,
});

const servidor = criarServidor({ gerenciador, raiz, host, porta, painelIaUrl });
const info = await servidor.iniciar();
process.stdout.write(`Harness UI em ${info.url} · raiz ${raiz} · Painel de IA ${painelIaUrl}\n`);

let encerrando = false;
for (const sinal of ['SIGINT', 'SIGTERM']) {
  process.on(sinal, async () => {
    if (encerrando) return;
    encerrando = true;
    await servidor.parar();
    process.exit(0);
  });
}
