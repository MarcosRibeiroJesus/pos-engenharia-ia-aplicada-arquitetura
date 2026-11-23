// Respostas ao paciente por template, montadas só com dados da agenda e do resultado real.
// O texto livre do modelo nunca chega ao paciente: isso fecha o canal de saída para injeção
// e garante que o assistente não diga que fez algo que não fez (proveniência, tarefa 5.6).
import { ROTULO_ESPECIALIDADE } from "./catalogo.js";
import type { Decisao } from "./gate.js";
import type { Consulta, Slot } from "./tipos.js";

const dataBr = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const slotTxt = (s: Slot) => `${dataBr(s.data)} às ${s.hora} (${s.profissional})`;
export const consultaTxt = (c: Consulta) => `${ROTULO_ESPECIALIDADE[c.especialidade]} em ${dataBr(c.data)} às ${c.hora}, com ${c.profissional} [${c.consultaId}]`;

export type TipoResposta = "confirmacao" | "pendente_aprovacao" | "pergunta" | "informacao" | "recusa" | "fora_de_escopo" | "bloqueio" | "indisponivel" | "erro";

export interface Resposta {
  tipo: TipoResposta;
  texto: string;
  opcoes?: string[];
}

export function responderDecisao(d: Decisao): Resposta {
  switch (d.tipo) {
    case "informar":
      return d.consultas.length
        ? { tipo: "informacao", texto: `Suas próximas consultas: ${d.consultas.map(consultaTxt).join("; ")}.` }
        : { tipo: "informacao", texto: "Você não tem consultas futuras." };
    case "perguntar": {
      const opcoes = (d.opcoes ?? []).map((o) => ("consultaId" in o && "usuarioId" in o ? consultaTxt(o as Consulta) : slotTxt(o as Slot)));
      const base: Record<typeof d.motivo, string> = {
        faltam_dados: `Para seguir, preciso de: ${(d.faltando ?? []).join(" e ")}.`,
        escolher_horario: "Tenho estes horários. Qual prefere?",
        horario_indisponivel: "Esse horário não está livre. Posso oferecer estes:",
        sem_vaga_no_dia: "Não há vaga nesse dia. Os próximos horários livres são:",
        qual_consulta: "Encontrei mais de uma consulta. Qual delas?",
        baixa_confianca: "Não tenho certeza do que você quer. Pode confirmar?",
        confirmar_dado_de_anexo: "Encontrei isto no anexo. Confirme na sua mensagem se é o que você quer:",
      };
      return { tipo: "pergunta", texto: base[d.motivo], ...(opcoes.length ? { opcoes } : {}) };
    }
    case "recusar": {
      const t: Record<typeof d.motivo, string> = {
        consulta_nao_encontrada: "Não encontrei essa consulta entre as suas.",
        nenhuma_consulta: "Você não tem consultas futuras para cancelar.",
        consulta_duplicada: "Você já tem consulta nessa especialidade nesse dia.",
        muito_perto: "Faltam menos de 2 horas para a consulta. Para cancelar, fale com a recepção pelo telefone da clínica.",
      };
      return { tipo: "recusa", texto: t[d.motivo] };
    }
    case "fora_de_escopo":
      return { tipo: "fora_de_escopo", texto: "Posso ajudar a marcar, cancelar ou consultar suas consultas." };
    default:
      return { tipo: "erro", texto: "Não consegui concluir. Tente de novo." };
  }
}

export const respostaAgendada = (c: Consulta): Resposta => ({ tipo: "confirmacao", texto: `Consulta agendada: ${consultaTxt(c)}.` });
export const respostaSlotOcupado = (): Resposta => ({ tipo: "pergunta", texto: "Esse horário acabou de ser ocupado. Quer ver outros?" });
export const respostaPendente = (c: Consulta): Resposta => ({
  tipo: "pendente_aprovacao",
  texto: `Pedido de cancelamento registrado para ${consultaTxt(c)}. A recepção confirma em breve e você recebe o aviso.`,
});
export const respostaBloqueio = (): Resposta => ({ tipo: "bloqueio", texto: "Não posso seguir com esse pedido. Posso ajudar a marcar, cancelar ou consultar suas consultas." });
export const respostaIndisponivel = (): Resposta => ({ tipo: "indisponivel", texto: "Estou com instabilidade agora. Um atendente da recepção vai continuar seu atendimento." });
export const respostaNaoEntendi = (): Resposta => ({ tipo: "pergunta", texto: "Não consegui entender o pedido. Pode reformular?" });
