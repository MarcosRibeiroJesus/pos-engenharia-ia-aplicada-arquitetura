/**
 * Falha de dependência propagada (RF-106, E4, ADR-0011).
 *
 * Os adaptadores do DynamoDB e do MemoryDB lançam este erro em vez de devolver lista vazia: lista
 * vazia é "sem dados", e misturar as duas coisas deixa o modo degradado e o alarme cegos. Quem
 * decide a degradação é o caso de uso, que recebe a dependência, a categoria e se vale repetir.
 */
export type Dependencia = 'dynamodb' | 'memorydb' | 'sagemaker';

/**
 * - `timeout`: a dependência não respondeu no orçamento do disjuntor; repetir pode dar certo.
 * - `circuito_aberto`: o disjuntor recusou sem chamar; repetir agora falha igual até o reset.
 * - `indisponivel`: o cliente lançou (rede, serviço, limite); tratada como transitória.
 * - `contrato`: a dependência respondeu fora do contrato (ex.: re-ranker com quantidade de scores
 *   diferente da de candidatos, ADR-0008); repetir a mesma chamada dá o mesmo erro.
 */
export type CategoriaDependencia = 'timeout' | 'circuito_aberto' | 'indisponivel' | 'contrato';

export class DependencyError extends Error {
  public readonly dependencia: Dependencia;
  public readonly categoria: CategoriaDependencia;
  public readonly retentavel: boolean;

  constructor(dependencia: Dependencia, categoria: CategoriaDependencia, cause?: unknown) {
    // A mensagem não leva entrada do usuário (userId, categoria): só a dependência e o motivo.
    super(`Dependência ${dependencia} falhou: ${categoria}`, { cause });
    this.name = 'DependencyError';
    this.dependencia = dependencia;
    this.categoria = categoria;
    this.retentavel = categoria === 'timeout' || categoria === 'indisponivel';
  }

  /** Classifica a rejeição do `breaker.fire` pelos códigos do opossum. */
  static fromBreaker(dependencia: Dependencia, error: unknown): DependencyError {
    if (error instanceof DependencyError) return error;
    const code = (error as { code?: unknown } | null)?.code;
    if (code === 'ETIMEDOUT') return new DependencyError(dependencia, 'timeout', error);
    if (code === 'EOPENBREAKER') return new DependencyError(dependencia, 'circuito_aberto', error);
    return new DependencyError(dependencia, 'indisponivel', error);
  }
}

/** Erro de validação (categoria `validacao`): entrada recusada, não queda de dependência. */
export function isValidationError(error: unknown): boolean {
  return (error as { categoria?: unknown } | null)?.categoria === 'validacao';
}
