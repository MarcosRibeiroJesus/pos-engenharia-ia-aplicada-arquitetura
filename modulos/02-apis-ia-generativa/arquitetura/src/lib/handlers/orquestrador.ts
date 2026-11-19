// Lambda da API: roteia as três rotas e roda o grafo da conversa.
import { randomUUID } from "node:crypto";
import { Agenda } from "../dominio/agenda.js";
import { Operacoes } from "../dominio/operacoes.js";
import { construirGrafo, executarTurno } from "../grafo/grafo.js";
import { exigir, log, relogio } from "../infra/ambiente.js";
import { ClienteGatewayLambda, ExecutorLambda, FluxoAprovacaoSfn, LeitorAnexosS3 } from "../infra/aws/adaptadores.js";
import { TabelaDynamo } from "../infra/aws/tabela-dynamo.js";
import { MetricasEmf } from "../infra/metricas.js";
import { Memoria } from "../memoria/memoria.js";

interface EventoApi {
  httpMethod: string;
  resource: string;
  pathParameters?: Record<string, string> | null;
  body?: string | null;
  requestContext?: { requestId?: string };
}

const ID = /^[a-z0-9-]{3,64}$/;
// Canário novo a cada cold start: ninguém o conhece, nem o atacante, e a verificação
// de saída compara com o mesmo valor do processo.
const CANARIO = `CANARIO-${randomUUID()}`;

let sistema: ReturnType<typeof montar> | undefined;

function montar() {
  const agora = relogio();
  const memoria = new Memoria(new TabelaDynamo(exigir("TABELA_MEMORIA")), agora);
  const operacoes = new Operacoes(new TabelaDynamo(exigir("TABELA_OPERACOES")), new FluxoAprovacaoSfn(exigir("STATE_MACHINE_ARN")), agora);
  const grafo = construirGrafo({
    gateway: new ClienteGatewayLambda(exigir("FUNCAO_GATEWAY")),
    memoria,
    agenda: new Agenda(new TabelaDynamo(exigir("TABELA_AGENDA"))),
    operacoes,
    executor: new ExecutorLambda(exigir("FUNCAO_EXECUTOR")),
    anexos: new LeitorAnexosS3(exigir("BUCKET_ANEXOS")),
    metricas: new MetricasEmf(process.env.NAMESPACE_METRICAS ?? "AssistenteAgendamento", "orquestrador"),
    canario: CANARIO,
    relogio: agora,
  });
  return { grafo, memoria, operacoes };
}

const resposta = (status: number, corpo: unknown) => ({ statusCode: status, headers: { "content-type": "application/json" }, body: JSON.stringify(corpo) });

function corpoJson(e: EventoApi): Record<string, unknown> | null {
  try {
    const v = JSON.parse(e.body ?? "");
    return v && typeof v === "object" ? v : null;
  } catch {
    return null;
  }
}

export async function handler(e: EventoApi) {
  sistema ??= montar();
  const requestId = e.requestContext?.requestId ?? randomUUID();
  const rota = `${e.httpMethod} ${e.resource}`;
  try {
    if (rota === "POST /v1/mensagens") {
      const b = corpoJson(e);
      // A borda já validou o schema; aqui valida de novo (defesa em profundidade).
      if (!b || !ID.test(String(b.usuarioId)) || !ID.test(String(b.sessaoId)) || typeof b.texto !== "string" || !b.texto.length || b.texto.length > 2000) {
        return resposta(400, { erro: "corpo_invalido" });
      }
      const anexos = Array.isArray(b.anexos) ? b.anexos.filter((a): a is string => typeof a === "string").slice(0, 2) : [];
      const r = await executarTurno(sistema.grafo, { usuarioId: String(b.usuarioId), sessaoId: String(b.sessaoId), texto: b.texto, anexos });
      log("INFO", "turno", { requestId, eventos: r.eventos, tipo: r.resposta.tipo, acaoId: r.acaoId, consultaId: r.consultaId });
      return resposta(200, {
        requestId,
        resposta: r.resposta,
        acaoId: r.acaoId ?? null,
        consultaId: r.consultaId ?? null,
        // Trilha do turno só no lab (os testes de integração conferem as camadas por ela).
        ...(process.env.EXPOR_TRILHA === "true" ? { trilha: r.eventos } : {}),
      });
    }

    if (rota === "POST /v1/aprovacoes/{acaoId}") {
      const acaoId = e.pathParameters?.acaoId ?? "";
      const b = corpoJson(e);
      if (!/^A-[a-f0-9]{16}$/.test(acaoId) || !b || !["aprovar", "rejeitar"].includes(String(b.decisao)) || !ID.test(String(b.aprovadorId))) {
        return resposta(400, { erro: "corpo_invalido" });
      }
      try {
        await sistema.operacoes.decidir(acaoId, {
          decisao: b.decisao as "aprovar" | "rejeitar",
          aprovadorId: String(b.aprovadorId),
          ...(typeof b.motivo === "string" ? { motivo: b.motivo.slice(0, 500) } : {}),
        });
      } catch (err) {
        const m = (err as Error).message;
        const status = m === "acao_nao_encontrada" ? 404 : m === "aprovador_invalido" ? 403 : m === "acao_nao_pendente" ? 409 : 500;
        if (status !== 500) return resposta(status, { erro: m });
        throw err;
      }
      log("INFO", "decisao_registrada", { requestId, acaoId, decisao: b.decisao });
      return resposta(200, { acaoId, status: "decisao_registrada" });
    }

    if (rota === "DELETE /v1/usuarios/{usuarioId}/memoria") {
      const usuarioId = e.pathParameters?.usuarioId ?? "";
      if (!ID.test(usuarioId)) return resposta(400, { erro: "usuario_invalido" });
      const r = await sistema.memoria.apagarTudo(usuarioId);
      log("INFO", "memoria_apagada", { requestId, apagados: r.apagados });
      return resposta(200, r);
    }

    return resposta(404, { erro: "rota_desconhecida" });
  } catch (err) {
    log("ERROR", "falha_nao_tratada", { requestId, rota, erro: String(err) });
    return resposta(500, { erro: "interno", requestId });
  }
}
