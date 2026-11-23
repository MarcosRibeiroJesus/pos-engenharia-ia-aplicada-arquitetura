// Camada 2 da defesa: normaliza a entrada antes de qualquer outra coisa ver o texto.
// O texto normalizado é o que segue para o modelo; a "forma de detecção" é mais agressiva
// e serve só para o detector (não é mostrada nem enviada a ninguém).

const INVISIVEIS = /[​-‏⁠-⁤﻿­]/g;
const BIDI = /[‪-‮⁦-⁩]/g;
// Controles C0/C1, exceto \n e \t.
const CONTROLE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;

export function normalizar(entrada: string): { texto: string; alteracoes: string[] } {
  const alteracoes: string[] = [];
  let t = entrada.normalize("NFKC");
  if (t !== entrada) alteracoes.push("nfkc");
  const passos: Array<[RegExp, string]> = [
    [INVISIVEIS, "invisiveis"],
    [BIDI, "bidi"],
    [CONTROLE, "controle"],
  ];
  for (const [re, nome] of passos) {
    const s = t.replace(re, "");
    if (s !== t) alteracoes.push(nome);
    t = s;
  }
  t = t.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return { texto: t, alteracoes };
}

// Homóglifos mais usados para esconder palavras (cirílico e grego parecidos com latim).
const HOMOGLIFOS: Record<string, string> = {
  а: "a", е: "e", о: "o", р: "p", с: "c", х: "x", у: "y", і: "i", ј: "j", ѕ: "s", һ: "h", ԁ: "d", ɡ: "g",
  α: "a", ο: "o", ε: "e", ι: "i", κ: "k", ν: "v", τ: "t", υ: "u", ρ: "p",
};
const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", $: "s" };

export function formaDeDeteccao(entrada: string): string {
  const base = normalizar(entrada).texto.toLowerCase();
  const semHomoglifo = [...base].map((c) => HOMOGLIFOS[c] ?? c).join("");
  const semAcento = semHomoglifo.normalize("NFD").replace(/\p{M}/gu, "");
  // Leetspeak só dentro de palavras com letras (não mexe em datas e horários como 26/11 9h).
  return semAcento.replace(/\b(?=\S*[a-z])[\w@$]+\b/g, (p) => [...p].map((c) => LEET[c] ?? c).join(""));
}
