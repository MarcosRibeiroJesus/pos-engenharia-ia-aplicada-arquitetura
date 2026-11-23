import { RecommendedItem } from '../../domain/candidate';
import { fallbackItemsCache } from '../cache/lru-cache.provider';

// Catálogo curado do fallback (RF-006): produtos fictícios, sem marca real (RNF-109, Art. VIII).
// Título e categoria vêm de `tests/fixtures/nomes-ficticios.json`, a mesma lista do gerador do
// lote; o VT-14 (`tests/unit/catalogo-ficticio.test.ts`) reprova qualquer par fora dela.
export const STATIC_CURATED_CATALOG: Omit<RecommendedItem, 'rank' | 'score' | 'provenance'>[] = [
  { itemId: 'SKU-FALLBACK-01', title: 'Caixa de Som Portatil', priceCents: 4999, category: 'Eletronicos' },
  { itemId: 'SKU-FALLBACK-02', title: 'Romance de Ficcao Cientifica', priceCents: 5990, category: 'Livros' },
  { itemId: 'SKU-FALLBACK-03', title: 'Monitor de 24 Polegadas', priceCents: 89900, category: 'Informatica' },
  { itemId: 'SKU-FALLBACK-04', title: 'Fone Intra-auricular Esportivo', priceCents: 24999, category: 'Eletronicos' },
  { itemId: 'SKU-FALLBACK-05', title: 'Garrafa Termica de Aco 750 ml', priceCents: 3500, category: 'Cozinha' },
  { itemId: 'SKU-FALLBACK-06', title: 'Jogo de Panelas Antiaderentes', priceCents: 7999, category: 'Cozinha' },
  { itemId: 'SKU-FALLBACK-07', title: 'Carregador de Parede 30 W', priceCents: 3999, category: 'Acessorios' },
  { itemId: 'SKU-FALLBACK-08', title: 'Fone de Ouvido com Cancelamento de Ruido', priceCents: 39999, category: 'Eletronicos' },
  { itemId: 'SKU-FALLBACK-09', title: 'Mouse Sem Fio Silencioso', priceCents: 9999, category: 'Informatica' },
  { itemId: 'SKU-FALLBACK-10', title: 'Tapete de Yoga Antiderrapante', priceCents: 12900, category: 'Esporte' },
];

export interface ICuratedFallbackProvider {
  getFallbackRecommendations(limit?: number): RecommendedItem[];
}

export class CuratedFallbackProvider implements ICuratedFallbackProvider {
  public getFallbackRecommendations(limit = 10): RecommendedItem[] {
    const cacheKey = `fallback-top-${limit}`;
    const cached = fallbackItemsCache.get(cacheKey) as RecommendedItem[] | undefined;
    if (cached) {
      return cached;
    }

    const items = STATIC_CURATED_CATALOG.slice(0, limit).map((product, index) => ({
      ...product,
      rank: index + 1,
      score: Math.max(0.1, 0.5 - index * 0.02),
      provenance: 'fallback' as const,
    }));

    fallbackItemsCache.set(cacheKey, items);
    return items;
  }
}
