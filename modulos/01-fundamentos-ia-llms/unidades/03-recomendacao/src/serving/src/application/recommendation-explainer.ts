import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { CandidateProvenance } from '../domain/candidate';
import {
  ExplanationSignal,
  ExplanationSignalEnum,
  ItemExplanation,
  allowedSignalsFor,
} from '../domain/explanation';

/**
 * Explicação curta por recomendação com Claude (ADR-0004).
 *
 * - Saída estruturada: uma tool com input_schema estrito e tool_choice forçado (CCAR-F 4.3).
 * - Validação semântica com zod e retentativa devolvendo o erro como tool_result is_error (4.4).
 * - Proveniência: só aceita sinais que os dados do item sustentam (5.6).
 * - Erros classificados em categorias com flag de retentável; qualquer falha vira
 *   "sem explicação", nunca 500 (2.2, 5.3).
 */

export const EXPLANATION_TOOL_NAME = 'record_explanations';
const MAX_REASON_CHARS = 160;
const MIN_REASON_CHARS = 20;

export type ProntidaoClaude = { pronto: true } | { pronto: false; motivo: string };

/** Porta para a Messages API. O adaptador do Bedrock implementa; os testes injetam um fake. */
export interface ClaudeMessagesPort {
  create(
    params: Anthropic.MessageCreateParamsNonStreaming,
    options?: { signal?: AbortSignal; timeout?: number }
  ): Promise<Anthropic.Message>;
  /**
   * Configuração obrigatória presente e válida (no Bedrock, o contrato da plataforma com o
   * guardrail, RF-110). Sem ela o explicador não chama o modelo (falha fechada). Ausente: pronto.
   */
  prontidao?(): ProntidaoClaude;
}

export interface ExplainItem {
  itemId: string;
  title?: string;
  category?: string;
  provenance: CandidateProvenance;
  batchScore?: number;
  vectorScore?: number;
}

export interface ExplainInput {
  userId: string;
  items: ExplainItem[];
  sessionItemIds?: string[];
}

export type ExplanationErrorCategory =
  | 'validation'
  | 'timeout'
  | 'throttled'
  | 'model_error'
  | 'refusal'
  | 'circuit_open'
  | 'internal_error';

export type ExplanationOutcome =
  | { status: 'ok'; attempts: number; modelId: string; explanations: ItemExplanation[] }
  | {
      status: 'unavailable';
      attempts: number;
      errorCategory: ExplanationErrorCategory;
      retryable: boolean;
      detail: string;
    };

export interface IRecommendationExplainer {
  explain(input: ExplainInput): Promise<ExplanationOutcome>;
}

export interface IExplanationMetrics {
  publishExplanationRetry(): void | Promise<void>;
  publishExplanationFallback(category: ExplanationErrorCategory): void | Promise<void>;
}

export interface ExplainerOptions {
  /**
   * Rótulo do modelo devolvido na resposta da API. No Bedrock, o adaptador troca o `model` da
   * requisição pelo ARN do perfil do contrato; o ARN (com a conta) não vai para o cliente.
   */
  modelId: string;
  /** Tentativas no total (a primeira + retentativas). */
  maxAttempts?: number;
  /** Orçamento de tempo de todas as tentativas juntas. */
  timeoutMs?: number;
  maxTokens?: number;
  /** Falhas seguidas que abrem o disjuntor. */
  failureThreshold?: number;
  cooldownMs?: number;
  metrics?: IExplanationMetrics;
  now?: () => number;
}

// ---------------------------------------------------------------- prompt e tool

const SIGNAL_DESCRIPTIONS: Record<ExplanationSignal, string> = {
  purchase_history: 'o item veio do modelo em lote treinado com o histórico de compras (tem batchScore)',
  similar_items: 'o item veio da busca vetorial por itens parecidos (tem vectorScore)',
  session_context: 'a busca vetorial usou os itens que o cliente está vendo agora (sessionItemIds e vectorScore)',
  category_affinity: 'o item é de uma categoria informada nos dados',
  popular: 'o item veio do catálogo curado de mais vendidos (provenance fallback)',
};

