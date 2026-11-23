import { describe, it, expect, vi, afterEach } from 'vitest';
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import type Anthropic from '@anthropic-ai/sdk';
import {
  RecommendationExplainer,
  ClaudeMessagesPort,
  ExplainInput,
  ExplainerOptions,
  GuardrailDeSaidaPort,
} from '../../src/serving/src/application/recommendation-explainer';
import { GetRecommendationsUseCase } from '../../src/serving/src/application/get-recommendations.use-case';
import { BedrockApplyGuardrailClient } from '../../src/serving/src/infrastructure/bedrock/bedrock-apply-guardrail.client';
import { contratoBedrock } from '../../src/serving/src/config/env';
import { baseLogger } from '../../src/serving/src/infrastructure/logging/logger';
import { carregarGravacao, mensagemGravada, transporteAwsGravado } from '../fixtures/claude/gravacoes';

// VT-12 (T084, RF-110, RF-007, ADR-0010 item 7): depois da validação, as frases aprovadas passam por um
// ApplyGuardrail com source OUTPUT no guardrail do contrato. Uma intervenção vira `guardrail`; um erro
// da chamada segue as categorias do RF-007 (429 retentável, 400 não); o orçamento de 2,5 s cobre as
// duas chamadas. Aceite: nenhuma frase chega à resposta sem a validação e o ApplyGuardrail.
//
// O ApplyGuardrail sai pelo SDK da AWS (bedrock-runtime), não pelo da Anthropic. Os testes usam o
// cliente real do SDK com um transporte falso (nenhuma rede, credenciais sintéticas), que entrega as
// gravações `apply-guardrail-*` (todas sintéticas, FORMATO A CONFIRMAR na captura da T107): é o
// desserializador do próprio SDK que monta o resultado e as exceções.

const input: ExplainInput = {
  userId: 'u-1',
  sessionItemIds: ['SKU-9'],
  items: [
    { itemId: 'SKU-1', title: 'Fone sem fio', category: 'Audio', provenance: 'hybrid', batchScore: 0.8, vectorScore: 0.9 },
    { itemId: 'SKU-2', title: 'Capa de celular', category: 'Acessorios', provenance: 'batch', batchScore: 0.6 },
  ],
};

const CONTRATO = {
  BEDROCK_PERFIL_ARN: 'arn:aws:bedrock:us-east-1:000000000000:application-inference-profile/perfilsintetico',
  GUARDRAIL_ID: 'guardrailsintetico',
  GUARDRAIL_VERSAO: '3',
};

/** Textos que não podem ecoar no `detail` nem no log. */
const TEXTO_DO_GUARDRAIL = 'Sorry, the model cannot answer';
const PROIBIDOS_NO_403 = ['arn:', '000000000000', 'role-sintetica', 'sessao-sintetica', 'not authorized'];

function portaClaude(...passos: Array<Anthropic.Message | Error>) {
  let i = 0;
  return {
    create: vi.fn(async () => {
      const passo = passos[Math.min(i++, passos.length - 1)];
      if (passo instanceof Error) throw passo;
      return passo;
    }),
  };
}

/** Cliente real do ApplyGuardrail sobre o SDK da AWS, com o transporte falso servindo as gravações. */
function guardrailGravado(...ids: string[]) {
  const transporte = transporteAwsGravado(...ids);
  const sdk = new BedrockRuntimeClient({
    region: 'us-east-1',
    endpoint: 'https://bedrock-runtime.us-east-1.amazonaws.com',
    maxAttempts: 1,
    credentials: { accessKeyId: 'credencial-sintetica-de-teste', secretAccessKey: 'credencial-sintetica-de-teste' },
    requestHandler: transporte,
  });
  return { guardrail: new BedrockApplyGuardrailClient(contratoBedrock(CONTRATO), sdk), transporte };
}

function metricas() {
  return { publishExplanationRetry: vi.fn(), publishExplanationFallback: vi.fn() };
}

