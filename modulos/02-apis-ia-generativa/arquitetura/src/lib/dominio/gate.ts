// Gate determinístico (tarefa 1.4). Recebe a intenção que o modelo PROPÔS e decide, só com
// código e com o estado real da agenda, o que pode acontecer. O usuário vem do contexto
// autenticado do canal, nunca da saída do modelo; por isso um texto injetado não consegue
// agir sobre a consulta de outra pessoa.
import type { Agenda } from "./agenda.js";
import { instante } from "./agenda.js";
import { periodoDoHorario } from "./catalogo.js";
import type { Consulta, Intencao, Slot } from "./tipos.js";

export const CONFIANCA_MINIMA = 0.6;
export const ANTECEDENCIA_MINIMA_MS = 2 * 3_600_000;

export type Decisao =
  | { tipo: "executar_agendamento"; slot: Slot }
  | { tipo: "solicitar_aprovacao_cancelamento"; consulta: Consulta }
  | { tipo: "informar"; consultas: Consulta[] }
  | {
      tipo: "perguntar";
      motivo: "faltam_dados" | "escolher_horario" | "horario_indisponivel" | "sem_vaga_no_dia" | "qual_consulta" | "baixa_confianca" | "confirmar_dado_de_anexo";
      faltando?: string[];
      opcoes?: Array<Slot | Consulta>;
      ambiguidades?: string[];
    }
  | { tipo: "recusar"; motivo: "consulta_nao_encontrada" | "consulta_duplicada" | "muito_perto" | "nenhuma_consulta" }
  | { tipo: "fora_de_escopo" };

export async function avaliar(i: Intencao, usuarioId: string, agenda: Agenda, agora: Date): Promise<Decisao> {
  if (i.intencao === "outra") return { tipo: "fora_de_escopo" };
  if (i.intencao === "consultar") return { tipo: "informar", consultas: await futuras(agenda, usuarioId, agora) };
  if (i.confianca < CONFIANCA_MINIMA || i.ambiguidades.length > 0) {
    // Escalonamento: na dúvida, pergunta em vez de agir (tarefa 5.2).
    const base = { tipo: "perguntar" as const, motivo: "baixa_confianca" as const, ambiguidades: i.ambiguidades };
    if (i.intencao === "cancelar") return { ...base, opcoes: filtrar(await futuras(agenda, usuarioId, agora), i) };
    return base;
  }
  const d = i.intencao === "agendar" ? await agendar(i, usuarioId, agenda, agora) : await cancelar(i, usuarioId, agenda, agora);
  // Injeção indireta: conteúdo de anexo pode informar, mas não pode sozinho disparar ação
  // que muda estado. O campo decisivo precisa vir da mensagem do paciente ou da memória.
  if (d.tipo === "executar_agendamento" && !temEvidenciaDireta(i, ["data", "horario"])) {
    return { tipo: "perguntar", motivo: "confirmar_dado_de_anexo", opcoes: [d.slot] };
  }
  if (d.tipo === "solicitar_aprovacao_cancelamento" && !temEvidenciaDireta(i, ["consulta_id", "data"])) {
    return { tipo: "perguntar", motivo: "confirmar_dado_de_anexo", opcoes: [d.consulta] };
  }
  return d;
}

function temEvidenciaDireta(i: Intencao, campos: string[]) {
  return i.evidencias.some((e) => campos.includes(e.campo) && (e.origem === "mensagem" || e.origem === "memoria"));
}

async function futuras(agenda: Agenda, usuarioId: string, agora: Date) {
  return (await agenda.consultasDoUsuario(usuarioId)).filter((c) => c.status === "confirmada" && instante(c.data, c.hora) > agora.getTime());
}

async function agendar(i: Intencao, usuarioId: string, agenda: Agenda, agora: Date): Promise<Decisao> {
  const faltando = [!i.especialidade && "especialidade", !i.data && "data"].filter(Boolean) as string[];
  if (faltando.length) {
    const opcoes = i.especialidade ? await agenda.proximosLivres(i.especialidade, agora, 3) : undefined;
    return { tipo: "perguntar", motivo: "faltam_dados", faltando, ...(opcoes ? { opcoes } : {}) };
  }
  const esp = i.especialidade!;
  const data = i.data!;
  const livres = (await agenda.slotsDoDia(esp, data)).filter((s) => s.status === "livre" && instante(s.data, s.hora) > agora.getTime());
  const noPeriodo = i.periodo ? livres.filter((s) => periodoDoHorario(s.hora) === i.periodo) : livres;

  let escolhido: Slot | undefined;
  if (i.horario) {
    escolhido = livres.find((s) => s.hora === i.horario);
    if (!escolhido) return { tipo: "perguntar", motivo: "horario_indisponivel", opcoes: (noPeriodo.length ? noPeriodo : livres).slice(0, 3) };
  } else if (noPeriodo.length === 1) {
    escolhido = noPeriodo[0];
  } else if (noPeriodo.length > 1) {
    return { tipo: "perguntar", motivo: "escolher_horario", opcoes: noPeriodo.slice(0, 4) };
  } else {
    return { tipo: "perguntar", motivo: "sem_vaga_no_dia", opcoes: await agenda.proximosLivres(esp, agora, 3) };
  }

  const duplicada = (await futuras(agenda, usuarioId, agora)).some((c) => c.especialidade === esp && c.data === data);
  if (duplicada) return { tipo: "recusar", motivo: "consulta_duplicada" };
  return { tipo: "executar_agendamento", slot: escolhido! };
}

function filtrar(consultas: Consulta[], i: Intencao) {
  return consultas.filter(
    (c) => (!i.data || c.data === i.data) && (!i.especialidade || c.especialidade === i.especialidade) && (!i.horario || c.hora === i.horario),
  );
}

async function cancelar(i: Intencao, usuarioId: string, agenda: Agenda, agora: Date): Promise<Decisao> {
  const minhas = await futuras(agenda, usuarioId, agora);
  let alvo: Consulta | undefined;
  if (i.consulta_id) {
    // Busca só entre as do próprio paciente: id alheio e id inexistente dão a mesma resposta.
    alvo = minhas.find((c) => c.consultaId === i.consulta_id);
    if (!alvo) return { tipo: "recusar", motivo: "consulta_nao_encontrada" };
  } else {
    const candidatas = filtrar(minhas, i);
    if (candidatas.length === 0) return { tipo: "recusar", motivo: minhas.length ? "consulta_nao_encontrada" : "nenhuma_consulta" };
    if (candidatas.length > 1) return { tipo: "perguntar", motivo: "qual_consulta", opcoes: candidatas };
    alvo = candidatas[0];
  }
  if (instante(alvo!.data, alvo!.hora) - agora.getTime() < ANTECEDENCIA_MINIMA_MS) return { tipo: "recusar", motivo: "muito_perto" };
  return { tipo: "solicitar_aprovacao_cancelamento", consulta: alvo! };
}
