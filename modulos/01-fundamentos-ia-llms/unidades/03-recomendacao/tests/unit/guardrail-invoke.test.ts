import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import AnthropicBedrock from '@anthropic-ai/bedrock-sdk';
import type Anthropic from '@anthropic-ai/sdk';
import {
  RecommendationExplainer,
  ClaudeMessagesPort,
  ExplainInput,
  CAMPO_ACAO_DO_GUARDRAIL,
} from '../../src/serving/src/application/recommendation-explainer';
import { ExplanationErrorCategoryEnum } from '../../src/serving/src/domain/explanation';
import { GetRecommendationsUseCase } from '../../src/serving/src/application/get-recommendations.use-case';
import { BedrockClaudeClient } from '../../src/serving/src/infrastructure/bedrock/bedrock-claude.client';
import { contratoBedrock } from '../../src/serving/src/config/env';
import { baseLogger } from '../../src/serving/src/infrastructure/logging/logger';
import { carregarGravacao, erroGravado, mensagemGravada, guardrailDeSaidaQueAprova } from '../fixtures/claude/gravacoes';

// VT-11 (T082, RF-110, RF-007, ADR-0010 itens 4 e 6): a intervenção do guardrail no InvokeModel e o
// 403 de uma chamada sem guardrail são falhas NÃO retentáveis, com o mesmo padrão estruturado do
// explicador (categoria, retentável, sem eco do texto do modelo ou do provedor, fallback sem
// explicação, nunca 500).
//
// Gravações usadas (nenhuma chamada real, D-006):
// - `guardrail-invoke-intervencao` (proveniencia documentacao): só o campo
//   `amazon-bedrock-guardrailAction: INTERVENED` vem da documentação da AWS; o resto é sintético, e a
//   forma exata pelo SDK é o risco R4 (formato a confirmar na captura da T107);
// - `erro-403-sem-guardrail` (sintetica): corpo e mensagem escritos à mão, formato a confirmar. A
//   mensagem imita o AccessDenied do IAM com ARNs da conta sintética 000000000000 (achado A5 da
//   revisão da T081: o texto do provedor não pode chegar ao log).

const input: ExplainInput = {
  userId: 'u-1',
  sessionItemIds: ['SKU-9'],
  items: [
    { itemId: 'SKU-1', title: 'Fone sem fio', category: 'Audio', provenance: 'hybrid', batchScore: 0.8, vectorScore: 0.9 },
    { itemId: 'SKU-2', title: 'Capa de celular', category: 'Acessorios', provenance: 'batch', batchScore: 0.6 },
  ],
};

const opts = { modelId: 'rotulo-do-modelo', timeoutMs: 1000, guardrailDeSaida: guardrailDeSaidaQueAprova() };

/** Textos que não podem ecoar no `detail` nem no log: o do modelo bloqueado e o do provedor no 403. */
const TEXTO_DO_MODELO = 'Sorry, the model cannot answer';
const PROIBIDOS_NO_403 = ['arn:', '000000000000', 'role-sintetica', 'sessao-sintetica', 'perfilsintetico', 'not authorized'];

function portaCom(...passos: Array<Anthropic.Message | Error>): ClaudeMessagesPort & { create: ReturnType<typeof vi.fn> } {
  let i = 0;
  return {
    create: vi.fn(async () => {
      const passo = passos[Math.min(i++, passos.length - 1)];
      if (passo instanceof Error) throw passo;
      return passo;
    }),
  };
}

function metricas() {
  return { publishExplanationRetry: vi.fn(), publishExplanationFallback: vi.fn() };
}

