// PRs abertos do repositório (opcional). Sem token, só a lista; com token, também o resumo dos checks.

async function obter(url, token, fetch) {
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'pos-painel-ia', 'X-GitHub-Api-Version': '2022-11-28' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const resp = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
  if (!resp.ok) throw new Error(`GitHub respondeu ${resp.status}`);
  return resp.json();
}

export async function prsGithub({ repo, token, fetch = globalThis.fetch }) {
  const base = `https://api.github.com/repos/${repo}`;
  const prs = await obter(`${base}/pulls?state=open&per_page=30`, token, fetch);
  return Promise.all(prs.map(async (pr) => {
    const item = { numero: pr.number, titulo: pr.title, rascunho: pr.draft, url: pr.html_url, checks: null };
    if (token) {
      const { check_runs: runs = [] } = await obter(`${base}/commits/${pr.head.sha}/check-runs?per_page=100`, token, fetch);
      item.checks = { sucesso: 0, falha: 0, andamento: 0 };
      for (const r of runs) {
        if (r.status !== 'completed') item.checks.andamento++;
        else if (['success', 'neutral', 'skipped'].includes(r.conclusion)) item.checks.sucesso++;
        else item.checks.falha++;
      }
    }
    return item;
  }));
}
