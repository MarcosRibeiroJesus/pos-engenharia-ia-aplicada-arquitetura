// Monta o sistema inteiro em memória, com o gateway real e as respostas gravadas da Lambda.
import { fileURLToPath } from "node:url";
import { Agenda } from "../../lib/dominio/agenda.js";
import { Operacoes } from "../../lib/dominio/operacoes.js";
import { Executor } from "../../lib/executor/executor.js";
import { EstadoGatewayMemoria } from "../../lib/gateway/estado.js";
import { ProvedorGravado } from "../../lib/gateway/provedor-gravado.js";
import { GatewayLlm } from "../../lib/gateway/roteador.js";
import type { ProvedorLlm } from "../../lib/gateway/tipos.js";
import { construirGrafo, executarTurno, type Entrada } from "../../lib/grafo/grafo.js";
import { MetricasMemoria } from "../../lib/infra/metricas.js";
import { TabelaMemoria } from "../../lib/infra/tabela.js";
import { Memoria } from "../../lib/memoria/memoria.js";
import { FluxoAprovacaoMemoria, NotificadorMemoria } from "./fakes.js";
import { semearAgenda } from "./semente.js";

export const DIR_FIXTURES = fileURLToPath(new URL("../../fixtures/respostas-gravadas", import.meta.url));
export const HOJE = new Date("2026-11-19T12:00:00-03:00");
export const CANARIO = "CANARIO-7f3a";

export async function montarSistema(o: { provedor?: ProvedorLlm; anexos?: Record<string, string> } = {}) {
  const tabelas = { agenda: new TabelaMemoria(), memoria: new TabelaMemoria(), gateway: new TabelaMemoria(), operacoes: new TabelaMemoria() };
  await semearAgenda(tabelas.agenda);
  const metricas = new MetricasMemoria();
  const estadoGw = new EstadoGatewayMemoria();
  const provedorBase = o.provedor ?? ProvedorGravado.deDiretorio(DIR_FIXTURES);
  const chamadas: string[] = [];
  const provedor: ProvedorLlm = {
    nome: provedorBase.nome,
    chamar: (m, r, t) => {
      chamadas.push(`${t}:${m}`);
      return provedorBase.chamar(m, r, t);
    },
  };
  const gateway = new GatewayLlm({
    provedor,
    estado: estadoGw,
    metricas,
    cadeia: ["anthropic.claude-haiku-5-5", "anthropic.claude-sonnet-5-5"],
    precos: { "anthropic.claude-haiku-5-5": { entrada: 0.1, saida: 0.5 }, "anthropic.claude-sonnet-5-5": { entrada: 2, saida: 10 } },
    cotaTokensDia: 1_000_000,
    relogio: () => HOJE,
  });
  const notificador = new NotificadorMemoria();
  const executor = new Executor(tabelas.agenda, tabelas.operacoes, notificador);
  const fluxo = new FluxoAprovacaoMemoria(executor);
  const operacoes = new Operacoes(tabelas.operacoes, fluxo, () => HOJE);
  const memoria = new Memoria(tabelas.memoria, () => HOJE);
  const agenda = new Agenda(tabelas.agenda);
  const arquivos = o.anexos ?? {};
  const grafo = construirGrafo({
    gateway,
    memoria,
    agenda,
    operacoes,
    executor,
    anexos: {
      async ler(chave) {
        const corpo = arquivos[chave];
        if (corpo === undefined) throw new Error("NoSuchKey");
        return { corpo, tipo: "text/plain; charset=utf-8", bytes: Buffer.byteLength(corpo) };
      },
    },
    metricas,
    canario: CANARIO,
    relogio: () => HOJE,
    gerarNonce: () => "nonce1",
  });
  return {
    tabelas,
    metricas,
    estadoGw,
    chamadas,
    notificador,
    fluxo,
    operacoes,
    memoria,
    agenda,
    turno: (e: Entrada) => executarTurno(grafo, e),
  };
}
