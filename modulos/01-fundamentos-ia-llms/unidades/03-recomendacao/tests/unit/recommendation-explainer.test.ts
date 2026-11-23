import { describe, it, expect, vi } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import {
  RecommendationExplainer,
  ClaudeMessagesPort,
  ExplainInput,
  EXPLANATION_TOOL_NAME,
} from '../../src/serving/src/application/recommendation-explainer';
import { erroGravado, mensagemGravada, guardrailDeSaidaQueAprova } from '../fixtures/claude/gravacoes';

// Respostas gravadas em tests/fixtures/claude/, cada uma com a sua proveniência (RF-111, VT-13).
// Todas são sintéticas: provam o código diante de cada formato, não o comportamento real do modelo (D-006).
const input: ExplainInput = {
  userId: 'u-1',
  sessionItemIds: ['SKU-9'],
  items: [
    { itemId: 'SKU-1', title: 'Fone sem fio', category: 'Audio', provenance: 'hybrid', batchScore: 0.8, vectorScore: 0.9 },
    { itemId: 'SKU-2', title: 'Capa de celular', category: 'Acessorios', provenance: 'batch', batchScore: 0.6 },
  ],
};

function fakeClient(...steps: Array<Anthropic.Message | Error>): ClaudeMessagesPort & { calls: Anthropic.MessageCreateParamsNonStreaming[] } {
  const calls: Anthropic.MessageCreateParamsNonStreaming[] = [];
  let i = 0;
  return {
    calls,
    create: vi.fn(async (params: Anthropic.MessageCreateParamsNonStreaming) => {
      calls.push(structuredClone(params));
      const step = steps[Math.min(i++, steps.length - 1)];
      if (step instanceof Error) throw step;
      return step;
    }),
  };
}

const opts = { modelId: 'anthropic.claude-haiku-5-5', timeoutMs: 1000, guardrailDeSaida: guardrailDeSaidaQueAprova() };

describe('RecommendationExplainer · saída estruturada via tool_use (CCAR-F 4.3)', () => {
  it('força a tool de explicação com schema estrito e devolve as explicações válidas', async () => {
    const client = fakeClient(mensagemGravada('sucesso'));
    const out = await new RecommendationExplainer(client, opts).explain(input);

    expect(out.status).toBe('ok');
    if (out.status !== 'ok') return;
    expect(out.attempts).toBe(1);
    expect(out.explanations.map((e) => e.itemId)).toEqual(['SKU-1', 'SKU-2']);
    expect(out.explanations[0].source).toBe('claude');
    expect(out.modelId).toBe('anthropic.claude-haiku-5-5');

    const req = client.calls[0];
    expect(req.model).toBe('anthropic.claude-haiku-5-5');
    expect(req.tool_choice).toEqual({ type: 'tool', name: EXPLANATION_TOOL_NAME });
    const tool = (req.tools ?? [])[0] as Anthropic.Tool & { strict?: boolean };
    expect(tool.name).toBe(EXPLANATION_TOOL_NAME);
    expect(tool.strict).toBe(true);
    expect(tool.input_schema).toMatchObject({ type: 'object', additionalProperties: false, required: ['explanations'] });
    // Forçar a tool exige thinking desligado; a tarefa é curta e sensível a latência.
    expect(req.thinking).toEqual({ type: 'disabled' });
  });

  it('o prompt tem critérios explícitos e um exemplo (CCAR-F 4.1 e 4.2)', async () => {
    const client = fakeClient(mensagemGravada('sucesso'));
    await new RecommendationExplainer(client, opts).explain(input);
    const system = JSON.stringify(client.calls[0].system);
    expect(system).toMatch(/no máximo 160 caracteres/);
    expect(system).toMatch(/<exemplo>/);
    expect(system).toMatch(/não invente/i);
  });
});

