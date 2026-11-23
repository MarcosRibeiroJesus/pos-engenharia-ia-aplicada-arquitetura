import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { BatchCandidate, InvalidUserIdError, UserIdSchema } from '../../domain/candidate';
import { DependencyError } from '../../domain/dependency-error';
import { RecentPurchase } from '../../domain/filter-rule';
import { env } from '../../config/env';
import { createCircuitBreaker } from '../resilience/circuit-breaker';
import { baseLogger } from '../logging/logger';
import { DownstreamStatus } from '../../domain/health';

/** Chave fixa da sonda de saúde: nunca vem da requisição. */
export const HEALTH_PROBE_USER_ID = 'health-probe';

/** Limite de compras lidas por usuário, o mesmo da publicação (risco de 400 KB do ADR-0012). */
export const MAX_RECENT_PURCHASES = 100;

/**
 * Tolerância de relógio para `purchasedAt` no futuro (segundos). Acima de agora mais isto, a entrada
 * é descartada: pega a data gravada em milissegundos por engano (cerca de 1000 vezes maior).
 */
export const PURCHASE_FUTURE_TOLERANCE_S = 300;

/**
 * Tudo o que o lote publica no item do usuário e o serviço usa (RF-104, ADR-0012): os candidatos,
 * com `inStock` em cada um, e as compras dos últimos 30 dias. Vem de um único GetItem.
 *
 * Contrato de leitura de `recentPurchases`: lista de `{ itemId: string, purchasedAt: number }`, com
 * `purchasedAt` em segundos desde a época (a mesma unidade de `generatedAt`). Entradas fora disso são
 * descartadas e contadas em `discardedPurchases` (ADR-0012, nota de 2026-11-23). O frescor é o do
 * lote (diário): uma compra de hoje só some no lote seguinte.
 */
export interface BatchUserData {
  candidates: BatchCandidate[];
  recentPurchases: RecentPurchase[];
  /** Entradas de `recentPurchases` fora do contrato de leitura, descartadas. */
  discardedPurchases?: number;
}

export interface IDynamoDbBatchRepository {
  getBatchCandidates(userId: string): Promise<BatchCandidate[]>;
  /** Candidatos e compras recentes no mesmo GetItem. Opcional para os dublês que só têm candidatos. */
  getBatchUserData?(userId: string): Promise<BatchUserData>;
}

export class DynamoDbBatchCandidateRepository implements IDynamoDbBatchRepository {
  private docClient: DynamoDBDocumentClient;
  private tableName: string;
  private breaker: ReturnType<typeof createCircuitBreaker>;

  constructor(customDocClient?: DynamoDBDocumentClient, tableName?: string) {
    this.tableName = tableName || env.DYNAMODB_TABLE_NAME;
    if (customDocClient) {
      this.docClient = customDocClient;
    } else {
      const client = new DynamoDBClient({ region: env.AWS_REGION });
      this.docClient = DynamoDBDocumentClient.from(client);
    }

    this.breaker = createCircuitBreaker(
      async (userId: string) => this.fetchFromDynamo(userId),
      {
        timeout: 20, // 20ms timeout deadline per FR-4.2.2
        errorThresholdPercentage: 20,
        resetTimeout: 10000,
        name: 'dynamodb-batch-repo',
      }
    );
  }

