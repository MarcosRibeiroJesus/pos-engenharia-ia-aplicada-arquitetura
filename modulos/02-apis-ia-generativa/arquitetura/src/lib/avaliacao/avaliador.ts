// Gate de avaliação (ADR-0008). Roda o dataset dourado pelo pipeline inteiro e compara as
// métricas com limiares versionados. No CI roda com respostas gravadas: protege o pipeline
// (schema, validação, retentativa, gate, templates) contra regressão. Com MODO_LLM=bedrock,
// fora do lab de custo zero, o mesmo gate mede o modelo de verdade.
import type { ProvedorLlm } from "../gateway/tipos.js";
import type { Item } from "../infra/tabela.js";
import { montarSistemaEmMemoria } from "../lab/sistema.js";
import type { Rastreador } from "../observabilidade/rastreador.js";

export interface Caso {
  id: string;
  usuarioId: string;
  antes?: string[];
  texto: string;
  anexos?: Record<string, string>;
  esperado: Partial<Record<"intencao" | "especialidade" | "data" | "horario" | "consulta_id", string | null>> & { resposta?: string };
}

export interface Limiares {
  acuracia_intencao_min: number;
  acuracia_campos_min: number;
  acuracia_resposta_min: number;
  taxa_saida_invalida_max: number;
  media_tentativas_max: number;
  custo_medio_usd_max: number;
}

export interface ResultadoCaso {
  id: string;
  acertoIntencao: boolean | null;
  camposCertos: number;
  camposTotal: number;
  acertoResposta: boolean | null;
  saidaInvalida: boolean;
  tentativas: number;
  custoUsd: number;
  latenciaMs: number;
  divergencias: string[];
}

export interface ConfigAvaliacao {
  casos: Caso[];
  limiares: Limiares;
  itensAgenda: Item[];
  agora: Date;
  dirFixtures?: string;
  provedor?: ProvedorLlm;
  rastreador?: Rastreador;
}

const CAMPOS = ["especialidade", "data", "horario", "consulta_id"] as const;

export async function avaliar(cfg: ConfigAvaliacao) {
  const resultados: ResultadoCaso[] = [];
  for (const caso of cfg.casos) {
    const s = await montarSistemaEmMemoria({
      itensAgenda: cfg.itensAgenda,
      agora: cfg.agora,
      canario: "CANARIO-avaliacao",
      ...(cfg.dirFixtures ? { dirFixtures: cfg.dirFixtures } : {}),
      ...(cfg.provedor ? { provedor: cfg.provedor } : {}),
      ...(cfg.rastreador ? { rastreador: cfg.rastreador } : {}),
      ...(caso.anexos ? { anexos: caso.anexos } : {}),
    });
    for (const t of caso.antes ?? []) await s.turno({ usuarioId: caso.usuarioId, sessaoId: caso.id, texto: t });
    const custoAntes = s.estadoGw.lancamentos.reduce((a, l) => a + l.custoUsd, 0);
    const inicio = performance.now();
    const r = await s.turno({ usuarioId: caso.usuarioId, sessaoId: caso.id, texto: caso.texto, anexos: Object.keys(caso.anexos ?? {}) });
    const latenciaMs = performance.now() - inicio;
    const custoUsd = s.estadoGw.lancamentos.reduce((a, l) => a + l.custoUsd, 0) - custoAntes;

    const e = caso.esperado;
    const div: string[] = [];
    const acertoIntencao = e.intencao === undefined ? null : r.intencao?.intencao === e.intencao;
    if (acertoIntencao === false) div.push(`intencao: esperado ${e.intencao}, veio ${r.intencao?.intencao ?? "nenhuma"}`);
    let camposCertos = 0;
    let camposTotal = 0;
    for (const c of CAMPOS) {
      if (!(c in e)) continue;
      camposTotal++;
      const veio = r.intencao ? r.intencao[c] : undefined;
      if (veio === e[c]) camposCertos++;
      else div.push(`${c}: esperado ${e[c]}, veio ${veio}`);
    }
    const acertoResposta = e.resposta === undefined ? null : r.resposta.tipo === e.resposta;
    if (acertoResposta === false) div.push(`resposta: esperado ${e.resposta}, veio ${r.resposta.tipo}`);
    const tent = Number(r.eventos.find((x) => x.startsWith("tentativas:"))?.split(":")[1] ?? 0);

    resultados.push({
      id: caso.id,
      acertoIntencao,
      camposCertos,
      camposTotal,
      acertoResposta,
      saidaInvalida: r.eventos.includes("fallback:saida_invalida"),
      tentativas: tent,
      custoUsd,
      latenciaMs,
      divergencias: div,
    });
    // Notas do caso no Langfuse (quando ligado), presas ao trace do turno.
    if (cfg.rastreador) {
      if (acertoIntencao !== null) cfg.rastreador.nota({ traceId: r.traceId, nome: "acerto_intencao", valor: acertoIntencao ? 1 : 0, comentario: caso.id });
      if (camposTotal) cfg.rastreador.nota({ traceId: r.traceId, nome: "acerto_campos", valor: camposCertos / camposTotal, comentario: caso.id });
      await cfg.rastreador.descarregar();
    }
  }
  return resumir(resultados, cfg.limiares);
}