function explicador(porta: ClaudeMessagesPort, guardrail: GuardrailDeSaidaPort | undefined, extra: Partial<ExplainerOptions> = {}) {
  return new RecommendationExplainer(porta, {
    modelId: 'rotulo-do-modelo',
    timeoutMs: 1000,
    guardrailDeSaida: guardrail as GuardrailDeSaidaPort,
    ...extra,
  });
}

describe('VT-12 · ApplyGuardrail com source OUTPUT nas frases aprovadas', () => {
  it('aprovado (NONE): as frases validadas vão ao guardrail do contrato e só então chegam à resposta', async () => {
    const porta = portaClaude(mensagemGravada('sucesso'));
    const { guardrail, transporte } = guardrailGravado('apply-guardrail-sem-intervencao');
    const out = await explicador(porta, guardrail).explain(input);

    expect(out).toMatchObject({ status: 'ok', attempts: 1 });
    if (out.status !== 'ok') return;
    expect(transporte.pedidos).toHaveLength(1);
    const pedido = transporte.pedidos[0];
    // Guardrail e versão do contrato, no caminho do ApplyGuardrail; pedido assinado (SigV4).
    expect(pedido.method).toBe('POST');
    expect(pedido.path).toBe('/guardrail/guardrailsintetico/version/3/apply');
    expect(pedido.headers.authorization).toMatch(/^AWS4-HMAC-SHA256 /);
    expect(pedido.body.source).toBe('OUTPUT');
    // Exatamente as frases aprovadas na validação, num bloco só de texto.
    const conteudo = pedido.body.content as Array<{ text: { text: string } }>;
    expect(conteudo).toHaveLength(1);
    expect(conteudo[0].text.text).toBe(out.explanations.map((e) => e.reason).join('\n'));
    // Nada do prompt nem do catálogo vai ao guardrail de saída.
    expect(JSON.stringify(pedido.body)).not.toContain('Fone sem fio');
  });

  it('a revisão acontece depois da validação: resposta inválida nunca chega ao ApplyGuardrail', async () => {
    const porta = portaClaude(mensagemGravada('preco-e-item-fora-da-lista'), mensagemGravada('preco-e-item-fora-da-lista'));
    const { guardrail, transporte } = guardrailGravado('apply-guardrail-sem-intervencao');
    const out = await explicador(porta, guardrail).explain(input);
    expect(out).toMatchObject({ status: 'unavailable', errorCategory: 'validation' });
    expect(transporte.pedidos).toHaveLength(0);
  });

  it('a retentativa por validação revisa só a resposta corrigida, uma vez', async () => {
    const porta = portaClaude(mensagemGravada('retentativa-item-faltando'), mensagemGravada('sucesso'));
    const { guardrail, transporte } = guardrailGravado('apply-guardrail-sem-intervencao');
    const out = await explicador(porta, guardrail).explain(input);
    expect(out).toMatchObject({ status: 'ok', attempts: 2 });
    expect(transporte.pedidos).toHaveLength(1);
  });

  it('sem guardrail de saída configurado: falha fechada, o modelo nem é chamado', async () => {
    const porta = portaClaude(mensagemGravada('sucesso'));
    const m = metricas();
    const out = await explicador(porta, undefined, { metrics: m }).explain(input);
    expect(out).toMatchObject({ status: 'unavailable', errorCategory: 'internal_error', retryable: false, attempts: 0 });
    expect(porta.create).not.toHaveBeenCalled();
    expect(m.publishExplanationFallback).toHaveBeenCalledWith('internal_error');
  });

  it('contrato inválido no adaptador: recusa antes de qualquer rede, sem eco do valor', async () => {
    const transporte = transporteAwsGravado('apply-guardrail-sem-intervencao');
    const sdk = new BedrockRuntimeClient({
      region: 'us-east-1',
      maxAttempts: 1,
      credentials: { accessKeyId: 'x', secretAccessKey: 'y' },
      requestHandler: transporte,
    });
    const guardrail = new BedrockApplyGuardrailClient(contratoBedrock({ ...CONTRATO, GUARDRAIL_VERSAO: 'DRAFT' }), sdk);
    const out = await explicador(portaClaude(mensagemGravada('sucesso')), guardrail).explain(input);
    expect(out).toMatchObject({ status: 'unavailable', errorCategory: 'internal_error', retryable: false });
    expect(transporte.pedidos).toHaveLength(0);
    if (out.status === 'unavailable') expect(out.detail).not.toContain('DRAFT');
  });
});

