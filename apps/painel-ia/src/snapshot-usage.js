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

/** Converte expressões como "Refreshes in 4d 14h 57m" ou "1h 6m" em timestamp ISO a partir de baseMs. */
export function parsearDuracaoReset(texto, baseMs = Date.now()) {
  if (!texto) return null;
  const s = String(texto);
  const d = Number(s.match(/(\d+)\s*d\b/i)?.[1] || 0);
  const h = Number(s.match(/(\d+)\s*h\b/i)?.[1] || 0);
  const m = Number(s.match(/(\d+)\s*m\b/i)?.[1] || 0);
  const totalMs = ((d * 24 + h) * 60 + m) * 60_000;
  if (totalMs <= 0) return null;
  return new Date(baseMs + totalMs).toISOString();
}

/**
 * Faz parse do texto colado do comando `/usage` (ex.: Antigravity CLI).
 * Ignora linhas de conta (`Account:`) para não gravar e-mail/PII, extrai os grupos de modelos,
 * converte `Remaining` em `% usado` e `Refreshes in ...` em timestamp ISO.
 */
export function parsearTextoUsage(texto, { agora = () => Date.now() } = {}) {
  const baseMs = agora();
  const linhas = String(texto || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !/^Account\s*:/i.test(l));

  const grupos = [];
  let atual = null;
  let secao = null; // 'semana' | 'sessao' | null

  const fecharAtual = () => {
    if (!atual) return;
    if (atual.sessao.pct != null || atual.semana.pct != null || atual.sessao.desabilitado) {
      grupos.push(atual);
    }
    atual = null;
    secao = null;
  };

  for (const linha of linhas) {
    if (/^[A-Z0-9][A-Z0-9 &/+_-]{2,}\s+MODELS$/i.test(linha) && linha === linha.toUpperCase()) {
      fecharAtual();
      atual = {
        nome: linha,
        modelos: '',
        sessao: { pct: null, restantePct: null, resetEm: null, desabilitado: false },
        semana: { pct: null, restantePct: null, resetEm: null },
      };
      continue;
    }
    if (!atual) continue;

    if (/^Models within this group\s*:/i.test(linha)) {
      atual.modelos = linha.replace(/^Models within this group\s*:\s*/i, '').slice(0, 180);
      continue;
    }
    if (/^Weekly Limit Remaining/i.test(linha)) { secao = 'semana'; continue; }
    if (/^Five Hour Limit Remaining/i.test(linha)) { secao = 'sessao'; continue; }
    if (/^Within each group/i.test(linha)) { secao = null; continue; }

    if (secao === 'sessao' && /^Disabled\s*:/i.test(linha)) {
      atual.sessao.desabilitado = true;
      atual.sessao.pct = 100;
      atual.sessao.restantePct = 0;
      const resetDesab = parsearDuracaoReset(linha, baseMs);
      if (resetDesab && !atual.semana.resetEm) atual.semana.resetEm = resetDesab;
      continue;
    }

    if (secao) {
      const mPct = linha.match(/(\d+(?:[.,]\d+)?)\s*%/);
      if (mPct && atual[secao].pct == null) {
        const rem = pctValido(mPct[1].replace(',', '.'));
        if (rem != null) {
          atual[secao].restantePct = rem;
          atual[secao].pct = restante(rem);
        }
        continue;
      }
      if (/Refreshes in/i.test(linha) && !atual[secao].resetEm) {
        atual[secao].resetEm = parsearDuracaoReset(linha, baseMs);
      }
    }
  }
  fecharAtual();

  if (!grupos.length) {
    throw new Error('nenhum grupo de modelos encontrado no texto colado do /usage');
  }

  // Grupo principal para o resumo do card: primeiro grupo ativo (não desabilitado), ou o primeiro da lista.
  const principal = grupos.find((g) => !g.sessao.desabilitado) || grupos[0];
  return {
    sessaoPct: principal.sessao.pct,
    semanaPct: principal.semana.pct,
    resetSessaoEm: principal.sessao.resetEm,
    resetSemanaEm: principal.semana.resetEm,
    grupos,
    nota: `${grupos.length} grupo(s) do /usage`,
  };
}

/**
 * Mescla overrides explícitos da CLI (`--sessao-pct`, `--semana-pct`, `--reset-sessao`, `--reset-semana`)
 * sobre o resultado de `parsearTextoUsage`, mantendo os campos dos grupos consistentes com o resumo.
 */
