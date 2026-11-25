// Integrações oficiais de uso/custo com provedores (Anthropic Admin API e GitHub Copilot)
// + painel por Code Agent (% da sessão atual e % da semana) + painel de custo por token.
// Nenhuma credencial é exposta nos retornos ou mensagens de erro.

const AGENTES_PADRAO = [
  { agente: 'claude-code', titulo: 'Claude Code' },
  { agente: 'antigravity', titulo: 'Antigravity' },
  { agente: 'copilot', titulo: 'GitHub Copilot' },
];

// Tabela de referência em USD por 1M de tokens (usada apenas como 'estimativa de referência'
// quando o provedor não expõe API de billing para assinatura pessoal).
const PRECOS_REF_1M = [
  { match: /opus/i, input: 15, cache_write: 18.75, cache_read: 1.5, output: 75 },
  { match: /sonnet/i, input: 3, cache_write: 3.75, cache_read: 0.3, output: 15 },
  { match: /haiku/i, input: 0.8, cache_write: 1.0, cache_read: 0.08, output: 4 },
  { match: /gemini/i, input: 1.25, cache_write: 1.25, cache_read: 0.125, output: 5 },
  { match: /gpt|o1|o3/i, input: 2.5, cache_write: 2.5, cache_read: 0.625, output: 10 },
];
const PRECO_PADRAO = { input: 3, cache_write: 3.75, cache_read: 0.3, output: 15 };

function precoRefDe(modelo = '') {
  return PRECOS_REF_1M.find((p) => p.match.test(String(modelo))) || PRECO_PADRAO;
}

/** Consulta oficial Anthropic Admin API (Organização) para uso e custo dos últimos 7 dias. */
export async function buscarAnthropic({ apiKey, agora = () => Date.now(), fetchImpl = fetch } = {}) {
  if (!apiKey) return { ativo: false, fonte: 'local', semana: null, erro: null };
  const fim = new Date(agora());
  const ini = new Date(fim.getTime() - 7 * 86_400_000);
  const qs = `starting_at=${encodeURIComponent(ini.toISOString())}&ending_at=${encodeURIComponent(fim.toISOString())}&bucket_width=1d`;
  const headers = { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', Accept: 'application/json' };

  const [rUso, rCusto] = await Promise.all([
    fetchImpl(`https://api.anthropic.com/v1/organizations/usage_report/messages?${qs}`, { headers }),
    fetchImpl(`https://api.anthropic.com/v1/organizations/cost_report?${qs}`, { headers }),
  ]);
  if (!rUso.ok) throw new Error(`Anthropic usage HTTP ${rUso.status}`);
  if (!rCusto.ok) throw new Error(`Anthropic cost HTTP ${rCusto.status}`);

  const usoJson = await rUso.json();
  const custoJson = await rCusto.json();
  let input = 0, cache_write = 0, cache_read = 0, output = 0, custoUsd = 0;

  for (const bucket of usoJson.data || []) {
    for (const r of bucket.results || []) {
      input += Number(r.uncached_input_tokens) || 0;
      const cc = r.cache_creation || {};
      cache_write += (Number(cc.ephemeral_5m_input_tokens) || 0) + (Number(cc.ephemeral_1h_input_tokens) || 0);
      cache_read += Number(r.cache_read_input_tokens) || 0;
      output += Number(r.output_tokens) || 0;
    }
  }
  for (const bucket of custoJson.data || []) {
    for (const r of bucket.results || []) {
      custoUsd += Number(r.amount) || 0;
    }
  }
  const totalTokens = input + cache_write + cache_read + output;
  return {
    ativo: true,
    fonte: 'provedor',
    atualizado: agora(),
    semana: {
      input,
      cache_write,
      cache_read,
      output,
      custoUsd: Number(custoUsd.toFixed(4)),
      custoPorMilhaoUsd: totalTokens > 0 ? Number(((custoUsd * 1_000_000) / totalTokens).toFixed(4)) : 0,
    },
    erro: null,
  };
}

/** Consulta oficial GitHub Copilot API (Org metrics/billing ou User billing usage). */
export async function buscarCopilot({ token, org = '', user = '', agora = () => Date.now(), fetchImpl = fetch } = {}) {
  if (!token || (!org && !user)) return { ativo: false, fonte: 'local', semana: null, erro: null };
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };

  if (org) {
    const [rMet, rBil] = await Promise.all([
      fetchImpl(`https://api.github.com/orgs/${encodeURIComponent(org)}/copilot/metrics`, { headers }),
      fetchImpl(`https://api.github.com/orgs/${encodeURIComponent(org)}/copilot/billing`, { headers }),
    ]);
    if (!rMet.ok) throw new Error(`GitHub Copilot metrics HTTP ${rMet.status}`);
    const met = await rMet.json();
    const bil = rBil.ok ? await rBil.json() : {};
    const ultimos7 = Array.isArray(met) ? met.slice(-7) : [];
    const ativos = ultimos7.reduce((m, d) => Math.max(m, Number(d.total_active_users) || 0), 0);
    return {
      ativo: true,
      fonte: 'provedor',
      atualizado: agora(),
      semana: {
        ativos,
        assentos: Number(bil?.seat_breakdown?.total) || 0,
        custoUsd: null,
      },
      erro: null,
    };
  }

  const rUser = await fetchImpl(`https://api.github.com/users/${encodeURIComponent(user)}/settings/billing/usage`, { headers });
  if (!rUser.ok) throw new Error(`GitHub Billing usage HTTP ${rUser.status}`);
  const dados = await rUser.json();
  const itensCopilot = (dados.usageItems || []).filter((i) => /copilot/i.test(String(i.product || i.sku || '')));
  const custoUsd = itensCopilot.reduce((s, i) => s + (Number(i.netAmount) || 0), 0);
  const quantidade = itensCopilot.reduce((s, i) => s + (Number(i.quantity) || 0), 0);
  return {
    ativo: true,
    fonte: 'provedor',
    atualizado: agora(),
    semana: { quantidade, custoUsd: Number(custoUsd.toFixed(4)) },
    erro: null,
  };
}

