// Limites reais da conta Claude (% da sessão de 5 h e da semana), lidos do endpoint de uso
// com o token OAuth da conta. Só leitura. O token nunca aparece em retornos nem em erros.
import { readFileSync } from 'node:fs';

const USO_URL = 'https://api.anthropic.com/api/oauth/usage';
const UA = 'pos-painel-ia (leitura de uso)';

/** Lê o accessToken de um arquivo local (JSON). Arquivo ausente ou ilegível vira '' (feature desligada). */
export function lerToken(caminho, ler = (p) => readFileSync(p, 'utf8')) {
  if (!caminho) return '';
  try {
    const j = JSON.parse(ler(caminho));
    return typeof j.access_token === 'string' ? j.access_token : '';
  } catch {
    return '';
  }
}

const ISO = (v) => (v ? new Date(v).toISOString() : null);
const pct = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const restante = (p) => Math.max(0, Math.round((100 - p) * 10) / 10);

/** Consulta o endpoint de uso da conta. Sem token, não chama a rede. */
export async function buscarLimites({ accessToken = '', fetchImpl = fetch } = {}) {
  if (!accessToken) return { ativo: false, fonte: 'conta', erro: null };
  const res = await fetchImpl(USO_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'anthropic-beta': 'oauth-2025-04-20',
      'anthropic-version': '2023-06-01',
      'User-Agent': UA,
    },
  });
  if (!res.ok) {
    // mensagem sem corpo nem token: só o status
    const e = new Error(`limites da conta HTTP ${res.status}`);
    e.status = res.status;
    throw e;
  }
  const j = await res.json();
  const sessaoP = pct(j.five_hour?.utilization);
  const semanaP = pct(j.seven_day?.utilization);
  return {
    ativo: true,
    fonte: 'conta',
    erro: null,
    sessao: { pct: sessaoP, restantePct: restante(sessaoP), resetEm: ISO(j.five_hour?.resets_at) },
    semana: { pct: semanaP, restantePct: restante(semanaP), resetEm: ISO(j.seven_day?.resets_at) },
    produtos: (j.seven_day_breakdown?.rows || []).map((r) => ({ label: r.display_name, pct: pct(r.percent) })),
    escopos: (j.limits || [])
      .filter((l) => l.kind === 'weekly_scoped' && l.scope?.model?.display_name)
      .map((l) => ({ label: l.scope.model.display_name, pct: pct(l.percent), resetEm: ISO(l.resets_at) })),
  };
}

/** Troca o % do Claude Code pelo da conta quando ela está lida; senão mantém a estimativa por logs. */
export function aplicarLimitesConta(paineis, limites) {
  return paineis.map((p) => {
    if (p.agente !== 'claude-code') return p;
    if (!limites?.ativo || !limites.sessao || !limites.semana) return { ...p, fontePct: 'estimativa' };
    return {
      ...p,
      fontePct: 'conta',
      sessao: { ...p.sessao, pct: limites.sessao.pct, restantePct: limites.sessao.restantePct, resetEm: limites.sessao.resetEm },
      semana: { ...p.semana, pct: limites.semana.pct, restantePct: limites.semana.restantePct, resetEm: limites.semana.resetEm },
    };
  });
}
