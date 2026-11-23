import AnthropicBedrock from '@anthropic-ai/bedrock-sdk';
import type Anthropic from '@anthropic-ai/sdk';
import { ContratoBedrock, env } from '../../config/env';
import { ClaudeMessagesPort, ProntidaoClaude } from '../../application/recommendation-explainer';

/**
 * Adaptador do Claude no Amazon Bedrock (caminho InvokeModel, endpoint bedrock-runtime).
 * Escolhido no lugar do cliente Mantle porque a VPC já tem endpoint de interface para
 * bedrock-runtime e o emulador local cobre esse caminho (ADR-0004).
 * Retentativas ficam no explainer, dentro de um único orçamento de tempo: o SDK não retenta.
 *
 * Contrato da plataforma (RF-110, ADR-0010, E9):
 * - `model` é sempre o ARN do perfil de inferência de aplicação do contrato, qualquer que seja o
 *   `model` recebido: o adaptador preso ao contrato é o único lugar que decide o modelo;
 * - os cabeçalhos do guardrail vão em toda requisição. O SDK 1.1.2 assina com SigV4 depois de
 *   montar os cabeçalhos, então eles entram na assinatura, e o IAM (condição
 *   `bedrock:GuardrailIdentifier`) nega a chamada que chegar sem eles;
 * - `X-Amzn-Bedrock-Trace` nunca vai: o trace do guardrail volta sem máscara;
 * - falha fechada: sem contrato válido, `create` recusa antes de qualquer rede.
 */
export const CABECALHO_GUARDRAIL_ID = 'X-Amzn-Bedrock-GuardrailIdentifier';
export const CABECALHO_GUARDRAIL_VERSAO = 'X-Amzn-Bedrock-GuardrailVersion';

export class BedrockClaudeClient implements ClaudeMessagesPort {
  private readonly client: AnthropicBedrock;

  constructor(
    private readonly contrato: ContratoBedrock,
    client?: AnthropicBedrock
  ) {
    this.client =
      client ??
      new AnthropicBedrock({
        awsRegion: env.AWS_REGION,
        baseURL: env.BEDROCK_ENDPOINT_URL,
        maxRetries: 0,
        apiKey: null, // assina com as credenciais da task role (SigV4), não com bearer token
      });
  }

  public prontidao(): ProntidaoClaude {
    return this.contrato.valido ? { pronto: true } : { pronto: false, motivo: this.contrato.motivo };
  }

  public create(
    params: Anthropic.MessageCreateParamsNonStreaming,
    options?: { signal?: AbortSignal; timeout?: number }
  ): Promise<Anthropic.Message> {
    const contrato = this.contrato;
    if (!contrato.valido) {
      // Defesa em camadas: o explicador já não chama sem prontidão, e o adaptador também recusa.
      return Promise.reject(new Error(contrato.motivo));
    }
    return this.client.messages.create(
      { ...params, model: contrato.perfilArn },
      {
        // Só o que veio: o SDK recusa `timeout: undefined` explícito.
        ...options,
        headers: {
          [CABECALHO_GUARDRAIL_ID]: contrato.guardrailId,
          [CABECALHO_GUARDRAIL_VERSAO]: contrato.guardrailVersao,
        },
      }
    );
  }
}
