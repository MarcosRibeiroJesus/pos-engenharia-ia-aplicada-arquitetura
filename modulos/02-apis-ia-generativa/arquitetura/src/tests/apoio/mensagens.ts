// Fábricas de respostas no formato da Messages API, para os testes.
import type Anthropic from "@anthropic-ai/sdk";

interface Opcoes {
  modelo?: string;
  stopReason?: Anthropic.Message["stop_reason"];
  entrada?: number;
  saida?: number;
}

function usage(entrada: number, saida: number): Anthropic.Usage {
  return { input_tokens: entrada, output_tokens: saida } as Anthropic.Usage;
}

export function mensagemTexto(texto: string, o: Opcoes = {}): Anthropic.Message {
  return {
    id: "msg_teste",
    type: "message",
    role: "assistant",
    model: o.modelo ?? "anthropic.claude-haiku-5-5",
    content: [{ type: "text", text: texto, citations: null }] as Anthropic.ContentBlock[],
    stop_reason: o.stopReason ?? "end_turn",
    stop_sequence: null,
    usage: usage(o.entrada ?? 100, o.saida ?? 20),
  } as Anthropic.Message;
}

export function mensagemTool(nome: string, input: unknown, o: Opcoes = {}): Anthropic.Message {
  return {
    ...mensagemTexto("", o),
    content: [{ type: "tool_use", id: "toolu_teste", name: nome, input }] as Anthropic.ContentBlock[],
    stop_reason: "tool_use",
  } as Anthropic.Message;
}
