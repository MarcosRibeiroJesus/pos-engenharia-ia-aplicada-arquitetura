import { describe, it, expect, vi, afterEach } from 'vitest';
import type { SageMakerRuntimeClient } from '@aws-sdk/client-sagemaker-runtime';
import {
  SageMakerScoringClient,
  RERANKER_FEATURES,
  MAX_CANDIDATES_PER_CALL,
  SageMakerScoringRequest,
  InvalidRerankerFeatureError,
} from '../../src/serving/src/infrastructure/sagemaker/sagemaker-scoring.client';
import { DependencyError } from '../../src/serving/src/domain/dependency-error';
import { loadEnv, env } from '../../src/serving/src/config/env';
import { baseLogger } from '../../src/serving/src/infrastructure/logging/logger';

// VT-09 e VT-16 (T075, RF-005, ADR-0008): o container nativo do XGBoost 1.7-1 recebe `text/csv`, uma
// linha por candidato com as 3 features na ordem do treino (`batchScore,vectorScore,hibrido`), sem
// cabeçalho, e devolve um score por linha, na mesma ordem. O runtime do SageMaker é simulado; os
// bytes que sairiam para o endpoint são lidos do comando montado.

type SendFn = (cmd: { input: Record<string, unknown> }) => Promise<{ Body?: Uint8Array }>;

function buildClient(send: SendFn, modelVersion = 'xgb-teste-0001') {
  const fake = { send: vi.fn(send) };
  const client = new SageMakerScoringClient(fake as unknown as SageMakerRuntimeClient, 'endpoint-teste', modelVersion);
  return { client, send: fake.send };
}

function body(text: string): Uint8Array {
  return new Uint8Array(Buffer.from(text, 'utf-8'));
}

