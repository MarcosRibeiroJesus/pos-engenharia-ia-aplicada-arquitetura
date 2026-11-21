// Leitura do registro físico (docs/uso/uso-tokens.csv), para medições que não vêm de transcript.
import { readFile } from 'node:fs/promises';

const NUMEROS = new Set(['requisicoes', 'input', 'cache_write', 'cache_read', 'output']);

function campos(linha) {
  const out = [];
  let atual = '';
  let aspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (aspas) {
      if (c === '"' && linha[i + 1] === '"') { atual += '"'; i++; }
      else if (c === '"') aspas = false;
      else atual += c;
    } else if (c === '"') aspas = true;
    else if (c === ',') { out.push(atual); atual = ''; }
    else atual += c;
  }
  out.push(atual);
  return out;
}

export function lerCsv(texto) {
  const linhas = texto.split(/\r?\n/).filter((l) => l.trim());
  if (!linhas.length) return [];
  const cab = campos(linhas[0]);
  return linhas.slice(1).map((l) => {
    const v = campos(l);
    return Object.fromEntries(cab.map((c, i) => [c, NUMEROS.has(c) ? Number(v[i] || 0) : (v[i] ?? '')]));
  });
}

export async function lerRegistro(caminho) {
  if (!caminho) return [];
  try { return lerCsv(await readFile(caminho, 'utf8')); } catch { return []; }
}
