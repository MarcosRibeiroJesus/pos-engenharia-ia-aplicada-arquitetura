// Verificação da saída do modelo: só tools da allowlist do nó e nenhum vazamento do canário
// (um marcador secreto no prompt do sistema; se aparecer na saída, houve exfiltração).
import type Anthropic from "@anthropic-ai/sdk";

export function verificarSaida(blocos: Anthropic.ContentBlock[] | Array<{ type: string; name?: string; input?: unknown; text?: string; id?: string }>, permitidas: string[], canario: string) {
  const problemas: string[] = [];
  for (const b of blocos as Array<{ type: string; name?: string; input?: unknown; text?: string }>) {
    if (b.type === "tool_use" && !permitidas.includes(b.name ?? "")) problemas.push(`tool_nao_permitida:${b.name}`);
    const serial = JSON.stringify(b.type === "tool_use" ? b.input : (b.text ?? ""));
    if (canario && serial.includes(canario)) problemas.push("vazamento_canario");
  }
  return { ok: problemas.length === 0, problemas };
}
