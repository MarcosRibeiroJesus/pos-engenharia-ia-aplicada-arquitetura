// Snapshot manual do /usage (calibração local para agentes sem API oficial de cota, como o Antigravity).
// O arquivo fica fora do repositório (padrão ~/.pos-painel-ia/usage-snapshot.json) e é relido a cada ciclo.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const ORDEM_SAUDE = { saudavel: 0, alerta: 1, critico: 2 };

/** Classifica o percentual de cota no semáforo (<70% verde, 70–90% amarelo, >=90% vermelho). */
export function classificarSaude(pct) {
  const v = Number(pct) || 0;
  if (v >= 90) return { nivel: 'critico', rotulo: 'Crítico' };
  if (v >= 70) return { nivel: 'alerta', rotulo: 'Atenção' };
  return { nivel: 'saudavel', rotulo: 'Saudável' };
}

/** Retorna o pior nível de saúde entre duas janelas (sessão 5h e semana 7d). */
export function piorSaude(a, b) {
  return (ORDEM_SAUDE[a?.nivel] ?? 0) >= (ORDEM_SAUDE[b?.nivel] ?? 0) ? a : b;
}

const ISO = (v) => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

const pctValido = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n * 10) / 10));
};

const restante = (p) => Math.max(0, Math.round((100 - p) * 10) / 10);

/** Lê o arquivo JSON de snapshots de /usage. Ausente ou inválido retorna {}. */
export async function lerSnapshotsUsage(caminho) {
  if (!caminho) return {};
  try {
    const bruto = await readFile(caminho, 'utf8');
    const j = JSON.parse(bruto);
    return j && typeof j === 'object' && !Array.isArray(j) ? j : {};
  } catch {
    return {};
  }
}

/** Salva ou atualiza o snapshot manual de um agente no arquivo JSON local. */
export function salvarSnapshotUsage(caminho, entrada, { agora = () => Date.now() } = {}) {
  const agente = String(entrada?.agente || '').trim().toLowerCase();
  if (!agente) throw new Error('agente é obrigatório (ex.: antigravity, claude-code, copilot)');
  const sessaoPct = pctValido(entrada.sessaoPct);
  const semanaPct = pctValido(entrada.semanaPct);
  if (sessaoPct == null && semanaPct == null) {
    throw new Error('informe ao menos --sessao-pct ou --semana-pct (0 a 100)');
  }
  let atual = {};
  try {
    const j = JSON.parse(readFileSync(caminho, 'utf8'));
    if (j && typeof j === 'object' && !Array.isArray(j)) atual = j;
  } catch { /* arquivo novo */ }

  const anterior = atual[agente] || {};
  const registro = {
    capturadoEm: new Date(agora()).toISOString(),
    sessaoPct: sessaoPct ?? anterior.sessaoPct ?? null,
    semanaPct: semanaPct ?? anterior.semanaPct ?? null,
    resetSessaoEm: entrada.resetSessaoEm !== undefined ? ISO(entrada.resetSessaoEm) : (anterior.resetSessaoEm ?? null),
    resetSemanaEm: entrada.resetSemanaEm !== undefined ? ISO(entrada.resetSemanaEm) : (anterior.resetSemanaEm ?? null),
    nota: entrada.nota ? String(entrada.nota).slice(0, 200) : (anterior.nota || ''),
  };
  atual[agente] = registro;
  mkdirSync(dirname(caminho), { recursive: true });
  writeFileSync(caminho, JSON.stringify(atual, null, 2));
  return registro;
}

/**
 * Aplica snapshots manuais de /usage aos painéis que não estão com leitura direta da conta ('conta'),
 * calcula o delta em tempo real de tokens desde a captura e anexa a classificação de saúde (<70 / 70-90 / >=90).
 */
export function aplicarSnapshotsUsage(paineis, snapshots = {}, deltaDesde = () => 0, agora = Date.now()) {
  return paineis.map((p) => {
    const snap = snapshots && typeof snapshots === 'object' ? snapshots[p.agente] : null;
    let painel = p;

    if (snap && p.fontePct !== 'conta') {
      const capMs = Date.parse(snap.capturadoEm || '');
      const resetSessMs = snap.resetSessaoEm ? Date.parse(snap.resetSessaoEm) : NaN;
      const resetSemMs = snap.resetSemanaEm ? Date.parse(snap.resetSemanaEm) : NaN;
      const sessaoExpirada = Number.isFinite(resetSessMs) && agora >= resetSessMs;
      const semanaExpirada = Number.isFinite(resetSemMs) && agora >= resetSemMs;
      const usaSessao = snap.sessaoPct != null && !sessaoExpirada;
      const usaSemana = snap.semanaPct != null && !semanaExpirada;
      const deltaEq = Number.isFinite(capMs) ? Math.max(0, Math.round(Number(deltaDesde(p.agente, capMs)) || 0)) : 0;

      if (usaSessao || usaSemana) {
        painel = {
          ...p,
          fontePct: 'snapshot',
          sessao: usaSessao
            ? { ...p.sessao, pct: snap.sessaoPct, restantePct: restante(snap.sessaoPct), resetEm: snap.resetSessaoEm || null }
            : p.sessao,
          semana: usaSemana
            ? { ...p.semana, pct: snap.semanaPct, restantePct: restante(snap.semanaPct), resetEm: snap.resetSemanaEm || null }
            : p.semana,
          snapshot: {
            capturadoEm: snap.capturadoEm || null,
            deltaEquivalente: deltaEq,
            sessaoExpirada,
            semanaExpirada,
            nota: snap.nota || '',
          },
        };
      } else {
        painel = {
          ...p,
          snapshot: {
            capturadoEm: snap.capturadoEm || null,
            deltaEquivalente: deltaEq,
            sessaoExpirada,
            semanaExpirada,
            expirado: true,
            nota: snap.nota || '',
          },
        };
      }
    }

    const saudeSessao = classificarSaude(painel.sessao?.pct);
    const saudeSemana = classificarSaude(painel.semana?.pct);
    return {
      ...painel,
      sessao: { ...painel.sessao, saude: saudeSessao },
      semana: { ...painel.semana, saude: saudeSemana },
      saude: piorSaude(saudeSessao, saudeSemana),
    };
  });
}
