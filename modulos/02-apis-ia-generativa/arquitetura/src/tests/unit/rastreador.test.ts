// Observabilidade de LLM: um trace por turno com a trilha do grafo e uma geração por chamada
// ao modelo (tokens, custo, modelo, fallback), enviados ao Langfuse local quando configurado.
import { describe, expect, it } from "vitest";
import { RastreadorLangfuse, RastreadorMemoria, RastreadorNulo, rastreadorDoAmbiente } from "../../lib/observabilidade/rastreador.js";
import { montarSistema } from "../apoio/montagem.js";

describe("rastreador Langfuse", () => {
  it("envia trace, geração e nota num lote, com Basic auth e texto do paciente mascarado", async () => {
    let enviado: { url: string; auth: string; corpo: { batch: Array<{ type: string; body: Record<string, unknown> }> } } | undefined;
    const fetchFalso = (async (url: string, init: RequestInit) => {
      enviado = { url, auth: String((init.headers as Record<string, string>).authorization), corpo: JSON.parse(String(init.body)) };
      return new Response(JSON.stringify({ successes: [], errors: [] }), { status: 207 });
    }) as unknown as typeof fetch;
    const r = new RastreadorLangfuse({ host: "http://localhost:3000/", chavePublica: "pk-teste", chaveSecreta: "sk-teste", fetch: fetchFalso });
    r.turno({ traceId: "t1", usuarioId: "u-ana", sessaoId: "s1", entrada: "Quero cardiologia", saida: "ok", eventos: ["intencao:agendar"], inicio: "a", fim: "b" });
    r.geracao({ traceId: "t1", nome: "extrair_intencao", modelo: "anthropic.claude-haiku-5-5", entrada: { x: 1 }, saida: { y: 2 }, tokensEntrada: 10, tokensSaida: 5, custoUsd: 0.001, inicio: "a", fim: "b" });
    r.nota({ traceId: "t1", nome: "acerto_intencao", valor: 1 });
    await r.descarregar();
    expect(enviado?.url).toBe("http://localhost:3000/api/public/ingestion");
    expect(enviado?.auth).toBe(`Basic ${Buffer.from("pk-teste:sk-teste").toString("base64")}`);
    expect(enviado?.corpo.batch.map((e) => e.type)).toEqual(["trace-create", "generation-create", "score-create"]);
    expect(enviado?.corpo.batch[0]?.body.input).toBe("[17 caracteres]");
    expect(enviado?.corpo.batch[1]?.body.usage).toEqual({ input: 10, output: 5, unit: "TOKENS" });
  });

  it("falha alto se o Langfuse recusar o lote", async () => {
    const f = (async () => new Response("no", { status: 401 })) as unknown as typeof fetch;
    const r = new RastreadorLangfuse({ host: "http://x", chavePublica: "a", chaveSecreta: "b", fetch: f });
    r.nota({ traceId: "t", nome: "n", valor: 1 });
    await expect(r.descarregar()).rejects.toThrow("401");
  });

  it("só liga com as três variáveis; senão é nulo (padrão na AWS)", () => {
    expect(rastreadorDoAmbiente({})).toBeInstanceOf(RastreadorNulo);
    expect(rastreadorDoAmbiente({ LANGFUSE_HOST: "h", LANGFUSE_PUBLIC_KEY: "p", LANGFUSE_SECRET_KEY: "s" })).toBeInstanceOf(RastreadorLangfuse);
  });
});

describe("rastreamento no pipeline", () => {
  it("um trace por turno e uma geração por chamada ao modelo, ligadas pelo mesmo traceId", async () => {
    const rastreador = new RastreadorMemoria();
    const s = await montarSistema({ rastreador });
    await s.turno({ usuarioId: "u-ana", sessaoId: "s1", texto: "Quero dermatologia dia 27" });
    expect(rastreador.turnos).toHaveLength(1);
    const t = rastreador.turnos[0]!;
    expect(rastreador.geracoes.map((g) => g.traceId)).toEqual([t.traceId, t.traceId]);
    expect(rastreador.geracoes[0]).toMatchObject({ nome: "extrair_intencao", modelo: "anthropic.claude-haiku-5-5" });
    expect(t.eventos).toContain("tentativas:2");
  });

  it("registra a geração com erro quando o modelo falha", async () => {
    const rastreador = new RastreadorMemoria();
    const s = await montarSistema({ rastreador });
    await s.turno({ usuarioId: "u-ana", sessaoId: "s1", texto: "simular-instabilidade" });
    expect(rastreador.geracoes[0]?.erro).toContain("todos_modelos_falharam");
  });
});
