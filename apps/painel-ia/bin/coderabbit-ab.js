#!/usr/bin/env node
// Coleta, em modo leitura, os fatos do CodeRabbit nos PRs mergeados (reviews, comentários, commits)
// e grava no diretório de dados do painel (fora do repositório). Não guarda texto de comentário.
// Uso: node bin/coderabbit-ab.js [--repo dono/nome] [--saida arquivo.json]   (requer o gh autenticado)
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const args = process.argv.slice(2);
const opcao = (nome) => { const i = args.indexOf(nome); return i >= 0 ? args[i + 1] : undefined; };
const gh = (...a) => execFileSync('gh', a, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

const repo = opcao('--repo') || process.env.GITHUB_REPO || gh('repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner').trim();
const [dono, nome] = repo.split('/');
if (!dono || !nome) { process.stderr.write('informe --repo dono/nome\n'); process.exit(2); }
const saida = opcao('--saida') || process.env.CODERABBIT_JSON
  || join(process.env.DADOS_DIR || join(homedir(), '.pos-painel-ia'), 'coderabbit-ab.json');

const CONSULTA = `query($dono: String!, $nome: String!, $depois: String) {
  repository(owner: $dono, name: $nome) {
    pullRequests(states: MERGED, first: 50, after: $depois, orderBy: {field: CREATED_AT, direction: ASC}) {
      pageInfo { hasNextPage endCursor }
      nodes {
        number mergedAt
        reviews(first: 100) { nodes { author { login } submittedAt comments { totalCount } } }
        comments(first: 100) { nodes { author { login } } }
        commits(first: 250) { nodes { commit { committedDate } } }
      }
    }
  }
}`;

const prs = [];
let depois = null;
do {
  const a = ['api', 'graphql', '-f', `query=${CONSULTA}`, '-F', `dono=${dono}`, '-F', `nome=${nome}`];
  if (depois) a.push('-F', `depois=${depois}`);
  const pagina = JSON.parse(gh(...a)).data.repository.pullRequests;
  for (const pr of pagina.nodes) {
    prs.push({
      numero: pr.number,
      mergedAt: pr.mergedAt,
      reviews: pr.reviews.nodes.map((r) => ({ autor: r.author?.login || '', quando: r.submittedAt, comentarios: r.comments.totalCount })),
      comentarios: pr.comments.nodes.map((c) => ({ autor: c.author?.login || '' })),
      commits: pr.commits.nodes.map((c) => c.commit.committedDate),
    });
  }
  depois = pagina.pageInfo.hasNextPage ? pagina.pageInfo.endCursor : null;
} while (depois);

mkdirSync(dirname(saida), { recursive: true });
writeFileSync(saida, JSON.stringify({ coletadoEm: new Date().toISOString(), prs }, null, 1));
process.stdout.write(`${prs.length} PRs mergeados coletados.\n`);