export function mesclarOverridesSnapshot(parseado, overrides = {}) {
  const sessaoOverride = overrides.sessaoPct !== undefined ? pctValido(overrides.sessaoPct) : null;
  const semanaOverride = overrides.semanaPct !== undefined ? pctValido(overrides.semanaPct) : null;
  const temResetSessao = overrides.resetSessaoEm !== undefined;
  const temResetSemana = overrides.resetSemanaEm !== undefined;
  const resetSessaoOverride = temResetSessao ? ISO(overrides.resetSessaoEm) : undefined;
  const resetSemanaOverride = temResetSemana ? ISO(overrides.resetSemanaEm) : undefined;

  const grupos = Array.isArray(parseado.grupos)
    ? parseado.grupos.map((g) => ({
      ...g,
      sessao: {
        ...g.sessao,
        ...(sessaoOverride != null ? { pct: sessaoOverride, restantePct: restante(sessaoOverride), desabilitado: false } : {}),
        ...(temResetSessao ? { resetEm: resetSessaoOverride } : {}),
      },
      semana: {
        ...g.semana,
        ...(semanaOverride != null ? { pct: semanaOverride, restantePct: restante(semanaOverride) } : {}),
        ...(temResetSemana ? { resetEm: resetSemanaOverride } : {}),
      },
    }))
    : [];

  return {
    ...parseado,
    ...overrides,
    ...(sessaoOverride != null ? { sessaoPct: sessaoOverride } : {}),
    ...(semanaOverride != null ? { semanaPct: semanaOverride } : {}),
    ...(temResetSessao ? { resetSessaoEm: resetSessaoOverride } : {}),
    ...(temResetSemana ? { resetSemanaEm: resetSemanaOverride } : {}),
    grupos,
  };
}

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
  const grupos = Array.isArray(entrada.grupos) ? entrada.grupos : null;
  if (sessaoPct == null && semanaPct == null && (!grupos || !grupos.length)) {
    throw new Error('informe --colar ou ao menos --sessao-pct / --semana-pct (0 a 100)');
  }
  let atual = {};
  try {
    const j = JSON.parse(readFileSync(caminho, 'utf8'));
    if (j && typeof j === 'object' && !Array.isArray(j)) atual = j;
  } catch { /* arquivo novo */ }

  const anterior = atual[agente] || {};
  const atualizacaoManualSemGrupos = grupos === null
    && (sessaoPct != null || semanaPct != null || entrada.resetSessaoEm !== undefined || entrada.resetSemanaEm !== undefined);
  const gruposFinal = grupos !== null
    ? grupos
    : (atualizacaoManualSemGrupos ? [] : (anterior.grupos ?? []));
  const registro = {
    capturadoEm: new Date(agora()).toISOString(),
    sessaoPct: sessaoPct ?? anterior.sessaoPct ?? null,
    semanaPct: semanaPct ?? anterior.semanaPct ?? null,
    resetSessaoEm: entrada.resetSessaoEm !== undefined ? ISO(entrada.resetSessaoEm) : (anterior.resetSessaoEm ?? null),
    resetSemanaEm: entrada.resetSemanaEm !== undefined ? ISO(entrada.resetSemanaEm) : (anterior.resetSemanaEm ?? null),
    grupos: gruposFinal,
    nota: entrada.nota ? String(entrada.nota).slice(0, 200) : (anterior.nota || ''),
  };
  atual[agente] = registro;
  mkdirSync(dirname(caminho), { recursive: true });
  writeFileSync(caminho, JSON.stringify(atual, null, 2));
  return registro;
}

function enriquecerGrupos(grupos = [], agora) {
  return grupos.map((g) => {
    const resetSessMs = g.sessao?.resetEm ? Date.parse(g.sessao.resetEm) : NaN;
    const resetSemMs = g.semana?.resetEm ? Date.parse(g.semana.resetEm) : NaN;
    const semanaExpirada = Number.isFinite(resetSemMs) && agora >= resetSemMs;
    const desabSemResetSessao = Boolean(g.sessao?.desabilitado) && !Number.isFinite(resetSessMs);
    const sessaoExpirada = (Number.isFinite(resetSessMs) && agora >= resetSessMs)
      || (desabSemResetSessao && semanaExpirada);
    const saudeSessao = classificarSaude(sessaoExpirada ? 0 : g.sessao?.pct);
    const saudeSemana = classificarSaude(semanaExpirada ? 0 : g.semana?.pct);
    return {
      nome: g.nome,
      modelos: g.modelos || '',
      saude: piorSaude(saudeSessao, saudeSemana),
      sessao: { ...g.sessao, expirada: sessaoExpirada, saude: saudeSessao },
      semana: { ...g.semana, expirada: semanaExpirada, saude: saudeSemana },
    };
  });
}

function grupoTemJanelaValida(g) {
  return (g.sessao?.pct != null && !g.sessao.expirada)
    || (g.semana?.pct != null && !g.semana.expirada);
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
      const grupos = Array.isArray(snap.grupos) ? enriquecerGrupos(snap.grupos, agora) : [];
      const gruposValidos = grupos.filter(grupoTemJanelaValida);
      const snapshotAtivo = grupos.length > 0 ? gruposValidos.length > 0 : (usaSessao || usaSemana);

      if (snapshotAtivo) {
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
            grupos: gruposValidos,
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
            grupos: [],
            nota: snap.nota || '',
          },
        };
      }
    }

    const saudeSessao = classificarSaude(painel.sessao?.pct);
    const saudeSemana = classificarSaude(painel.semana?.pct);
    let saudeGeral = piorSaude(saudeSessao, saudeSemana);
    for (const g of (painel.snapshot?.grupos || [])) {
      saudeGeral = piorSaude(saudeGeral, g.saude);
    }
    return {
      ...painel,
      sessao: { ...painel.sessao, saude: saudeSessao },
      semana: { ...painel.semana, saude: saudeSemana },
      saude: saudeGeral,
    };
  });
}
