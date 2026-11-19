// Executor e fluxo de aprovação: transações idempotentes, travas otimistas e decisão humana.
import { beforeEach, describe, expect, it } from "vitest";
import { TabelaMemoria } from "../../lib/infra/tabela.js";
import { Executor } from "../../lib/executor/executor.js";
import { Operacoes } from "../../lib/dominio/operacoes.js";
import { Agenda } from "../../lib/dominio/agenda.js";
import { semearAgenda, CONSULTAS_SEMENTE } from "../apoio/semente.js";
import { FluxoAprovacaoMemoria, NotificadorMemoria } from "../apoio/fakes.js";

let agenda: TabelaMemoria, ops: TabelaMemoria, executor: Executor, operacoes: Operacoes, fluxo: FluxoAprovacaoMemoria, notificador: NotificadorMemoria;

beforeEach(async () => {
  agenda = new TabelaMemoria();
  ops = new TabelaMemoria();
  await semearAgenda(agenda);
  notificador = new NotificadorMemoria();
  executor = new Executor(agenda, ops, notificador);
  fluxo = new FluxoAprovacaoMemoria(executor);
  operacoes = new Operacoes(ops, fluxo, () => new Date("2026-11-19T15:00:00Z"));
});

async function slot(hora: string) {
  return (await new Agenda(agenda).slotsDoDia("cardiologia", "2026-11-26")).find((s) => s.hora === hora)!;
}

describe("agendar", () => {
  it("reserva o slot e cria a consulta numa transação", async () => {
    const r = await executor.agendar({ usuarioId: "u-ana", slot: await slot("10:00"), idempotencia: "sessao-1#10:00" });
    expect(r.status).toBe("agendada");
    expect((await slot("10:00")).status).toBe("reservado");
    const c = await new Agenda(agenda).consulta(r.consulta!.consultaId);
    expect(c).toMatchObject({ usuarioId: "u-ana", status: "confirmada", versao: 1 });
  });

  it("é idempotente: repetir o mesmo pedido não cria outra consulta", async () => {
    const s = await slot("10:00");
    const a = await executor.agendar({ usuarioId: "u-ana", slot: s, idempotencia: "k1" });
    const b = await executor.agendar({ usuarioId: "u-ana", slot: s, idempotencia: "k1" });
    expect(b.consulta!.consultaId).toBe(a.consulta!.consultaId);
    expect(b.status).toBe("ja_existia");
  });

  it("não reserva slot já ocupado (corrida entre dois pacientes)", async () => {
    const s = await slot("10:00");
    await executor.agendar({ usuarioId: "u-ana", slot: s, idempotencia: "k1" });
    const r = await executor.agendar({ usuarioId: "u-davi", slot: s, idempotencia: "k2" });
    expect(r.status).toBe("slot_ocupado");
  });
});

describe("cancelamento com aprovação humana", () => {
  async function pedir(usuario = "u-bruno", consultaId = CONSULTAS_SEMENTE.bruno_cardio) {
    const c = (await new Agenda(agenda).consulta(consultaId))!;
    return operacoes.solicitarCancelamento(usuario, c);
  }

  it("cria a ação, inicia o fluxo e avisa o aprovador sem expor o token", async () => {
    const a = await pedir();
    expect(a.status).toBe("PENDENTE_APROVACAO");
    expect(fluxo.execucoes).toEqual([a.acaoId]);
    expect(notificador.avisos).toHaveLength(1);
    expect(JSON.stringify(notificador.avisos[0])).not.toContain("token");
    // Nada mudou na agenda ainda.
    expect((await new Agenda(agenda).consulta(CONSULTAS_SEMENTE.bruno_cardio))?.status).toBe("confirmada");
  });

  it("pedido repetido devolve a mesma ação (idempotência por consulta)", async () => {
    const a = await pedir();
    const b = await pedir();
    expect(b.acaoId).toBe(a.acaoId);
    expect(fluxo.execucoes).toHaveLength(1);
  });

  it("aprovado: cancela a consulta, libera o slot e registra quem aprovou", async () => {
    const a = await pedir();
    await operacoes.decidir(a.acaoId, { decisao: "aprovar", aprovadorId: "recepcao-1" });
    expect((await new Agenda(agenda).consulta(CONSULTAS_SEMENTE.bruno_cardio))?.status).toBe("cancelada");
    expect((await slot("09:00")).status).toBe("livre");
    expect(await ops.obter(`ACAO#${a.acaoId}`, "META")).toMatchObject({ status: "EXECUTADA", aprovador_id: "recepcao-1" });
  });

  it("rejeitado: a consulta continua confirmada", async () => {
    const a = await pedir();
    await operacoes.decidir(a.acaoId, { decisao: "rejeitar", aprovadorId: "recepcao-1", motivo: "paciente ligou" });
    expect((await new Agenda(agenda).consulta(CONSULTAS_SEMENTE.bruno_cardio))?.status).toBe("confirmada");
    expect(await ops.obter(`ACAO#${a.acaoId}`, "META")).toMatchObject({ status: "REJEITADA" });
  });

  it("o próprio paciente não aprova o próprio pedido (segregação de funções)", async () => {
    const a = await pedir();
    await expect(operacoes.decidir(a.acaoId, { decisao: "aprovar", aprovadorId: "u-bruno" })).rejects.toThrow("aprovador_invalido");
  });

  it("decisão só vale uma vez", async () => {
    const a = await pedir();
    await operacoes.decidir(a.acaoId, { decisao: "rejeitar", aprovadorId: "recepcao-1" });
    await expect(operacoes.decidir(a.acaoId, { decisao: "aprovar", aprovadorId: "recepcao-2" })).rejects.toThrow("acao_nao_pendente");
  });

  it("não cancela se a consulta mudou depois do pedido (trava otimista por versão)", async () => {
    const a = await pedir();
    await agenda.atualizar(`CONSULTA#${CONSULTAS_SEMENTE.bruno_cardio}`, "META", { versao: 2 });
    await operacoes.decidir(a.acaoId, { decisao: "aprovar", aprovadorId: "recepcao-1" });
    expect(await ops.obter(`ACAO#${a.acaoId}`, "META")).toMatchObject({ status: "CONFLITO" });
  });

  it("expira sem decisão", async () => {
    const a = await pedir();
    await executor.expirar({ acaoId: a.acaoId });
    expect(await ops.obter(`ACAO#${a.acaoId}`, "META")).toMatchObject({ status: "EXPIRADA" });
  });
});
