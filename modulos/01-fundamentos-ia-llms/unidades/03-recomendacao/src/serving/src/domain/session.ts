/**
 * Itens da sessão que derivam o vetor da busca em tempo real (RF-105, E5, ADR-0011).
 *
 * Cada id vira a chave `item:<id>` de um HGET no MemoryDB, então a entrada é validada por lista de
 * caracteres permitidos (o mesmo padrão do `userId`) e por tamanho antes de qualquer comando. O
 * controlador responde 400 e o repositório confere de novo (defesa em profundidade).
 */
import { USER_ID_PATTERN } from './candidate';

export const MAX_SESSION_ITEMS = 10;

export const SESSION_ITEMS_MESSAGE = `Parameter 'sessionItemIds' must have at most ${MAX_SESSION_ITEMS} ids matching pattern '${USER_ID_PATTERN.source}'`;

export function isValidSessionItems(ids: readonly unknown[]): ids is string[] {
  return (
    ids.length <= MAX_SESSION_ITEMS &&
    ids.every((id) => typeof id === 'string' && USER_ID_PATTERN.test(id))
  );
}

/** Erro de validação estruturado: não retentável, e a entrada recusada não entra na mensagem. */
export class InvalidSessionItemsError extends Error {
  public readonly categoria = 'validacao' as const;
  public readonly retentavel = false;

  constructor() {
    super(SESSION_ITEMS_MESSAGE);
    this.name = 'InvalidSessionItemsError';
  }
}

export function assertValidSessionItems(ids: readonly unknown[]): void {
  if (!isValidSessionItems(ids)) {
    throw new InvalidSessionItemsError();
  }
}
