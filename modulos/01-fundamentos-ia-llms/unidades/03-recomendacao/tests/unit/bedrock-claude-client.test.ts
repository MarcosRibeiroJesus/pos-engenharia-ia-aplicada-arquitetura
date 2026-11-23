import { describe, it, expect, vi } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';
import AnthropicBedrock from '@anthropic-ai/bedrock-sdk';
import { BedrockClaudeClient } from '../../src/serving/src/infrastructure/bedrock/bedrock-claude.client';
import { RecommendationExplainer, ExplainInput } from '../../src/serving/src/application/recommendation-explainer';
import { contratoBedrock, loadEnv, rotuloDoPerfil } from '../../src/serving/src/config/env';
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { erroGravado, mensagemGravada, guardrailDeSaidaQueAprova, transporteAwsGravado } from '../fixtures/claude/gravacoes';
import type Anthropic from '@anthropic-ai/sdk';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type Redis from 'ioredis';

// VT-10 (T081, RF-110, ADR-0010, E9): configuração pelo contrato da plataforma, cabeçalhos do
// guardrail no InvokeModel e falha fechada. Nenhuma chamada real: o SDK do Bedrock roda de verdade
// (montagem do pedido e assinatura SigV4), mas o fetch é simulado e devolve a resposta gravada
// `sucesso` (sintética, D-006). Os valores abaixo são marcadores sintéticos, não recursos reais:
// conta 000000000000, ids sem significado e credenciais de teste sem valor.
const PERFIL_ARN = 'arn:aws:bedrock:us-east-1:000000000000:application-inference-profile/perfilsintetico';
const GUARDRAIL_ID = 'guardrailsintetico';
const GUARDRAIL_VERSAO = '3';

const CONTRATO_COMPLETO = {
  BEDROCK_PERFIL_ARN: PERFIL_ARN,
  GUARDRAIL_ID,
  GUARDRAIL_VERSAO,
};

const input: ExplainInput = {
  userId: 'u-1',
  sessionItemIds: ['SKU-9'],
  items: [
    { itemId: 'SKU-1', title: 'Fone sem fio', category: 'Audio', provenance: 'hybrid', batchScore: 0.8, vectorScore: 0.9 },
    { itemId: 'SKU-2', title: 'Capa de celular', category: 'Acessorios', provenance: 'batch', batchScore: 0.6 },
  ],
};

interface PedidoCapturado {
  url: URL;
  headers: Headers;
  body: Record<string, unknown>;
}

