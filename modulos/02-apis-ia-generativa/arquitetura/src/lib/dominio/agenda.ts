// Leitura da agenda (slots e consultas) sobre a porta de tabela.
// Modelo: SLOT#<especialidade>#<data> / <hora>#<slotId>; CONSULTA#<id> / META (índice por_usuario).
import type { Item, TabelaChaveValor } from "../infra/tabela.js";
import type { Especialidade } from "./catalogo.js";
import type { Consulta, Slot } from "./tipos.js";

export const FUSO = "-03:00"; // clínica sintética em horário de Brasília

export function instante(data: string, hora: string): number {
  return Date.parse(`${data}T${hora}:00${FUSO}`);
}

export function paraSlot(i: Item): Slot {
  return {
    slotId: String(i.slot_id),
    especialidade: i.especialidade as Especialidade,
    data: String(i.data),
    hora: String(i.hora),
    profissional: String(i.profissional),
    status: i.status as Slot["status"],
    ...(i.consulta_id ? { consultaId: String(i.consulta_id) } : {}),
  };
}

export function paraConsulta(i: Item): Consulta {
  return {
    consultaId: String(i.consulta_id),
    usuarioId: String(i.usuario_id),
    slotId: String(i.slot_id),
    especialidade: i.especialidade as Especialidade,
    data: String(i.data),
    hora: String(i.hora),
    profissional: String(i.profissional),
    status: i.status as Consulta["status"],
    versao: Number(i.versao),
  };
}

export const chaveSlot = (s: Pick<Slot, "especialidade" | "data" | "hora" | "slotId">) => ({ pk: `SLOT#${s.especialidade}#${s.data}`, sk: `${s.hora}#${s.slotId}` });

export class Agenda {
  constructor(private readonly t: TabelaChaveValor) {}

  async slotsDoDia(especialidade: Especialidade, data: string): Promise<Slot[]> {
    return (await this.t.consultar(`SLOT#${especialidade}#${data}`)).map(paraSlot);
  }

  async proximosLivres(especialidade: Especialidade, aPartirDe: Date, n: number, dias = 14): Promise<Slot[]> {
    const saida: Slot[] = [];
    for (let d = 0; d < dias && saida.length < n; d++) {
      const data = new Date(aPartirDe.getTime() + d * 86_400_000 - 3 * 3_600_000).toISOString().slice(0, 10);
      for (const s of await this.slotsDoDia(especialidade, data)) {
        if (s.status === "livre" && instante(s.data, s.hora) > aPartirDe.getTime()) saida.push(s);
        if (saida.length >= n) break;
      }
    }
    return saida;
  }

  async consultasDoUsuario(usuarioId: string): Promise<Consulta[]> {
    const itens = await this.t.consultarIndice("por_usuario", "usuario_id", usuarioId);
    return itens
      .filter((i) => i.pk.startsWith("CONSULTA#"))
      .map(paraConsulta)
      .sort((a, b) => instante(a.data, a.hora) - instante(b.data, b.hora));
  }

  async consulta(id: string): Promise<Consulta | undefined> {
    const i = await this.t.obter(`CONSULTA#${id}`, "META");
    return i ? paraConsulta(i) : undefined;
  }
}
