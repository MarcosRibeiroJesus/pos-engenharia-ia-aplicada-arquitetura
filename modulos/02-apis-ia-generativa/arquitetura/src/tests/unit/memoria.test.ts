// Memória (ADR-0003): curto prazo com TTL, fatos fixados pelo código, preferências com
// proveniência, resumo do histórico que não perde fatos (5.1) e direito de apagar (LGPD).
import { beforeEach, describe, expect, it } from "vitest";
import { Memoria } from "../../lib/memoria/memoria.js";
import { resumirHistorico } from "../../lib/memoria/resumidor.js";
import { TabelaMemoria } from "../../lib/infra/tabela.js";
import type { ClienteGateway } from "../../lib/intencao/extrator.js";
import { mensagemTool } from "../apoio/mensagens.js";

let t: TabelaMemoria;
let relogio: Date;
let mem: Memoria;

beforeEach(() => {
  t = new TabelaMemoria();
  relogio = new Date("2026-11-19T12:00:00Z");
  mem = new Memoria(t, () => relogio, { turnosNoContexto: 4, limiteParaResumo: 6 });
});

const avancar = () => (relogio = new Date(relogio.getTime() + 1000));

describe("memória de curto prazo", () => {
  it("devolve os últimos turnos em ordem e com TTL", async () => {
    for (let n = 1; n <= 5; n++) {
      await mem.registrarTurno("u-ana", "s1", n % 2 ? "paciente" : "assistente", `turno ${n}`);
      avancar();
    }
    const c = await mem.carregar("u-ana", "s1");
    expect(c.turnos.map((x) => x.texto)).toEqual(["turno 2", "turno 3", "turno 4", "turno 5"]);
    const algum = [...t.itens.values()].find((i) => i.sk.includes("TURNO"));
    expect(Number(algum?.expira_em)).toBeGreaterThan(relogio.getTime() / 1000);
  });

  it("sessões não se misturam", async () => {
    await mem.registrarTurno("u-ana", "s1", "paciente", "na s1");
    await mem.registrarTurno("u-ana", "s2", "paciente", "na s2");
    expect((await mem.carregar("u-ana", "s2")).turnos.map((x) => x.texto)).toEqual(["na s2"]);
  });
});

describe("preferências e fatos", () => {
  it("guarda a preferência com a fonte (de qual sessão e trecho veio)", async () => {
    await mem.salvarPreferencias("u-ana", "s1", [{ chave: "periodo_preferido", valor: "manha", origem: "mensagem" }], "prefiro de manhã");
    const c = await mem.carregar("u-ana", "s9");
    expect(c.preferencias).toEqual([{ chave: "periodo_preferido", valor: "manha", fonte: { sessaoId: "s1", em: relogio.toISOString(), trecho: "prefiro de manhã" } }]);
  });

  it("fatos fixados valem entre sessões", async () => {
    await mem.fixarFato("u-ana", { tipo: "consulta_agendada", referencia: "C-1234ABCD", descricao: "cardiologia 26/11 10:00", em: relogio.toISOString() });
    expect((await mem.carregar("u-ana", "outra")).fatos[0]).toMatchObject({ referencia: "C-1234ABCD" });
  });
});

describe("resumo do histórico", () => {
  it("compacta os turnos antigos e mantém os recentes e os fatos, mesmo se o resumo os omitir", async () => {
    await mem.fixarFato("u-ana", { tipo: "consulta_agendada", referencia: "C-1234ABCD", descricao: "cardiologia 26/11 10:00", em: relogio.toISOString() });
    for (let n = 1; n <= 7; n++) {
      await mem.registrarTurno("u-ana", "s1", "paciente", `turno ${n}`);
      avancar();
    }
    expect(await mem.precisaResumir("u-ana", "s1")).toBe(true);
    await mem.aplicarResumo("u-ana", "s1", "Paciente conversou sobre horários.");
    const c = await mem.carregar("u-ana", "s1");
    expect(c.resumo).toBe("Paciente conversou sobre horários.");
    expect(c.turnos.map((x) => x.texto)).toEqual(["turno 4", "turno 5", "turno 6", "turno 7"]);
    expect(c.fatos.map((f) => f.referencia)).toEqual(["C-1234ABCD"]);
    expect(await mem.precisaResumir("u-ana", "s1")).toBe(false);
  });

  it("o resumidor envia os turnos como dado não confiável e devolve o texto da tool", async () => {
    let enviado = "";
    const gw: ClienteGateway = {
      async chamar(p) {
        enviado = JSON.stringify(p.requisicao.messages);
        return { ok: true, modelo: "m", custoUsd: 0, tentativas: [], resposta: mensagemTool("registrar_resumo", { resumo: "Pediu cardiologia." }) };
      },
    };
    const r = await resumirHistorico(gw, { resumoAnterior: "", turnos: [{ papel: "paciente", texto: "quero cardio", em: "x" }], nonce: "n1" });
    expect(r).toBe("Pediu cardiologia.");
    expect(enviado).toContain("dados_nao_confiaveis");
  });

  it("se o modelo falhar, o resumidor devolve null e nada é apagado", async () => {
    const gw: ClienteGateway = { async chamar() { return { ok: false, erro: { categoria: "todos_modelos_falharam", retentavel: true, mensagem: "x", tentativas: [] }, tentativas: [] }; } };
    expect(await resumirHistorico(gw, { resumoAnterior: "", turnos: [], nonce: "n" })).toBeNull();
  });
});

describe("direito de apagar", () => {
  it("apaga tudo do paciente e só dele", async () => {
    await mem.registrarTurno("u-ana", "s1", "paciente", "oi");
    await mem.salvarPreferencias("u-ana", "s1", [{ chave: "periodo_preferido", valor: "tarde", origem: "mensagem" }], "tarde");
    await mem.fixarFato("u-ana", { tipo: "consulta_agendada", referencia: "C-1", descricao: "x", em: "y" });
    await mem.registrarTurno("u-bruno", "s1", "paciente", "oi");
    const r = await mem.apagarTudo("u-ana");
    expect(r.apagados).toBe(3);
    const c = await mem.carregar("u-ana", "s1");
    expect(c).toEqual({ fatos: [], resumo: "", preferencias: [], turnos: [], candidatos: [] });
    expect((await mem.carregar("u-bruno", "s1")).turnos).toHaveLength(1);
  });
});