describe('RecommendationExplainer · validação e retentativa com o erro (CCAR-F 4.4)', () => {
  it('reenvia o erro de validação como tool_result is_error e aceita a correção', async () => {
    const client = fakeClient(mensagemGravada('retentativa-item-faltando'), mensagemGravada('sucesso'));
    const metrics = { publishExplanationRetry: vi.fn(), publishExplanationFallback: vi.fn() };

    const out = await new RecommendationExplainer(client, { ...opts, metrics }).explain(input);

    expect(out.status).toBe('ok');
    expect(out.attempts).toBe(2);
    expect(metrics.publishExplanationRetry).toHaveBeenCalledTimes(1);

    const retry = client.calls[1];
    const last = retry.messages[retry.messages.length - 1];
    expect(last.role).toBe('user');
    const block = (last.content as Anthropic.ToolResultBlockParam[])[0];
    expect(block.type).toBe('tool_result');
    expect(block.tool_use_id).toBe('toolu_1');
    expect(block.is_error).toBe(true);
    expect(JSON.stringify(block.content)).toContain('SKU-2');
    // A resposta inválida do assistente fica no histórico, para o modelo corrigir o que fez.
    expect(retry.messages[retry.messages.length - 2].role).toBe('assistant');
  });

  it('rejeita sinal que os dados do item não sustentam (proveniência, CCAR-F 5.6)', async () => {
    const client = fakeClient(mensagemGravada('sinal-sem-lastro'), mensagemGravada('sinal-sem-lastro'));
    const out = await new RecommendationExplainer(client, opts).explain(input);

    expect(out.status).toBe('unavailable');
    if (out.status !== 'unavailable') return;
    expect(out.errorCategory).toBe('validation');
    expect(out.detail).toMatch(/similar_items/);
  });

  it('rejeita promessa de preço ou desconto e item fora da lista', async () => {
    const client = fakeClient(mensagemGravada('preco-e-item-fora-da-lista'), mensagemGravada('preco-e-item-fora-da-lista'));
    const out = await new RecommendationExplainer(client, opts).explain(input);
    expect(out.status).toBe('unavailable');
    if (out.status !== 'unavailable') return;
    expect(out.detail).toMatch(/preço|desconto/);
    expect(out.detail).toMatch(/SKU-404/);
  });

  it('trata resposta sem tool_use como falha de validação e tenta de novo', async () => {
    const client = fakeClient(mensagemGravada('sem-tool-use'), mensagemGravada('sucesso'));
    const out = await new RecommendationExplainer(client, opts).explain(input);
    expect(out.status).toBe('ok');
    expect(out.attempts).toBe(2);
  });

  it('respeita o limite de tentativas', async () => {
    const client = fakeClient(mensagemGravada('lista-vazia-de-explicacoes'));
    const out = await new RecommendationExplainer(client, { ...opts, maxAttempts: 3 }).explain(input);
    expect(out.status).toBe('unavailable');
    expect(out.attempts).toBe(3);
    expect(client.create).toHaveBeenCalledTimes(3);
  });
});

describe('RecommendationExplainer · fallback sem explicação e erros estruturados (CCAR-F 5.3, 2.2)', () => {
  it('refusal não é retentado', async () => {
    const client = fakeClient(mensagemGravada('recusa'));
    const out = await new RecommendationExplainer(client, opts).explain(input);
    expect(out.status).toBe('unavailable');
    if (out.status !== 'unavailable') return;
    expect(out.errorCategory).toBe('refusal');
    expect(out.retryable).toBe(false);
    expect(client.create).toHaveBeenCalledTimes(1);
  });

  it('429 é retentável e, esgotadas as tentativas, cai no fallback como throttled', async () => {
    const err = erroGravado('erro-429');
    const client = fakeClient(err, err);
    const metrics = { publishExplanationRetry: vi.fn(), publishExplanationFallback: vi.fn() };
    const out = await new RecommendationExplainer(client, { ...opts, metrics }).explain(input);
    expect(out.status).toBe('unavailable');
    if (out.status !== 'unavailable') return;
    expect(out.errorCategory).toBe('throttled');
    expect(out.retryable).toBe(true);
    expect(client.create).toHaveBeenCalledTimes(2);
    expect(metrics.publishExplanationFallback).toHaveBeenCalledWith('throttled');
  });

  it('400 do modelo não é retentado', async () => {
    const err = erroGravado('erro-400');
    const client = fakeClient(err);
    const out = await new RecommendationExplainer(client, opts).explain(input);
    expect(out.status).toBe('unavailable');
    if (out.status !== 'unavailable') return;
    expect(out.errorCategory).toBe('model_error');
    expect(out.retryable).toBe(false);
    expect(client.create).toHaveBeenCalledTimes(1);
  });

  it('estoura o orçamento de tempo e devolve timeout', async () => {
    const client: ClaudeMessagesPort = {
      create: (_p, o) =>
        new Promise((_resolve, reject) => {
          o?.signal?.addEventListener('abort', () => reject(new Anthropic.APIUserAbortError()));
        }),
    };
    const started = Date.now();
    const out = await new RecommendationExplainer(client, { ...opts, timeoutMs: 50 }).explain(input);
    expect(Date.now() - started).toBeLessThan(1000);
    expect(out.status).toBe('unavailable');
    if (out.status !== 'unavailable') return;
    expect(out.errorCategory).toBe('timeout');
  });

  it('abre o disjuntor depois de falhas seguidas e nem chama o modelo', async () => {
    const err = erroGravado('erro-500');
    const client = fakeClient(err);
    let now = 0;
    const explainer = new RecommendationExplainer(client, { ...opts, maxAttempts: 1, failureThreshold: 2, cooldownMs: 30_000, now: () => now });

    await explainer.explain(input);
    await explainer.explain(input);
    const callsBefore = (client.create as ReturnType<typeof vi.fn>).mock.calls.length;
    const out = await explainer.explain(input);
    expect(out.status).toBe('unavailable');
    if (out.status !== 'unavailable') return;
    expect(out.errorCategory).toBe('circuit_open');
    expect((client.create as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsBefore);

    now = 31_000; // passou o cooldown: volta a tentar
    await explainer.explain(input);
    expect((client.create as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsBefore + 1);
  });

  it('lista vazia não chama o modelo', async () => {
    const client = fakeClient(mensagemGravada('sucesso'));
    const out = await new RecommendationExplainer(client, opts).explain({ ...input, items: [] });
    expect(out.status).toBe('ok');
    expect(client.create).not.toHaveBeenCalled();
  });
});
