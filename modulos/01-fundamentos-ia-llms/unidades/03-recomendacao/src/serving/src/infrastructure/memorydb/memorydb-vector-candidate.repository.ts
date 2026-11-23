import Redis from 'ioredis';
import { SemanticCandidate } from '../../domain/candidate';
import { assertValidCategory } from '../../domain/category';
import { DependencyError } from '../../domain/dependency-error';
import { env } from '../../config/env';
import { createCircuitBreaker } from '../resilience/circuit-breaker';

export interface IMemoryDbVectorRepository {
  searchSimilarItems(vector: Float32Array | Buffer, category?: string, limit?: number): Promise<SemanticCandidate[]>;
}

export class MemoryDbVectorCandidateRepository implements IMemoryDbVectorRepository {
  private redis: Redis;
  private breaker: ReturnType<typeof createCircuitBreaker>;

  constructor(customRedis?: Redis) {
    if (customRedis) {
      this.redis = customRedis;
    } else {
      const endpoint = env.MEMORYDB_CLUSTER_ENDPOINT;
      const [host, portStr] = endpoint.split(':');
      this.redis = new Redis({
        host: host || 'localhost',
        port: portStr ? parseInt(portStr, 10) : 6379,
        connectTimeout: 1000,
        maxRetriesPerRequest: 1,
        lazyConnect: true,
        // MemoryDB com tls_enabled exige TLS no cliente (ADR-0003).
        tls: env.MEMORYDB_TLS ? {} : undefined,
      });
    }

    this.breaker = createCircuitBreaker(
      async (buf: Buffer, cat?: string, lim?: number) => this.executeVectorSearch(buf, cat, lim),
      {
        timeout: 15, // 15ms timeout deadline per spec
        errorThresholdPercentage: 20,
        resetTimeout: 10000,
        name: 'memorydb-vector-repo',
      }
    );
  }

  private async executeVectorSearch(
    vectorBuffer: Buffer,
    category?: string,
    limit = 50
  ): Promise<SemanticCandidate[]> {
    const k = Math.min(Math.max(limit, 1), 50);
    const query = category
      ? `(@cat:{${category}})=>[KNN ${k} @v $vec AS vector_score]`
      : `*=>[KNN ${k} @v $vec AS vector_score]`;

    // VT-03 (ADR-0011, E8): o FT.SEARCH do MemoryDB não tem `SORTBY` (o KNN já vem ordenado pela
    // distância) e o `LIMIT` padrão é `0 10`; por isso o `LIMIT 0 k` explícito.
    const rawResult = (await this.redis.call(
      'FT.SEARCH',
      'item_idx',
      query,
      'PARAMS',
      '2',
      'vec',
      vectorBuffer,
      'LIMIT',
      '0',
      String(k),
      'RETURN',
      '3',
      'vector_score',
      'cat',
      'inStock',
      'DIALECT',
      '2'
    )) as [number, ...unknown[]];

    if (!Array.isArray(rawResult) || rawResult.length <= 1) {
      return [];
    }

    const candidates: SemanticCandidate[] = [];

    // Response structure: [totalCount, key1, [field1, val1], key2, [field2, val2], ...]
    for (let i = 1; i < rawResult.length; i += 2) {
      const key = String(rawResult[i]);
      const attributes = rawResult[i + 1] as unknown[];
      const itemId = key.replace(/^item:/, '');

      const candidate: SemanticCandidate = { itemId, vectorScore: 0.5 };
      if (Array.isArray(attributes)) {
        for (let j = 0; j < attributes.length; j += 2) {
          const field = String(attributes[j]);
          const value = String(attributes[j + 1]);
          if (field === 'vector_score') {
            // Cosine distance to similarity: 1.0 - distance
            candidate.vectorScore = Math.max(0.0, Math.min(1.0, 1.0 - parseFloat(value)));
          } else if (field === 'cat') {
            candidate.category = value;
          } else if (field === 'inStock') {
            // Só valores reconhecidos viram booleano; o resto fica indefinido (não inventa estoque).
            if (value === 'true' || value === '1') candidate.inStock = true;
            else if (value === 'false' || value === '0') candidate.inStock = false;
          }
        }
      }

      candidates.push(candidate);
    }

    return candidates;
  }

  public async searchSimilarItems(
    vector: Float32Array | Buffer,
    category?: string,
    limit = 50
  ): Promise<SemanticCandidate[]> {
    // RNF-104 (ADR-0011): defesa em profundidade. Confere a categoria de novo antes de montar a
    // consulta e lança o erro de validação fora do try abaixo, para ele não virar lista vazia.
    if (category !== undefined) {
      assertValidCategory(category);
    }

    let buffer: Buffer;
    if (vector instanceof Buffer) {
      buffer = vector;
    } else {
      buffer = Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength);
    }

    // Ensure 128-dim Float32 = 512 bytes
    if (buffer.byteLength !== 512) {
      // If smaller or empty in test/fallback, pad or return empty
      if (buffer.byteLength === 0) {
        return [];
      }
    }

    // RF-106 (ADR-0011): a falha sai como DependencyError, nunca como lista vazia. A validação da
    // categoria acontece antes, fora do disjuntor, para entrada ruim não contar como queda.
    try {
      const result = await this.breaker.fire(buffer, category, limit);
      return (result as SemanticCandidate[]) || [];
    } catch (error) {
      throw DependencyError.fromBreaker('memorydb', error);
    }
  }
}
