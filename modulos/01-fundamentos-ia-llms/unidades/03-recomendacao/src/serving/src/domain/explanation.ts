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
