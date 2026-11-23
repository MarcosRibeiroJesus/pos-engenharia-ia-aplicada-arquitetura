import { randomBytes } from 'crypto';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { CandidateProvenance } from '../domain/candidate';
import {
  ExplanationErrorCategory,
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

/**
 * Ação do guardrail de saída, já traduzida pelo adaptador para uma lista fechada (ADR-0010 item 7).
 * `NONE`: as frases passaram. `INTERVENED`: o guardrail interveio, e nenhuma frase vai ao cliente.
 */
export type AcaoDoGuardrailDeSaida = 'NONE' | 'INTERVENED';

/**
 * Motivo de falha do guardrail de saída, numa lista fechada. O adaptador traduz o erro do provedor
 * para um destes motivos e nunca repassa a mensagem dele (que pode trazer ARN e conta).
 * - `limite`: 429 / ThrottlingException (retentável);
 * - `indisponivel`: 5xx do provedor (retentável);
 * - `conexao`: falha de rede sem resposta HTTP (retentável);
 * - `permissao`: 403, a role sem `bedrock:ApplyGuardrail` no guardrail do contrato (configuração);
 * - `requisicao`: outro 4xx, como 400 ou 404 (configuração ou pedido inválido);
 * - `formato`: resposta fora da lista permitida (ação desconhecida);
 * - `configuracao`: contrato inválido, recusado antes de qualquer rede.
 */
export type MotivoFalhaDoGuardrailDeSaida =
  | 'limite'
  | 'indisponivel'
  | 'conexao'
  | 'permissao'
  | 'requisicao'
  | 'formato'
  | 'configuracao';

export class FalhaDoGuardrailDeSaida extends Error {
  constructor(
    public readonly motivo: MotivoFalhaDoGuardrailDeSaida,
    public readonly status?: number
  ) {
    super(`falha do guardrail de saída: ${motivo}${status === undefined ? '' : ` (HTTP ${status})`}`);
    this.name = 'FalhaDoGuardrailDeSaida';
  }
}

/**
 * Porta do guardrail de saída (ApplyGuardrail com source OUTPUT, ADR-0010 item 7, T084). O guardrail
 * do InvokeModel não alcança os parâmetros de tool, onde as frases estão; por isso as frases aprovadas
 * na validação passam por esta revisão antes de chegar à resposta. O adaptador do Bedrock implementa;
 * os testes injetam o adaptador real com um transporte falso, ou um fake da porta.
 */
export interface GuardrailDeSaidaPort {
  revisarSaida(textos: string[], options: { signal: AbortSignal }): Promise<AcaoDoGuardrailDeSaida>;
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

export type { ExplanationErrorCategory };

/**
 * Campo do corpo da resposta do InvokeModel com a ação do guardrail (`INTERVENED` ou `NONE`,
 * ADR-0010 item 6). A porta devolve o corpo JSON cru do Bedrock, então o campo chega aqui mesmo fora
 * do tipo `Anthropic.Message`. Formato a confirmar na captura da T107 (risco R4): se o campo não
 * vier, uma intervenção sem `tool_use` cai na validação e termina em `unavailable` do mesmo jeito.
 */
export const CAMPO_ACAO_DO_GUARDRAIL = 'amazon-bedrock-guardrailAction';

/**
 * Marcas de entrada do guardrail (ADR-0010 item 5, T083, VT-17). Título e categoria vêm do catálogo,
 * que não é confiável (injeção indireta): só eles vão entre as marcas, para o filtro de ataque de
 * prompt do guardrail avaliá-los como conteúdo de entrada. O sufixo é aleatório por requisição e vai
 * declarado no corpo do InvokeModel, para que um dado de catálogo não adivinhe a marca de fechamento.
 *
 * FORMATO A CONFIRMAR (DM-08, captura da T107): o prefixo da marca, o campo do corpo e o limite do
 * sufixo não estão registrados no ADR-0010 e a documentação da AWS não foi reaberta na T083. Se a
 * forma real for outra, muda só aqui. Se o corpo for recusado, o 400 cai em `model_error` não
 * retentável (falha fechada); se as marcas forem ignoradas, o guardrail avalia o prompt inteiro.
 */
export const PREFIXO_MARCA_DO_GUARDRAIL = 'amazon-bedrock-guardrails-guardContent';
export const CAMPO_CONFIG_DO_GUARDRAIL = 'amazon-bedrock-guardrailConfig';
/** Lista permitida do sufixo: só minúsculas e dígitos, de 8 a 20 caracteres (limite a confirmar). */
export const SUFIXO_DA_MARCA_VALIDO = /^[a-z0-9]{8,20}$/;

function sufixoAleatorio(): string {
  return randomBytes(8).toString('hex');
}

/**
 * Campo de catálogo entre as marcas. `<` e `>` saem do valor: sem eles nenhum dado de catálogo forma
 * uma marca de abertura ou de fechamento, com qualquer sufixo. O resto do texto continua dentro da
 * marca, onde o guardrail o avalia. Campo vazio ou ausente fica ausente (sem marca vazia).
 */
function marcarCampoDeCatalogo(valor: string | undefined, sufixo: string): string | undefined {
  if (valor === undefined) return undefined;
  const neutro = valor.replace(/[<>]/g, '');
  if (neutro.trim().length === 0) return undefined;
  return `<${PREFIXO_MARCA_DO_GUARDRAIL}_${sufixo}>${neutro}</${PREFIXO_MARCA_DO_GUARDRAIL}_${sufixo}>`;
}

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
  /** Gerador do sufixo das marcas do guardrail; os testes injetam um fixo. Padrão: aleatório. */
  gerarSufixoDaMarca?: () => string;
  /**
   * Revisão da saída pelo guardrail da plataforma (ApplyGuardrail, T084). Obrigatória: sem ela o
   * explicador não chama o modelo (falha fechada), porque nenhuma frase pode chegar à resposta sem
   * passar na validação e no guardrail.
   */
  guardrailDeSaida: GuardrailDeSaidaPort;
}

/** Chamadas ao ApplyGuardrail por requisição: a primeira e uma retentativa, como o RF-007. */
const MAX_TENTATIVAS_DO_GUARDRAIL = 2;

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
    message: string,
    /**
     * Se a falha conta no disjuntor. Sem valor, decide pela categoria. Erro de configuração do
     * guardrail de saída (403, 400, formato) passa `false`: não é indisponibilidade do Bedrock.
     */
    public readonly contaNoDisjuntor?: boolean
  ) {
    super(message);
  }
}

