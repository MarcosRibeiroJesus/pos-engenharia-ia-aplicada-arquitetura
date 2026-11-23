import { describe, it, expect } from 'vitest';
import { BatchDataEligibilityRepository } from '../../src/serving/src/infrastructure/cache/inventory-eligibility.repository';
import { MergedCandidate } from '../../src/serving/src/domain/candidate';

// A2 da revisão da T074 (RF-104, ADR-0012): o repositório de produção só repete o que o lote
// publicou; não inventa estoque e não inventa compras.
function cand(itemId: string, inStock?: boolean): MergedCandidate {
  return { itemId, provenance: 'batch', initialCombinedScore: 0.5, inStock };
}

describe('BatchDataEligibilityRepository', () => {
  const repo = new BatchDataEligibilityRepository();

  it('checkStock preserva false e true do candidato', async () => {
    const map = await repo.checkStock(['A', 'B'], { candidates: [cand('A', false), cand('B', true)] });
    expect(map.get('A')).toBe(false);
    expect(map.get('B')).toBe(true);
  });

  it('checkStock deixa fora do mapa o item sem campo e o item não pedido', async () => {
    const map = await repo.checkStock(['A'], { candidates: [cand('A'), cand('C', false)] });
    expect(map.has('A')).toBe(false);
    expect(map.has('C')).toBe(false);
  });

  it('checkStock sem snapshot devolve Map vazio', async () => {
    const map = await repo.checkStock(['A']);
    expect(map.size).toBe(0);
  });

  it('getRecentPurchases devolve as compras do snapshot', async () => {
    const purchases = [{ itemId: 'A', purchaseTimestamp: 1 }];
    await expect(repo.getRecentPurchases('u-1', { candidates: [], recentPurchases: purchases })).resolves.toEqual(purchases);
  });

  it('getRecentPurchases com snapshot ou compras indefinidos vira []', async () => {
    await expect(repo.getRecentPurchases('u-1')).resolves.toEqual([]);
    await expect(repo.getRecentPurchases('u-1', { candidates: [] })).resolves.toEqual([]);
  });
});
