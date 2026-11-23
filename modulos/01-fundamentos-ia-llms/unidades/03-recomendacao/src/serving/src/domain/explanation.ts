import { z } from 'zod';
import { CandidateProvenance } from './candidate';

/** Sinais que uma explicação pode citar. Cada um precisa de lastro nos dados do item. */
export const ExplanationSignalEnum = z.enum([
  'purchase_history',
  'similar_items',
  'session_context',
  'category_affinity',
  'popular',
]);
export type ExplanationSignal = z.infer<typeof ExplanationSignalEnum>;

/**
 * Categorias de falha da explicação (ADR-0004 item 8, ADR-0010 item 6). Enum fechado: vira o `reason`
 * da API e o nome da métrica `ExplanationFallback_<categoria>`, nunca texto livre.
 * `guardrail`: o guardrail da plataforma interveio (não retentável, não conta no disjuntor).
 */
export const ExplanationErrorCategoryEnum = z.enum([
  'validation',
  'timeout',
  'throttled',
  'model_error',
  'refusal',
  'guardrail',
  'circuit_open',
  'internal_error',
]);
export type ExplanationErrorCategory = z.infer<typeof ExplanationErrorCategoryEnum>;

export interface ItemExplanation {
  itemId: string;
  reason: string;
  signals: ExplanationSignal[];
  /** Proveniência do texto: sempre gerado por modelo, nunca escrito por humano. */
  source: 'claude';
}

export interface SignalEvidence {
  provenance: CandidateProvenance;
  batchScore?: number;
  vectorScore?: number;
  category?: string;
}

/**
 * Sinais permitidos para um item, derivados só dos dados que o serviço tem.
 * É a regra que impede a explicação de inventar um motivo (CCAR-F 5.6).
 */
export function allowedSignalsFor(item: SignalEvidence, sessionItemIds?: string[]): ExplanationSignal[] {
  const out: ExplanationSignal[] = [];
  if (item.provenance === 'fallback') return ['popular'];
  if (item.batchScore !== undefined) out.push('purchase_history');
  if (item.vectorScore !== undefined) {
    out.push('similar_items');
    if (sessionItemIds && sessionItemIds.length > 0) out.push('session_context');
  }
  if (item.category) out.push('category_affinity');
  return out;
}
