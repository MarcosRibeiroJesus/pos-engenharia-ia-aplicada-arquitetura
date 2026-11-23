/**
 * Categoria do catálogo (RNF-104, ADR-0011).
 *
 * A categoria entra na expressão de tag `(@cat:{<categoria>})` do FT.SEARCH, e a gramática do
 * MemoryDB não documenta escape para tags nem parâmetro fora do vetor. Por isso a entrada é
 * validada por lista de caracteres permitidos, nunca por lista de proibidos: o padrão abaixo é a
 * única fonte da regra, usada pelo controlador (400) e pelo repositório (erro de validação).
 */
export const CATEGORY_PATTERN = /^[A-Za-z0-9_]{1,40}$/;

/** Texto do padrão, para mensagens de erro e para o contrato OpenAPI. */
export const CATEGORY_PATTERN_SOURCE = CATEGORY_PATTERN.source;

export function isValidCategory(value: unknown): value is string {
  return typeof value === 'string' && CATEGORY_PATTERN.test(value);
}

/** Erro de validação estruturado: não retentável, porque repetir a mesma entrada falha igual. */
export class InvalidCategoryError extends Error {
  public readonly categoria = 'validacao' as const;
  public readonly retentavel = false;

  constructor() {
    // A entrada recusada não entra na mensagem nem no log: é texto não confiável.
    super(`Parameter 'category' must match pattern '${CATEGORY_PATTERN_SOURCE}'`);
    this.name = 'InvalidCategoryError';
  }
}

export function assertValidCategory(value: string): void {
  if (!isValidCategory(value)) {
    throw new InvalidCategoryError();
  }
}
