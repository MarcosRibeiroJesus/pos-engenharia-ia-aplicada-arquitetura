// Intenção em JSON: tool com JSON Schema estrito, few-shot, validação e retentativa com o erro
// (tarefas 4.2, 4.3, 4.4) e evidência por campo conferida na fonte (5.6).
import { describe, expect, it } from "vitest";
import { TOOL_INTENCAO, validarIntencao } from "../../lib/intencao/esquema.js";
import { extrairIntencao, type ContextoExtracao } from "../../lib/intencao/extrator.js";
import { montarSistema } from "../../lib/intencao/prompt.js";
import type { ClienteGateway } from "../../lib/intencao/extrator.js";
import type { PedidoGateway, RespostaGateway } from "../../lib/gateway/tipos.js";
import { mensagemTexto, mensagemTool } from "../apoio/mensagens.js";
import type { Intencao } from "../../lib/dominio/tipos.js";

const BASE: Intencao = {
  intencao: "cancelar",
  especialidade: "cardiologia",
  data: "2026-11-26",
  horario: null,
  periodo: null,
  consulta_id: null,
  preferencias: [],
  confianca: 0.9,
  ambiguidades: [],
  evidencias: [
    { campo: "especialidade", origem: "mensagem", trecho: "cardiologista" },
    { campo: "data", origem: "mensagem", trecho: "dia 26" },
  ],
};

const CTX: ContextoExtracao = {
  hoje: "2026-11-19",
  mensagem: "Preciso cancelar o cardiologista do dia 26",
  anexos: [],
  memoria: { fatos: [], resumo: "", preferencias: [], turnos: [], candidatos: [] },
  idsConhecidos: ["C-AAAA1111"],
  canario: "CANARIO-teste",
  nonce: "n1",
};

function gatewayRoteirizado(respostas: RespostaGateway[]): ClienteGateway & { pedidos: PedidoGateway[] } {
  const pedidos: PedidoGateway[] = [];
  return {
    pedidos,
    async chamar(p) {
      pedidos.push(structuredClone(p));
      const r = respostas.shift();
      if (!r) throw new Error("roteiro acabou");
      return r;
    },
  };
}
const ok = (m: ReturnType<typeof mensagemTool>): RespostaGateway => ({ ok: true, modelo: "anthropic.claude-haiku-5-5", resposta: m, custoUsd: 0.0001, tentativas: [] });

describe("schema da tool", () => {
  it("é estrito: sem propriedades extras e todos os campos obrigatórios", () => {
    expect(TOOL_INTENCAO.strict).toBe(true);
    const s = TOOL_INTENCAO.input_schema as unknown as { additionalProperties: boolean; required: string[]; properties: Record<string, unknown> };
    expect(s.additionalProperties).toBe(false);
    expect(new Set(s.required)).toEqual(new Set(Object.keys(s.properties)));
  });

  it("rejeita data inválida, enum fora da lista e confiança fora de [0,1]", () => {
    expect(validarIntencao({ ...BASE, data: "26/11" }, CTX).ok).toBe(false);
    expect(validarIntencao({ ...BASE, especialidade: "neurocirurgia" as never }, CTX).ok).toBe(false);
    expect(validarIntencao({ ...BASE, confianca: 1.5 }, CTX).ok).toBe(false);
    expect(validarIntencao(BASE, CTX).ok).toBe(true);
  });
});

describe("validação semântica", () => {
  it("rejeita data no passado", () => {
    const r = validarIntencao({ ...BASE, data: "2026-11-01", evidencias: [] }, CTX);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erros.join()).toContain("data_no_passado");
  });

  it("rejeita consulta_id que o usuário não tem (id inventado ou de outra pessoa)", () => {
    const r = validarIntencao({ ...BASE, consulta_id: "C-ZZZZ9999" }, CTX);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erros.join()).toContain("consulta_id_desconhecido");
  });

  it("exige evidência literal na fonte para cada campo preenchido (proveniência)", () => {
    const r = validarIntencao({ ...BASE, evidencias: [{ campo: "especialidade", origem: "mensagem", trecho: "dermatologia" }, BASE.evidencias[1]!] }, CTX);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erros.join()).toContain("evidencia_nao_encontrada:especialidade");
  });
});

