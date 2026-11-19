// Lambda do executor: chamada pelo orquestrador (agendar) e pelo Step Functions (aprovação).
import { Executor } from "../executor/executor.js";
import { exigir, log } from "../infra/ambiente.js";
import { NotificadorSns } from "../infra/aws/adaptadores.js";
import { TabelaDynamo } from "../infra/aws/tabela-dynamo.js";

let executor: Executor | undefined;

type Evento =
  | { etapa: "agendar"; usuarioId: string; slot: Parameters<Executor["agendar"]>[0]["slot"]; idempotencia: string }
  | { etapa: "registrar_pendencia"; acao: Parameters<Executor["registrarPendencia"]>[0]["acao"]; token: string }
  | { etapa: "cancelar"; acao: Parameters<Executor["cancelar"]>[0]["acao"]; decisao: { aprovadorId: string } }
  | { etapa: "rejeitar"; acao: Parameters<Executor["rejeitar"]>[0]["acao"]; decisao?: unknown }
  | { etapa: "expirar"; acao: { acaoId: string } };

export async function handler(e: Evento) {
  executor ??= new Executor(new TabelaDynamo(exigir("TABELA_AGENDA")), new TabelaDynamo(exigir("TABELA_OPERACOES")), new NotificadorSns(exigir("TOPICO_APROVACOES")));
  log("INFO", "etapa_executor", { etapa: e.etapa, acaoId: "acao" in e ? e.acao.acaoId : undefined });
  switch (e.etapa) {
    case "agendar":
      return executor.agendar(e);
    case "registrar_pendencia":
      return executor.registrarPendencia(e);
    case "cancelar":
      return executor.cancelar(e);
    case "rejeitar":
      return executor.rejeitar(e);
    case "expirar":
      return executor.expirar({ acaoId: e.acao.acaoId });
    default:
      throw new Error(`etapa desconhecida: ${(e as { etapa?: string }).etapa}`);
  }
}