class PrazoEsgotado extends Error {}

/**
 * Espera a promessa, mas encerra quando o sinal aborta, mesmo que a porta ignore o sinal: o orçamento
 * de tempo é um só para o InvokeModel e o ApplyGuardrail (VT-12).
 */
function comPrazo<T>(promessa: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new PrazoEsgotado());
  return new Promise<T>((resolve, reject) => {
    const aoAbortar = () => reject(new PrazoEsgotado());
    signal.addEventListener('abort', aoAbortar, { once: true });
    promessa.then(
      (v) => {
        signal.removeEventListener('abort', aoAbortar);
        resolve(v);
      },
      (e) => {
        signal.removeEventListener('abort', aoAbortar);
        reject(e);
      }
    );
  });
}

/**
 * Categoria do RF-007 para uma falha do guardrail de saída. O detail tem só o motivo e o status, nunca
 * a mensagem do provedor nem o texto revisado (sem eco). Erros de configuração ficam fora do disjuntor.
 */
function classificarFalhaDoGuardrail(err: unknown, aborted: boolean): TerminalFailure {
  if (aborted || err instanceof PrazoEsgotado) {
    return new TerminalFailure('timeout', true, 'orçamento de tempo da explicação esgotado na revisão da saída');
  }
  if (!(err instanceof FalhaDoGuardrailDeSaida)) {
    return new TerminalFailure('internal_error', false, 'falha inesperada na revisão da saída; mensagem omitida');
  }
  const http = err.status === undefined ? '' : ` (HTTP ${err.status})`;
  const omitida = '; mensagem do provedor omitida';
  switch (err.motivo) {
    case 'limite':
      return new TerminalFailure('throttled', true, `ApplyGuardrail com limite de taxa${http}${omitida}`);
    case 'indisponivel':
      return new TerminalFailure('model_error', true, `ApplyGuardrail indisponível${http}${omitida}`);
    case 'conexao':
      return new TerminalFailure('model_error', true, `falha de conexão com o ApplyGuardrail${omitida}`);
    case 'permissao':
      return new TerminalFailure(
        'model_error',
        false,
        `acesso negado ao ApplyGuardrail${http}: role sem permissão no guardrail do contrato${omitida}`,
        false
      );
    case 'requisicao':
      return new TerminalFailure('model_error', false, `ApplyGuardrail recusou o pedido${http}${omitida}`, false);
    case 'formato':
      return new TerminalFailure('model_error', false, 'ApplyGuardrail respondeu fora do formato esperado; resposta omitida', false);
    case 'configuracao':
      return new TerminalFailure('internal_error', false, 'contrato do guardrail de saída inválido; ApplyGuardrail não chamado', false);
  }
}

