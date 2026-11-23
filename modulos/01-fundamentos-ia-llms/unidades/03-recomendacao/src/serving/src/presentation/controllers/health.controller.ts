import { FastifyRequest, FastifyReply } from 'fastify';
import { DownstreamStatus, isDownstreamStatus } from '../../domain/health';
import { baseLogger } from '../../infrastructure/logging/logger';

export type { DownstreamStatus } from '../../domain/health';
export type OverallServiceStatus = 'UP' | 'DEGRADED' | 'DOWN';

export interface HealthResponse {
  status: OverallServiceStatus;
  timestamp: string;
  downstream: {
    dynamoDb: DownstreamStatus;
    memoryDb: DownstreamStatus;
    sageMaker: DownstreamStatus;
  };
}

export interface DownstreamHealthCheckers {
  checkDynamoDb?: () => Promise<DownstreamStatus>;
  checkMemoryDb?: () => Promise<DownstreamStatus>;
  checkSageMaker?: () => Promise<DownstreamStatus>;
}

export interface HealthControllerOptions {
  /** Prazo de cada verificador. O health roda fora do caminho de 60 ms; o prazo só evita pendurar. */
  timeoutMs?: number;
}

/** Abaixo do timeout de 5 s do health check, para a resposta sair mesmo com dependência pendurada. */
export const DEFAULT_HEALTH_CHECK_TIMEOUT_MS = 1000;

type Dependencia = 'dynamodb' | 'memorydb' | 'sagemaker';

export class HealthController {
  private checkers: DownstreamHealthCheckers;
  private timeoutMs: number;

  constructor(checkers: DownstreamHealthCheckers = {}, options: HealthControllerOptions = {}) {
    this.checkers = checkers;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_HEALTH_CHECK_TIMEOUT_MS;
  }

  /**
   * Executa um verificador com prazo. Erro, prazo vencido ou valor fora da lista permitida viram
   * `UNREACHABLE`. O log leva só a dependência e a categoria: nunca a mensagem do erro.
   */
  private async run(dependencia: Dependencia, check?: () => Promise<DownstreamStatus>): Promise<DownstreamStatus> {
    if (!check) return 'CONNECTED';
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<'timeout'>((resolve) => {
      timer = setTimeout(() => resolve('timeout'), this.timeoutMs);
      timer.unref?.();
    });
    try {
      const result = await Promise.race([check(), timeout]);
      if (result === 'timeout') {
        baseLogger.warn({ dependencia, categoria: 'timeout', retentavel: true }, 'Verificador de saúde sem resposta no prazo');
        return 'UNREACHABLE';
      }
      if (!isDownstreamStatus(result)) {
        baseLogger.warn({ dependencia, categoria: 'contrato', retentavel: false }, 'Verificador de saúde devolveu status fora da lista');
        return 'UNREACHABLE';
      }
      return result;
    } catch (error) {
      baseLogger.warn(
        { dependencia, categoria: 'indisponivel', retentavel: true, erro: error instanceof Error ? error.name : 'desconhecido' },
        'Verificador de saúde falhou'
      );
      return 'UNREACHABLE';
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  public async getHealth(_req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const [dynamoDb, memoryDb, sageMaker] = await Promise.all([
      this.run('dynamodb', this.checkers.checkDynamoDb),
      this.run('memorydb', this.checkers.checkMemoryDb),
      this.run('sagemaker', this.checkers.checkSageMaker),
    ]);

    let overallStatus: OverallServiceStatus = 'UP';
    const statuses = [dynamoDb, memoryDb, sageMaker];

    if (statuses.every((s) => s === 'UNREACHABLE')) {
      overallStatus = 'DOWN';
    } else if (statuses.some((s) => s === 'DEGRADED' || s === 'UNREACHABLE')) {
      overallStatus = 'DEGRADED';
    } else {
      overallStatus = 'UP';
    }

    const payload: HealthResponse = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      downstream: {
        dynamoDb,
        memoryDb,
        sageMaker,
      },
    };

    const statusCode = overallStatus === 'DOWN' ? 503 : 200;
    reply.status(statusCode).send(payload);
  }

  /**
   * Liveness (ALB e HEALTHCHECK do contêiner): só prova que o processo responde. Não consulta
   * dependência, para uma queda delas não tirar a task do ar (o fallback do RF-006 precisa dela).
   */
  public async getLiveness(_req: FastifyRequest, reply: FastifyReply): Promise<void> {
    reply.status(200).send({ status: 'UP', timestamp: new Date().toISOString() });
  }
}
