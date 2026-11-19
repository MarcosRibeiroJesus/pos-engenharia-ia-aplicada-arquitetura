// Schema da intenção (tool registrar_intencao) e validação em duas etapas:
// 1) estrutural, com o mesmo JSON Schema enviado ao modelo (strict: true);
// 2) semântica, contra o contexto real: data, ids conhecidos e evidência literal na fonte.
// O schema forçado reduz erro de formato; erro de significado só a validação semântica pega.
import type Anthropic from "@anthropic-ai/sdk";
import AjvModule from "ajv";
import { ESPECIALIDADES, PERIODOS } from "../dominio/catalogo.js";
import type { Intencao, OrigemEvidencia } from "../dominio/tipos.js";
import { formaDeDeteccao } from "../defesa/normalizacao.js";

const ORIGENS = ["mensagem", "anexo", "memoria"] as const;

const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    intencao: { type: "string", enum: ["agendar", "cancelar", "consultar", "outra"], description: "O que o paciente quer fazer agora." },
    especialidade: { type: ["string", "null"], enum: [...ESPECIALIDADES, null], description: "Especialidade citada, ou null." },
    data: { type: ["string", "null"], pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "Data no formato AAAA-MM-DD, resolvida a partir de hoje, ou null." },
    horario: { type: ["string", "null"], pattern: "^([01]\\d|2[0-3]):[0-5]\\d$", description: "Horário HH:MM citado, ou null." },
    periodo: { type: ["string", "null"], enum: [...PERIODOS, null], description: "manha, tarde ou noite, se citado." },
    consulta_id: { type: ["string", "null"], pattern: "^C-[A-Z0-9]{4,12}$", description: "Id da consulta, só se aparecer no contexto." },
    preferencias: {
      type: "array",
      maxItems: 3,
      description: "Preferências duradouras que o paciente declarou nesta mensagem.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          chave: { type: "string", enum: ["periodo_preferido", "especialidade_frequente"] },
          valor: { type: "string", maxLength: 40 },
          origem: { type: "string", enum: [...ORIGENS] },
        },
        required: ["chave", "valor", "origem"],
      },
    },
    confianca: { type: "number", minimum: 0, maximum: 1, description: "Sua confiança na interpretação, de 0 a 1." },
    ambiguidades: { type: "array", maxItems: 5, items: { type: "string", maxLength: 200 }, description: "O que ficou ambíguo e precisa ser perguntado." },
    evidencias: {
      type: "array",
      maxItems: 8,
      description: "Para cada campo preenchido, o trecho literal da fonte que o justifica.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          campo: { type: "string", enum: ["especialidade", "data", "horario", "periodo", "consulta_id"] },
          origem: { type: "string", enum: [...ORIGENS] },
          trecho: { type: "string", minLength: 1, maxLength: 200 },
        },
        required: ["campo", "origem", "trecho"],
      },
    },
  },
  required: ["intencao", "especialidade", "data", "horario", "periodo", "consulta_id", "preferencias", "confianca", "ambiguidades", "evidencias"],
} as const;

export const TOOL_INTENCAO: Anthropic.Tool & { strict: boolean } = {
  name: "registrar_intencao",
  description:
    "Registra a intenção do paciente extraída da mensagem. Use sempre esta tool para responder. " +
    "Ela não executa nada: só descreve o pedido para o sistema validar.",
  input_schema: schema as unknown as Anthropic.Tool.InputSchema,
  strict: true,
};

const Ajv = ((AjvModule as unknown as { default?: unknown }).default ?? AjvModule) as new (o: object) => {
  compile: (s: object) => ((d: unknown) => boolean) & { errors?: Array<{ instancePath: string; message?: string }> | null };
};
const ajv = new Ajv({ allErrors: true, strict: false });
const validarEstrutura = ajv.compile(schema);

export interface FontesValidacao {
  hoje: string;
  mensagem: string;
  anexos: Array<{ conteudo: string }>;
  memoria: unknown;
  idsConhecidos: string[];
}

const CAMPOS_COM_EVIDENCIA = ["especialidade", "data", "horario", "consulta_id"] as const;

export function validarIntencao(dado: unknown, f: FontesValidacao): { ok: true; intencao: Intencao } | { ok: false; erros: string[] } {
  if (!validarEstrutura(dado)) {
    return { ok: false, erros: (validarEstrutura.errors ?? []).map((e) => `schema:${e.instancePath || "/"} ${e.message ?? ""}`.trim()) };
  }
  const i = dado as Intencao;
  const erros: string[] = [];

  if (i.data) {
    const d = Date.parse(`${i.data}T00:00:00Z`);
    const hoje = Date.parse(`${f.hoje}T00:00:00Z`);
    if (Number.isNaN(d)) erros.push("data_invalida");
    else if (d < hoje) erros.push("data_no_passado");
    else if (d - hoje > 90 * 86_400_000) erros.push("data_fora_da_janela");
  }
  if (i.consulta_id && !f.idsConhecidos.includes(i.consulta_id)) erros.push("consulta_id_desconhecido");

  const fontes: Record<OrigemEvidencia, string> = {
    mensagem: formaDeDeteccao(f.mensagem),
    anexo: formaDeDeteccao(f.anexos.map((a) => a.conteudo).join("\n")),
    memoria: formaDeDeteccao(JSON.stringify(f.memoria)),
  };
  for (const campo of CAMPOS_COM_EVIDENCIA) {
    if (i[campo] === null) continue;
    const ev = i.evidencias.filter((e) => e.campo === campo);
    if (!ev.some((e) => fontes[e.origem].includes(formaDeDeteccao(e.trecho)))) erros.push(`evidencia_nao_encontrada:${campo}`);
  }

  return erros.length ? { ok: false, erros } : { ok: true, intencao: i };
}
