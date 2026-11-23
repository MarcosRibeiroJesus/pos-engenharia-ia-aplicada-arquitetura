// Gate determinístico (tarefa 1.4): a intenção do modelo é uma proposta, nunca uma autorização.
import { beforeEach, describe, expect, it } from "vitest";
import { Agenda } from "../../lib/dominio/agenda.js";
import { avaliar } from "../../lib/dominio/gate.js";
import { TabelaMemoria } from "../../lib/infra/tabela.js";
import type { Intencao } from "../../lib/dominio/tipos.js";
import { semearAgenda, CONSULTAS_SEMENTE } from "../apoio/semente.js";

const AGORA = new Date("2026-11-19T12:00:00-03:00");
const vazia: Intencao = { intencao: "outra", especialidade: null, data: null, horario: null, periodo: null, consulta_id: null, preferencias: [], confianca: 0.9, ambiguidades: [], evidencias: [] };
// Por padrão a evidência vem da mensagem do paciente; os testes de anexo trocam a origem.
const EV_MSG: Intencao["evidencias"] = [
  { campo: "data", origem: "mensagem", trecho: "x" },
  { campo: "horario", origem: "mensagem", trecho: "x" },
  { campo: "consulta_id", origem: "mensagem", trecho: "x" },
];
const i = (p: Partial<Intencao>): Intencao => ({ ...vazia, evidencias: EV_MSG, ...p });

let agenda: Agenda;
beforeEach(async () => {
  const t = new TabelaMemoria();
  await semearAgenda(t);
  agenda = new Agenda(t);
});

describe("agendar", () => {
  it("executa quando o horário pedido está livre", async () => {
    const d = await avaliar(i({ intencao: "agendar", especialidade: "cardiologia", data: "2026-11-26", horario: "10:00" }), "u-ana", agenda, AGORA);
    expect(d.tipo).toBe("executar_agendamento");
    if (d.tipo === "executar_agendamento") expect(d.slot).toMatchObject({ hora: "10:00", status: "livre" });
  });

  it("pergunta o horário e oferece opções quando há mais de um livre no período", async () => {
    const d = await avaliar(i({ intencao: "agendar", especialidade: "cardiologia", data: "2026-11-26", periodo: "manha" }), "u-ana", agenda, AGORA);
    expect(d).toMatchObject({ tipo: "perguntar", motivo: "escolher_horario" });
    if (d.tipo === "perguntar") expect(d.opcoes?.length).toBeGreaterThan(1);
  });

  it("pergunta o que falta (especialidade, data)", async () => {
    expect(await avaliar(i({ intencao: "agendar", data: "2026-11-26" }), "u-ana", agenda, AGORA)).toMatchObject({ tipo: "perguntar", faltando: ["especialidade"] });
    expect(await avaliar(i({ intencao: "agendar", especialidade: "cardiologia" }), "u-ana", agenda, AGORA)).toMatchObject({ tipo: "perguntar", faltando: ["data"] });
  });

  it("oferece alternativas quando o horário pedido está ocupado", async () => {
    const d = await avaliar(i({ intencao: "agendar", especialidade: "cardiologia", data: "2026-11-26", horario: "09:00" }), "u-bruno", agenda, AGORA);
    expect(d).toMatchObject({ tipo: "perguntar", motivo: "horario_indisponivel" });
  });

  it("recusa consulta duplicada na mesma especialidade e dia", async () => {
    const d = await avaliar(i({ intencao: "agendar", especialidade: "cardiologia", data: "2026-11-26", horario: "10:00" }), "u-bruno", agenda, AGORA);
    expect(d).toMatchObject({ tipo: "recusar", motivo: "consulta_duplicada" });
  });

  it("pergunta em vez de agir quando a confiança é baixa ou há ambiguidade (escalonamento)", async () => {
    const d = await avaliar(i({ intencao: "agendar", especialidade: "cardiologia", data: "2026-11-26", horario: "10:00", confianca: 0.4 }), "u-ana", agenda, AGORA);
    expect(d).toMatchObject({ tipo: "perguntar", motivo: "baixa_confianca" });
  });
});

