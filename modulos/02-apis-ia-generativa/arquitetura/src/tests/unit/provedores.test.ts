// Provedores do gateway. Nenhum teste chama o Claude real (ADR-0006):
// o gravado lê fixtures; o do Bedrock recebe um fetch falso com respostas no formato da API.
import { describe, expect, it } from "vitest";
import { ProvedorGravado, type Fixture } from "../../lib/gateway/provedor-gravado.js";
import { ProvedorBedrockMantle } from "../../lib/gateway/provedor-bedrock.js";
import { ErroProvedor, type RequisicaoLlm } from "../../lib/gateway/tipos.js";

const REQ: RequisicaoLlm = { max_tokens: 256, messages: [{ role: "user", content: "Quero CANCELAR a consulta de quinta" }] };

const fixtures: Fixture[] = [
  { id: "falha-haiku", tarefa: "extrair_intencao", quando: { contem: ["simular-falha"], modelo: "anthropic.claude-haiku-5-5" }, erro: { categoria: "transitorio", status: 529, mensagem: "overloaded" } },
  { id: "cancelar", tarefa: "extrair_intencao", quando: { contem: ["cancelar", "quinta"] }, resposta: { content: [{ type: "tool_use", id: "t1", name: "registrar_intencao", input: { intencao: "cancelar" } }], stop_reason: "tool_use", usage: { input_tokens: 900, output_tokens: 80 } } },
  { id: "padrao", tarefa: "extrair_intencao", quando: { contem: [] }, resposta: { content: [{ type: "text", text: "não entendi" }], stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 5 } } },
];

describe("provedor gravado", () => {
  it("escolhe a primeira fixture cujos trechos aparecem no pedido (sem diferenciar maiúsculas)", async () => {
    const r = await new ProvedorGravado(fixtures).chamar("anthropic.claude-haiku-5-5", REQ, "extrair_intencao");
    expect(r.content[0]).toMatchObject({ type: "tool_use", name: "registrar_intencao" });
    expect(r.model).toBe("anthropic.claude-haiku-5-5");
    expect(r.usage.input_tokens).toBe(900);
  });

  it("simula falha de um modelo específico para exercitar o fallback", async () => {
    const p = new ProvedorGravado(fixtures);
    const req: RequisicaoLlm = { max_tokens: 10, messages: [{ role: "user", content: "simular-falha cancelar quinta" }] };
    await expect(p.chamar("anthropic.claude-haiku-5-5", req, "extrair_intencao")).rejects.toMatchObject({ categoria: "transitorio", status: 529 });
    const r = await p.chamar("anthropic.claude-sonnet-5-5", req, "extrair_intencao");
    expect(r.stop_reason).toBe("tool_use");
  });

  it("usa a fixture padrão quando nada casa", async () => {
    const req: RequisicaoLlm = { max_tokens: 10, messages: [{ role: "user", content: "bom dia" }] };
    const r = await new ProvedorGravado(fixtures).chamar("m", req, "extrair_intencao");
    expect(r.content[0]).toMatchObject({ type: "text" });
  });

  it("falha alto se não houver fixture para a tarefa (fixture faltando é bug do teste)", async () => {
    await expect(new ProvedorGravado(fixtures).chamar("m", REQ, "resumir")).rejects.toBeInstanceOf(ErroProvedor);
  });
});

function fetchFalso(status: number, corpo: unknown, capturar?: (url: string, body: unknown) => void): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    capturar?.(String(url), init?.body ? JSON.parse(String(init.body)) : undefined);
    return new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json", "request-id": "req_teste" } });
  }) as typeof fetch;
}

const MENSAGEM_OK = {
  id: "msg_1",
  type: "message",
  role: "assistant",
  model: "anthropic.claude-haiku-5-5",
  content: [{ type: "tool_use", id: "toolu_1", name: "registrar_intencao", input: { intencao: "consultar" } }],
  stop_reason: "tool_use",
  stop_sequence: null,
  usage: { input_tokens: 700, output_tokens: 60 },
};

describe("provedor Bedrock (Claude no Amazon Bedrock, endpoint bedrock-mantle)", () => {
  it("envia o pedido com o modelo da cadeia e devolve a mensagem", async () => {
    let enviado: { url: string; body: any } | undefined;
    const p = new ProvedorBedrockMantle({ regiao: "us-east-1", fetch: fetchFalso(200, MENSAGEM_OK, (url, body) => (enviado = { url, body })), semAutenticacao: true });
    const r = await p.chamar("anthropic.claude-haiku-5-5", { ...REQ, tools: [{ name: "registrar_intencao", input_schema: { type: "object" } }], tool_choice: { type: "auto" } }, "extrair_intencao");
    expect(r.content[0]).toMatchObject({ type: "tool_use" });
    expect(enviado?.url).toContain("bedrock-mantle.us-east-1.api.aws/anthropic/v1/messages");
    expect(enviado?.body.model).toBe("anthropic.claude-haiku-5-5");
    expect(enviado?.body.tool_choice).toEqual({ type: "auto" });
  });

  it.each([
    [529, "transitorio", true],
    [500, "transitorio", true],
    [429, "limite_de_taxa", true],
    [400, "requisicao_invalida", false],
    [403, "acesso_negado", false],
  ])("classifica HTTP %i como %s", async (status, categoria, retentavel) => {
    const p = new ProvedorBedrockMantle({ regiao: "us-east-1", fetch: fetchFalso(status, { type: "error", error: { type: "x", message: "m" } }), semAutenticacao: true });
    const erro = await p.chamar("anthropic.claude-haiku-5-5", REQ, "extrair_intencao").catch((e) => e);
    expect(erro).toBeInstanceOf(ErroProvedor);
    expect(erro).toMatchObject({ categoria, retentavel, status });
  });

  it("classifica falha de rede como transitória", async () => {
    const quebrado = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    const p = new ProvedorBedrockMantle({ regiao: "us-east-1", fetch: quebrado, semAutenticacao: true });
    await expect(p.chamar("anthropic.claude-haiku-5-5", REQ, "extrair_intencao")).rejects.toMatchObject({ categoria: "transitorio", retentavel: true });
  });
});
