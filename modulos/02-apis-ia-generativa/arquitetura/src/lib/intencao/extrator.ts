// Extração da intenção: chama o gateway com uma única tool, valida e, se falhar, devolve o erro
// ao modelo como tool_result com is_error e pede a correção (tarefa 4.4). Erro do gateway não é
// retentado aqui: ele já fez fallback; o grafo decide o que fazer com o erro (5.3).
import type Anthropic from "@anthropic-ai/sdk";
import type { PedidoGateway, RespostaGateway, CategoriaErro } from "../gateway/tipos.js";
import type { Intencao } from "../dominio/tipos.js";
import { envelopar } from "../defesa/envelope.js";
import { verificarSaida } from "../defesa/saida.js";
import { TOOL_INTENCAO, validarIntencao } from "./esquema.js";
import { montarSistema } from "./prompt.js";

export interface ClienteGateway {
  chamar(p: PedidoGateway): Promise<RespostaGateway>;
}

export interface MemoriaParaPrompt {
  fatos: unknown[];
  resumo: string;
  preferencias: unknown[];
  turnos: Array<{ papel: string; texto: string }>;
  candidatos: unknown[];
}

export interface ContextoExtracao {
  hoje: string;
  mensagem: string;
  anexos: Array<{ caminho: string; conteudo: string }>;
  memoria: MemoriaParaPrompt;
  idsConhecidos: string[];
  canario: string;
  nonce: string;
  traceId?: string;
}

export type ResultadoExtracao =
  | { ok: true; intencao: Intencao; tentativas: number; modelo: string; custoUsd: number }
  | { ok: false; motivo: "llm_indisponivel" | "saida_invalida" | "saida_insegura"; retentavel: boolean; detalhe: string; categoria?: CategoriaErro; tentativas: number };

export const MAX_TENTATIVAS = 3;

export function montarMensagemUsuario(c: ContextoExtracao): Anthropic.TextBlockParam[] {
  const blocos: Anthropic.TextBlockParam[] = [
    { type: "text", text: `Memória da conversa:\n${envelopar("memoria", JSON.stringify(c.memoria), c.nonce)}` },
    ...c.anexos.map((a) => ({ type: "text" as const, text: `Anexo:\n${envelopar("anexo", a.conteudo, c.nonce, { caminho: a.caminho })}` })),
    { type: "text", text: `Mensagem do paciente:\n${envelopar("mensagem", c.mensagem, c.nonce)}` },
    { type: "text", text: "Chame registrar_intencao com a intenção desta mensagem." },
  ];
  return blocos;
}

export async function extrairIntencao(gateway: ClienteGateway, c: ContextoExtracao, clienteId = "orquestrador"): Promise<ResultadoExtracao> {
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: montarMensagemUsuario(c) }];
  let ultimoErro = "";
  let custoUsd = 0;

  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
    const r = await gateway.chamar({
      clienteId,
      tarefa: "extrair_intencao",
      ...(c.traceId ? { traceId: c.traceId } : {}),
      requisicao: {
        system: montarSistema(c.canario, c.hoje),
        max_tokens: 1024,
        tools: [TOOL_INTENCAO],
        // auto + strict + instrução: tool_choice forçado não é aceito em todos os modelos da cadeia.
        tool_choice: { type: "auto" },
        messages,
      },
    });
    if (!r.ok) {
      return { ok: false, motivo: "llm_indisponivel", retentavel: r.erro.retentavel, detalhe: r.erro.mensagem, categoria: r.erro.categoria, tentativas: tentativa };
    }
    custoUsd += r.custoUsd;

    const seguranca = verificarSaida(r.resposta.content, [TOOL_INTENCAO.name], c.canario);
    if (!seguranca.ok) {
      return { ok: false, motivo: "saida_insegura", retentavel: false, detalhe: seguranca.problemas.join(","), tentativas: tentativa };
    }

    const uso = r.resposta.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === TOOL_INTENCAO.name);
    messages.push({ role: "assistant", content: r.resposta.content as Anthropic.ContentBlockParam[] });

    if (!uso) {
      ultimoErro = "sem_tool";
      messages.push({ role: "user", content: [{ type: "text", text: "ERRO_VALIDACAO: responda chamando a tool registrar_intencao." }] });
      continue;
    }

    const v = validarIntencao(uso.input, c);
    if (v.ok) return { ok: true, intencao: v.intencao, tentativas: tentativa, modelo: r.modelo, custoUsd };

    ultimoErro = v.erros.join("; ");
    messages.push({
      role: "user",
      content: [{ type: "tool_result", tool_use_id: uso.id, is_error: true, content: `ERRO_VALIDACAO: ${ultimoErro}. Corrija e chame registrar_intencao de novo.` }],
    });
  }

  return { ok: false, motivo: "saida_invalida", retentavel: false, detalhe: ultimoErro, tentativas: MAX_TENTATIVAS };
}
