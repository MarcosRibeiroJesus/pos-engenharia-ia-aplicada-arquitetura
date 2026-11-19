// Catálogo sintético da clínica do lab. Nenhum dado real.
export const ESPECIALIDADES = ["clinica_geral", "cardiologia", "dermatologia", "pediatria", "ortopedia"] as const;
export const PERIODOS = ["manha", "tarde", "noite"] as const;
export type Especialidade = (typeof ESPECIALIDADES)[number];
export type Periodo = (typeof PERIODOS)[number];

export function periodoDoHorario(hhmm: string): Periodo {
  const h = Number(hhmm.slice(0, 2));
  return h < 12 ? "manha" : h < 18 ? "tarde" : "noite";
}

export const ROTULO_ESPECIALIDADE: Record<Especialidade, string> = {
  clinica_geral: "clínica geral",
  cardiologia: "cardiologia",
  dermatologia: "dermatologia",
  pediatria: "pediatria",
  ortopedia: "ortopedia",
};