describe("extração com retentativa", () => {
  it("valida de primeira e devolve a intenção", async () => {
    const gw = gatewayRoteirizado([ok(mensagemTool("registrar_intencao", BASE))]);
    const r = await extrairIntencao(gw, CTX);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.intencao.intencao).toBe("cancelar");
    expect(gw.pedidos).toHaveLength(1);
    const req = gw.pedidos[0]!.requisicao;
    expect(req.tool_choice).toEqual({ type: "auto" });
    expect(req.tools?.map((t) => ("name" in t ? t.name : ""))).toEqual(["registrar_intencao"]);
  });

  it("devolve o erro de validação ao modelo como tool_result e aceita a correção", async () => {
    const errada = mensagemTool("registrar_intencao", { ...BASE, data: "26/11" });
    const gw = gatewayRoteirizado([ok(errada), ok(mensagemTool("registrar_intencao", BASE))]);
    const r = await extrairIntencao(gw, CTX);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.tentativas).toBe(2);
    const segunda = gw.pedidos[1]!.requisicao.messages;
    const ultimo = segunda.at(-1)!;
    expect(ultimo.role).toBe("user");
    expect(JSON.stringify(ultimo.content)).toContain("ERRO_VALIDACAO");
    expect(JSON.stringify(ultimo.content)).toContain('"is_error":true');
  });

  it("pede a tool de novo quando o modelo responde em texto", async () => {
    const gw = gatewayRoteirizado([ok(mensagemTexto("Claro! Vou cancelar.")), ok(mensagemTool("registrar_intencao", BASE))]);
    const r = await extrairIntencao(gw, CTX);
    expect(r.ok).toBe(true);
  });

  it("desiste depois do limite de tentativas, com motivo estruturado", async () => {
    const errada = () => ok(mensagemTool("registrar_intencao", { ...BASE, data: "x" }));
    const gw = gatewayRoteirizado([errada(), errada(), errada()]);
    const r = await extrairIntencao(gw, CTX);
    expect(r).toMatchObject({ ok: false, motivo: "saida_invalida" });
    expect(gw.pedidos).toHaveLength(3);
  });

  it("propaga o erro do gateway sem tentar de novo por conta própria (5.3)", async () => {
    const gw = gatewayRoteirizado([{ ok: false, erro: { categoria: "todos_modelos_falharam", retentavel: true, mensagem: "x", tentativas: [] }, tentativas: [] }]);
    const r = await extrairIntencao(gw, CTX);
    expect(r).toMatchObject({ ok: false, motivo: "llm_indisponivel", retentavel: true });
  });

  it("trata tool não permitida ou vazamento do canário como saída insegura, sem retentar", async () => {
    const gw = gatewayRoteirizado([ok(mensagemTool("registrar_intencao", { ...BASE, ambiguidades: ["CANARIO-teste"] }))]);
    const r = await extrairIntencao(gw, CTX);
    expect(r).toMatchObject({ ok: false, motivo: "saida_insegura" });
  });
});

describe("prompt do sistema", () => {
  it("traz critérios explícitos, exemplos e o canário; não traz dados do usuário", () => {
    const s = montarSistema("CANARIO-teste", "2026-11-19");
    expect(s).toContain("CANARIO-teste");
    expect(s).toContain("<exemplos>");
    expect(s.match(/<exemplo>/g)?.length).toBeGreaterThanOrEqual(4);
    expect(s).toContain("dados_nao_confiaveis");
    expect(s).not.toContain(CTX.mensagem);
  });
});