/** SDK real do Bedrock com fetch simulado: captura o pedido final (já assinado) e devolve a gravação. */
function sdkComFetchSimulado() {
  const pedidos: PedidoCapturado[] = [];
  const fetchSimulado = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    pedidos.push({
      url: new URL(String(url)),
      headers: new Headers(init?.headers),
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
    });
    return new Response(JSON.stringify(mensagemGravada('sucesso')), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
  const sdk = new AnthropicBedrock({
    awsRegion: 'us-east-1',
    baseURL: 'https://bedrock-runtime.us-east-1.amazonaws.com',
    awsAccessKey: 'credencial-sintetica-de-teste',
    awsSecretKey: 'credencial-sintetica-de-teste',
    maxRetries: 0,
    fetch: fetchSimulado as unknown as typeof fetch,
  });
  return { sdk, pedidos, fetchSimulado };
}

describe('VT-10: configuração do Claude vem do contrato da plataforma (RF-110)', () => {
  it('aceita o ARN do perfil de aplicação, o id e a versão numerada do guardrail', () => {
    const c = contratoBedrock(CONTRATO_COMPLETO);
    expect(c).toEqual({ valido: true, perfilArn: PERFIL_ARN, guardrailId: GUARDRAIL_ID, guardrailVersao: GUARDRAIL_VERSAO });
  });

  it('a configuração do serviço não tem mais id de modelo escrito (sai bedrock_model_id)', () => {
    const cfg = loadEnv({ ...CONTRATO_COMPLETO } as never);
    expect(Object.keys(cfg)).not.toContain('BEDROCK_MODEL_ID');
    expect(cfg.BEDROCK_PERFIL_ARN).toBe(PERFIL_ARN);
    expect(cfg.GUARDRAIL_ID).toBe(GUARDRAIL_ID);
    expect(cfg.GUARDRAIL_VERSAO).toBe(GUARDRAIL_VERSAO);
  });

  it('a requisição sai com model igual ao ARN do perfil e os cabeçalhos do guardrail assinados, sem trace', async () => {
    const { sdk, pedidos } = sdkComFetchSimulado();
    const cliente = new BedrockClaudeClient(contratoBedrock(CONTRATO_COMPLETO), sdk);
    const out = await new RecommendationExplainer(cliente, { modelId: 'rotulo-do-modelo', guardrailDeSaida: guardrailDeSaidaQueAprova(), timeoutMs: 2000 }).explain(input);

    expect(out.status).toBe('ok');
    expect(pedidos).toHaveLength(1);
    const pedido = pedidos[0];

    // InvokeModel: o modelo vai no caminho, e é o ARN do perfil de aplicação do contrato.
    expect(decodeURIComponent(pedido.url.pathname)).toBe(`/model/${PERFIL_ARN}/invoke`);
    expect(pedido.body.model).toBeUndefined();

    expect(pedido.headers.get('x-amzn-bedrock-guardrailidentifier')).toBe(GUARDRAIL_ID);
    expect(pedido.headers.get('x-amzn-bedrock-guardrailversion')).toBe(GUARDRAIL_VERSAO);
    // Sem o trace do guardrail: ele volta sem máscara e não pode chegar a log (ADR-0010, item 3).
    expect(pedido.headers.has('x-amzn-bedrock-trace')).toBe(false);

    // Os dois cabeçalhos entram na assinatura SigV4 do pedido final.
    const autorizacao = pedido.headers.get('authorization') ?? '';
    expect(autorizacao).toMatch(/^AWS4-HMAC-SHA256 /);
    const assinados = /SignedHeaders=([^,]+)/.exec(autorizacao)?.[1].split(';') ?? [];
    expect(assinados).toContain('x-amzn-bedrock-guardrailidentifier');
    expect(assinados).toContain('x-amzn-bedrock-guardrailversion');
  });

  it('o cliente ignora um model vindo de fora e usa sempre o perfil do contrato', async () => {
    const { sdk, pedidos } = sdkComFetchSimulado();
    const cliente = new BedrockClaudeClient(contratoBedrock(CONTRATO_COMPLETO), sdk);
    await cliente.create({ model: 'outro-modelo', max_tokens: 16, messages: [{ role: 'user', content: 'oi' }] });
    expect(decodeURIComponent(pedidos[0].url.pathname)).toBe(`/model/${PERFIL_ARN}/invoke`);
  });
});

describe('VT-10: falha fechada sem a configuração do contrato (nunca chama o modelo sem guardrail)', () => {
  const casos: Array<[string, Record<string, string | undefined>, string]> = [
    ['sem BEDROCK_PERFIL_ARN', { ...CONTRATO_COMPLETO, BEDROCK_PERFIL_ARN: undefined }, 'BEDROCK_PERFIL_ARN'],
    ['sem GUARDRAIL_ID', { ...CONTRATO_COMPLETO, GUARDRAIL_ID: undefined }, 'GUARDRAIL_ID'],
    ['sem GUARDRAIL_VERSAO', { ...CONTRATO_COMPLETO, GUARDRAIL_VERSAO: undefined }, 'GUARDRAIL_VERSAO'],
    ['GUARDRAIL_ID vazio', { ...CONTRATO_COMPLETO, GUARDRAIL_ID: '' }, 'GUARDRAIL_ID'],
    ['versão DRAFT, não publicada', { ...CONTRATO_COMPLETO, GUARDRAIL_VERSAO: 'DRAFT' }, 'GUARDRAIL_VERSAO'],
    ['id de modelo no lugar do perfil', { ...CONTRATO_COMPLETO, BEDROCK_PERFIL_ARN: 'modelo-qualquer-v1' }, 'BEDROCK_PERFIL_ARN'],
    [
      'perfil de sistema no lugar do perfil de aplicação',
      { ...CONTRATO_COMPLETO, BEDROCK_PERFIL_ARN: 'arn:aws:bedrock:us-east-1:000000000000:inference-profile/perfilsintetico' },
      'BEDROCK_PERFIL_ARN',
    ],
    ['id do guardrail com injeção de cabeçalho', { ...CONTRATO_COMPLETO, GUARDRAIL_ID: 'abc\r\nX-Amzn-Bedrock-Trace: ENABLED' }, 'GUARDRAIL_ID'],
  ];

  it.each(casos)('%s: o explicador devolve unavailable/internal_error sem chamar o modelo', async (_nome, vars, variavel) => {
    const { sdk, fetchSimulado } = sdkComFetchSimulado();
    const contrato = contratoBedrock(vars);
    expect(contrato.valido).toBe(false);

    const fallbacks: string[] = [];
    const explicador = new RecommendationExplainer(new BedrockClaudeClient(contrato, sdk), {
      modelId: 'rotulo-do-modelo',
      guardrailDeSaida: guardrailDeSaidaQueAprova(),
      timeoutMs: 2000,
      metrics: { publishExplanationRetry: () => undefined, publishExplanationFallback: (c) => void fallbacks.push(c) },
    });
    const out = await explicador.explain(input);

    expect(fetchSimulado).not.toHaveBeenCalled();
    expect(out).toMatchObject({ status: 'unavailable', errorCategory: 'internal_error', retryable: false, attempts: 0 });
    expect(fallbacks).toEqual(['internal_error']);
    if (out.status !== 'unavailable') return;
    // O detalhe nomeia a variável, sem ecoar o valor recebido (ele pode ir para o log).
    expect(out.detail).toContain(variavel);
    for (const valor of Object.values(vars)) {
      if (valor && valor !== PERFIL_ARN && valor !== GUARDRAIL_ID && valor !== GUARDRAIL_VERSAO) {
        expect(out.detail).not.toContain(valor);
      }
    }
  });

  it('a falha de configuração não abre o disjuntor: continua internal_error, sem virar circuit_open', async () => {
    const { sdk } = sdkComFetchSimulado();
    const explicador = new RecommendationExplainer(new BedrockClaudeClient(contratoBedrock({}), sdk), {
      modelId: 'rotulo-do-modelo',
      guardrailDeSaida: guardrailDeSaidaQueAprova(),
      failureThreshold: 2,
    });
    for (let i = 0; i < 4; i++) {
      expect(await explicador.explain(input)).toMatchObject({ status: 'unavailable', errorCategory: 'internal_error' });
    }
  });

  it('o cliente sozinho também recusa sem configuração, antes de qualquer fetch (defesa em camadas)', async () => {
    const { sdk, fetchSimulado } = sdkComFetchSimulado();
    const cliente = new BedrockClaudeClient(contratoBedrock({ ...CONTRATO_COMPLETO, GUARDRAIL_VERSAO: undefined }), sdk);
    await expect(
      cliente.create({ model: 'x', max_tokens: 16, messages: [{ role: 'user', content: 'oi' }] })
    ).rejects.toThrow(/GUARDRAIL_VERSAO/);
    expect(fetchSimulado).not.toHaveBeenCalled();
  });
});

describe('VT-10: o ARN do perfil (com a conta) não chega à resposta da API', () => {
  it('o rótulo público tem só o id do perfil, sem conta, região nem prefixo arn:', () => {
    const rotulo = rotuloDoPerfil(contratoBedrock(CONTRATO_COMPLETO));
    expect(rotulo).toBe('perfil/perfilsintetico');
    expect(rotulo).not.toContain('000000000000');
    expect(rotulo).not.toContain('us-east-1');
    expect(rotulo).not.toContain('arn:');
    expect(rotuloDoPerfil(contratoBedrock({}))).toBe('sem-contrato');
  });

  it('buildDefaultService com o explicador em operação: a resposta não traz a conta nem o ARN', async () => {
    // `env` é lido no import: variáveis trocadas e módulos recarregados. O SDK real do Bedrock usa o
    // fetch global simulado; credenciais sintéticas pelo ambiente. Nenhuma rede.
    vi.stubEnv('EXPLANATIONS_ENABLED', 'true');
    vi.stubEnv('BEDROCK_PERFIL_ARN', PERFIL_ARN);
    vi.stubEnv('GUARDRAIL_ID', GUARDRAIL_ID);
    vi.stubEnv('GUARDRAIL_VERSAO', GUARDRAIL_VERSAO);
    vi.stubEnv('AWS_REGION', 'us-east-1');
    vi.stubEnv('AWS_ACCESS_KEY_ID', 'credencial-sintetica-de-teste');
    vi.stubEnv('AWS_SECRET_ACCESS_KEY', 'credencial-sintetica-de-teste');
    // Resposta no formato da gravação `sucesso` (sintética), com a tool preenchida para os itens
    // que o serviço de fato pediu: a gravação fixa explica SKU-1 e SKU-2.
    const urls: string[] = [];
    const fetchSimulado = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      urls.push(String(url));
      const corpo = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
      const itens = JSON.parse(corpo.messages[0].content.split('\n').slice(1).join('\n')) as Array<{
        itemId: string;
        allowedSignals: string[];
      }>;
      const resposta = mensagemGravada('sucesso');
      const bloco = resposta.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')!;
      bloco.input = {
        explanations: itens.map((i) => ({
          itemId: i.itemId,
          reason: 'Combina com as suas compras anteriores de que você gostou.',
          signals: [i.allowedSignals[0]],
        })),
      };
      return new Response(JSON.stringify(resposta), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchSimulado);
    // ApplyGuardrail da composição (T084): SDK da AWS com transporte falso, nenhuma rede.
    const transporteDoGuardrail = transporteAwsGravado('apply-guardrail-sem-intervencao');
    const guardrailNaComposicao = new BedrockRuntimeClient({
      region: 'us-east-1',
      maxAttempts: 1,
      credentials: { accessKeyId: 'credencial-sintetica-de-teste', secretAccessKey: 'credencial-sintetica-de-teste' },
      requestHandler: transporteDoGuardrail,
    });
    vi.resetModules();
    try {
      const { buildDefaultService } = await import('../../src/serving/src/presentation/server');
      const { useCase } = buildDefaultService({
        dynamoDocClient: {
          send: vi.fn().mockResolvedValue({
            Item: {
              userId: 'u-1',
              recommendations: [
                { itemId: 'ITEM-A', score: 0.9, rank: 1, title: 'Garrafa térmica', category: 'Casa', inStock: true },
                { itemId: 'ITEM-B', score: 0.8, rank: 2, title: 'Caneca', category: 'Casa', inStock: true },
              ],
            },
          }),
        } as unknown as DynamoDBDocumentClient,
        redis: { call: vi.fn().mockResolvedValue([0]), pipeline: vi.fn() } as unknown as Redis,
        scoringClient: {
          scoreCandidates: vi.fn(async (inp: { candidates: { itemId: string }[] }) =>
            inp.candidates.map((c) => ({ itemId: c.itemId, score: 0.5 }))
          ),
        },
        bedrockRuntimeClient: guardrailNaComposicao,
        metricsPublisher: {
          publishDegradedMode: vi.fn(),
          publishSageMakerFallback: vi.fn(),
          publishMemoryDbFallback: vi.fn(),
          publishDynamoDbFallback: vi.fn(),
        },
      });
      const res = await useCase.execute({ userId: 'u-1', limit: 5, explain: true });

      expect(fetchSimulado).toHaveBeenCalledTimes(1);
      expect(decodeURIComponent(new URL(urls[0]).pathname)).toBe(`/model/${PERFIL_ARN}/invoke`);
      expect(res.explanation).toEqual({ status: 'ok', modelId: 'perfil/perfilsintetico', attempts: 1 });
      // A composição de produção revisa a saída no guardrail do contrato, depois do InvokeModel.
      expect(transporteDoGuardrail.pedidos).toHaveLength(1);
      expect(transporteDoGuardrail.pedidos[0].path).toBe(`/guardrail/${GUARDRAIL_ID}/version/${GUARDRAIL_VERSAO}/apply`);
      expect(transporteDoGuardrail.pedidos[0].body.source).toBe('OUTPUT');
      expect(JSON.stringify(res.explanation)).not.toContain('000000000000');
      expect(JSON.stringify(res)).not.toContain('000000000000');
      expect(JSON.stringify(res)).not.toContain('arn:');
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });
});

describe('VT-10: a falha de configuração não conta no disjuntor (prontidão alternante)', () => {
  it('falhas de configuração entre duas falhas reais não abrem o disjuntor antes da hora', async () => {
    let pronto = true;
    const create = vi.fn(async () => {
      throw erroGravado('erro-500');
    });
    const porta = {
      create,
      prontidao: () => (pronto ? { pronto: true as const } : { pronto: false as const, motivo: 'GUARDRAIL_ID ausente' }),
    };
    const explicador = new RecommendationExplainer(porta, { modelId: 'rotulo-do-modelo', guardrailDeSaida: guardrailDeSaidaQueAprova(), failureThreshold: 2, maxAttempts: 1 });

    expect(await explicador.explain(input)).toMatchObject({ errorCategory: 'model_error' }); // 1ª falha real
    pronto = false;
    for (let i = 0; i < 3; i++) {
      expect(await explicador.explain(input)).toMatchObject({ errorCategory: 'internal_error', attempts: 0 });
    }
    pronto = true;
    // Se a configuração contasse, o disjuntor já estaria aberto e esta chamada nem chegaria à porta.
    expect(await explicador.explain(input)).toMatchObject({ errorCategory: 'model_error' }); // 2ª falha real
    expect(create).toHaveBeenCalledTimes(2);
    expect(await explicador.explain(input)).toMatchObject({ errorCategory: 'circuit_open' });
    expect(create).toHaveBeenCalledTimes(2);
  });
});

describe('VT-10 (aceite): nada de id de modelo ou ARN escrito no código, SDK fixado', () => {
  const RAIZ_SERVING = path.resolve(__dirname, '../../src/serving');

  function arquivosTs(dir: string): string[] {
    return readdirSync(dir).flatMap((nome) => {
      const p = path.join(dir, nome);
      return statSync(p).isDirectory() ? arquivosTs(p) : p.endsWith('.ts') ? [p] : [];
    });
  }

  it('o código do serviço não escreve id de modelo Claude nem ARN do Bedrock (ST-06)', () => {
    const achados = arquivosTs(path.join(RAIZ_SERVING, 'src')).filter((f) =>
      /anthropic\.claude|arn:aws:bedrock/.test(readFileSync(f, 'utf-8'))
    );
    expect(achados).toEqual([]);
  });

  it('@anthropic-ai/bedrock-sdk fixado em 1.1.2, na declaração e no lock', () => {
    const pkg = JSON.parse(readFileSync(path.join(RAIZ_SERVING, 'package.json'), 'utf-8'));
    expect(pkg.dependencies['@anthropic-ai/bedrock-sdk']).toBe('1.1.2');
    const lock = JSON.parse(readFileSync(path.resolve(__dirname, '../../package-lock.json'), 'utf-8'));
    expect(lock.packages['src/serving'].dependencies['@anthropic-ai/bedrock-sdk']).toBe('1.1.2');
    expect(lock.packages['node_modules/@anthropic-ai/bedrock-sdk'].version).toBe('1.1.2');
  });
});
