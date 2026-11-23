// Gate de avaliação no CI (ADR-0008, tarefas 4.4, 5.5, 5.6): reprova o PR se as métricas do
// dataset dourado caírem abaixo dos limiares versionados.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { avaliar, resumir, type Caso, type Limiares, type ResultadoCaso } from "../../lib/avaliacao/avaliador.js";
import { RastreadorMemoria } from "../../lib/observabilidade/rastreador.js";
import { DIR_FIXTURES, HOJE } from "../apoio/montagem.js";
import { itensSemente } from "../apoio/semente.js";

const ler = <T>(rel: string) => JSON.parse(readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8")) as T;
const { casos } = ler<{ casos: Caso[] }>("../../fixtures/avaliacao/dataset.json");
const limiares = ler<Limiares>("../../fixtures/avaliacao/limiares.json");

describe("gate de avaliação", () => {
  it("o dataset dourado passa nos limiares e o relatório é gravado", async () => {
    const rastreador = new RastreadorMemoria();
    const r = await avaliar({ casos, limiares, itensAgenda: itensSemente(), agora: HOJE, dirFixtures: DIR_FIXTURES, rastreador });
    const dir = fileURLToPath(new URL("../../reports", import.meta.url));
    mkdirSync(dir, { recursive: true });
    writeFileSync(`${dir}/avaliacao.json`, `${JSON.stringify({ executado_em: new Date().toISOString(), modo: "gravado", ...r }, null, 2)}\n`);
    expect(r.reprovacoes).toEqual([]);
    expect(r.aprovado).toBe(true);
    // Notas por caso vão para o rastreador (Langfuse no lab local).
    expect(rastreador.notas.filter((n) => n.nome === "acerto_intencao").length).toBeGreaterThanOrEqual(8);
  });

  it("reprova quando uma métrica cai abaixo do limiar (o gate não é decorativo)", () => {
    const ruim: ResultadoCaso = { id: "x", acertoIntencao: false, camposCertos: 0, camposTotal: 2, acertoResposta: false, saidaInvalida: true, tentativas: 3, custoUsd: 0.01, latenciaMs: 1, divergencias: [] };
    const r = resumir([ruim], limiares);
    expect(r.aprovado).toBe(false);
    expect(r.reprovacoes.map((x) => x.split(" ")[0])).toEqual([
      "acuracia_intencao",
      "acuracia_campos",
      "acuracia_resposta",
      "taxa_saida_invalida",
      "media_tentativas",
      "custo_medio_usd",
    ]);
  });
});