describe('VT-12 · intervenção do ApplyGuardrail', () => {
  it('a gravação de intervenção vira guardrail, não retentável, sem retentar o modelo nem o guardrail', async () => {
    const porta = portaClaude(mensagemGravada('sucesso'));
    const { guardrail, transporte } = guardrailGravado('apply-guardrail-intervencao', 'apply-guardrail-sem-intervencao');
    const m = metricas();
    const out = await explicador(porta, guardrail, { metrics: m }).explain(input);

    expect(out).toMatchObject({ status: 'unavailable', errorCategory: 'guardrail', retryable: false, attempts: 1 });
    expect(porta.create).toHaveBeenCalledTimes(1);
    expect(transporte.pedidos).toHaveLength(1);
    expect(m.publishExplanationRetry).not.toHaveBeenCalled();
    expect(m.publishExplanationFallback).toHaveBeenCalledWith('guardrail');
    if (out.status !== 'unavailable') return;
    expect(out.detail).not.toContain(TEXTO_DO_GUARDRAIL);
  });

  it('a intervenção não conta no disjuntor', async () => {
    const porta = portaClaude(mensagemGravada('sucesso'));
    const { guardrail } = guardrailGravado('apply-guardrail-intervencao');
    const e = explicador(porta, guardrail, { failureThreshold: 2 });
    for (let i = 0; i < 4; i++) expect(await e.explain(input)).toMatchObject({ errorCategory: 'guardrail' });
    expect(porta.create).toHaveBeenCalledTimes(4);
  });
});

