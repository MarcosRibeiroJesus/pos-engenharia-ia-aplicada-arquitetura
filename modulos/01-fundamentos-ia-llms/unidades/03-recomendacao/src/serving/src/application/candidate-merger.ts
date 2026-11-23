import { BatchCandidate, SemanticCandidate, MergedCandidate } from '../domain/candidate';

export function mergeCandidates(
  batchCandidates: BatchCandidate[],
  semanticCandidates: SemanticCandidate[]
): MergedCandidate[] {
  const mergedMap = new Map<string, MergedCandidate>();

  // Process batch candidates first
  for (const batch of batchCandidates) {
    mergedMap.set(batch.itemId, {
      itemId: batch.itemId,
      provenance: 'batch',
      batchScore: batch.score,
      batchRank: batch.rank,
      initialCombinedScore: batch.score,
      category: batch.category,
      priceCents: batch.priceCents,
      title: batch.title || `Product ${batch.itemId}`,
      inStock: batch.inStock !== false,
    });
  }

  // Merge semantic vector candidates
  for (const sem of semanticCandidates) {
    const existing = mergedMap.get(sem.itemId);
    if (existing) {
      // Present in both: mark as hybrid and combine scores (50% batch + 50% vector)
      existing.provenance = 'hybrid';
      existing.vectorScore = sem.vectorScore;
      existing.initialCombinedScore = 0.5 * (existing.batchScore ?? 0) + 0.5 * sem.vectorScore;
      if (!existing.title && sem.title) existing.title = sem.title;
      if (!existing.category && sem.category) existing.category = sem.category;
      // Estoque (VT-07, ADR-0012): basta uma fonte dizer false para o item ficar inelegível.
      existing.inStock = existing.inStock !== false && sem.inStock !== false;
      if (existing.priceCents === undefined && sem.priceCents !== undefined) {
        existing.priceCents = sem.priceCents;
      }
    } else {
      // Realtime only
      mergedMap.set(sem.itemId, {
        itemId: sem.itemId,
        provenance: 'realtime',
        vectorScore: sem.vectorScore,
        initialCombinedScore: sem.vectorScore,
        category: sem.category,
        priceCents: sem.priceCents,
        title: sem.title || `Product ${sem.itemId}`,
        inStock: sem.inStock !== false,
      });
    }
  }

  return Array.from(mergedMap.values());
}
