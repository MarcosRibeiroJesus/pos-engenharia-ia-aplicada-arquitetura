// Claude no Amazon Bedrock pelo endpoint bedrock-mantle (Messages API), com o cliente
// oficial AnthropicBedrockMantle e assinatura SigV4 da role da Lambda (sem chave estática).
// Os erros saem classificados para o gateway decidir entre fallback, circuito e falha (tarefa 2.2).
import { AnthropicBedrockMantle } from "@anthropic-ai/bedrock-sdk";
import Anthropic from "@anthropic-ai/sdk";
import { ErroProvedor, type ProvedorLlm, type RequisicaoLlm, type Tarefa } from "./tipos.js";

export interface OpcoesBedrock {
  regiao: string;
  /** Só para testes: fetch falso com respostas gravadas. */
  fetch?: typeof fetch;
  semAutenticacao?: boolean;
  timeoutMs?: number;
}

export class ProvedorBedrockMantle implements ProvedorLlm {
  readonly nome = "bedrock-mantle";
  private readonly cliente: AnthropicBedrockMantle;

  constructor(o: OpcoesBedrock) {
    this.cliente = new AnthropicBedrockMantle({
      awsRegion: o.regiao,
      // Retentativa é do gateway (cadeia + circuito); o SDK não repete por conta própria.
      maxRetries: 0,
      timeout: o.timeoutMs ?? 20_000,
      ...(o.fetch ? { fetch: o.fetch } : {}),
      ...(o.semAutenticacao ? { skipAuth: true } : {}),
    });
  }

  async chamar(modelo: string, req: RequisicaoLlm, _tarefa: Tarefa): Promise<Anthropic.Message> {
    try {
      return await this.cliente.messages.create({ ...req, model: modelo });
    } catch (e) {
      throw classificar(e);
    }
  }
}

/** Do mais específico para o mais geral: timeout e rede antes do status HTTP. */
export function classificar(e: unknown): ErroProvedor {
  if (e instanceof Anthropic.APIConnectionTimeoutError) return new ErroProvedor("transitorio", true, "timeout");
  if (e instanceof Anthropic.APIConnectionError) return new ErroProvedor("transitorio", true, "falha de conexão");
  if (e instanceof Anthropic.RateLimitError) return new ErroProvedor("limite_de_taxa", true, e.message, 429);
  if (e instanceof Anthropic.APIError) {
    const s = e.status ?? 0;
    if (s >= 500) return new ErroProvedor("transitorio", true, e.message, s);
    if (s === 401 || s === 403) return new ErroProvedor("acesso_negado", false, e.message, s);
    return new ErroProvedor("requisicao_invalida", false, e.message, s);
  }
  return new ErroProvedor("transitorio", true, String(e));
}
