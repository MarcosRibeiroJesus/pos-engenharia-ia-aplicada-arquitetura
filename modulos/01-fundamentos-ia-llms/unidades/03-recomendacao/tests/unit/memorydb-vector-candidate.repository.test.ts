import { describe, it, expect, vi } from 'vitest';
import type Redis from 'ioredis';
import { MemoryDbVectorCandidateRepository } from '../../src/serving/src/infrastructure/memorydb/memorydb-vector-candidate.repository';
import { InvalidCategoryError } from '../../src/serving/src/domain/category';

// VT-02 (T070, RNF-104, ADR-0011): defesa em profundidade. Mesmo que um chamador pule o controlador,
// o repositório confere a categoria de novo e lança erro de validação antes de montar a expressão
// `(@cat:{...})` do FT.SEARCH. O cliente Redis é simulado; nenhum comando pode sair.

function buildRepo() {
  const call = vi.fn().mockResolvedValue([0]);
  const fakeRedis = { call } as unknown as Redis;
  return { repo: new MemoryDbVectorCandidateRepository(fakeRedis), call };
}

const vector = new Float32Array(128).fill(0.1);

describe('VT-02: MemoryDbVectorCandidateRepository recusa categoria fora do padrão', () => {
  it.each([
    'Electronics}',
    'a|b',
    '*',
    '@cat',
    'x)',
    'Home Garden',
    'A'.repeat(41),
    '',
    'Eletrônicos',
    'Electronics\n}',
    'a\n',
  ])('lança InvalidCategoryError para %j sem chamar o Redis', async (category) => {
    const { repo, call } = buildRepo();

    await expect(repo.searchSimilarItems(vector, category, 10)).rejects.toBeInstanceOf(InvalidCategoryError);
    expect(call).not.toHaveBeenCalled();
  });

  it('o erro de validação é estruturado e não retentável', async () => {
    const { repo } = buildRepo();

    const err = await repo.searchSimilarItems(vector, 'bad}', 10).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(InvalidCategoryError);
    expect(err).toMatchObject({ categoria: 'validacao', retentavel: false });
  });

  it('com categoria no padrão monta o filtro de tag e chama o FT.SEARCH', async () => {
    const { repo, call } = buildRepo();

    await repo.searchSimilarItems(vector, 'Home_Garden_2', 10);

    expect(call).toHaveBeenCalledTimes(1);
    expect(call.mock.calls[0][0]).toBe('FT.SEARCH');
    expect(call.mock.calls[0][2]).toContain('(@cat:{Home_Garden_2})');
  });

  it('sem categoria usa o filtro curinga', async () => {
    const { repo, call } = buildRepo();

    await repo.searchSimilarItems(vector, undefined, 10);

    expect(call).toHaveBeenCalledTimes(1);
    expect(call.mock.calls[0][2]).toMatch(/^\*=>\[KNN /);
  });
});

// VT-03 (T071, RF-002, RNF-104, E8, ADR-0011): forma exata do FT.SEARCH. A página do FT.SEARCH do
// MemoryDB não lista `SORTBY` (o KNN já vem ordenado pela distância) e o `LIMIT` padrão é `0 10`;
// sem `LIMIT 0 k` o serviço receberia no máximo 10 vizinhos mesmo pedindo 50.
describe('VT-03: MemoryDbVectorCandidateRepository monta o FT.SEARCH sem SORTBY e com LIMIT 0 k', () => {
  const buffer = Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength);

  function expectedArgs(filter: string, k: number) {
    return [
      'FT.SEARCH',
      'item_idx',
      `${filter}=>[KNN ${k} @v $vec AS vector_score]`,
      'PARAMS',
      '2',
      'vec',
      buffer,
      'LIMIT',
      '0',
      String(k),
      'RETURN',
      '3',
      'vector_score',
      'cat',
      'inStock',
      'DIALECT',
      '2',
    ];
  }

  it.each([
    ['Electronics', '(@cat:{Electronics})', 50],
    ['Books', '(@cat:{Books})', 10],
    [undefined, '*', 50],
    [undefined, '*', 1],
  ] as const)('categoria %j: argumentos exatos com k = %j', async (category, filter, k) => {
    const { repo, call } = buildRepo();

    await repo.searchSimilarItems(vector, category, k);

    expect(call).toHaveBeenCalledTimes(1);
    expect(call.mock.calls[0]).toEqual(expectedArgs(filter, k));
    expect(call.mock.calls[0]).not.toContain('SORTBY');
  });

  it('k acima de 50 é limitado a 50 no KNN e no LIMIT', async () => {
    const { repo, call } = buildRepo();

    await repo.searchSimilarItems(vector, undefined, 500);

    expect(call.mock.calls[0]).toEqual(expectedArgs('*', 50));
  });

  it('entrega até 50 candidatos vetoriais, com cat e inStock do RETURN no candidato', async () => {
    const reply: unknown[] = [50];
    for (let i = 1; i <= 50; i++) {
      reply.push(`item:SKU-${i}`, [
        'vector_score',
        String(i / 100),
        'cat',
        'Electronics',
        'inStock',
        i % 2 === 0 ? 'false' : 'true',
      ]);
    }
    const call = vi.fn().mockResolvedValue(reply);
    const repo = new MemoryDbVectorCandidateRepository({ call } as unknown as Redis);

    const result = await repo.searchSimilarItems(vector, 'Electronics', 50);

    expect(result).toHaveLength(50);
    expect(result[0]).toEqual({ itemId: 'SKU-1', vectorScore: 0.99, category: 'Electronics', inStock: true });
    expect(result[1]).toMatchObject({ itemId: 'SKU-2', inStock: false });
  });

  it("inStock '1' e '0' vindos do hash viram true e false", async () => {
    const call = vi
      .fn()
      .mockResolvedValue([2, 'item:SKU-1', ['vector_score', '0.1', 'inStock', '1'], 'item:SKU-0', ['vector_score', '0.2', 'inStock', '0']]);
    const repo = new MemoryDbVectorCandidateRepository({ call } as unknown as Redis);

    const result = await repo.searchSimilarItems(vector, undefined, 2);

    expect(result.map((c) => [c.itemId, c.inStock])).toEqual([
      ['SKU-1', true],
      ['SKU-0', false],
    ]);
  });

  it.each([0, -5])('limit = %j sobe para o piso de 1 no KNN e no LIMIT', async (limit) => {
    const { repo, call } = buildRepo();

    await repo.searchSimilarItems(vector, undefined, limit);

    expect(call.mock.calls[0]).toEqual(expectedArgs('*', 1));
  });

  it('inStock ausente ou ilegível no hash fica indefinido (não inventa estoque)', async () => {
    const call = vi
      .fn()
      .mockResolvedValue([2, 'item:SKU-A', ['vector_score', '0.2'], 'item:SKU-B', ['vector_score', '0.3', 'inStock', 'talvez']]);
    const repo = new MemoryDbVectorCandidateRepository({ call } as unknown as Redis);

    const result = await repo.searchSimilarItems(vector, undefined, 2);

    expect(result.map((c) => c.inStock)).toEqual([undefined, undefined]);
    expect(result[0]).not.toHaveProperty('category');
  });
});
