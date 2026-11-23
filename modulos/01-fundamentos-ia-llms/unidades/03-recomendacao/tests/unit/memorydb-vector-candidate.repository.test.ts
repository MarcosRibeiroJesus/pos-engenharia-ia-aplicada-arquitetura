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
