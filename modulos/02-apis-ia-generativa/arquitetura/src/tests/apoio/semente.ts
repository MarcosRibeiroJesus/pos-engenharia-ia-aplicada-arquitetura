// Agenda sintética dos testes (a mesma da integração, em fixtures/agenda-sintetica.json).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { TabelaChaveValor, Item } from "../../lib/infra/tabela.js";

const arquivo = fileURLToPath(new URL("../../fixtures/agenda-sintetica.json", import.meta.url));

export function itensSemente(): Item[] {
  return JSON.parse(readFileSync(arquivo, "utf8")) as Item[];
}

export async function semearAgenda(t: TabelaChaveValor) {
  for (const item of itensSemente()) await t.gravar(item);
}

export const CONSULTAS_SEMENTE = {
  bruno_cardio: "C-B7CARD01",
  carla_cardio: "C-C1CARD02",
  carla_derma: "C-C2DERM03",
};
