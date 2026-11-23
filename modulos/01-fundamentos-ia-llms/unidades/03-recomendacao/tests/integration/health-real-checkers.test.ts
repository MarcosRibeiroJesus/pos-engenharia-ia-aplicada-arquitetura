import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import type Redis from 'ioredis';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { SageMakerRuntimeClient } from '@aws-sdk/client-sagemaker-runtime';
import { buildServer } from '../../src/serving/src/presentation/server';
import { HealthController } from '../../src/serving/src/presentation/controllers/health.controller';
import { SageMakerScoringClient } from '../../src/serving/src/infrastructure/sagemaker/sagemaker-scoring.client';
import { baseLogger } from '../../src/serving/src/infrastructure/logging/logger';

// VT-19 (T076, RF-008, E7): `GET /health` no servidor montado para produção (`buildServer` sem
// caso de uso injetado, o mesmo que `startServer` chama) usa verificadores reais do DynamoDB, do
// MemoryDB e do SageMaker. Só os clientes de baixo nível são dublês: DynamoDB `send`, Redis `ping`
// e o `SageMakerRuntimeClient` dentro do cliente de produção do re-ranker.
//
// Custo: o health roda fora do caminho de 60 ms. DynamoDB faz um GetItem numa chave fixa de sonda
// (só a chave na projeção, permissão que a task já tem); MemoryDB faz PING. O SageMaker NÃO é
// chamado: o verificador lê o estado do disjuntor do cliente de produção (aberto = UNREACHABLE,
// meio-aberto = DEGRADED), para o health não gerar inferência paga nem cold start no endpoint
// serverless, e sem pedir permissão IAM nova (DescribeEndpoint).
//
// Decisão (aceite da T076): o health check do ALB e o HEALTHCHECK do contêiner usam
// `/health/live`, que só prova o processo. Se usassem `/health`, uma dependência fora (ou todas)
// tiraria a task do target group e o ECS a substituiria; e o 200 com fallback curado do RF-006, que
// existe justamente para a queda das dependências, só sai se a task estiver no ar. `/health` fica
// para diagnóstico e alarmes, não para decidir se a task vive.

const UNIT = path.resolve(__dirname, '../..');

type Fakes = {
  send: ReturnType<typeof vi.fn>;
  ping: ReturnType<typeof vi.fn>;
  runtimeSend: ReturnType<typeof vi.fn>;
  scoringClient: SageMakerScoringClient;
};

function fakes(): Fakes {
  const send = vi.fn().mockResolvedValue({});
  const ping = vi.fn().mockResolvedValue('PONG');
  const runtimeSend = vi.fn().mockRejectedValue(new Error('endpoint fora'));
  const scoringClient = new SageMakerScoringClient(
    { send: runtimeSend } as unknown as SageMakerRuntimeClient,
    'endpoint-teste',
    'v-teste'
  );
  return { send, ping, runtimeSend, scoringClient };
}

function serverWith(f: Fakes) {
  return buildServer({
    clients: {
      dynamoDocClient: { send: f.send } as unknown as DynamoDBDocumentClient,
      redis: { ping: f.ping } as unknown as Redis,
      scoringClient: f.scoringClient,
    },
  });
}

/** Abre o disjuntor do cliente de produção com falhas reais do runtime (volume mínimo de 5). */
async function openSageMakerBreaker(f: Fakes) {
  const input = {
    userId: 'u-1',
    candidates: [{ itemId: 'I-1', initialScore: 0.5, provenance: 'batch' as const, batchScore: 0.5 }],
  };
  for (let i = 0; i < 6; i++) {
    await f.scoringClient.score(input).catch(() => undefined);
  }
}

