// VT-14 (catálogo fictício, T077): RNF-109, Art. VIII.
//
// Todo título que o serviço ou a semente local podem mostrar vem da lista versionada de nomes
// fictícios (`tests/fixtures/nomes-ficticios.json`), a mesma que o gerador do lote usa (PY-07). A
// lista é uma lista permitida: título fora dela reprova, inclusive um nome de produto com marca
// real. Cada título tem uma categoria fixa na lista, no padrão do RNF-104, para que fallback,
// semente e lote mostrem o mesmo par título-categoria.
import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { STATIC_CURATED_CATALOG } from '../../src/serving/src/infrastructure/fallback/curated-fallback.provider';
import { SEED_RECOMMENDATIONS, SEED_VECTOR_ITEMS } from '../../scripts/seed-local';

interface ItemFicticio {
  titulo: string;
  categoria: string;
}

interface ListaDeNomes {
  proveniencia: string;
  categorias: string[];
  itens: ItemFicticio[];
}

const PADRAO_CATEGORIA = /^[A-Za-z0-9_]{1,40}$/;
const lista: ListaDeNomes = JSON.parse(
  readFileSync(path.resolve(__dirname, '../fixtures/nomes-ficticios.json'), 'utf-8')
);
const categoriaDoTitulo = new Map(lista.itens.map((i) => [i.titulo, i.categoria]));

/** Pares título-categoria que não batem com a lista (título ausente ou categoria trocada). */
function foraDaLista(itens: { title?: string; category?: string }[]): string[] {
  return itens
    .filter((i) => i.title === undefined || categoriaDoTitulo.get(i.title) !== i.category)
    .map((i) => `${i.title} / ${i.category}`);
}

describe('VT-14 · lista de nomes fictícios (RNF-109)', () => {
  it('é sintética, não vazia e sem título repetido', () => {
    expect(lista.proveniencia).toBe('sintetica');
    expect(lista.itens.length).toBeGreaterThan(0);
    expect(categoriaDoTitulo.size).toBe(lista.itens.length);
  });

  it('declara categorias no padrão do RNF-104, e todo item usa uma delas', () => {
    for (const c of lista.categorias) expect(c).toMatch(PADRAO_CATEGORIA);
    const declaradas = new Set(lista.categorias);
    for (const i of lista.itens) expect(declaradas.has(i.categoria), i.titulo).toBe(true);
  });

  it('não contém nome de marca conhecido (a lista é a raiz da confiança)', () => {
    const marcas = /\b(amazon|kindle|echo dot|fire tv|apple|airpods|stanley|instant pot|anker|sony|logitech|bose)\b/i;
    for (const i of lista.itens) expect(i.titulo).not.toMatch(marcas);
  });
});

describe('VT-14 · catálogo curado de fallback (RF-006)', () => {
  it('só usa títulos da lista, cada um com a categoria da lista', () => {
    expect(STATIC_CURATED_CATALOG.length).toBeGreaterThan(0);
    expect(foraDaLista(STATIC_CURATED_CATALOG)).toEqual([]);
  });

  it('não repete item', () => {
    const ids = STATIC_CURATED_CATALOG.map((i) => i.itemId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('VT-14 · semente local (scripts/seed-local.ts)', () => {
  it('as recomendações semeadas só usam títulos e categorias da lista', () => {
    expect(SEED_RECOMMENDATIONS.length).toBeGreaterThan(0);
    expect(foraDaLista(SEED_RECOMMENDATIONS)).toEqual([]);
  });

  it('os itens vetoriais semeados usam categorias da lista', () => {
    const declaradas = new Set(lista.categorias);
    expect(SEED_VECTOR_ITEMS.length).toBeGreaterThan(0);
    for (const v of SEED_VECTOR_ITEMS) {
      expect(v.category).toMatch(PADRAO_CATEGORIA);
      expect(declaradas.has(v.category), v.itemId).toBe(true);
    }
  });
});

describe('VT-14 · a checagem morde', () => {
  it('reprova um título com marca real', () => {
    const comMarca = [{ title: 'Amazon Echo Dot (5th Gen) Smart Speaker', category: 'Eletronicos' }];
    expect(foraDaLista(comMarca)).toEqual(['Amazon Echo Dot (5th Gen) Smart Speaker / Eletronicos']);
  });

  it('reprova título da lista com categoria trocada', () => {
    const primeiro = lista.itens[0];
    const outra = lista.categorias.find((c) => c !== primeiro.categoria);
    expect(foraDaLista([{ title: primeiro.titulo, category: outra }])).toHaveLength(1);
  });
});
