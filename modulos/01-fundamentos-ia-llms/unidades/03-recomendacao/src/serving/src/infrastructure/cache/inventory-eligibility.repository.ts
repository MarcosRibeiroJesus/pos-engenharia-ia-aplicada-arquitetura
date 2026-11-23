import { MergedCandidate } from '../../domain/candidate';
import { RecentPurchase } from '../../domain/filter-rule';
import { catalogMetadataCache } from './lru-cache.provider';

/**
 * Dados de elegibilidade que o caso de uso já buscou na requisição (ADR-0012): os candidatos
 * juntados, com o `inStock` do lote, e as compras recentes do item do usuário no DynamoDB.
 * `recentPurchases` indefinido = não se sabe (DynamoDB fora ou dublê sem compras).
 */
export interface EligibilitySnapshot {
  candidates: MergedCandidate[];
  recentPurchases?: RecentPurchase[];
}

export interface IInventoryEligibilityRepository {
  checkStock(itemIds: string[], snapshot?: EligibilitySnapshot): Promise<Map<string, boolean>>;
  getRecentPurchases(userId: string, snapshot?: EligibilitySnapshot): Promise<RecentPurchase[]>;
}

/**
 * Repositório de produção (RF-104, ADR-0012), injetado pelo `buildDefaultUseCase`. Não faz chamada
 * de rede: lê o estoque e as compras que o lote publicou e que já chegaram no GetItem do DynamoDB e
 * no FT.SEARCH do MemoryDB. O frescor é o do lote (diário).
 */
export class BatchDataEligibilityRepository implements IInventoryEligibilityRepository {
  public async checkStock(itemIds: string[], snapshot?: EligibilitySnapshot): Promise<Map<string, boolean>> {
    const wanted = new Set(itemIds);
    const results = new Map<string, boolean>();
    for (const c of snapshot?.candidates ?? []) {
      if (wanted.has(c.itemId) && typeof c.inStock === 'boolean') {
        results.set(c.itemId, c.inStock);
      }
    }
    return results;
  }

  public async getRecentPurchases(_userId: string, snapshot?: EligibilitySnapshot): Promise<RecentPurchase[]> {
    return snapshot?.recentPurchases ?? [];
  }
}

export class InMemoryInventoryEligibilityRepository implements IInventoryEligibilityRepository {
  private stockOverrides = new Map<string, boolean>();
  private userPurchaseHistory = new Map<string, RecentPurchase[]>();

  public setStock(itemId: string, inStock: boolean): void {
    this.stockOverrides.set(itemId, inStock);
    catalogMetadataCache.set(`stock:${itemId}`, { inStock });
  }

  public recordPurchase(userId: string, itemId: string, purchaseTimestamp: number = Date.now()): void {
    const list = this.userPurchaseHistory.get(userId) || [];
    list.push({ itemId, purchaseTimestamp });
    this.userPurchaseHistory.set(userId, list);
  }

  public async checkStock(itemIds: string[]): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();
    for (const itemId of itemIds) {
      if (this.stockOverrides.has(itemId)) {
        results.set(itemId, this.stockOverrides.get(itemId)!);
      } else {
        const cached = catalogMetadataCache.get(`stock:${itemId}`) as { inStock?: boolean } | undefined;
        if (cached && typeof cached.inStock === 'boolean') {
          results.set(itemId, cached.inStock);
        } else {
          // Default to in-stock if not explicitly marked out-of-stock
          results.set(itemId, true);
        }
      }
    }
    return results;
  }

  public async getRecentPurchases(userId: string): Promise<RecentPurchase[]> {
    return this.userPurchaseHistory.get(userId) || [];
  }
}
