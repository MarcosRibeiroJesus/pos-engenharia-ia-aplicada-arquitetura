// Gera a agenda sintética (fixtures/agenda-sintetica.json): slots de 26 e 27/11/2026 em
// três especialidades e três consultas confirmadas de pacientes fictícios.
// Uso: node scripts/gerar-agenda.mjs
import { writeFileSync } from "node:fs";

const dias = ["2026-11-26", "2026-11-27"];
const horas = ["08:00", "09:00", "10:00", "11:00", "14:00", "15:00", "16:00"];
const profissionais = { cardiologia: "Dra. Helena Prado", dermatologia: "Dr. Caio Nunes", clinica_geral: "Dra. Lia Moraes" };
const consultas = {
  "cardiologia|2026-11-26|09:00": { id: "C-B7CARD01", usuario: "u-bruno" },
  "cardiologia|2026-11-26|11:00": { id: "C-C1CARD02", usuario: "u-carla" },
  "dermatologia|2026-11-26|15:00": { id: "C-C2DERM03", usuario: "u-carla" },
};

const itens = [];
for (const [esp, prof] of Object.entries(profissionais)) {
  for (const data of dias) {
    for (const hora of horas) {
      const slotId = `S-${esp.slice(0, 4).toUpperCase()}-${data.slice(5).replace("-", "")}-${hora.replace(":", "")}`;
      const c = consultas[`${esp}|${data}|${hora}`];
      itens.push({
        pk: `SLOT#${esp}#${data}`,
        sk: `${hora}#${slotId}`,
        slot_id: slotId,
        especialidade: esp,
        data,
        hora,
        profissional: prof,
        status: c ? "reservado" : "livre",
        ...(c ? { consulta_id: c.id } : {}),
      });
      if (c) {
        itens.push({
          pk: `CONSULTA#${c.id}`,
          sk: "META",
          consulta_id: c.id,
          usuario_id: c.usuario,
          slot_id: slotId,
          slot_pk: `SLOT#${esp}#${data}`,
          slot_sk: `${hora}#${slotId}`,
          especialidade: esp,
          data,
          hora,
          profissional: prof,
          status: "confirmada",
          versao: 1,
        });
      }
    }
  }
}
writeFileSync(new URL("../fixtures/agenda-sintetica.json", import.meta.url), `${JSON.stringify(itens, null, 1)}\n`);
console.log(`${itens.length} itens`);
