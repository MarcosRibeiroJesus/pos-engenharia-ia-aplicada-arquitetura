// Leitura de anexos com as proteções que a aula mostra faltarem num servidor MCP de
// sistema de arquivos: caminho confinado ao diretório do próprio usuário, só leitura,
// só texto, tamanho máximo e conteúdo tratado como dado não confiável.
import { detectarInjecao } from "./detector.js";
import { normalizar } from "./normalizacao.js";

export const MAX_BYTES_ANEXO = 20_000;
const NOME = /^[a-z0-9][a-z0-9._-]{0,80}\.txt$/;

export type ResultadoCaminho = { ok: true; chave: string } | { ok: false; motivo: string };

export function validarCaminhoAnexo(usuarioId: string, caminho: string): ResultadoCaminho {
  if (/%[0-9a-f]{2}/i.test(caminho)) return { ok: false, motivo: "caminho_codificado" };
  if (caminho.includes("\\") || caminho.startsWith("/")) return { ok: false, motivo: "caminho_absoluto" };
  const partes = caminho.split("/");
  if (partes.some((p) => p === ".." || p === "." || p === "")) return { ok: false, motivo: "travessia" };
  // Exatamente anexos/<usuario>/<arquivo>.txt: sem subdiretórios.
  if (partes.length !== 3 || partes[0] !== "anexos") return { ok: false, motivo: "fora_da_area" };
  if (partes[1] !== usuarioId) return { ok: false, motivo: "outro_usuario" };
  if (!NOME.test(partes[2]!)) return { ok: false, motivo: "nome_ou_tipo_invalido" };
  return { ok: true, chave: caminho };
}

export interface LeitorAnexos {
  ler(chave: string): Promise<{ corpo: string; tipo: string; bytes: number }>;
}

export type ResultadoAnexo =
  | { ok: true; caminho: string; conteudo: string; quarentena: boolean; sinais: string[] }
  | { ok: false; caminho: string; motivo: string };

export async function lerAnexoSeguro(leitor: LeitorAnexos, usuarioId: string, caminho: string): Promise<ResultadoAnexo> {
  const v = validarCaminhoAnexo(usuarioId, caminho);
  if (!v.ok) return { ok: false, caminho, motivo: v.motivo };
  let obj;
  try {
    obj = await leitor.ler(v.chave);
  } catch {
    return { ok: false, caminho, motivo: "nao_encontrado" };
  }
  if (!obj.tipo.startsWith("text/plain")) return { ok: false, caminho, motivo: "tipo_nao_textual" };
  if (obj.bytes > MAX_BYTES_ANEXO) return { ok: false, caminho, motivo: "grande_demais" };
  const { texto } = normalizar(obj.corpo);
  const d = detectarInjecao(texto);
  // Injeção indireta: o anexo com instrução não chega ao modelo.
  if (d.nivel === "alto") return { ok: true, caminho, conteudo: "", quarentena: true, sinais: d.sinais };
  return { ok: true, caminho, conteudo: texto, quarentena: false, sinais: d.sinais };
}
