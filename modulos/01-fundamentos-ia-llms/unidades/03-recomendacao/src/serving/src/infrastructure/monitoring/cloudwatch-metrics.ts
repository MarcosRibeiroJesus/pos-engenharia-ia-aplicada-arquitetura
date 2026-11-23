import { env } from '../../config/env';
import { baseLogger } from '../logging/logger';

export interface ICloudWatchMetricsPublisher {
  publishDegradedMode(): Promise<void>;
  publishSageMakerFallback(): Promise<void>;
  publishMemoryDbFallback(): Promise<void>;
  publishDynamoDbFallback(): Promise<void>;
  publishExplanationRetry?(): Promise<void>;
  publishExplanationFallback?(category: string): Promise<void>;
}

export interface EmfMetricsPublisherOptions {
  /** Namespace das métricas; o padrão é `METRICS_NAMESPACE` (Ecommerce/Recommendations). */
  namespace?: string;
  /** Destino da linha EMF; o padrão é o stdout, que o driver awslogs envia ao CloudWatch Logs. */
  write?: (line: string) => void;
  /** Relógio em milissegundos desde a época, injetável para teste. */
  now?: () => number;
}

/**
 * Publica as contagens do serviço no Embedded Metric Format (ADR-0013, T015).
 *
 * Cada contagem é uma linha JSON no stdout com o bloco `_aws.CloudWatchMetrics`; o CloudWatch
 * Logs extrai a métrica da linha, então o serviço não chama a API de métricas, não precisa do
 * endpoint de interface `monitoring` e a task role não precisa de permissão de CloudWatch.
 *
 * A linha leva só o bloco `_aws` e o valor da métrica: nunca userId, requestId, prompt ou texto do
 * modelo. O payload é montado aqui, sem receber contexto da requisição, para isso valer por
 * construção, e não por disciplina de quem chama.
 */
export class EmfMetricsPublisher implements ICloudWatchMetricsPublisher {
  private readonly namespace: string;
  private readonly write: (line: string) => void;
  private readonly now: () => number;

  constructor(options: EmfMetricsPublisherOptions = {}) {
    this.namespace = options.namespace ?? env.METRICS_NAMESPACE;
    this.write = options.write ?? ((line) => void process.stdout.write(line));
    this.now = options.now ?? Date.now;
  }

  private async putMetric(metricName: string, value = 1): Promise<void> {
    try {
      const line = JSON.stringify({
        _aws: {
          Timestamp: this.now(),
          CloudWatchMetrics: [
            {
              Namespace: this.namespace,
              // Sem dimensões: os alarmes do módulo cloudwatch_monitoring usam `dimensions = {}`.
              Dimensions: [[]],
              Metrics: [{ Name: metricName, Unit: 'Count' }],
            },
          ],
        },
        [metricName]: value,
      });
      this.write(`${line}\n`);
    } catch (err) {
      // Falha ao publicar métrica nunca derruba a requisição de recomendação.
      baseLogger.warn({ err, metricName }, `Failed to emit EMF metric: ${metricName}`);
    }
  }

  public async publishDegradedMode(): Promise<void> {
    await this.putMetric('DegradedModeCount');
  }

  public async publishSageMakerFallback(): Promise<void> {
    await this.putMetric('SageMakerFallbackCount');
  }

  public async publishMemoryDbFallback(): Promise<void> {
    await this.putMetric('MemoryDbFallbackCount');
  }

  public async publishDynamoDbFallback(): Promise<void> {
    await this.putMetric('DynamoDbFallbackCount');
  }

  public async publishExplanationRetry(): Promise<void> {
    await this.putMetric('ExplanationRetryCount');
  }

  public async publishExplanationFallback(category: string): Promise<void> {
    await this.putMetric('ExplanationFallbackCount');
    // `category` é o enum fechado ExplanationErrorCategory, nunca texto livre.
    await this.putMetric(`ExplanationFallback_${category}`);
  }
}
