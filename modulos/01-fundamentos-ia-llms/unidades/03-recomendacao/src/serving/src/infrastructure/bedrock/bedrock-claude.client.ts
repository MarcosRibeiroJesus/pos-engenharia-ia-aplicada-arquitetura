import AnthropicBedrock from '@anthropic-ai/bedrock-sdk';
import type Anthropic from '@anthropic-ai/sdk';
import { env } from '../../config/env';
import { ClaudeMessagesPort } from '../../application/recommendation-explainer';

/**
 * Adaptador do Claude no Amazon Bedrock (caminho InvokeModel, endpoint bedrock-runtime).
 * Escolhido no lugar do cliente Mantle porque a VPC já tem endpoint de interface para
 * bedrock-runtime e o emulador local cobre esse caminho (ADR-0004).
 * Retentativas ficam no explainer, dentro de um único orçamento de tempo: o SDK não retenta.
 */
export class BedrockClaudeClient implements ClaudeMessagesPort {
  private readonly client: AnthropicBedrock;

  constructor(client?: AnthropicBedrock) {
    this.client =
      client ??
      new AnthropicBedrock({
        awsRegion: env.AWS_REGION,
        baseURL: env.BEDROCK_ENDPOINT_URL,
        maxRetries: 0,
        apiKey: null, // assina com as credenciais da task role (SigV4), não com bearer token
      });
  }

  public create(
    params: Anthropic.MessageCreateParamsNonStreaming,
    options?: { signal?: AbortSignal; timeout?: number }
  ): Promise<Anthropic.Message> {
    return this.client.messages.create(params, options);
  }
}