/** Monta um painel individual para cada Code Agent com consumo em % da sessão atual e da semana atual. */
export function montarPainelAgentes(estado, cotas = {}, provedores = {}) {
  const ultimaSemana = (estado.porSemana || []).at(-1) || null;
  const sessoes = estado.sessoes || [];

  return AGENTES_PADRAO.map(({ agente, titulo }) => {
    const cotaAg = cotas[agente] || { sessao: 10_000_000, semana: 50_000_000 };
    const sessoesAg = sessoes.filter((s) => (s.agente || 'claude-code') === agente);
    const sessaoAtual = sessoesAg.find((s) => s.ativa) || sessoesAg[0] || null;
    const eqSessao = sessaoAtual?.equivalente || 0;
    const pctSessao = cotaAg.sessao > 0 ? Number(((100 * eqSessao) / cotaAg.sessao).toFixed(1)) : 0;

    const dadosSemana = ultimaSemana?.agentes?.[agente] || { equivalente: 0, requisicoes: 0 };
    const eqSemana = dadosSemana.equivalente || 0;
    const pctSemana = cotaAg.semana > 0 ? Number(((100 * eqSemana) / cotaAg.semana).toFixed(1)) : 0;

    const prov = agente === 'claude-code' ? provedores.anthropic
      : (agente === 'copilot' ? provedores.copilot : null);

    return {
      agente,
      titulo,
      sessao: {
        id: sessaoAtual?.id || null,
        idCompleto: sessaoAtual?.idCompleto || null,
        ativa: Boolean(sessaoAtual?.ativa),
        equivalente: eqSessao,
        cota: cotaAg.sessao,
        pct: pctSessao,
      },
      semana: {
        chave: ultimaSemana?.semana || '—',
        equivalente: eqSemana,
        requisicoes: dadosSemana.requisicoes || 0,
        cota: cotaAg.semana,
        pct: pctSemana,
      },
      provedor: prov?.ativo
        ? { ativo: true, fonte: 'provedor', custoUsd: prov.semana?.custoUsd ?? null, erro: prov.erro || null }
        : { ativo: false, fonte: 'local (transcripts)', custoUsd: null, erro: prov?.erro || null },
    };
  });
}

/** Calcula custo por token (USD/1M e total USD) por modelo, rotulando provedor vs. estimativa de referência. */
export function calcularCustoPorToken(modelos = [], provedores = {}) {
  return modelos.map((m) => {
    const p = precoRefDe(m.nome);
    const totalUsd = ((m.input || 0) * p.input
      + (m.cache_write || 0) * p.cache_write
      + (m.cache_read || 0) * p.cache_read
      + (m.output || 0) * p.output) / 1_000_000;
    const totalTokens = (m.input || 0) + (m.cache_write || 0) + (m.cache_read || 0) + (m.output || 0);
    const efetivoPorMilhaoUsd = totalTokens > 0 ? (totalUsd * 1_000_000) / totalTokens : 0;
    const usaAnthropicReal = /claude/i.test(m.nome) && provedores.anthropic?.ativo && provedores.anthropic?.semana?.custoUsd != null;
    return {
      modelo: m.nome,
      input1M: p.input,
      cacheWrite1M: p.cache_write,
      cacheRead1M: p.cache_read,
      output1M: p.output,
      efetivoPorMilhaoUsd: Number(efetivoPorMilhaoUsd.toFixed(4)),
      totalUsd: Number(totalUsd.toFixed(4)),
      rotulo: usaAnthropicReal ? 'estimativa de referência (API Anthropic ativa no total)' : 'estimativa de referência',
    };
  }).sort((a, b) => b.totalUsd - a.totalUsd);
}
