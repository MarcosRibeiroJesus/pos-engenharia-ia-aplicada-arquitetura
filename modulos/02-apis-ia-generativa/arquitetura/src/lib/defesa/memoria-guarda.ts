// Guarda da memória: o que o modelo sugere guardar como preferência passa por allowlist
// de chave e valor e só vale se veio da mensagem do próprio usuário. Assim um anexo
// ou um texto injetado não envenena a memória de longo prazo.
import { ESPECIALIDADES, PERIODOS } from "../dominio/catalogo.js";

export interface Preferencia {
  chave: string;
  valor: string;
  origem: "mensagem" | "anexo" | "memoria";
}

const PERMITIDAS: Record<string, readonly string[]> = {
  periodo_preferido: PERIODOS,
  especialidade_frequente: ESPECIALIDADES,
};

export function filtrarPreferencias(prefs: Preferencia[]) {
  const aceitas: Preferencia[] = [];
  const rejeitadas: Array<Preferencia & { motivo: string }> = [];
  for (const p of prefs) {
    const valores = PERMITIDAS[p.chave];
    if (!valores) rejeitadas.push({ ...p, motivo: "chave_nao_permitida" });
    else if (!valores.includes(p.valor)) rejeitadas.push({ ...p, motivo: "valor_nao_permitido" });
    else if (p.origem !== "mensagem") rejeitadas.push({ ...p, motivo: "origem_nao_confiavel" });
    else aceitas.push(p);
  }
  return { aceitas, rejeitadas };
}
