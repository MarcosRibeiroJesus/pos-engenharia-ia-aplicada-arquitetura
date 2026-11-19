// Executor: a única peça com permissão de escrita na agenda (ver main.tf). Só roda depois do
// gate (agendar) ou da aprovação humana (cancelar). Toda escrita é transação condicional:
// slot livre, consulta inexistente, versão igual à do pedido e ação no status esperado.
import { createHash } from "node:crypto";
import type { TabelaChaveValor } from "../infra/tabela.js";
import { ErroCondicao } from "../infra/tabela.js";
import { chaveSlot, paraConsulta } from "../dominio/agenda.js";
import type { Consulta, Slot } from "../dominio/tipos.js";
import type { Notificador } from "../dominio/operacoes.js";

export interface AcaoEntrada {
  acaoId: string;
  usuarioId: string;
  consultaId: string;
  consultaVersao: number;
}

export type ResultadoAgendar = { status: "agendada" | "ja_existia"; consulta: Consulta } | { status: "slot_ocupado"; consulta?: undefined };

export function idConsulta(idempotencia: string) {
  return `C-${createHash("sha256").update(idempotencia).digest("hex").slice(0, 8).toUpperCase()}`;
}

export class Executor {
  constructor(
    private readonly agenda: TabelaChaveValor,
    private readonly ops: TabelaChaveValor,
    private readonly notificador: Notificador,
  ) {}

  async agendar(p: { usuarioId: string; slot: Slot; idempotencia: string }): Promise<ResultadoAgendar> {
    const consultaId = idConsulta(`${p.usuarioId}|${p.idempotencia}`);
    const existente = await this.agenda.obter(`CONSULTA#${consultaId}`, "META");
    if (existente) return { status: "ja_existia", consulta: paraConsulta(existente) };

    const k = chaveSlot(p.slot);
    const item = {
      pk: `CONSULTA#${consultaId}`,
      sk: "META",
      consulta_id: consultaId,
      usuario_id: p.usuarioId,
      slot_id: p.slot.slotId,
      slot_pk: k.pk,
      slot_sk: k.sk,
      especialidade: p.slot.especialidade,
      data: p.slot.data,
      hora: p.slot.hora,
      profissional: p.slot.profissional,
      status: "confirmada",
      versao: 1,
    };
    try {
      await this.agenda.transacao([
        { tipo: "atualizar", pk: k.pk, sk: k.sk, campos: { status: "reservado", consulta_id: consultaId }, condicoes: [{ atributo: "status", igual: "livre" }] },
        { tipo: "gravar", item, condicoes: [{ atributo: "pk", naoExiste: true }] },
      ]);
    } catch (e) {
      if (e instanceof ErroCondicao) return { status: "slot_ocupado" };
      throw e;
    }
    return { status: "agendada", consulta: paraConsulta(item) };
  }

  /** Etapa AguardarAprovacao do Step Functions: guarda o token e avisa a recepção. */
  async registrarPendencia(p: { acao: AcaoEntrada; token: string }) {
    try {
      await this.ops.atualizar(`ACAO#${p.acao.acaoId}`, "META", { status: "PENDENTE_APROVACAO", token: p.token }, [{ atributo: "status", igual: "CRIADA" }]);
    } catch (e) {
      // Reentrega do mesmo passo: já está pendente, nada a fazer.
      if (e instanceof ErroCondicao) return;
      throw e;
    }
    // O token nunca sai na notificação: quem decide chama a API, que lê o token da tabela.
    await this.notificador.avisar({ tipo: "cancelamento_pendente", acaoId: p.acao.acaoId, consultaId: p.acao.consultaId });
  }

  async cancelar(p: { acao: AcaoEntrada; decisao: { aprovadorId: string } }) {
    const acao = await this.ops.obter(`ACAO#${p.acao.acaoId}`, "META");
    if (acao?.status === "EXECUTADA") return { status: "ja_executada" };
    const c = await this.agenda.obter(`CONSULTA#${p.acao.consultaId}`, "META");
    try {
      await this.agenda.transacao([
        {
          tipo: "atualizar",
          pk: `CONSULTA#${p.acao.consultaId}`,
          sk: "META",
          campos: { status: "cancelada", versao: p.acao.consultaVersao + 1, cancelada_por_acao: p.acao.acaoId },
          condicoes: [
            { atributo: "status", igual: "confirmada" },
            { atributo: "versao", igual: p.acao.consultaVersao },
          ],
        },
        { tipo: "atualizar", pk: String(c?.slot_pk), sk: String(c?.slot_sk), campos: { status: "livre" }, remover: ["consulta_id"], condicoes: [{ atributo: "consulta_id", igual: p.acao.consultaId }] },
      ]);
    } catch (e) {
      if (e instanceof ErroCondicao) {
        // A consulta mudou depois do pedido: não cancela e registra o conflito para a recepção.
        await this.ops.atualizar(`ACAO#${p.acao.acaoId}`, "META", { status: "CONFLITO" });
        return { status: "conflito" };
      }
      throw e;
    }
    await this.ops.atualizar(`ACAO#${p.acao.acaoId}`, "META", { status: "EXECUTADA", aprovador_id: p.decisao.aprovadorId }, [], ["token"]);
    return { status: "cancelada" };
  }

  async rejeitar(p: { acao: AcaoEntrada; decisao?: unknown }) {
    await this.ops.atualizar(`ACAO#${p.acao.acaoId}`, "META", { status: "REJEITADA" }, [], ["token"]);
    return { status: "rejeitada" };
  }

  async expirar(p: { acaoId: string }) {
    await this.ops.atualizar(`ACAO#${p.acaoId}`, "META", { status: "EXPIRADA" }, [], ["token"]);
    return { status: "expirada" };
  }
}
