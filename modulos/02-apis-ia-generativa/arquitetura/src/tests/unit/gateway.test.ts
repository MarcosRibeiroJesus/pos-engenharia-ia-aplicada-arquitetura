// Camada 1 · gateway de LLM: roteamento, fallback, circuit breaker, cota e custo por chamada.
// Tarefas da prova: 2.2 (erro estruturado e retentável), 5.3 (propagação de erro), 1.4.
import { describe, expect, it } from "vitest";
import { GatewayLlm } from "../../lib/gateway/roteador.js";
import { ErroProvedor, type ProvedorLlm, type RequisicaoLlm } from "../../lib/gateway/tipos.js";
import { EstadoGatewayMemoria } from "../../lib/gateway/estado.js";
import { MetricasMemoria } from "../../lib/infra/metricas.js";
import { mensagemTexto } from "../apoio/mensagens.js";

const HAIKU = "anthropic.claude-haiku-5-5";
const SONNET = "anthropic.claude-sonnet-5-5";
const PRECOS = { [HAIKU]: { entrada: 0.1, saida: 0.5 }, [SONNET]: { entrada: 2, saida: 10 } };
const REQ: RequisicaoLlm = { max_tokens: 512, messages: [{ role: "user", content: "oi" }] };
const agora = () => new Date("2026-11-19T12:00:00Z");

function provedor(roteiro: Record<string, Array<"ok" | "refusal" | ErroProvedor>>): ProvedorLlm & { chamadas: string[] } {
  const chamadas: string[] = [];
  return {
    nome: "roteirizado",
    chamadas,
    async chamar(modelo) {
      chamadas.push(modelo);
      const passo = roteiro[modelo]?.shift() ?? "ok";
      if (passo instanceof ErroProvedor) throw passo;
      return mensagemTexto("resposta", { modelo, stopReason: passo === "refusal" ? "refusal" : "end_turn", entrada: 1000, saida: 200 });
    },
  };
}

function gateway(p: ProvedorLlm, extra: Partial<ConstructorParameters<typeof GatewayLlm>[0]> = {}) {
  const estado = new EstadoGatewayMemoria();
  const metricas = new MetricasMemoria();
  const gw = new GatewayLlm({ provedor: p, estado, metricas, cadeia: [HAIKU, SONNET], precos: PRECOS, cotaTokensDia: 10_000, relogio: agora, ...extra });
  return { gw, estado, metricas };
}