  private async fetchFromDynamo(userId: string): Promise<BatchUserData> {
    const response = await this.docClient.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { userId },
      })
    );

    const item = response.Item;
    const { purchases: recentPurchases, discarded: discardedPurchases } = parseRecentPurchases(item?.recentPurchases);
    if (!item || !Array.isArray(item.recommendations)) {
      return { candidates: [], recentPurchases, discardedPurchases };
    }

    const rawRecs = item.recommendations;
    const candidates: BatchCandidate[] = rawRecs.slice(0, 50).map((r: Record<string, unknown>) => ({
      itemId: String(r.itemId),
      score: typeof r.score === 'number' ? r.score : 0,
      rank: typeof r.rank === 'number' ? r.rank : 1,
      modelId: typeof r.modelId === 'string' ? r.modelId : undefined,
      category: typeof r.category === 'string' ? r.category : undefined,
      priceCents: typeof r.priceCents === 'number' ? r.priceCents : undefined,
      title: typeof r.title === 'string' ? r.title : undefined,
      // Só booleano vira estoque; o resto fica indefinido (não inventa estoque).
      inStock: typeof r.inStock === 'boolean' ? r.inStock : undefined,
    }));

    return { candidates, recentPurchases, discardedPurchases };
  }

  /**
   * Verificador de saúde (RF-008, VT-19): GetItem na chave fixa de sonda, só com a chave na projeção.
   * Fora do disjuntor do caminho quente (a sonda não conta falha contra o tráfego) e com a permissão
   * que a task já tem (`dynamodb:GetItem`). Item ausente é esperado: o que importa é a tabela responder.
   */
  public async checkHealth(): Promise<DownstreamStatus> {
    await this.docClient.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { userId: HEALTH_PROBE_USER_ID },
        ProjectionExpression: 'userId',
      })
    );
    return 'CONNECTED';
  }

  public async getBatchCandidates(userId: string): Promise<BatchCandidate[]> {
    return (await this.getBatchUserData(userId)).candidates;
  }

  public async getBatchUserData(userId: string): Promise<BatchUserData> {
    const parseResult = UserIdSchema.safeParse(userId);
    if (!parseResult.success) {
      // Fora do disjuntor e sem eco da entrada: erro de validação estruturado, não queda.
      throw new InvalidUserIdError();
    }

    // RF-106 (ADR-0011): a falha sai como DependencyError, nunca como lista vazia. Lista vazia
    // fica só para "sem dados" (item ausente), que não liga o modo degradado.
    try {
      const result = (await this.breaker.fire(userId)) as BatchUserData | undefined;
      return result ?? { candidates: [], recentPurchases: [] };
    } catch (error) {
      throw DependencyError.fromBreaker('dynamodb', error);
    }
  }
}

/**
 * Contrato de leitura de `recentPurchases` (ADR-0012, nota de 2026-11-23): `itemId` texto não vazio e
 * `purchasedAt` número finito em segundos, não maior que agora mais a tolerância. Fora disso, a
 * entrada é descartada e contada; o log leva só as contagens, sem userId nem itemId.
 */
function parseRecentPurchases(raw: unknown): { purchases: RecentPurchase[]; discarded: number } {
  if (!Array.isArray(raw)) return { purchases: [], discarded: 0 };
  const maxPurchasedAt = Date.now() / 1000 + PURCHASE_FUTURE_TOLERANCE_S;
  const purchases: RecentPurchase[] = [];
  let discarded = 0;
  let truncated = 0;
  for (const entry of raw) {
    const e = entry as { itemId?: unknown; purchasedAt?: unknown } | null;
    const valid =
      !!e &&
      typeof e.itemId === 'string' &&
      e.itemId.length > 0 &&
      typeof e.purchasedAt === 'number' &&
      Number.isFinite(e.purchasedAt) &&
      e.purchasedAt >= 0 &&
      e.purchasedAt <= maxPurchasedAt;
    if (!valid) {
      discarded++;
      continue;
    }
    if (purchases.length >= MAX_RECENT_PURCHASES) {
      truncated++;
      continue;
    }
    purchases.push({ itemId: e!.itemId as string, purchaseTimestamp: (e!.purchasedAt as number) * 1000 });
  }
  if (discarded > 0 || truncated > 0) {
    baseLogger.warn(
      { descartadas: discarded, acimaDoLimite: truncated, limite: MAX_RECENT_PURCHASES },
      'recentPurchases fora do contrato de leitura; entradas descartadas'
    );
  }
  return { purchases, discarded };
}
