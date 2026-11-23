// Sistema inteiro em memória, com o gateway real e as respostas gravadas: usado pelos testes,
// pelo gate de avaliação e pelo laboratório local com Langfuse. Mesma montagem da Lambda,
// trocando só os adaptadores de infraestrutura.
import { Agenda } from "../dominio/agenda.js";
import { Operacoes } from "../dominio/operacoes.js";
import { Executor } from "../executor/executor.js";
import { EstadoGatewayMemoria } from "../gateway/estado.js";
import { ProvedorGravado } from "../gateway/provedor-gravado.js";
import { GatewayLlm } from "../gateway/roteador.js";
import type { ProvedorLlm } from "../gateway/tipos.js";
import { construirGrafo, executarTurno, type Entrada } from "../grafo/grafo.js";
import { MetricasMemoria } from "../infra/metricas.js";
import { TabelaMemoria, type Item } from "../infra/tabela.js";
import { Memoria } from "../memoria/memoria.js";
import { RastreadorNulo, type Rastreador } from "../observabilidade/rastreador.js";
import { FluxoAprovacaoMemoria, NotificadorMemoria } from "./fakes.js";

export const CADEIA_LAB = ["anthropic.claude-haiku-5-5", "anthropic.claude-sonnet-5-5"];
export const PRECOS_LAB = { "anthropic.claude-haiku-5-5": { entrada: 0.1, saida: 0.5 }, "anthropic.claude-sonnet-5-5": { entrada: 2, saida: 10 } };

export interface OpcoesSistema {
  itensAgenda: Item[];
  dirFixtures?: string;
  provedor?: ProvedorLlm;
  anexos?: Record<string, string>;
  rastreador?: Rastreador;
  agora: Date;
  canario: string;
}

export async function montarSistemaEmMemoria(o: OpcoesSistema) {
  const tabelas = { agenda: new TabelaMemoria(), memoria: new TabelaMemoria(), gateway: new TabelaMemoria(), operacoes: new TabelaMemoria() };
  for (const item of o.itensAgenda) await tabelas.agenda.gravar(item);
  const metricas = new MetricasMemoria();
  const estadoGw = new EstadoGatewayMemoria();
  const rastreador = o.rastreador ?? new RastreadorNulo();
  const provedorBase = o.provedor ?? ProvedorGravado.deDiretorio(o.dirFixtures!);
  const chamadas: string[] = [];
  const provedor: ProvedorLlm = {
    nome: provedorBase.nome,
    chamar: (m, r, t) => {
      chamadas.push(`${t}:${m}`);
      return provedorBase.chamar(m, r, t);
    },
  };
  const relogio = () => o.agora;
  const gateway = new GatewayLlm({ provedor, estado: estadoGw, metricas, cadeia: CADEIA_LAB, precos: PRECOS_LAB, cotaTokensDia: 1_000_000, relogio, rastreador });
  const notificador = new NotificadorMemoria();
  const executor = new Executor(tabelas.agenda, tabelas.operacoes, notificador);
  const fluxo = new FluxoAprovacaoMemoria(executor);
  const operacoes = new Operacoes(tabelas.operacoes, fluxo, relogio);
  const memoria = new Memoria(tabelas.memoria, relogio);
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
    canario: o.canario,
    relogio,
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
    rastreador,
    turno: (e: Entrada) => executarTurno(grafo, e, rastreador),
  };
}