describe("gateway de LLM", () => {
  it("usa o primeiro modelo da cadeia e registra custo por chamada", async () => {
    const p = provedor({});
    const { gw, estado, metricas } = gateway(p);
    const r = await gw.chamar({ clienteId: "orquestrador", tarefa: "extrair_intencao", requisicao: REQ });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.modelo).toBe(HAIKU);
    // 1000 tokens de entrada a US$ 0,10/M + 200 de saída a US$ 0,50/M
    expect(r.custoUsd).toBeCloseTo(0.0002, 8);
    expect(estado.lancamentos).toHaveLength(1);
    expect(estado.lancamentos[0]).toMatchObject({ modelo: HAIKU, tarefa: "extrair_intencao", tokensEntrada: 1000, tokensSaida: 200 });
    expect(metricas.soma("CustoUSD")).toBeCloseTo(0.0002, 8);
    expect(metricas.soma("FallbackAcionado")).toBe(0);
  });

  it("cai para o modelo seguinte em erro transitório e conta o fallback", async () => {
    const p = provedor({ [HAIKU]: [new ErroProvedor("transitorio", true, "overloaded", 529)] });
    const { gw, metricas } = gateway(p);
    const r = await gw.chamar({ clienteId: "c", tarefa: "extrair_intencao", requisicao: REQ });
    expect(r.ok && r.modelo).toBe(SONNET);
    expect(r.tentativas.map((t) => t.resultado)).toEqual(["transitorio", "ok"]);
    expect(metricas.soma("FallbackAcionado")).toBe(1);
  });

  it("trata recusa do modelo como motivo de fallback, sem abrir o circuito", async () => {
    const p = provedor({ [HAIKU]: ["refusal"] });
    const { gw, estado } = gateway(p);
    const r = await gw.chamar({ clienteId: "c", tarefa: "extrair_intencao", requisicao: REQ });
    expect(r.ok && r.modelo).toBe(SONNET);
    expect((await estado.lerCircuito(HAIKU)).falhas).toBe(0);
  });

  it("não faz fallback em requisição inválida: o mesmo pedido falharia em qualquer modelo", async () => {
    const p = provedor({ [HAIKU]: [new ErroProvedor("requisicao_invalida", false, "schema inválido", 400)] });
    const { gw } = gateway(p);
    const r = await gw.chamar({ clienteId: "c", tarefa: "extrair_intencao", requisicao: REQ });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro).toMatchObject({ categoria: "requisicao_invalida", retentavel: false });
    expect(p.chamadas).toEqual([HAIKU]);
  });

  it("devolve erro estruturado e retentável quando todos os modelos falham", async () => {
    const e = () => new ErroProvedor("transitorio", true, "timeout");
    const p = provedor({ [HAIKU]: [e()], [SONNET]: [e()] });
    const { gw } = gateway(p);
    const r = await gw.chamar({ clienteId: "c", tarefa: "extrair_intencao", requisicao: REQ });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro.categoria).toBe("todos_modelos_falharam");
    expect(r.erro.retentavel).toBe(true);
    expect(r.erro.tentativas.map((t) => `${t.modelo}:${t.resultado}`)).toEqual([`${HAIKU}:transitorio`, `${SONNET}:transitorio`]);
  });

  it("abre o circuito depois de falhas seguidas e pula o modelo enquanto estiver aberto", async () => {
    const falhas = Array.from({ length: 3 }, () => new ErroProvedor("transitorio", true, "5xx", 503));
    const p = provedor({ [HAIKU]: falhas });
    const { gw, metricas } = gateway(p, { limiteFalhas: 3, aberturaMs: 60_000 });
    for (let i = 0; i < 3; i++) await gw.chamar({ clienteId: "c", tarefa: "extrair_intencao", requisicao: REQ });
    p.chamadas.length = 0;
    const r = await gw.chamar({ clienteId: "c", tarefa: "extrair_intencao", requisicao: REQ });
    expect(p.chamadas).toEqual([SONNET]);
    expect(r.tentativas[0]).toMatchObject({ modelo: HAIKU, resultado: "circuito_aberto" });
    expect(metricas.soma("CircuitoAberto")).toBeGreaterThanOrEqual(1);
  });

  it("fecha o circuito quando a janela passa e o modelo volta a responder", async () => {
    let t = new Date("2026-11-19T12:00:00Z").getTime();
    const falhas = Array.from({ length: 3 }, () => new ErroProvedor("transitorio", true, "5xx", 503));
    const p = provedor({ [HAIKU]: falhas });
    const { gw, estado } = gateway(p, { limiteFalhas: 3, aberturaMs: 60_000, relogio: () => new Date(t) });
    for (let i = 0; i < 3; i++) await gw.chamar({ clienteId: "c", tarefa: "extrair_intencao", requisicao: REQ });
    t += 61_000;
    const r = await gw.chamar({ clienteId: "c", tarefa: "extrair_intencao", requisicao: REQ });
    expect(r.ok && r.modelo).toBe(HAIKU);
    expect((await estado.lerCircuito(HAIKU)).falhas).toBe(0);
  });

  it("bloqueia o cliente que estourou a cota diária de tokens, sem chamar o modelo", async () => {
    const p = provedor({});
    const { gw } = gateway(p, { cotaTokensDia: 1500 });
    await gw.chamar({ clienteId: "c", tarefa: "extrair_intencao", requisicao: REQ }); // consome 1200
    await gw.chamar({ clienteId: "c", tarefa: "extrair_intencao", requisicao: REQ }); // chega a 2400
    p.chamadas.length = 0;
    const r = await gw.chamar({ clienteId: "c", tarefa: "extrair_intencao", requisicao: REQ });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro).toMatchObject({ categoria: "cota_excedida", retentavel: false });
    expect(p.chamadas).toEqual([]);
  });

  it("a cota é por cliente", async () => {
    const p = provedor({});
    const { gw } = gateway(p, { cotaTokensDia: 1000 });
    await gw.chamar({ clienteId: "a", tarefa: "extrair_intencao", requisicao: REQ });
    const r = await gw.chamar({ clienteId: "b", tarefa: "extrair_intencao", requisicao: REQ });
    expect(r.ok).toBe(true);
  });

  it("recusa max_tokens acima do teto do gateway (proteção de custo)", async () => {
    const { gw } = gateway(provedor({}));
    const r = await gw.chamar({ clienteId: "c", tarefa: "extrair_intencao", requisicao: { ...REQ, max_tokens: 100_000 } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro.categoria).toBe("requisicao_invalida");
  });

  it("recusa modelo fora da cadeia configurada (a escolha do modelo é do gateway)", async () => {
    const { gw } = gateway(provedor({}));
    const r = await gw.chamar({ clienteId: "c", tarefa: "extrair_intencao", requisicao: { ...REQ, model: "outro" } as RequisicaoLlm });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro.categoria).toBe("requisicao_invalida");
  });
});
