// Camada 4: separação de instrução e dado (spotlighting). Todo conteúdo que não é do
// operador entra no prompt dentro de um envelope com nonce aleatório por requisição;
// o conteúdo perde os sinais < e >, então não consegue fechar o envelope nem abrir tags.
export type Origem = "mensagem" | "anexo" | "memoria";

export function neutralizar(conteudo: string): string {
  return conteudo.replace(/</g, "‹").replace(/>/g, "›");
}

export function envelopar(origem: Origem, conteudo: string, nonce: string, atributos: Record<string, string> = {}): string {
  const attrs = Object.entries(atributos)
    .map(([k, v]) => ` ${k}="${neutralizar(v).replace(/"/g, "'")}"`)
    .join("");
  return `<dados_nao_confiaveis origem="${origem}" id="${nonce}"${attrs}>${neutralizar(conteudo)}</dados_nao_confiaveis_${nonce}>`;
}
