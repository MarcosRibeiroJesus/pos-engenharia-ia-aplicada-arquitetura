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
  /** Dublês dos clientes de baixo nível para a composição de produção (E7). */
  clients?: DefaultUseCaseClients;
}

export function buildServer(options: ServerOptions = {}): FastifyInstance {
  const { healthCheckers, recommendationUseCase, clients, ...fastifyOptions } = options;

  // Sem caso de uso injetado, é a composição de produção (a de `startServer`): caso de uso e
  // verificadores de saúde compartilham os mesmos adaptadores (mesmo cliente Redis, mesmo disjuntor
  // do SageMaker). Com caso de uso injetado (testes do caso de uso), os verificadores são só os
  // passados.
  const defaults = recommendationUseCase ? undefined : buildDefaultService(clients);
  const useCase = recommendationUseCase ?? defaults!.useCase;
  const checkers = healthCheckers ?? defaults?.healthCheckers;

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

  // RF-008: `/health` consulta as dependências (diagnóstico e alarmes); `/health/live` só prova o
  // processo e é o caminho do ALB e do HEALTHCHECK do contêiner (VT-19).
  const healthController = new HealthController(checkers);
  app.get('/health', (req, reply) => healthController.getHealth(req, reply));
  app.get('/health/live', (req, reply) => healthController.getLiveness(req, reply));

  // Register Recommendations Route
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

export interface DefaultService {
  useCase: IGetRecommendationsUseCase;
  healthCheckers: DownstreamHealthCheckers;
}

export function buildDefaultUseCase(clients: DefaultUseCaseClients = {}): IGetRecommendationsUseCase {
  return buildDefaultService(clients).useCase;
}

/**
 * Composição de produção: o caso de uso e os verificadores de saúde (RF-008) sobre os mesmos
 * adaptadores. DynamoDB e MemoryDB têm verificador ativo barato (GetItem de sonda, PING); o
 * SageMaker, passivo (disjuntor), para o health não pagar inferência.
 */
export function buildDefaultService(clients: DefaultUseCaseClients = {}): DefaultService {
  const batchRepo = new DynamoDbBatchCandidateRepository(clients.dynamoDocClient);
  const vectorRepo = new MemoryDbVectorCandidateRepository(clients.redis);
  const scoringClient = clients.scoringClient ?? new SageMakerScoringClient();
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

  const useCase = new GetRecommendationsUseCase({
    batchRepo,
    vectorRepo,
    scoringClient,
    metricsPublisher,
    explainer,
    // RF-104 (ADR-0012): compras recentes e estoque pelo lote, sem chamada nova; frescor diário.
    inventoryRepo: new BatchDataEligibilityRepository(),
  });

  const healthCheckers: DownstreamHealthCheckers = {
    checkDynamoDb: () => batchRepo.checkHealth(),
    checkMemoryDb: () => vectorRepo.checkHealth(),
    // Dublê sem estado de saúde: sem verificador (o controlador o trata como CONNECTED).
    checkSageMaker: scoringClient.healthStatus
      ? async () => scoringClient.healthStatus!()
      : undefined,
  };

  return { useCase, healthCheckers };
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