describe('VT-12 · erros do ApplyGuardrail pelas categorias do RF-007', () => {
  it('429 (ThrottlingException) é retentável: retenta só o ApplyGuardrail, não o modelo', async () => {
    const porta = portaClaude(mensagemGravada('sucesso'));
    const { guardrail, transporte } = guardrailGravado('apply-guardrail-erro-429', 'apply-guardrail-sem-intervencao');
    const m = metricas();
    const out = await explicador(porta, guardrail, { metrics: m }).explain(input);
    expect(out).toMatchObject({ status: 'ok', attempts: 1 });
    expect(porta.create).toHaveBeenCalledTimes(1);
    expect(transporte.pedidos).toHaveLength(2);
    expect(m.publishExplanationRetry).toHaveBeenCalledTimes(1);
  });

  it('429 seguido de 429: throttled, retentável, no máximo duas chamadas ao guardrail', async () => {
    const porta = portaClaude(mensagemGravada('sucesso'));
    const { guardrail, transporte } = guardrailGravado('apply-guardrail-erro-429');
    const out = await explicador(porta, guardrail).explain(input);
    expect(out).toMatchObject({ status: 'unavailable', errorCategory: 'throttled', retryable: true, attempts: 1 });
    expect(transporte.pedidos).toHaveLength(2);
    expect(porta.create).toHaveBeenCalledTimes(1);
  });

  it('400 (ValidationException) não é retentável: uma chamada só, fora do disjuntor', async () => {
    const porta = portaClaude(mensagemGravada('sucesso'));
    const { guardrail, transporte } = guardrailGravado('apply-guardrail-erro-400');
    const e = explicador(porta, guardrail, { failureThreshold: 2 });
    const out = await e.explain(input);
    expect(out).toMatchObject({ status: 'unavailable', errorCategory: 'model_error', retryable: false, attempts: 1 });
    expect(transporte.pedidos).toHaveLength(1);
    if (out.status === 'unavailable') expect(out.detail).not.toContain('Invalid input');
    // Erro de configuração não abre o disjuntor (senão viraria circuit_open e esconderia a causa).
    for (let i = 0; i < 3; i++) expect(await e.explain(input)).toMatchObject({ errorCategory: 'model_error' });
    expect(porta.create).toHaveBeenCalledTimes(4);
  });

  it('403 (AccessDeniedException) não é retentável, fora do disjuntor e sem ARN no detail', async () => {
    const pre = carregarGravacao('apply-guardrail-erro-403').resposta as { corpo: { message: string } };
    expect(pre.corpo.message).toContain('arn:aws:sts::000000000000');
    const porta = portaClaude(mensagemGravada('sucesso'));
    const { guardrail, transporte } = guardrailGravado('apply-guardrail-erro-403');
    const e = explicador(porta, guardrail, { failureThreshold: 2 });
    const out = await e.explain(input);
    expect(out).toMatchObject({ status: 'unavailable', errorCategory: 'model_error', retryable: false, attempts: 1 });
    expect(transporte.pedidos).toHaveLength(1);
    if (out.status !== 'unavailable') return;
    for (const p of PROIBIDOS_NO_403) expect(out.detail).not.toContain(p);
    expect(out.detail).toMatch(/403/);
    for (let i = 0; i < 3; i++) expect(await e.explain(input)).toMatchObject({ errorCategory: 'model_error' });
    expect(porta.create).toHaveBeenCalledTimes(4);
  });

  it('formato inesperado (action fora da lista): falha fechada, não retentável, sem eco', async () => {
    const porta = portaClaude(mensagemGravada('sucesso'));
    const { guardrail, transporte } = guardrailGravado('apply-guardrail-formato-inesperado');
    const out = await explicador(porta, guardrail).explain(input);
    expect(out).toMatchObject({ status: 'unavailable', errorCategory: 'model_error', retryable: false });
    expect(transporte.pedidos).toHaveLength(1);
    if (out.status !== 'unavailable') return;
    expect(out.detail).not.toContain('ACAO_SINTETICA_DESCONHECIDA');
    expect(out.detail).not.toContain('texto sintético');
  });

  it('erro desconhecido da porta não ecoa a mensagem e não é retentável', async () => {
    const guardrail: GuardrailDeSaidaPort = {
      revisarSaida: vi.fn(async () => {
        throw new Error('segredo-do-provedor arn:aws:x');
      }),
    };
    const out = await explicador(portaClaude(mensagemGravada('sucesso')), guardrail).explain(input);
    expect(out).toMatchObject({ status: 'unavailable', errorCategory: 'internal_error', retryable: false });
    if (out.status === 'unavailable') expect(out.detail).not.toMatch(/segredo|arn:/);
  });
});

describe('VT-12 · o orçamento de tempo cobre o InvokeModel e o ApplyGuardrail', () => {
  it('um ApplyGuardrail que não responde termina em timeout dentro do mesmo orçamento', async () => {
    let sinalRecebido: AbortSignal | undefined;
    // Ignora o sinal de propósito: o explicador precisa encerrar mesmo assim.
    const guardrail: GuardrailDeSaidaPort = {
      revisarSaida: vi.fn((_textos: string[], opcoes: { signal: AbortSignal }) => {
        sinalRecebido = opcoes.signal;
        return new Promise<never>(() => undefined);
      }),
    };
    const porta: ClaudeMessagesPort = {
      create: vi.fn(async () => {
        await new Promise((r) => setTimeout(r, 40));
        return mensagemGravada('sucesso');
      }),
    };
    const inicio = Date.now();
    const out = await explicador(porta, guardrail, { timeoutMs: 120 }).explain(input);
    const duracao = Date.now() - inicio;

    expect(out).toMatchObject({ status: 'unavailable', errorCategory: 'timeout', retryable: true, attempts: 1 });
    // Um orçamento só: termina perto dos 120 ms, não em 40 + 120.
    expect(duracao).toBeLessThan(150);
    expect(sinalRecebido?.aborted).toBe(true);
    expect(guardrail.revisarSaida).toHaveBeenCalledTimes(1);
  });

  it('o ApplyGuardrail recebe o mesmo sinal e o SDK aborta o pedido quando o orçamento acaba', async () => {
    const transporte = {
      pedidos: 0,
      handle: (_req: unknown, opcoes?: { abortSignal?: AbortSignal }) =>
        new Promise<never>((_resolve, reject) => {
          transporte.pedidos++;
          opcoes?.abortSignal?.addEventListener('abort', () => {
            const erro = new Error('Request aborted');
            erro.name = 'AbortError';
            reject(erro);
          });
        }),
    };
    const sdk = new BedrockRuntimeClient({
      region: 'us-east-1',
      maxAttempts: 1,
      credentials: { accessKeyId: 'x', secretAccessKey: 'y' },
      requestHandler: transporte,
    });
    const guardrail = new BedrockApplyGuardrailClient(contratoBedrock(CONTRATO), sdk);
    const out = await explicador(portaClaude(mensagemGravada('sucesso')), guardrail, { timeoutMs: 60 }).explain(input);
    expect(out).toMatchObject({ status: 'unavailable', errorCategory: 'timeout', retryable: true });
    expect(transporte.pedidos).toBe(1);
  });
});