function proporcao(xs: Array<boolean | null>) {
  const v = xs.filter((x): x is boolean => x !== null);
  return v.length ? v.filter(Boolean).length / v.length : 1;
}

export function resumir(resultados: ResultadoCaso[], l: Limiares) {
  const comModelo = resultados.filter((r) => r.tentativas > 0);
  const camposTotal = resultados.reduce((a, r) => a + r.camposTotal, 0);
  const metricas = {
    acuracia_intencao: proporcao(resultados.map((r) => r.acertoIntencao)),
    acuracia_campos: camposTotal ? resultados.reduce((a, r) => a + r.camposCertos, 0) / camposTotal : 1,
    acuracia_resposta: proporcao(resultados.map((r) => r.acertoResposta)),
    taxa_saida_invalida: resultados.length ? resultados.filter((r) => r.saidaInvalida).length / resultados.length : 0,
    media_tentativas: comModelo.length ? comModelo.reduce((a, r) => a + r.tentativas, 0) / comModelo.length : 0,
    custo_medio_usd: comModelo.length ? comModelo.reduce((a, r) => a + r.custoUsd, 0) / comModelo.length : 0,
    latencia_p95_ms: percentil(resultados.map((r) => r.latenciaMs), 0.95),
  };
  const reprovacoes = [
    metricas.acuracia_intencao < l.acuracia_intencao_min && `acuracia_intencao ${metricas.acuracia_intencao.toFixed(3)} < ${l.acuracia_intencao_min}`,
    metricas.acuracia_campos < l.acuracia_campos_min && `acuracia_campos ${metricas.acuracia_campos.toFixed(3)} < ${l.acuracia_campos_min}`,
    metricas.acuracia_resposta < l.acuracia_resposta_min && `acuracia_resposta ${metricas.acuracia_resposta.toFixed(3)} < ${l.acuracia_resposta_min}`,
    metricas.taxa_saida_invalida > l.taxa_saida_invalida_max && `taxa_saida_invalida ${metricas.taxa_saida_invalida.toFixed(3)} > ${l.taxa_saida_invalida_max}`,
    metricas.media_tentativas > l.media_tentativas_max && `media_tentativas ${metricas.media_tentativas.toFixed(2)} > ${l.media_tentativas_max}`,
    metricas.custo_medio_usd > l.custo_medio_usd_max && `custo_medio_usd ${metricas.custo_medio_usd.toFixed(5)} > ${l.custo_medio_usd_max}`,
  ].filter((x): x is string => Boolean(x));
  return { aprovado: reprovacoes.length === 0, reprovacoes, metricas, limiares: l, casos: resultados };
}

function percentil(xs: number[], p: number) {
  if (!xs.length) return 0;
  const o = [...xs].sort((a, b) => a - b);
  return o[Math.min(o.length - 1, Math.ceil(p * o.length) - 1)]!;
}