const SYSTEM_PROMPT = `Você escreve, para um cliente de e-commerce, uma frase curta explicando por que cada produto foi recomendado.

Critérios (todos obrigatórios):
1. Uma explicação para cada itemId recebido, nem mais nem menos, na mesma ordem.
2. reason em português do Brasil, segunda pessoa ("você"), entre ${MIN_REASON_CHARS} e no máximo ${MAX_REASON_CHARS} caracteres.
3. signals lista só os sinais permitidos daquele item (campo allowedSignals). Não invente sinais nem fatos: use apenas os dados recebidos.
4. Não fale de preço, desconto, frete, estoque ou prazo, e não use números.
5. Não cite o id do produto nem termos técnicos (score, vetor, modelo).
6. Responda chamando a ferramenta ${EXPLANATION_TOOL_NAME}, uma vez.

Significado dos sinais:
${Object.entries(SIGNAL_DESCRIPTIONS)
  .map(([k, v]) => `- ${k}: ${v}`)
  .join('\n')}

<exemplo>
Entrada: [{"itemId":"A1","title":"Garrafa térmica","category":"Casa","provenance":"hybrid","allowedSignals":["purchase_history","similar_items","category_affinity"]}]
Chamada: {"explanations":[{"itemId":"A1","reason":"Combina com as suas compras anteriores e com itens parecidos de que você gostou.","signals":["purchase_history","similar_items"]}]}
</exemplo>`;

const EXPLANATION_TOOL: Anthropic.Tool & { strict: boolean } = {
  name: EXPLANATION_TOOL_NAME,
  description:
    'Registra uma explicação curta por produto recomendado. Chame uma vez, com uma entrada para cada itemId recebido. ' +
    'Use apenas sinais presentes em allowedSignals do item.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['explanations'],
    properties: {
      explanations: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['itemId', 'reason', 'signals'],
          properties: {
            itemId: { type: 'string', description: 'itemId exatamente como recebido' },
            reason: { type: 'string', description: `Frase para o cliente, até ${MAX_REASON_CHARS} caracteres` },
            signals: {
              type: 'array',
              items: { type: 'string', enum: [...ExplanationSignalEnum.options] },
            },
          },
        },
      },
    },
  },
};

const ToolInputSchema = z.object({
  explanations: z.array(
    z.object({
      itemId: z.string(),
      reason: z.string(),
      signals: z.array(ExplanationSignalEnum),
    })
  ),
});

// ---------------------------------------------------------------- erros

class ValidationFailure extends Error {
  constructor(
    public readonly problems: string[],
    public readonly response: Anthropic.Message,
    public readonly toolUseId?: string
  ) {
    super(problems.join('; '));
  }
}

class TerminalFailure extends Error {
  constructor(
    public readonly category: ExplanationErrorCategory,
    public readonly retryable: boolean,
    message: string
  ) {
    super(message);
  }
}

function classify(err: unknown, aborted: boolean): TerminalFailure {
  if (err instanceof TerminalFailure) return err;
  if (aborted || err instanceof Anthropic.APIUserAbortError || err instanceof Anthropic.APIConnectionTimeoutError) {
    return new TerminalFailure('timeout', true, 'orçamento de tempo da explicação esgotado');
  }
  if (err instanceof Anthropic.RateLimitError) return new TerminalFailure('throttled', true, err.message);
  if (err instanceof Anthropic.InternalServerError) return new TerminalFailure('model_error', true, err.message);
  if (err instanceof Anthropic.APIConnectionError) return new TerminalFailure('model_error', true, err.message);
  if (err instanceof Anthropic.APIError) {
    // 400/401/403/404/422: repetir a mesma requisição não muda o resultado.
    const retryable = typeof err.status === 'number' && (err.status === 408 || err.status === 409 || err.status >= 500);
    return new TerminalFailure('model_error', retryable, err.message);
  }
  return new TerminalFailure('internal_error', false, err instanceof Error ? err.message : String(err));
}

// ---------------------------------------------------------------- explainer

export class RecommendationExplainer implements IRecommendationExplainer {
  private readonly maxAttempts: number;
  private readonly timeoutMs: number;
  private readonly maxTokens: number;
  private readonly failureThreshold: number;
  private readonly cooldownMs: number;
  private readonly now: () => number;
  private consecutiveFailures = 0;
  private openedAt: number | null = null;

