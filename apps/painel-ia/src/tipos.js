// Tipo de tarefa (taxonomia do harness). Fonte: harness/especialistas.json, campo `tarefas` de cada
// especialista. Uma linha do progresso.md leva o tipo de duas formas: explícita, `tipo: <x>` no campo
// do agente (daqui pra frente), ou pelo especialista citado na linha (histórico). Sem pista, não chuta.
import { readFileSync } from 'node:fs';

export const NAO_ATRIBUIDO = 'não atribuído';

/** Mapa especialista -> tipo (o primeiro da lista `tarefas`). */
export function mapaDeEspecialistas(catalogo = {}) {
  const mapa = new Map();
  for (const [nome, esp] of Object.entries(catalogo.especialistas || {})) {
    const tipo = Array.isArray(esp?.tarefas) ? esp.tarefas[0] : null;
    if (tipo) mapa.set(nome, tipo);
  }
  return mapa;
}

/** Lê o catálogo do harness. Caminho vazio ou arquivo ilegível vira mapa vazio (tipo não atribuído). */
export function carregarMapaEspecialistas(caminho, ler = (p) => readFileSync(p, 'utf8')) {
  if (!caminho) return new Map();
  try {
    return mapaDeEspecialistas(JSON.parse(ler(caminho)));
  } catch {
    return new Map();
  }
}

/** Tipo de uma linha do progresso: `tipo: x` explícito primeiro, depois o especialista mais longo citado. */
export function tipoDaLinha(linha = '', mapa = new Map()) {
  const explicito = linha.match(/\btipo:\s*([a-z][a-z-]*)/i);
  if (explicito) return explicito[1].toLowerCase();
  const nomes = [...mapa.keys()].sort((a, b) => b.length - a.length);
  for (const nome of nomes) {
    if (linha.includes(nome)) return mapa.get(nome);
  }
  return NAO_ATRIBUIDO;
}