describe('VT-11 · intervenção do guardrail no InvokeModel', () => {
  it('a gravação de intervenção vira unavailable/guardrail, não retentável, numa tentativa só', async () => {
    const porta = portaCom(mensagemGravada('guardrail-invoke-intervencao'), mensagemGravada('sucesso'));
    const m = metricas();
    const out = await new RecommendationExplainer(porta, { ...opts, metrics: m }).explain(input);

    expect(out).toMatchObject({ status: 'unavailable', errorCategory: 'guardrail', retryable: false, attempts: 1 });
    expect(porta.create).toHaveBeenCalledTimes(1);
    expect(m.publishExplanationRetry).not.toHaveBeenCalled();
    // ExplanationFallbackCount conta a intervenção (o publicador soma o total e a categoria).
    expect(m.publishExplanationFallback).toHaveBeenCalledTimes(1);
    expect(m.publishExplanationFallback).toHaveBeenCalledWith('guardrail');
    // Sem eco: o texto que o guardrail devolveu no lugar da resposta não vai para o detail.
    if (out.status !== 'unavailable') return;
    expect(out.detail).not.toContain(TEXTO_DO_MODELO);
  });

  it('a intervenção não conta no disjuntor: intervenções seguidas continuam chegando ao modelo', async () => {
    const porta = portaCom(mensagemGravada('guardrail-invoke-intervencao'));
    const explicador = new RecommendationExplainer(porta, { ...opts, maxAttempts: 1, failureThreshold: 2 });
    for (let i = 0; i < 4; i++) {
      expect(await explicador.explain(input)).toMatchObject({ errorCategory: 'guardrail' });
    }
    expect(porta.create).toHaveBeenCalledTimes(4);
  });

  it('a intervenção também vale com tool_use na resposta (o campo decide, não o conteúdo)', async () => {
    const resposta = mensagemGravada('sucesso') as Anthropic.Message & Record<string, unknown>;
    resposta[CAMPO_ACAO_DO_GUARDRAIL] = 'INTERVENED';
    const out = await new RecommendationExplainer(portaCom(resposta), opts).explain(input);
    expect(out).toMatchObject({ status: 'unavailable', errorCategory: 'guardrail', retryable: false });
  });

  it('com o campo em NONE a resposta segue normal', async () => {
    const resposta = mensagemGravada('sucesso') as Anthropic.Message & Record<string, unknown>;
    resposta[CAMPO_ACAO_DO_GUARDRAIL] = 'NONE';
    const out = await new RecommendationExplainer(portaCom(resposta), opts).explain(input);
    expect(out).toMatchObject({ status: 'ok', attempts: 1 });
  });

  it('R4: sem o campo e sem tool_use, segue a validação de hoje (retenta e termina em validation)', async () => {
    const semCampo = mensagemGravada('guardrail-invoke-intervencao') as Anthropic.Message & Record<string, unknown>;
    delete semCampo[CAMPO_ACAO_DO_GUARDRAIL];
    const porta = portaCom(semCampo, semCampo);
    const m = metricas();
    const out = await new RecommendationExplainer(porta, { ...opts, metrics: m }).explain(input);
    expect(out).toMatchObject({ status: 'unavailable', errorCategory: 'validation', attempts: 2 });
    expect(porta.create).toHaveBeenCalledTimes(2);
    expect(m.publishExplanationRetry).toHaveBeenCalledTimes(1);
  });

  it('a categoria guardrail está no enum fechado do domínio e no contrato da API', () => {
    expect(ExplanationErrorCategoryEnum.options).toContain('guardrail');
    // O `reason` da API é o mesmo enum fechado: o contrato OpenAPI lista as mesmas categorias.
    const contrato = readFileSync(
      path.resolve(__dirname, '../../specs/001-aws-recommendation-platform/contracts/recommendations-api.yaml'),
      'utf-8'
    );
    const linha = /enum: \[([^\]]*circuit_open[^\]]*)\]/.exec(contrato);
    expect(linha).not.toBeNull();
    const doContrato = linha![1].split(',').map((s) => s.trim()).sort();
    expect(doContrato).toEqual([...ExplanationErrorCategoryEnum.options].sort());
  });
});

describe('VT-11 · 403 de chamada sem guardrail', () => {
  it('a gravação de 403 vira unavailable, não retentável, sem segunda tentativa', async () => {
    const porta = portaCom(erroGravado('erro-403-sem-guardrail'), mensagemGravada('sucesso'));
    const m = metricas();
    const out = await new RecommendationExplainer(porta, { ...opts, metrics: m }).explain(input);
    expect(out).toMatchObject({ status: 'unavailable', errorCategory: 'model_error', retryable: false, attempts: 1 });
    expect(porta.create).toHaveBeenCalledTimes(1);
    expect(m.publishExplanationRetry).not.toHaveBeenCalled();
  });

  it('A5: o detail do 403 é normalizado, sem ARN, conta nem texto do provedor', async () => {
    // Pré-condição: a gravação traz mesmo o ARN e a conta sintética na mensagem do SDK.
    expect(erroGravado('erro-403-sem-guardrail').message).toContain('arn:aws:sts::000000000000');
    const out = await new RecommendationExplainer(portaCom(erroGravado('erro-403-sem-guardrail')), opts).explain(input);
    if (out.status !== 'unavailable') throw new Error('esperava unavailable');
    for (const p of PROIBIDOS_NO_403) expect(out.detail).not.toContain(p);
    expect(out.detail).toMatch(/403/);
  });
});

// O campo precisa chegar pela porta: o SDK real do Bedrock devolve o corpo JSON da resposta, e o
// explicador lê o campo desse corpo cru. Fetch simulado, credenciais sintéticas, nenhuma rede.
const CONTRATO = {
  BEDROCK_PERFIL_ARN: 'arn:aws:bedrock:us-east-1:000000000000:application-inference-profile/perfilsintetico',
  GUARDRAIL_ID: 'guardrailsintetico',
  GUARDRAIL_VERSAO: '3',
};