  constructor(
    private readonly client: ClaudeMessagesPort,
    private readonly options: ExplainerOptions
  ) {
    this.maxAttempts = Math.max(1, options.maxAttempts ?? 2);
    this.timeoutMs = options.timeoutMs ?? 2500;
    this.maxTokens = options.maxTokens ?? 1024;
    this.failureThreshold = options.failureThreshold ?? 5;
    this.cooldownMs = options.cooldownMs ?? 30_000;
    this.now = options.now ?? Date.now;
  }

  public async explain(input: ExplainInput): Promise<ExplanationOutcome> {
    // Falha fechada (RF-110, ADR-0010 item 8): sem a configuração do contrato, nenhuma chamada ao
    // modelo. É erro de configuração, não de disponibilidade: não conta no disjuntor, senão a
    // categoria viraria circuit_open e esconderia a causa.
    const prontidao = this.client.prontidao?.() ?? { pronto: true };
    if (!prontidao.pronto) {
      void this.options.metrics?.publishExplanationFallback('internal_error');
      return { status: 'unavailable', attempts: 0, errorCategory: 'internal_error', retryable: false, detail: prontidao.motivo };
    }

    if (input.items.length === 0) {
      return { status: 'ok', attempts: 0, modelId: this.options.modelId, explanations: [] };
    }

    if (this.isCircuitOpen()) {
      return this.fail(0, new TerminalFailure('circuit_open', true, 'Bedrock com falhas seguidas; disjuntor aberto'));
    }

    const allowed = new Map(input.items.map((i) => [i.itemId, allowedSignalsFor(i, input.sessionItemIds)]));
    const messages: Anthropic.MessageParam[] = [{ role: 'user', content: this.userPrompt(input, allowed) }];

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const deadline = this.now() + this.timeoutMs;
    let attempts = 0;
    let lastFailure: TerminalFailure | null = null;

    try {
      while (attempts < this.maxAttempts) {
        attempts++;
        try {
          const response = await this.client.create(this.request(messages), {
            signal: controller.signal,
            timeout: Math.max(1, deadline - this.now()),
          });
          const explanations = this.parse(response, input, allowed);
          this.recordSuccess();
          return { status: 'ok', attempts, modelId: this.options.modelId, explanations };
        } catch (err) {
          if (err instanceof ValidationFailure) {
            lastFailure = new TerminalFailure('validation', true, err.message);
            if (attempts < this.maxAttempts) {
              void this.options.metrics?.publishExplanationRetry();
              this.appendValidationFeedback(messages, err);
            }
            continue;
          }
          lastFailure = classify(err, controller.signal.aborted);
          if (!lastFailure.retryable || lastFailure.category === 'timeout') break;
          if (attempts < this.maxAttempts) void this.options.metrics?.publishExplanationRetry();
        }
      }
    } finally {
      clearTimeout(timer);
    }

    return this.fail(attempts, lastFailure ?? new TerminalFailure('internal_error', false, 'sem resultado'));
  }

  // ------------------------------------------------------------ request

  private request(messages: Anthropic.MessageParam[]): Anthropic.MessageCreateParamsNonStreaming {
    return {
      model: this.options.modelId,
      max_tokens: this.maxTokens,
      system: SYSTEM_PROMPT,
      // tool_choice forçado só vale com thinking desligado; a tarefa é curta e sensível a latência.
      thinking: { type: 'disabled' },
      tools: [EXPLANATION_TOOL],
      tool_choice: { type: 'tool', name: EXPLANATION_TOOL_NAME },
      messages,
    };
  }

  private userPrompt(input: ExplainInput, allowed: Map<string, ExplanationSignal[]>): string {
    const items = input.items.map((i) => ({
      itemId: i.itemId,
      title: i.title,
      category: i.category,
      provenance: i.provenance,
      allowedSignals: allowed.get(i.itemId),
    }));
    return `Produtos recomendados, em ordem:\n${JSON.stringify(items)}`;
  }