describe("cancelar", () => {
  it("pede aprovação humana para a consulta do próprio paciente", async () => {
    const d = await avaliar(i({ intencao: "cancelar", consulta_id: CONSULTAS_SEMENTE.bruno_cardio }), "u-bruno", agenda, AGORA);
    expect(d.tipo).toBe("solicitar_aprovacao_cancelamento");
  });

  it("recusa id de consulta de outro paciente sem revelar que ela existe", async () => {
    const d = await avaliar(i({ intencao: "cancelar", consulta_id: CONSULTAS_SEMENTE.bruno_cardio }), "u-ana", agenda, AGORA);
    expect(d).toMatchObject({ tipo: "recusar", motivo: "consulta_nao_encontrada" });
  });

  it("desambigua quando o filtro casa com mais de uma consulta", async () => {
    const d = await avaliar(i({ intencao: "cancelar", data: "2026-11-26" }), "u-carla", agenda, AGORA);
    expect(d).toMatchObject({ tipo: "perguntar", motivo: "qual_consulta" });
    if (d.tipo === "perguntar") expect(d.opcoes).toHaveLength(2);
  });

  it("resolve sem id quando o filtro casa com uma só", async () => {
    const d = await avaliar(i({ intencao: "cancelar", data: "2026-11-26", especialidade: "dermatologia" }), "u-carla", agenda, AGORA);
    expect(d.tipo).toBe("solicitar_aprovacao_cancelamento");
  });

  it("encaminha para a recepção quando falta menos de 2 horas", async () => {
    const perto = new Date("2026-11-26T07:30:00-03:00");
    const d = await avaliar(i({ intencao: "cancelar", consulta_id: CONSULTAS_SEMENTE.bruno_cardio }), "u-bruno", agenda, perto);
    expect(d).toMatchObject({ tipo: "recusar", motivo: "muito_perto" });
  });
});

describe("dado vindo só de anexo (injeção indireta)", () => {
  const EV_ANEXO: Intencao["evidencias"] = [
    { campo: "data", origem: "anexo", trecho: "x" },
    { campo: "horario", origem: "anexo", trecho: "x" },
    { campo: "consulta_id", origem: "anexo", trecho: "x" },
  ];

  it("não agenda: pede confirmação na mensagem", async () => {
    const d = await avaliar(i({ intencao: "agendar", especialidade: "cardiologia", data: "2026-11-26", horario: "10:00", evidencias: EV_ANEXO }), "u-ana", agenda, AGORA);
    expect(d).toMatchObject({ tipo: "perguntar", motivo: "confirmar_dado_de_anexo" });
  });

  it("não abre cancelamento: pede confirmação na mensagem", async () => {
    const d = await avaliar(i({ intencao: "cancelar", consulta_id: CONSULTAS_SEMENTE.bruno_cardio, evidencias: EV_ANEXO }), "u-bruno", agenda, AGORA);
    expect(d).toMatchObject({ tipo: "perguntar", motivo: "confirmar_dado_de_anexo" });
  });

  it("com o dado confirmado na mensagem, segue", async () => {
    const ev: Intencao["evidencias"] = [...EV_ANEXO, { campo: "horario", origem: "mensagem", trecho: "10h" }];
    const d = await avaliar(i({ intencao: "agendar", especialidade: "cardiologia", data: "2026-11-26", horario: "10:00", evidencias: ev }), "u-ana", agenda, AGORA);
    expect(d.tipo).toBe("executar_agendamento");
  });
});

describe("consultar", () => {
  it("lista só as consultas futuras e confirmadas do próprio paciente", async () => {
    const d = await avaliar(i({ intencao: "consultar" }), "u-carla", agenda, AGORA);
    expect(d.tipo).toBe("informar");
    if (d.tipo === "informar") expect(d.consultas.every((c) => c.usuarioId === "u-carla" && c.status === "confirmada")).toBe(true);
  });
});

it("intenção 'outra' nunca muda estado", async () => {
  expect((await avaliar(i({ intencao: "outra" }), "u-ana", agenda, AGORA)).tipo).toBe("fora_de_escopo");
});
