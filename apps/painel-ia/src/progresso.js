// Leitura de harness/progresso.md para incluir no painel todas as tarefas concluídas
// com o Code Agent e o modelo usado em cada entrega.
import { readFile } from 'node:fs/promises';
import { tipoDaLinha } from './tipos.js';

function normalizarAgente(sessaoCampo = '') {
  const s = sessaoCampo.toLowerCase();
  if (s.includes('antigravity') || s.includes('agy') || s.includes('gemini')) return 'antigravity';
  if (s.includes('copilot') || s.includes('openai') || s.includes('gpt')) return 'copilot';
  if (s.includes('claude') || s.includes('executar-tarefas') || s.includes('orquestra')) return 'claude-code';
  return 'outro';
}

function extrairModelo(sessaoCampo = '') {
  const m = sessaoCampo.match(/\(([^)]+)\)/);
  if (!m) return '—';
  // Pega o primeiro item antes da vírgula (ex.: "Gemini 4 Argon, orquestração" -> "Gemini 4 Argon")
  return m[1].split(',')[0].trim() || '—';
}

/** Faz o parse do conteúdo de harness/progresso.md em tarefas concluídas. */
export function parseProgresso(texto = '', mapa = new Map()) {
  const saida = [];
  for (const linha of texto.split(/\r?\n/)) {
    if (!linha.startsWith('- ')) continue;
    const partes = linha.slice(2).split(' · ').map((p) => p.trim());
    if (partes.length < 4) continue;
    const [data, projeto, sessaoCampo, feito] = partes;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || !feito) continue;
    const agente = normalizarAgente(sessaoCampo);
    const modelo = extrairModelo(sessaoCampo);
    const titulo = feito.length > 140 ? `${feito.slice(0, 137)}…` : feito;
    saida.push({
      data,
      projeto,
      agente,
      modelo,
      titulo,
      status: 'completed',
      quando: Date.parse(`${data}T12:00:00Z`) || 0,
      fonte: 'progresso',
      tipo: tipoDaLinha(linha, mapa),
    });
  }
  return saida;
}

export async function lerProgresso(caminho, mapa = new Map()) {
  if (!caminho) return [];
  try {
    return parseProgresso(await readFile(caminho, 'utf8'), mapa);
  } catch {
    return [];
  }
}