describe('VT-12 · no fluxo de recomendação: sem explicação, nunca 500, log sem eco', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function capturarLog() {
    const linhas: unknown[] = [];
    const registrar = (...args: unknown[]) => void linhas.push(args);
    const falso: Record<string, unknown> = { info: registrar, warn: registrar, error: registrar, debug: registrar };
    falso.child = () => falso;
    vi.spyOn(baseLogger, 'child').mockReturnValue(falso as never);
    return linhas;
  }

  function casoDeUso(guardrail: GuardrailDeSaidaPort) {
    return new GetRecommendationsUseCase({
      batchRepo: {
        getBatchCandidates: vi.fn().mockResolvedValue([
          { itemId: 'SKU-1', score: 0.8, rank: 1, title: 'Fone', priceCents: 1000, category: 'Audio' },
          { itemId: 'SKU-2', score: 0.6, rank: 2, title: 'Capa', priceCents: 500, category: 'Acessorios' },
        ]),
      },
      // SKU-1 também vem da busca vetorial, para os sinais da gravação `sucesso` terem lastro.
      vectorRepo: {
        searchBySession: vi.fn().mockResolvedValue([{ itemId: 'SKU-1', vectorScore: 0.9, title: 'Fone', priceCents: 1000 }]),
      },
      scoringClient: {
        scoreCandidates: vi.fn().mockResolvedValue([
          { itemId: 'SKU-1', score: 0.95 },
          { itemId: 'SKU-2', score: 0.7 },
        ]),
      },
      explainer: explicador(portaClaude(mensagemGravada('sucesso')), guardrail),
    });
  }

  it('aprovado: as frases chegam às recomendações só depois do ApplyGuardrail', async () => {
    const { guardrail, transporte } = guardrailGravado('apply-guardrail-sem-intervencao');
    const res = await casoDeUso(guardrail).execute({ userId: 'u-1', limit: 2, explain: true, sessionItemIds: ['SKU-9'] });
    expect(res.explanation).toMatchObject({ status: 'ok' });
    expect(res.recommendations.every((r) => r.explanation !== undefined)).toBe(true);
    expect(transporte.pedidos).toHaveLength(1);
  });

  it.each([
    ['apply-guardrail-intervencao', 'guardrail', [TEXTO_DO_GUARDRAIL]],
    ['apply-guardrail-erro-403', 'model_error', PROIBIDOS_NO_403],
    ['apply-guardrail-formato-inesperado', 'model_error', ['texto sintético']],
  ])('%s: recomendações sem explicação, reason %s, log sem texto do guardrail nem do provedor', async (id, reason, proibidos) => {
    const linhas = capturarLog();
    const { guardrail } = guardrailGravado(id);
    const res = await casoDeUso(guardrail).execute({ userId: 'u-1', limit: 2, explain: true, sessionItemIds: ['SKU-9'] });
    expect(res.recommendations).toHaveLength(2);
    expect(res.recommendations.every((r) => r.explanation === undefined)).toBe(true);
    expect(res.explanation).toMatchObject({ status: 'unavailable', reason });
    const log = JSON.stringify(linhas);
    for (const p of proibidos) expect(log).not.toContain(p);
  });
});