/**
 * Detalhe do erro HTTP do provedor só com o status, nunca com a mensagem dele: o `detail` não vai
 * mais para o log (lista permitida, T085), mas fica no resultado, e a mensagem de um 403 do IAM costuma trazer o ARN do chamador e do recurso, com a conta
 * (achado A5 da revisão da T081). Formato real da mensagem a confirmar na captura da T107.
 */
function detalheHttp(status: number | undefined): string {
  if (status === 403) {
    return 'acesso negado ao modelo (HTTP 403): chamada sem o guardrail do contrato ou fora do perfil; mensagem do provedor omitida';
  }
  return `o Bedrock respondeu HTTP ${status ?? 'sem status'}; mensagem do provedor omitida`;
}

function classify(err: unknown, aborted: boolean): TerminalFailure {
  if (err instanceof TerminalFailure) return err;
  if (aborted || err instanceof Anthropic.APIUserAbortError || err instanceof Anthropic.APIConnectionTimeoutError) {
    return new TerminalFailure('timeout', true, 'orçamento de tempo da explicação esgotado');
  }
  if (err instanceof Anthropic.RateLimitError) return new TerminalFailure('throttled', true, detalheHttp(err.status));
  if (err instanceof Anthropic.InternalServerError) return new TerminalFailure('model_error', true, detalheHttp(err.status));
  if (err instanceof Anthropic.APIConnectionError) {
    return new TerminalFailure('model_error', true, 'falha de conexão com o Bedrock; mensagem do provedor omitida');
  }
  if (err instanceof Anthropic.APIError) {
    // 400/401/403/404/422: repetir a mesma requisição não muda o resultado. O 403 é o caso da
    // chamada sem o guardrail do contrato, negada pela condição do IAM (ADR-0010 item 4).
    const retryable = typeof err.status === 'number' && (err.status === 408 || err.status === 409 || err.status >= 500);
    return new TerminalFailure('model_error', retryable, detalheHttp(err.status));
  }
  // Só o nome da classe: a mensagem de um erro inesperado pode trazer texto do prompt ou do provedor.
  const nome = err instanceof Error ? err.name : 'desconhecido';
  return new TerminalFailure('internal_error', false, `falha inesperada na chamada ao modelo (${nome}); mensagem omitida`);
}

// ---------------------------------------------------------------- explainer

