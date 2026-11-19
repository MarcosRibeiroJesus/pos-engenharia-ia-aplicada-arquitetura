// Ações que mudam estado e precisam de humano (cancelamento). A ação é registrada antes do
// fluxo começar, com id determinístico por consulta (pedido repetido = mesma ação) e o nome
// da execução do Step Functions igual ao id (o SFN recusa nome repetido: idempotência grátis).
import { createHash } from "node:crypto";
import type { TabelaChaveValor } from "../infra/tabela.js";
import { ErroCondicao } from "../infra/tabela.js";
import type { Consulta } from "./tipos.js";

export interface FluxoAprovacao {
  iniciar(acaoId: string, acao: Record<string, unknown>): Promise<void>;
  concluirTarefa(token: string, saida: { aprovado: boolean; aprovadorId: string; motivo?: string }): Promise<void>;
}

export interface Notificador {
  avisar(mensagem: Record<string, unknown>): Promise<void>;
}

export interface AcaoCancelamento {
  acaoId: string;
  usuarioId: string;
  consultaId: string;
  consultaVersao: number;
  status: "CRIADA" | "PENDENTE_APROVACAO" | "DECIDIDA" | "EXECUTADA" | "REJEITADA" | "EXPIRADA" | "CONFLITO";
}

const TRINTA_DIAS_S = 30 * 86_400;

export function idAcao(usuarioId: string, consultaId: string) {
  return `A-${createHash("sha256").update(`${usuarioId}|${consultaId}`).digest("hex").slice(0, 16)}`;
}

export class Operacoes {
  constructor(
    private readonly t: TabelaChaveValor,
    private readonly fluxo: FluxoAprovacao,
    private readonly relogio: () => Date = () => new Date(),
  ) {}

  async solicitarCancelamento(usuarioId: string, c: Consulta): Promise<AcaoCancelamento> {
    const acaoId = idAcao(usuarioId, c.consultaId);
    const existente = await this.t.obter(`ACAO#${acaoId}`, "META");
    if (existente && ["CRIADA", "PENDENTE_APROVACAO", "DECIDIDA"].includes(String(existente.status))) {
      return this.paraAcao(existente);
    }
    const acao = {
      pk: `ACAO#${acaoId}`,
      sk: "META",
      acao_id: acaoId,
      tipo: "cancelar",
      usuario_id: usuarioId,
      consulta_id: c.consultaId,
      consulta_versao: c.versao,
      resumo: `${c.especialidade} em ${c.data} às ${c.hora}`,
      status: "CRIADA",
      criado_em: this.relogio().toISOString(),
      expira_em: Math.floor(this.relogio().getTime() / 1000) + TRINTA_DIAS_S,
    };
    try {
      // Nova ação, ou substitui uma já encerrada (rejeitada/expirada) da mesma consulta.
      await this.t.gravar(acao, existente ? [{ atributo: "status", igual: existente.status }] : [{ atributo: "pk", naoExiste: true }]);
    } catch (e) {
      if (e instanceof ErroCondicao) return this.paraAcao((await this.t.obter(`ACAO#${acaoId}`, "META"))!);
      throw e;
    }
    await this.fluxo.iniciar(acaoId, { acaoId, usuarioId, consultaId: c.consultaId, consultaVersao: c.versao });
    return this.paraAcao((await this.t.obter(`ACAO#${acaoId}`, "META"))!);
  }

  async decidir(acaoId: string, d: { decisao: "aprovar" | "rejeitar"; aprovadorId: string; motivo?: string }) {
    const item = await this.t.obter(`ACAO#${acaoId}`, "META");
    if (!item) throw new Error("acao_nao_encontrada");
    if (item.status !== "PENDENTE_APROVACAO" || !item.token) throw new Error("acao_nao_pendente");
    if (d.aprovadorId === item.usuario_id) throw new Error("aprovador_invalido");
    // Trava: só a primeira decisão passa da condição.
    try {
      await this.t.atualizar(
        `ACAO#${acaoId}`,
        "META",
        { status: "DECIDIDA", decisao: d.decisao, aprovador_id: d.aprovadorId, motivo: d.motivo ?? null, decidido_em: this.relogio().toISOString() },
        [{ atributo: "status", igual: "PENDENTE_APROVACAO" }],
      );
    } catch (e) {
      if (e instanceof ErroCondicao) throw new Error("acao_nao_pendente");
      throw e;
    }
    await this.fluxo.concluirTarefa(String(item.token), { aprovado: d.decisao === "aprovar", aprovadorId: d.aprovadorId, ...(d.motivo ? { motivo: d.motivo } : {}) });
  }

  private paraAcao(i: Record<string, unknown>): AcaoCancelamento {
    return {
      acaoId: String(i.acao_id),
      usuarioId: String(i.usuario_id),
      consultaId: String(i.consulta_id),
      consultaVersao: Number(i.consulta_versao),
      status: i.status as AcaoCancelamento["status"],
    };
  }
}
