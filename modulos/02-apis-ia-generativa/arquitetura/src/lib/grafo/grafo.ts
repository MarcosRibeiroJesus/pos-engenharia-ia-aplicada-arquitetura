// Grafo da conversa em LangGraph.js, como na aula: estado tipado, nós, arestas condicionais e
// nó de fallback. Roda dentro da Lambda (ADR-0002): um turno dura segundos e precisa ser
// síncrono; a única espera longa (aprovação humana) sai do grafo e vai para o Step Functions.
//
//   START → carregar_contexto → defender_entrada ─┬─ bloqueado → bloquear ─────────────┐
//                                                 └─ extrair_intencao ─┬─ erro → fallback ┤
//                                                                      └─ decidir ─┬─ agendar ────────────┤
//                                                                                  ├─ solicitar_aprovacao ┤
//                                                                                  └─ responder ──────────┤
//                                                                          atualizar_memoria ← ───────────┘ → END
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { randomUUID } from "node:crypto";
import type { Agenda } from "../dominio/agenda.js";
import { avaliar, type Decisao } from "../dominio/gate.js";
import type { Operacoes } from "../dominio/operacoes.js";
import {
  consultaTxt,
  respostaAgendada,
  respostaBloqueio,
  respostaIndisponivel,
  respostaNaoEntendi,
  respostaPendente,
  respostaSlotOcupado,
  responderDecisao,
  type Resposta,
} from "../dominio/respostas.js";
import type { Consulta, Intencao, Slot } from "../dominio/tipos.js";
import { lerAnexoSeguro, type LeitorAnexos, type ResultadoAnexo } from "../defesa/anexos.js";
import { detectarInjecao } from "../defesa/detector.js";
import { filtrarPreferencias } from "../defesa/memoria-guarda.js";
import { normalizar } from "../defesa/normalizacao.js";
import type { Metricas } from "../infra/metricas.js";
import { extrairIntencao, type ClienteGateway, type ResultadoExtracao } from "../intencao/extrator.js";
import type { ContextoMemoria, Memoria } from "../memoria/memoria.js";
import { resumirHistorico } from "../memoria/resumidor.js";
import type { ResultadoAgendar } from "../executor/executor.js";

export interface PortaExecutor {
  agendar(p: { usuarioId: string; slot: Slot; idempotencia: string }): Promise<ResultadoAgendar>;
}

export interface Dependencias {
  gateway: ClienteGateway;
  memoria: Memoria;
  agenda: Agenda;
  operacoes: Operacoes;
  executor: PortaExecutor;
  anexos: LeitorAnexos;
  metricas: Metricas;
  canario: string;
  relogio?: () => Date;
  gerarNonce?: () => string;
}

export interface Entrada {
  usuarioId: string;
  sessaoId: string;
  texto: string;
  anexos?: string[];
}

const Estado = Annotation.Root({
  entrada: Annotation<Entrada>(),
  texto: Annotation<string>(),
  bloqueado: Annotation<boolean>(),
  sinais: Annotation<string[]>(),
  anexosLidos: Annotation<ResultadoAnexo[]>(),
  contexto: Annotation<ContextoMemoria>(),
  extracao: Annotation<ResultadoExtracao | undefined>(),
  intencao: Annotation<Intencao | undefined>(),
  decisao: Annotation<Decisao | undefined>(),
  resposta: Annotation<Resposta>(),
  acaoId: Annotation<string | undefined>(),
  consultaId: Annotation<string | undefined>(),
  // Trilha de auditoria do turno: cada nó acrescenta o que decidiu.
  eventos: Annotation<string[]>({ reducer: (a, b) => a.concat(b), default: () => [] }),
});

export type EstadoTurno = typeof Estado.State;