const NAO_CONTAM_NO_DISJUNTOR: ReadonlySet<ExplanationErrorCategory> = new Set<ExplanationErrorCategory>([
  'circuit_open',
  'validation',
  'refusal',
  'guardrail',
]);

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

    // Falha fechada (T084): sem a revisão da saída, nenhuma frase pode chegar à resposta; então o
    // modelo nem é chamado. Erro de configuração: fora do disjuntor.
    if (!this.options.guardrailDeSaida) {
      void this.options.metrics?.publishExplanationFallback('internal_error');
      return {
        status: 'unavailable',
        attempts: 0,
        errorCategory: 'internal_error',
        retryable: false,
        detail: 'revisão da saída sem guardrail configurado; modelo não chamado',
      };
    }

    if (input.items.length === 0) {
      return { status: 'ok', attempts: 0, modelId: this.options.modelId, explanations: [] };
    }

    // Um sufixo por requisição (VT-17), o mesmo nas retentativas, para as marcas do histórico
    // continuarem válidas. Fora da lista permitida, falha fechada: sem marca confiável, nenhum dado de
    // catálogo vai ao modelo. É erro interno, não de disponibilidade: não conta no disjuntor. O valor
    // não entra no detail (sem eco).
    const sufixo = (this.options.gerarSufixoDaMarca ?? sufixoAleatorio)();
    if (typeof sufixo !== 'string' || !SUFIXO_DA_MARCA_VALIDO.test(sufixo)) {
      void this.options.metrics?.publishExplanationFallback('internal_error');
      return {
        status: 'unavailable',
        attempts: 0,
        errorCategory: 'internal_error',
        retryable: false,
        detail: 'sufixo das marcas do guardrail fora da lista permitida; modelo não chamado',
      };
    }

    if (this.isCircuitOpen()) {
      return this.fail(0, new TerminalFailure('circuit_open', true, 'Bedrock com falhas seguidas; disjuntor aberto'));
    }

    const allowed = new Map(input.items.map((i) => [i.itemId, allowedSignalsFor(i, input.sessionItemIds)]));
    const messages: Anthropic.MessageParam[] = [{ role: 'user', content: this.userPrompt(input, allowed, sufixo) }];

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const deadline = this.now() + this.timeoutMs;
    let attempts = 0;
    let lastFailure: TerminalFailure | null = null;
    let aprovadas: ItemExplanation[] | null = null;

    try {
      while (attempts < this.maxAttempts) {
        attempts++;
        try {
          const response = await this.client.create(this.request(messages, sufixo), {
            signal: controller.signal,
            timeout: Math.max(1, deadline - this.now()),
          });
          aprovadas = this.parse(response, input, allowed);
          break;
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

      // Revisão da saída (ADR-0010 item 7): só as frases que passaram na validação, no mesmo
      // orçamento de tempo. Uma falha aqui é final para a requisição: o modelo não é chamado de novo.
      if (aprovadas) {
        const falha = await this.revisarSaida(aprovadas, controller.signal);
        if (falha) return this.fail(attempts, falha);
        this.recordSuccess();
        return { status: 'ok', attempts, modelId: this.options.modelId, explanations: aprovadas };
      }
    } finally {
      clearTimeout(timer);
    }

    return this.fail(attempts, lastFailure ?? new TerminalFailure('internal_error', false, 'sem resultado'));
  }

  // ------------------------------------------------------------ revisão da saída

  /**
   * ApplyGuardrail com source OUTPUT sobre as frases aprovadas, num bloco só de texto (uma frase por
   * linha), para a requisição pagar o mínimo de unidades de texto. Devolve a falha, ou `null` se o
   * guardrail aprovou. Só os motivos retentáveis repetem, e só o ApplyGuardrail (nunca o modelo).
   */
  private async revisarSaida(explicacoes: ItemExplanation[], signal: AbortSignal): Promise<TerminalFailure | null> {
    const textos = [explicacoes.map((e) => e.reason).join('\n')];
    for (let tentativa = 1; ; tentativa++) {
      try {
        const acao = await comPrazo(this.options.guardrailDeSaida.revisarSaida(textos, { signal }), signal);
        if (acao === 'NONE') return null;
        if (acao === 'INTERVENED') {
          // O texto que o guardrail devolve no lugar das frases não entra no detail (sem eco).
          return new TerminalFailure('guardrail', false, 'o guardrail da plataforma interveio na revisão da saída');
        }
        return classificarFalhaDoGuardrail(new FalhaDoGuardrailDeSaida('formato'), false);
      } catch (err) {
        const falha = classificarFalhaDoGuardrail(err, signal.aborted);
        if (!falha.retryable || falha.category === 'timeout' || tentativa >= MAX_TENTATIVAS_DO_GUARDRAIL) return falha;
        void this.options.metrics?.publishExplanationRetry();
      }
    }
  }

  // ------------------------------------------------------------ request

  private request(messages: Anthropic.MessageParam[], sufixo: string): Anthropic.MessageCreateParamsNonStreaming {
    const params: Anthropic.MessageCreateParamsNonStreaming & { [CAMPO_CONFIG_DO_GUARDRAIL]: { tagSuffix: string } } = {
      model: this.options.modelId,
      max_tokens: this.maxTokens,
      system: SYSTEM_PROMPT,
      // tool_choice forçado só vale com thinking desligado; a tarefa é curta e sensível a latência.
      thinking: { type: 'disabled' },
      tools: [EXPLANATION_TOOL],
      tool_choice: { type: 'tool', name: EXPLANATION_TOOL_NAME },
      messages,
      // Declara o sufixo das marcas no corpo do InvokeModel (formato a confirmar, ver acima). O SDK
      // do Bedrock repassa o corpo, tirando só `model` e `stream`.
      [CAMPO_CONFIG_DO_GUARDRAIL]: { tagSuffix: sufixo },
    };
    return params;
  }

  private userPrompt(input: ExplainInput, allowed: Map<string, ExplanationSignal[]>, sufixo: string): string {
    // Só título e categoria vêm do catálogo e vão marcados; itemId, proveniência e sinais são
    // calculados pelo serviço e ficam fora das marcas (nada além desses campos fica marcado).
    const items = input.items.map((i) => ({
      itemId: i.itemId,
      title: marcarCampoDeCatalogo(i.title, sufixo),
      category: marcarCampoDeCatalogo(i.category, sufixo),
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
    // Intervenção do guardrail (ADR-0010 item 6): decide pelo campo do corpo, antes de olhar o
    // conteúdo, porque o texto devolvido é a mensagem de bloqueio e não uma resposta a validar.
    // Retentar não muda o resultado; o texto de bloqueio não entra no detail (sem eco).
    if ((response as unknown as Record<string, unknown>)[CAMPO_ACAO_DO_GUARDRAIL] === 'INTERVENED') {
      throw new TerminalFailure('guardrail', false, 'o guardrail da plataforma interveio na chamada ao modelo');
    }

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
    // Validação, recusa e intervenção do guardrail são problema da resposta (do conteúdo), não da
    // disponibilidade do Bedrock: não contam no disjuntor.
    if (failure.contaNoDisjuntor ?? !NAO_CONTAM_NO_DISJUNTOR.has(failure.category)) {
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
