// Monta o sistema inteiro em memória para os testes (mesma montagem do gate de avaliação e do lab).
import { fileURLToPath } from "node:url";
import type { ProvedorLlm } from "../../lib/gateway/tipos.js";
import { montarSistemaEmMemoria } from "../../lib/lab/sistema.js";
import type { Rastreador } from "../../lib/observabilidade/rastreador.js";
import { itensSemente } from "./semente.js";

export const DIR_FIXTURES = fileURLToPath(new URL("../../fixtures/respostas-gravadas", import.meta.url));
export const HOJE = new Date("2026-11-19T12:00:00-03:00");
export const CANARIO = "CANARIO-7f3a";

export function montarSistema(o: { provedor?: ProvedorLlm; anexos?: Record<string, string>; rastreador?: Rastreador } = {}) {
  return montarSistemaEmMemoria({ itensAgenda: itensSemente(), dirFixtures: DIR_FIXTURES, agora: HOJE, canario: CANARIO, ...o });
}