export function construirGrafo(d: Dependencias) {
  const relogio = d.relogio ?? (() => new Date());
  const nonce = d.gerarNonce ?? (() => randomUUID().slice(0, 8));

  const carregarContexto = async (s: EstadoTurno) => ({
    contexto: await d.memoria.carregar(s.entrada.usuarioId, s.entrada.sessaoId),
    eventos: ["contexto_carregado"],
  });

  const defenderEntrada = async (s: EstadoTurno) => {
    const { texto, alteracoes } = normalizar(s.entrada.texto);
    const det = detectarInjecao(texto);
    const anexosLidos = await Promise.all((s.entrada.anexos ?? []).map((c) => lerAnexoSeguro(d.anexos, s.entrada.usuarioId, c)));
    const eventos = [`deteccao:${det.nivel}`, ...alteracoes.map((a) => `normalizado:${a}`)];
    for (const a of anexosLidos) eventos.push(a.ok ? (a.quarentena ? `anexo_quarentena:${a.caminho}` : `anexo_lido:${a.caminho}`) : `anexo_recusado:${a.motivo}`);
    const quarentenas = anexosLidos.filter((a) => a.ok && a.quarentena).length;
    if (det.nivel === "alto" || quarentenas) d.metricas.emitir("InjecaoBloqueada", (det.nivel === "alto" ? 1 : 0) + quarentenas, "Count");
    return { texto, bloqueado: det.nivel === "alto", sinais: det.sinais, anexosLidos, eventos };
  };

  const bloquear = async () => ({ resposta: respostaBloqueio(), eventos: ["bloqueado_na_entrada"] });

  const extrair = async (s: EstadoTurno) => {
    const minhas = await d.agenda.consultasDoUsuario(s.entrada.usuarioId);
    const anexos = s.anexosLidos.filter((a): a is Extract<ResultadoAnexo, { ok: true }> => a.ok && !a.quarentena).map((a) => ({ caminho: a.caminho, conteudo: a.conteudo }));
    const consultasConhecidas = minhas.filter((c) => c.status === "confirmada").map((c) => ({ consultaId: c.consultaId, descricao: consultaTxt(c) }));
    const r = await extrairIntencao(d.gateway, {
      hoje: hojeLocal(relogio()),
      mensagem: s.texto,
      anexos,
      memoria: { ...s.contexto, candidatos: s.contexto.candidatos.length ? s.contexto.candidatos : consultasConhecidas },
      idsConhecidos: [...new Set([...minhas.map((c) => c.consultaId), ...s.contexto.candidatos.map((c) => c.consultaId)])],
      canario: d.canario,
      nonce: nonce(),
    });
    return r.ok
      ? { extracao: r, intencao: r.intencao, eventos: [`intencao:${r.intencao.intencao}`, `tentativas:${r.tentativas}`, `modelo:${r.modelo}`] }
      : { extracao: r, eventos: [`extracao_falhou:${r.motivo}`, `tentativas:${r.tentativas}`] };
  };

  const decidir = async (s: EstadoTurno) => {
    const decisao = await avaliar(s.intencao!, s.entrada.usuarioId, d.agenda, relogio());
    return { decisao, eventos: [`gate:${decisao.tipo}${"motivo" in decisao ? `:${decisao.motivo}` : ""}`] };
  };

  const agendar = async (s: EstadoTurno) => {
    const slot = (s.decisao as Extract<Decisao, { tipo: "executar_agendamento" }>).slot;
    const r = await d.executor.agendar({ usuarioId: s.entrada.usuarioId, slot, idempotencia: `${s.entrada.sessaoId}#${slot.slotId}` });
    if (r.status === "slot_ocupado") return { resposta: respostaSlotOcupado(), eventos: ["agendamento:slot_ocupado"] };
    await d.memoria.fixarFato(s.entrada.usuarioId, { tipo: "consulta_agendada", referencia: r.consulta.consultaId, descricao: consultaTxt(r.consulta), em: relogio().toISOString() });
    return { resposta: respostaAgendada(r.consulta), consultaId: r.consulta.consultaId, eventos: [`agendamento:${r.status}`] };
  };

  const solicitarAprovacao = async (s: EstadoTurno) => {
    const c = (s.decisao as Extract<Decisao, { tipo: "solicitar_aprovacao_cancelamento" }>).consulta;
    const acao = await d.operacoes.solicitarCancelamento(s.entrada.usuarioId, c);
    await d.memoria.fixarFato(s.entrada.usuarioId, { tipo: "cancelamento_pendente", referencia: c.consultaId, descricao: `aguardando aprovação (${acao.acaoId})`, em: relogio().toISOString() });
    return { resposta: respostaPendente(c), acaoId: acao.acaoId, consultaId: c.consultaId, eventos: [`aprovacao_solicitada:${acao.acaoId}`] };
  };

  const responder = async (s: EstadoTurno) => {
    const dec = s.decisao!;
    if (dec.tipo === "perguntar" && dec.opcoes?.some((o) => "usuarioId" in o)) {
      const lista = (dec.opcoes as Consulta[]).map((c) => ({ consultaId: c.consultaId, descricao: consultaTxt(c) }));
      await d.memoria.salvarCandidatos(s.entrada.usuarioId, s.entrada.sessaoId, lista);
    }
    return { resposta: responderDecisao(dec), eventos: ["respondido"] };
  };

  // Nó de fallback: degrada de forma controlada conforme o erro que veio propagado (5.3).
  const fallback = async (s: EstadoTurno) => {
    const e = s.extracao as Extract<ResultadoExtracao, { ok: false }>;
    if (e.motivo === "saida_insegura") {
      d.metricas.emitir("InjecaoBloqueada", 1, "Count");
      return { resposta: respostaBloqueio(), eventos: ["fallback:saida_insegura"] };
    }
    if (e.motivo === "llm_indisponivel") {
      // Handoff para humano com o contexto do turno (tarefa 1.4 e 5.2).
      d.metricas.emitir("HandoffHumano", 1, "Count");
      return { resposta: respostaIndisponivel(), eventos: [`fallback:handoff_humano:${e.categoria}`] };
    }
    return { resposta: respostaNaoEntendi(), eventos: ["fallback:saida_invalida"] };
  };

  const atualizarMemoria = async (s: EstadoTurno) => {
    const { usuarioId, sessaoId } = s.entrada;
    // Mensagem bloqueada não entra na memória: senão o ataque voltaria no próximo turno.
    await d.memoria.registrarTurno(usuarioId, sessaoId, "paciente", s.bloqueado ? "[mensagem bloqueada pela defesa]" : s.texto);
    await d.memoria.registrarTurno(usuarioId, sessaoId, "assistente", s.resposta.texto);
    const eventos: string[] = [];
    if (s.intencao?.preferencias.length) {
      const { aceitas, rejeitadas } = filtrarPreferencias(s.intencao.preferencias);
      if (aceitas.length) await d.memoria.salvarPreferencias(usuarioId, sessaoId, aceitas, s.texto);
      eventos.push(...aceitas.map((p) => `preferencia_salva:${p.chave}`), ...rejeitadas.map((p) => `preferencia_rejeitada:${p.motivo}`));
    }
    if (await d.memoria.precisaResumir(usuarioId, sessaoId)) {
      const turnos = await d.memoria.turnosParaResumir(usuarioId, sessaoId);
      const resumo = await resumirHistorico(d.gateway, { resumoAnterior: s.contexto.resumo, turnos, nonce: nonce() });
      if (resumo) {
        await d.memoria.aplicarResumo(usuarioId, sessaoId, resumo);
        eventos.push("memoria_resumida");
      } else eventos.push("resumo_adiado");
    }
    return { eventos: ["memoria_atualizada", ...eventos] };
  };

  return new StateGraph(Estado)
    .addNode("carregar_contexto", carregarContexto)
    .addNode("defender_entrada", defenderEntrada)
    .addNode("bloquear", bloquear)
    .addNode("extrair_intencao", extrair)
    .addNode("decidir", decidir)
    .addNode("agendar", agendar)
    .addNode("solicitar_aprovacao", solicitarAprovacao)
    .addNode("responder", responder)
    .addNode("fallback", fallback)
    .addNode("atualizar_memoria", atualizarMemoria)
    .addEdge(START, "carregar_contexto")
    .addEdge("carregar_contexto", "defender_entrada")
    .addConditionalEdges("defender_entrada", rotaEntrada, ["bloquear", "extrair_intencao"])
    .addConditionalEdges("extrair_intencao", rotaExtracao, ["decidir", "fallback"])
    .addConditionalEdges("decidir", rotaDecisao, ["agendar", "solicitar_aprovacao", "responder"])
    .addEdge("bloquear", "atualizar_memoria")
    .addEdge("fallback", "atualizar_memoria")
    .addEdge("agendar", "atualizar_memoria")
    .addEdge("solicitar_aprovacao", "atualizar_memoria")
    .addEdge("responder", "atualizar_memoria")
    .addEdge("atualizar_memoria", END)
    .compile();
}

// Arestas condicionais: funções puras, testadas isoladamente.
export const rotaEntrada = (s: Pick<EstadoTurno, "bloqueado">) => (s.bloqueado ? "bloquear" : "extrair_intencao");
export const rotaExtracao = (s: Pick<EstadoTurno, "extracao">) => (s.extracao?.ok ? "decidir" : "fallback");
export const rotaDecisao = (s: Pick<EstadoTurno, "decisao">) =>
  s.decisao?.tipo === "executar_agendamento" ? "agendar" : s.decisao?.tipo === "solicitar_aprovacao_cancelamento" ? "solicitar_aprovacao" : "responder";

export function hojeLocal(agora: Date) {
  return new Date(agora.getTime() - 3 * 3_600_000).toISOString().slice(0, 10);
}

export async function executarTurno(grafo: ReturnType<typeof construirGrafo>, entrada: Entrada) {
  const final = (await grafo.invoke({ entrada })) as EstadoTurno;
  return {
    resposta: final.resposta,
    eventos: final.eventos,
    intencao: final.intencao,
    acaoId: final.acaoId,
    consultaId: final.consultaId,
  };
}
