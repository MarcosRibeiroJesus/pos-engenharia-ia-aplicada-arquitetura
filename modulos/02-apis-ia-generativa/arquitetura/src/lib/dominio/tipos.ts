import type { Especialidade, Periodo } from "./catalogo.js";

export interface Slot {
  slotId: string;
  especialidade: Especialidade;
  data: string; // AAAA-MM-DD
  hora: string; // HH:MM
  profissional: string;
  status: "livre" | "reservado";
  consultaId?: string;
}

export interface Consulta {
  consultaId: string;
  usuarioId: string;
  slotId: string;
  especialidade: Especialidade;
  data: string;
  hora: string;
  profissional: string;
  status: "confirmada" | "cancelada";
  versao: number;
}

export type TipoIntencao = "agendar" | "cancelar" | "consultar" | "outra";
export type OrigemEvidencia = "mensagem" | "anexo" | "memoria";

export interface Intencao {
  intencao: TipoIntencao;
  especialidade: Especialidade | null;
  data: string | null;
  horario: string | null;
  periodo: Periodo | null;
  consulta_id: string | null;
  preferencias: Array<{ chave: string; valor: string; origem: OrigemEvidencia }>;
  confianca: number;
  ambiguidades: string[];
  evidencias: Array<{ campo: string; origem: OrigemEvidencia; trecho: string }>;
}

/** Fato fixado: registrado pelo código a partir de um resultado real, nunca pelo modelo (tarefa 5.1). */
export interface Fato {
  tipo: "consulta_agendada" | "consulta_cancelada" | "cancelamento_pendente" | "cancelamento_rejeitado";
  referencia: string;
  descricao: string;
  em: string;
}