const request: SageMakerScoringRequest = {
  userId: 'u-12345',
  candidates: [
    { itemId: 'PROD-A', initialScore: 0.84, provenance: 'hybrid', batchScore: 0.8, vectorScore: 0.9 },
    { itemId: 'PROD-B', initialScore: 0.6, provenance: 'batch', batchScore: 0.6 },
    { itemId: 'PROD-C', initialScore: 0.7, provenance: 'realtime', vectorScore: 0.7 },
  ],
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('VT-09: cliente do re-ranker no contrato CSV do container nativo', () => {
  it('a ordem das features é a do treino (ADR-0008)', () => {
    expect(RERANKER_FEATURES).toEqual(['batchScore', 'vectorScore', 'hibrido']);
    expect(MAX_CANDIDATES_PER_CALL).toBe(100);
  });

  it('manda text/csv com uma linha por candidato, na ordem, sem cabeçalho nem dado do usuário', async () => {
    const { client, send } = buildClient(async () => ({ Body: body('0.1\n0.9\n0.5\n') }));

    await client.scoreCandidates(request);

    expect(send).toHaveBeenCalledTimes(1);
    const input = send.mock.calls[0][0].input;
    expect(input.EndpointName).toBe('endpoint-teste');
    expect(input.ContentType).toBe('text/csv');
    expect(input.Accept).toBe('text/csv');
    const sent = Buffer.from(input.Body as Uint8Array).toString('utf-8');
    // Fonte ausente vale 0; `hibrido` é 1 só para o candidato que veio das duas fontes.
    expect(sent).toBe('0.800000,0.900000,1\n0.600000,0.000000,0\n0.000000,0.700000,0');
    expect(sent).not.toContain('u-12345');
    expect(sent).not.toContain('PROD-');
  });

  it('lê um score por linha e devolve na ordem dos candidatos', async () => {
    const { client } = buildClient(async () => ({ Body: body('0.1\n0.9\n0.5\n') }));

    const predictions = await client.scoreCandidates(request);

    expect(predictions).toEqual([
      { itemId: 'PROD-A', score: 0.1 },
      { itemId: 'PROD-B', score: 0.9 },
      { itemId: 'PROD-C', score: 0.5 },
    ]);
  });

  it('aceita os scores separados por vírgula numa linha só, na ordem (formato do container a confirmar no DM-06)', async () => {
    const { client } = buildClient(async () => ({ Body: body('0.1,0.9,0.5') }));

    const predictions = await client.scoreCandidates(request);

    expect(predictions).toEqual([
      { itemId: 'PROD-A', score: 0.1 },
      { itemId: 'PROD-B', score: 0.9 },
      { itemId: 'PROD-C', score: 0.5 },
    ]);
  });

  it.each([
    ['vírgulas com contagem errada', '0.1,0.9'],
    ['menos scores que candidatos', '0.1\n0.9\n'],
    ['mais scores que candidatos', '0.1\n0.9\n0.5\n0.3\n'],
    ['corpo vazio', ''],
    ['score não numérico', '0.1\nabc\n0.5\n'],
    ['score fora de [0, 1]', '0.1\n1.5\n0.5\n'],
    ['score NaN', '0.1\nNaN\n0.5\n'],
    ['linha vazia no meio', '0.1\n\n0.5\n'],
    ['JSON do contrato legado', '{"modelId":"x","predictions":[]}'],
  ])('%s vira erro de contrato estruturado, não retentável', async (_caso, text) => {
    const { client } = buildClient(async () => ({ Body: body(text) }));

    const err = await client.scoreCandidates(request).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(DependencyError);
    expect(err).toMatchObject({ dependencia: 'sagemaker', categoria: 'contrato', retentavel: false });
    // A mensagem não ecoa a resposta do endpoint nem o usuário.
    expect((err as Error).message).not.toContain('u-12345');
    expect((err as Error).message).not.toContain(text.trim() || '§');
  });

  it('feature fora de [0, 1] ou não finita tem origem `feature`, não culpa o endpoint e nada sai para ele', async () => {
    const warn = vi.spyOn(baseLogger, 'warn');
    const { client, send } = buildClient(async () => ({ Body: body('0.1\n') }));

    for (const bad of [Number.NaN, 1.5, -0.1, Number.POSITIVE_INFINITY]) {
      const err = await client
        .scoreCandidates({ userId: 'u-1', candidates: [{ itemId: 'X', initialScore: 0.5, provenance: 'batch', batchScore: bad }] })
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(InvalidRerankerFeatureError);
      expect(err).not.toBeInstanceOf(DependencyError);
      expect(err).toMatchObject({ origem: 'feature', categoria: 'contrato', retentavel: false });
    }
    expect(send).not.toHaveBeenCalled();
    expect(warn.mock.calls.every(([fields]) => (fields as { origem?: string }).origem === 'feature')).toBe(true);
    expect(JSON.stringify(warn.mock.calls)).not.toContain('u-1');
  });

  it('erro de contrato da resposta conta no disjuntor: depois de 5, a 6ª chamada nem sai', async () => {
    const { client, send } = buildClient(async () => ({ Body: body('0.1\n') }));

    for (let i = 0; i < 5; i++) {
      const err = await client.scoreCandidates(request).catch((e: unknown) => e);
      expect(err).toMatchObject({ dependencia: 'sagemaker', categoria: 'contrato' });
    }
    const sexta = await client.scoreCandidates(request).catch((e: unknown) => e);

    expect(sexta).toMatchObject({ dependencia: 'sagemaker', categoria: 'circuito_aberto', retentavel: false });
    expect(send).toHaveBeenCalledTimes(5);
  });

  it('limita a 100 candidatos por chamada', async () => {
    const candidates = Array.from({ length: 130 }, (_, i) => ({
      itemId: `P-${i}`,
      initialScore: 0.5,
      provenance: 'batch' as const,
      batchScore: 0.5,
    }));
    const { client, send } = buildClient(async () => ({ Body: body(Array(100).fill('0.5').join('\n')) }));

    const predictions = await client.scoreCandidates({ userId: 'u-1', candidates });

    const sent = Buffer.from(send.mock.calls[0][0].input.Body as Uint8Array).toString('utf-8');
    expect(sent.split('\n')).toHaveLength(100);
    expect(predictions).toHaveLength(100);
    expect(predictions[99].itemId).toBe('P-99');
  });

  it('sem candidatos não chama o endpoint', async () => {
    const { client, send } = buildClient(async () => ({ Body: body('') }));

    expect(await client.scoreCandidates({ userId: 'u-1', candidates: [] })).toEqual([]);
    expect(send).not.toHaveBeenCalled();
  });

  it('estouro dos 35 ms vira DependencyError de timeout, retentável', async () => {
    const { client } = buildClient(
      () => new Promise((resolve) => setTimeout(() => resolve({ Body: body('0.1\n0.9\n0.5') }), 200))
    );

    const err = await client.scoreCandidates(request).catch((e: unknown) => e);

    expect(err).toMatchObject({ dependencia: 'sagemaker', categoria: 'timeout', retentavel: true });
  });

  it('falha do runtime vira DependencyError indisponível, e o log não leva o userId', async () => {
    const warn = vi.spyOn(baseLogger, 'warn');
    const { client } = buildClient(async () => {
      throw new Error('ServiceUnavailable');
    });

    const err = await client.scoreCandidates(request).catch((e: unknown) => e);

    expect(err).toMatchObject({ dependencia: 'sagemaker', categoria: 'indisponivel', retentavel: true });
    expect(warn).toHaveBeenCalled();
    expect(JSON.stringify(warn.mock.calls)).not.toContain('u-12345');
  });
});

describe('VT-16: modelId do re-ranker vem de RERANKER_MODEL_VERSION', () => {
  it('a resposta do cliente traz o modelId da configuração, não do endpoint', async () => {
    const { client } = buildClient(async () => ({ Body: body('0.1\n0.9\n0.5') }), 'xgb-5f3a9c');

    const response = await client.score(request);

    expect(response.modelId).toBe('xgb-5f3a9c');
    expect(response.predictions.map((p) => p.itemId)).toEqual(['PROD-A', 'PROD-B', 'PROD-C']);
  });

  it('sem versão explícita, o cliente usa a variável de ambiente', async () => {
    vi.stubEnv('RERANKER_MODEL_VERSION', 'xgb-da-variavel');
    vi.resetModules();
    const mod = await import('../../src/serving/src/infrastructure/sagemaker/sagemaker-scoring.client');
    const fake = { send: vi.fn(async () => ({ Body: body('0.2') })) };
    const client = new mod.SageMakerScoringClient(fake as unknown as SageMakerRuntimeClient, 'endpoint-teste');

    const response = await client.score({
      userId: 'u-1',
      candidates: [{ itemId: 'X', initialScore: 0.5, provenance: 'batch', batchScore: 0.5 }],
    });

    expect(response.modelId).toBe('xgb-da-variavel');
  });

  it('a variável só aceita a lista permitida de caracteres; sem ela, um valor neutro', () => {
    expect(loadEnv({ RERANKER_MODEL_VERSION: 'reranker-0a1b2c3d_v1.7' }).RERANKER_MODEL_VERSION).toBe(
      'reranker-0a1b2c3d_v1.7'
    );
    for (const bad of ['', 'a b', 'x;rm', 'v\n1', 'a'.repeat(129)]) {
      expect(() => loadEnv({ RERANKER_MODEL_VERSION: bad })).toThrow(/RERANKER_MODEL_VERSION/);
    }
    expect(env.RERANKER_MODEL_VERSION).toMatch(/^[A-Za-z0-9._-]{1,128}$/);
  });
});
