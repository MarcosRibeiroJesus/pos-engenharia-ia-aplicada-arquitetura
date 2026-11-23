import fastify, { FastifyInstance, FastifyServerOptions } from 'fastify';
import { randomUUID } from 'crypto';
import { env } from '../config/env';
import { baseLogger } from '../infrastructure/logging/logger';
import { HealthController, DownstreamHealthCheckers } from './controllers/health.controller';
import { RecommendationController } from './controllers/recommendation.controller';
import { IGetRecommendationsUseCase, GetRecommendationsUseCase } from '../application/get-recommendations.use-case';
import { DynamoDbBatchCandidateRepository } from '../infrastructure/dynamodb/dynamodb-batch-candidate.repository';
import { MemoryDbVectorCandidateRepository } from '../infrastructure/memorydb/memorydb-vector-candidate.repository';
import { ISageMakerScoringClient, SageMakerScoringClient } from '../infrastructure/sagemaker/sagemaker-scoring.client';
import { EmfMetricsPublisher, ICloudWatchMetricsPublisher } from '../infrastructure/monitoring/cloudwatch-metrics';
import { BatchDataEligibilityRepository } from '../infrastructure/cache/inventory-eligibility.repository';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type Redis from 'ioredis';
import { BedrockClaudeClient } from '../infrastructure/bedrock/bedrock-claude.client';
import { RecommendationExplainer } from '../application/recommendation-explainer';

export interface ServerOptions extends FastifyServerOptions {
  healthCheckers?: DownstreamHealthCheckers;
  recommendationUseCase?: IGetRecommendationsUseCase;
}

export function buildServer(options: ServerOptions = {}): FastifyInstance {
  const { healthCheckers, recommendationUseCase, ...fastifyOptions } = options;

  const app = fastify({
    logger: false, // We use custom structured logging via Pino
    genReqId: (req) => {
      const headerReqId = req.headers['x-request-id'];
      if (typeof headerReqId === 'string' && headerReqId.trim().length > 0) {
        return headerReqId;
      }
      return `req-${randomUUID()}`;
    },
    requestIdHeader: 'x-request-id',
    ...fastifyOptions,
  });

  // Request & response logging hooks
  app.addHook('onRequest', async (req) => {
    baseLogger.info(
      {
        requestId: req.id,
        method: req.method,
        url: req.url,
      },
      `Incoming request ${req.method} ${req.url}`
    );
  });

  app.addHook('onResponse', async (req, reply) => {
    baseLogger.info(
      {
        requestId: req.id,
        method: req.method,
        url: req.url,
        statusCode: reply.statusCode,
        responseTimeMs: reply.elapsedTime,
      },
      `Request completed ${req.method} ${req.url} with ${reply.statusCode}`
    );
  });

  // Global Error Handler conforming to OpenAPI ErrorResponse
  app.setErrorHandler((error, req, reply) => {
    baseLogger.error(
      {
        requestId: req.id,
        error: error.name,
        message: error.message,
        stack: error.stack,
      },
      `Request error: ${error.message}`
    );

    const statusCode = error.statusCode && error.statusCode >= 400 && error.statusCode < 500
      ? error.statusCode
      : error.validation
      ? 400
      : 500;

    const errorName = statusCode === 400 ? 'Bad Request' : statusCode === 404 ? 'Not Found' : 'Internal Server Error';

    reply.status(statusCode).send({
      error: errorName,
      message: error.message || 'An unexpected error occurred.',
      requestId: req.id,
    });
  });

  // Register Health Check Route
  const healthController = new HealthController(healthCheckers);
  app.get('/health', (req, reply) => healthController.getHealth(req, reply));

  // Register Recommendations Route
  const useCase = recommendationUseCase || buildDefaultUseCase();
  const recommendationController = new RecommendationController(useCase);
  app.get('/v1/recommendations', (req, reply) => recommendationController.getRecommendations(req, reply));

  return app;
}

/**
 * Clientes de baixo nível que o teste pode trocar por dublês. A composição (adaptadores, filtros e
 * repositório de elegibilidade) é sempre a de produção: o teste prova o que roda no contêiner
 * (E7, ADR-0012).
 */
export interface DefaultUseCaseClients {
  dynamoDocClient?: DynamoDBDocumentClient;
  redis?: Redis;
  scoringClient?: ISageMakerScoringClient;
  metricsPublisher?: ICloudWatchMetricsPublisher;
}

export function buildDefaultUseCase(clients: DefaultUseCaseClients = {}): IGetRecommendationsUseCase {
  const metricsPublisher = clients.metricsPublisher ?? new EmfMetricsPublisher();
  const explainer = env.EXPLANATIONS_ENABLED
    ? new RecommendationExplainer(new BedrockClaudeClient(), {
        modelId: env.BEDROCK_MODEL_ID,
        timeoutMs: env.EXPLANATION_TIMEOUT_MS,
        metrics: {
          publishExplanationRetry: () => metricsPublisher.publishExplanationRetry?.(),
          publishExplanationFallback: (c) => metricsPublisher.publishExplanationFallback?.(c),
        },
      })
    : undefined;

  return new GetRecommendationsUseCase({
    batchRepo: new DynamoDbBatchCandidateRepository(clients.dynamoDocClient),
    vectorRepo: new MemoryDbVectorCandidateRepository(clients.redis),
    scoringClient: clients.scoringClient ?? new SageMakerScoringClient(),
    metricsPublisher,
    explainer,
    // RF-104 (ADR-0012): compras recentes e estoque pelo lote, sem chamada nova; frescor diário.
    inventoryRepo: new BatchDataEligibilityRepository(),
  });
}

export async function startServer(): Promise<FastifyInstance> {
  const server = buildServer();
  try {
    const address = await server.listen({
      port: env.PORT,
      host: '0.0.0.0',
    });
    baseLogger.info(`Recommendation Service listening on ${address}`);
    return server;
  } catch (err) {
    baseLogger.error(err, 'Failed to start server');
    process.exit(1);
  }
}

// Auto-start if invoked directly
if (require.main === module) {
  startServer();
}