  private appendValidationFeedback(messages: Anthropic.MessageParam[], failure: ValidationFailure): void {
    const feedback =
      `A chamada anterior não passou na validação:\n- ${failure.problems.join('\n- ')}\n` +
      `Chame ${EXPLANATION_TOOL_NAME} de novo corrigindo só esses problemas e mantendo o resto.`;
    messages.push({ role: 'assistant', content: failure.response.content });
    if (failure.toolUseId) {
      messages.push({
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: failure.toolUseId, is_error: true, content: feedback }],
      });
    } else {
      messages.push({ role: 'user', content: feedback });
    }
  }

  // ------------------------------------------------------------ parse e validação

  private parse(
    response: Anthropic.Message,
    input: ExplainInput,
    allowed: Map<string, ExplanationSignal[]>
  ): ItemExplanation[] {
    if (response.stop_reason === 'refusal') {
      throw new TerminalFailure('refusal', false, 'o modelo recusou a solicitação');
    }

    const toolUse = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === EXPLANATION_TOOL_NAME
    );

    if (!toolUse) {
      throw new ValidationFailure([`a resposta não chamou a ferramenta ${EXPLANATION_TOOL_NAME}`], response);
    }

    // A resposta (mesmo inválida) entra no histórico para a retentativa referenciar o tool_use_id.
    const fail = (problems: string[]): never => {
      throw new ValidationFailure(problems, response, toolUse.id);
    };

    if (response.stop_reason === 'max_tokens') {
      fail(['a resposta foi cortada por max_tokens; seja mais breve']);
    }

    const parsed = ToolInputSchema.safeParse(toolUse.input);
    if (!parsed.success) {
      fail(parsed.error.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`));
      throw new Error('unreachable');
    }

    const problems: string[] = [];
    const expected = input.items.map((i) => i.itemId);
    const seen = new Set<string>();

    for (const e of parsed.data.explanations) {
      if (!allowed.has(e.itemId)) problems.push(`itemId ${e.itemId} não está na lista recebida`);
      if (seen.has(e.itemId)) problems.push(`itemId ${e.itemId} repetido`);
      seen.add(e.itemId);

      const len = e.reason.trim().length;
      if (len < MIN_REASON_CHARS || len > MAX_REASON_CHARS) {
        problems.push(`${e.itemId}: reason com ${len} caracteres (precisa de ${MIN_REASON_CHARS} a ${MAX_REASON_CHARS})`);
      }
      if (/\d|%|R\$|US\$|desconto|promo|frete|grátis|gratis|preço|preco/i.test(e.reason)) {
        problems.push(`${e.itemId}: reason não pode falar de preço, desconto, frete ou usar números`);
      }
      if (e.signals.length === 0) problems.push(`${e.itemId}: informe ao menos um sinal`);
      const ok = allowed.get(e.itemId) ?? [];
      for (const s of e.signals) {
        if (!ok.includes(s)) problems.push(`${e.itemId}: sinal ${s} não é sustentado pelos dados (permitidos: ${ok.join(', ') || 'nenhum'})`);
      }
    }
    for (const id of expected) {
      if (!seen.has(id)) problems.push(`falta a explicação do itemId ${id}`);
    }

    if (problems.length > 0) fail(problems);

    const byId = new Map(parsed.data.explanations.map((e) => [e.itemId, e]));
    return expected.map((id) => {
      const e = byId.get(id)!;
      return { itemId: id, reason: e.reason.trim(), signals: [...new Set(e.signals)], source: 'claude' as const };
    });
  }

  // ------------------------------------------------------------ disjuntor e métricas

  private isCircuitOpen(): boolean {
    if (this.openedAt === null) return false;
    if (this.now() - this.openedAt >= this.cooldownMs) {
      this.openedAt = null; // meia-abertura: a próxima chamada testa o Bedrock
      this.consecutiveFailures = this.failureThreshold - 1;
      return false;
    }
    return true;
  }

  private recordSuccess(): void {
    this.consecutiveFailures = 0;
    this.openedAt = null;
  }

  private fail(attempts: number, failure: TerminalFailure): ExplanationOutcome {
    // Validação e recusa são problema da resposta, não da disponibilidade do Bedrock.
    if (failure.category !== 'circuit_open' && failure.category !== 'validation' && failure.category !== 'refusal') {
      this.consecutiveFailures++;
      if (this.consecutiveFailures >= this.failureThreshold) this.openedAt = this.now();
    }
    void this.options.metrics?.publishExplanationFallback(failure.category);
    return {
      status: 'unavailable',
      attempts,
      errorCategory: failure.category,
      retryable: failure.retryable,
      detail: failure.message,
    };
  }
}