function clienteComFetch(resposta: () => Response) {
  const fetchSimulado = vi.fn(async () => resposta());
  const sdk = new AnthropicBedrock({
    awsRegion: 'us-east-1',
    baseURL: 'https://bedrock-runtime.us-east-1.amazonaws.com',
    awsAccessKey: 'credencial-sintetica-de-teste',
    awsSecretKey: 'credencial-sintetica-de-teste',
    maxRetries: 0,
    fetch: fetchSimulado as unknown as typeof fetch,
  });
  return { cliente: new BedrockClaudeClient(contratoBedrock(CONTRATO), sdk), fetchSimulado };
}

describe('VT-11 · pelo SDK real do Bedrock (corpo cru pela porta ClaudeMessagesPort)', () => {
  it('o campo de intervenção do corpo chega ao explicador e vira guardrail', async () => {
    const { cliente, fetchSimulado } = clienteComFetch(
      () =>
        new Response(JSON.stringify(carregarGravacao('guardrail-invoke-intervencao').resposta), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
    );
    const out = await new RecommendationExplainer(cliente, opts).explain(input);
    expect(out).toMatchObject({ status: 'unavailable', errorCategory: 'guardrail', retryable: false, attempts: 1 });
    expect(fetchSimulado).toHaveBeenCalledTimes(1);
  });

  it('o 403 do Bedrock pelo SDK é não retentável e o detail sai normalizado', async () => {
    const r = carregarGravacao('erro-403-sem-guardrail').resposta as {
      status: number;
      corpo: unknown;
      cabecalhos: Record<string, string>;
    };
    const { cliente, fetchSimulado } = clienteComFetch(
      () =>
        new Response(JSON.stringify(r.corpo), {
          status: r.status,
          headers: { 'content-type': 'application/json', ...r.cabecalhos },
        })
    );
    const out = await new RecommendationExplainer(cliente, opts).explain(input);
    expect(out).toMatchObject({ status: 'unavailable', retryable: false, attempts: 1 });
    expect(fetchSimulado).toHaveBeenCalledTimes(1);
    if (out.status !== 'unavailable') return;
    for (const p of PROIBIDOS_NO_403) expect(out.detail).not.toContain(p);
  });
});

describe('VT-11 · no fluxo de recomendação: fallback sem explicação, log sem texto do provedor', () => {
  afterEach(() => vi.restoreAllMocks());

  /** Logger falso no lugar do filho por requisição: guarda tudo o que seria gravado. */
  function capturarLog() {
    const linhas: unknown[] = [];
    const registrar = (...args: unknown[]) => void linhas.push(args);
    const falso: Record<string, unknown> = { info: registrar, warn: registrar, error: registrar, debug: registrar };
    falso.child = () => falso;
    vi.spyOn(baseLogger, 'child').mockReturnValue(falso as never);
    return linhas;
  }

  function casoDeUso(porta: ClaudeMessagesPort) {
    return new GetRecommendationsUseCase({
      batchRepo: {
        getBatchCandidates: vi.fn().mockResolvedValue([
          { itemId: 'SKU-1', score: 0.8, rank: 1, title: 'Fone', priceCents: 1000, category: 'Audio' },
          { itemId: 'SKU-2', score: 0.6, rank: 2, title: 'Capa', priceCents: 500, category: 'Acessorios' },
        ]),
      },
      vectorRepo: { searchBySession: vi.fn().mockResolvedValue([]) },
      scoringClient: {
        scoreCandidates: vi.fn().mockResolvedValue([
          { itemId: 'SKU-1', score: 0.95 },
          { itemId: 'SKU-2', score: 0.7 },
        ]),
      },
      explainer: new RecommendationExplainer(porta, opts),
    });
  }

  it('403: a resposta sai sem explicação e o log não leva ARN, conta nem mensagem do provedor (A5)', async () => {
    const linhas = capturarLog();
    const res = await casoDeUso(portaCom(erroGravado('erro-403-sem-guardrail'))).execute({ userId: 'u-1', limit: 2, explain: true });

    expect(res.recommendations).toHaveLength(2);
    expect(res.recommendations.every((r) => r.explanation === undefined)).toBe(true);
    expect(res.explanation).toMatchObject({ status: 'unavailable', reason: 'model_error', attempts: 1 });
    expect(linhas.length).toBeGreaterThan(0);
    const log = JSON.stringify(linhas);
    for (const p of PROIBIDOS_NO_403) expect(log).not.toContain(p);
  });

  it('intervenção: a resposta sai sem explicação com reason guardrail e o log não ecoa o texto do modelo', async () => {
    const linhas = capturarLog();
    const res = await casoDeUso(portaCom(mensagemGravada('guardrail-invoke-intervencao'))).execute({
      userId: 'u-1',
      limit: 2,
      explain: true,
    });
    expect(res.recommendations).toHaveLength(2);
    expect(res.explanation).toMatchObject({ status: 'unavailable', reason: 'guardrail', attempts: 1 });
    expect(JSON.stringify(linhas)).not.toContain(TEXTO_DO_MODELO);
  });
});