async function health(f: Fakes) {
  const app = serverWith(f);
  const res = await app.inject({ method: 'GET', url: '/health' });
  await app.close();
  return { statusCode: res.statusCode, body: JSON.parse(res.body) };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('VT-19: /health com verificadores reais no servidor de produção', () => {
  it('tudo no ar: UP, com GetItem na chave de sonda, PING e nenhuma chamada ao SageMaker', async () => {
    const f = fakes();
    const { statusCode, body } = await health(f);

    expect(statusCode).toBe(200);
    expect(body.status).toBe('UP');
    expect(body.downstream).toEqual({ dynamoDb: 'CONNECTED', memoryDb: 'CONNECTED', sageMaker: 'CONNECTED' });

    expect(f.send).toHaveBeenCalledTimes(1);
    const cmd = f.send.mock.calls[0][0];
    expect(cmd.constructor.name).toBe('GetCommand');
    expect(cmd.input.Key).toEqual({ userId: 'health-probe' });
    expect(cmd.input.ProjectionExpression).toBe('userId');
    expect(f.ping).toHaveBeenCalledTimes(1);
    expect(f.runtimeSend).not.toHaveBeenCalled();
  });

  it('DynamoDB fora: DEGRADED (200), só dynamoDb UNREACHABLE', async () => {
    const f = fakes();
    f.send.mockRejectedValue(new Error('ResourceNotFound'));
    const { statusCode, body } = await health(f);

    expect(statusCode).toBe(200);
    expect(body.status).toBe('DEGRADED');
    expect(body.downstream).toEqual({ dynamoDb: 'UNREACHABLE', memoryDb: 'CONNECTED', sageMaker: 'CONNECTED' });
  });

  it('MemoryDB fora: DEGRADED (200), só memoryDb UNREACHABLE', async () => {
    const f = fakes();
    f.ping.mockRejectedValue(new Error('ECONNREFUSED'));
    const { statusCode, body } = await health(f);

    expect(statusCode).toBe(200);
    expect(body.status).toBe('DEGRADED');
    expect(body.downstream).toEqual({ dynamoDb: 'CONNECTED', memoryDb: 'UNREACHABLE', sageMaker: 'CONNECTED' });
  });

  it('SageMaker fora (disjuntor aberto pelo tráfego real): DEGRADED, sem inferência nova no health', async () => {
    const f = fakes();
    await openSageMakerBreaker(f);
    const callsBefore = f.runtimeSend.mock.calls.length;

    const { statusCode, body } = await health(f);

    expect(statusCode).toBe(200);
    expect(body.status).toBe('DEGRADED');
    expect(body.downstream).toEqual({ dynamoDb: 'CONNECTED', memoryDb: 'CONNECTED', sageMaker: 'UNREACHABLE' });
    expect(f.runtimeSend.mock.calls.length).toBe(callsBefore);
  });

  it('SageMaker com disjuntor meio-aberto (resetTimeout vencido): DEGRADED', async () => {
    // Relógio falso só para o timer de reset do opossum: abre por falhas reais e avança 10 s.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const f = fakes();
      await openSageMakerBreaker(f);
      vi.advanceTimersByTime(10_001);
      vi.useRealTimers();
      const callsBefore = f.runtimeSend.mock.calls.length;

      const { statusCode, body } = await health(f);

      expect(statusCode).toBe(200);
      expect(body.status).toBe('DEGRADED');
      expect(body.downstream.sageMaker).toBe('DEGRADED');
      expect(f.runtimeSend.mock.calls.length).toBe(callsBefore);
    } finally {
      vi.useRealTimers();
    }
  });

  it("MemoryDB respondendo 'LOADING' ao PING: DEGRADED", async () => {
    const f = fakes();
    f.ping.mockResolvedValue('LOADING');
    const { statusCode, body } = await health(f);

    expect(statusCode).toBe(200);
    expect(body.status).toBe('DEGRADED');
    expect(body.downstream.memoryDb).toBe('DEGRADED');
  });

  it('todas fora: DOWN (503)', async () => {
    const f = fakes();
    f.send.mockRejectedValue(new Error('fora'));
    f.ping.mockRejectedValue(new Error('fora'));
    await openSageMakerBreaker(f);
    const { statusCode, body } = await health(f);

    expect(statusCode).toBe(503);
    expect(body.status).toBe('DOWN');
    expect(body.downstream).toEqual({ dynamoDb: 'UNREACHABLE', memoryDb: 'UNREACHABLE', sageMaker: 'UNREACHABLE' });
  });

  it('o log da falha leva só dependência e categoria, sem a mensagem do erro', async () => {
    const f = fakes();
    f.send.mockRejectedValue(new Error('detalhe-interno-x9'));
    const warn = vi.spyOn(baseLogger, 'warn');

    await health(f);

    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).toContain('dynamodb');
    expect(logged).not.toContain('detalhe-interno-x9');
  });
});

describe('VT-19: verificador lento ou com valor fora da lista permitida', () => {
  it('verificador que não responde no prazo vira UNREACHABLE', async () => {
    const controller = new HealthController(
      { checkDynamoDb: () => new Promise(() => undefined) },
      { timeoutMs: 20 }
    );
    const app = buildServer({ healthCheckers: {}, recommendationUseCase: { execute: vi.fn() } as never });
    app.get('/h-lento', (req, reply) => controller.getHealth(req, reply));
    const res = await app.inject({ method: 'GET', url: '/h-lento' });
    await app.close();

    expect(JSON.parse(res.body).downstream.dynamoDb).toBe('UNREACHABLE');
  });

  it('status fora de CONNECTED/DEGRADED/UNREACHABLE vira UNREACHABLE', async () => {
    const controller = new HealthController({ checkMemoryDb: async () => 'OK' as never });
    const app = buildServer({ healthCheckers: {}, recommendationUseCase: { execute: vi.fn() } as never });
    app.get('/h-invalido', (req, reply) => controller.getHealth(req, reply));
    const res = await app.inject({ method: 'GET', url: '/h-invalido' });
    await app.close();

    expect(JSON.parse(res.body).downstream.memoryDb).toBe('UNREACHABLE');
  });
});

describe('VT-19: liveness só prova o processo (ALB e contêiner)', () => {
  it('/health/live dá 200 com todas as dependências fora e não chama nenhuma', async () => {
    const f = fakes();
    f.send.mockRejectedValue(new Error('fora'));
    f.ping.mockRejectedValue(new Error('fora'));
    const app = serverWith(f);
    const res = await app.inject({ method: 'GET', url: '/health/live' });
    await app.close();

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).status).toBe('UP');
    expect(f.send).not.toHaveBeenCalled();
    expect(f.ping).not.toHaveBeenCalled();
    expect(f.runtimeSend).not.toHaveBeenCalled();
  });

  it('o target group do ALB usa /health/live', () => {
    const tf = readFileSync(path.join(UNIT, 'infra/terraform/modules/ecs_service/main.tf'), 'utf-8');
    const block = tf.slice(tf.indexOf('health_check {'), tf.indexOf('}', tf.indexOf('health_check {')));
    expect(block).toMatch(/path\s*=\s*"\/health\/live"/);
  });

  it('o HEALTHCHECK do contêiner usa /health/live', () => {
    const dockerfile = readFileSync(path.join(UNIT, 'src/serving/Dockerfile'), 'utf-8');
    const line = dockerfile.split('\n').find((l) => l.includes('CMD curl'));
    expect(line).toContain('http://localhost:8080/health/live');
  });
});
