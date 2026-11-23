import { ApplyGuardrailCommand, BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { ContratoBedrock, env } from '../../config/env';
import {
  AcaoDoGuardrailDeSaida,
  FalhaDoGuardrailDeSaida,
  GuardrailDeSaidaPort,
} from '../../application/recommendation-explainer';

/**
 * Adaptador do ApplyGuardrail com source OUTPUT (ADR-0010 item 7, T084, VT-12).
 *
 * - Sai pelo SDK da AWS (`@aws-sdk/client-bedrock-runtime`, endpoint bedrock-runtime), assinado com
 *   SigV4 pela task role. A role só tem `bedrock:ApplyGuardrail` no guardrail do contrato (ADR-0010
 *   item 4).
 * - Guardrail e versão vêm do contrato da plataforma, nunca escritos no código. Contrato inválido:
 *   recusa antes de qualquer rede (falha fechada).
 * - Retentativas ficam no explicador, dentro do orçamento de tempo: o SDK não retenta (`maxAttempts: 1`).
 * - Erros do provedor viram um motivo de uma lista fechada, sem a mensagem dele (um 403 do IAM traz o
 *   ARN do chamador e do recurso, com a conta).
 *
 * FORMATO A CONFIRMAR (DM-08, captura da T107): a página da API ApplyGuardrail não foi consultada (a
 * documentação da AWS não abriu na T084). O pedido (`guardrailIdentifier`, `guardrailVersion`,
 * `source: OUTPUT`, `content[].text.text`), a resposta (`action` com `GUARDRAIL_INTERVENED` ou `NONE`)
 * e as exceções seguem os tipos e o desserializador do SDK 3.1171.0 instalado (código do pacote), não
 * a documentação. Se a forma real for outra, a resposta cai em `formato` (falha fechada).
 */
export class BedrockApplyGuardrailClient implements GuardrailDeSaidaPort {
  private readonly client: BedrockRuntimeClient;

  constructor(
    private readonly contrato: ContratoBedrock,
    client?: BedrockRuntimeClient
  ) {
    this.client =
      client ??
      new BedrockRuntimeClient({
        region: env.AWS_REGION,
        endpoint: env.BEDROCK_ENDPOINT_URL,
        maxAttempts: 1,
      });
  }

  public async revisarSaida(textos: string[], options: { signal: AbortSignal }): Promise<AcaoDoGuardrailDeSaida> {
    const contrato = this.contrato;
    if (!contrato.valido) throw new FalhaDoGuardrailDeSaida('configuracao');
    if (textos.length === 0) throw new FalhaDoGuardrailDeSaida('requisicao');

    let acao: unknown;
    try {
      const resposta = await this.client.send(
        new ApplyGuardrailCommand({
          guardrailIdentifier: contrato.guardrailId,
          guardrailVersion: contrato.guardrailVersao,
          source: 'OUTPUT',
          content: textos.map((text) => ({ text: { text } })),
        }),
        { abortSignal: options.signal }
      );
      acao = resposta.action;
    } catch (err) {
      throw traduzirErro(err);
    }

    // Lista permitida da ação; qualquer outra coisa é formato inesperado, sem eco do valor.
    if (acao === 'NONE') return 'NONE';
    if (acao === 'GUARDRAIL_INTERVENED') return 'INTERVENED';
    throw new FalhaDoGuardrailDeSaida('formato');
  }
}

/** Erro do SDK da AWS para o motivo da lista fechada, pelo status HTTP e pelo nome da exceção. */
function traduzirErro(err: unknown): FalhaDoGuardrailDeSaida {
  const e = (err ?? {}) as { name?: unknown; $metadata?: { httpStatusCode?: unknown } };
  const status = typeof e.$metadata?.httpStatusCode === 'number' ? e.$metadata.httpStatusCode : undefined;
  if (e.name === 'ThrottlingException' || status === 429) return new FalhaDoGuardrailDeSaida('limite', status);
  if (status === undefined) {
    // Sem resposta HTTP: rede, ou o pedido abortado pelo orçamento (o explicador vê o sinal e decide).
    return new FalhaDoGuardrailDeSaida('conexao');
  }
  if (status === 403) return new FalhaDoGuardrailDeSaida('permissao', status);
  // Os mesmos retentáveis do RF-007: 408, 409 e 5xx.
  if (status >= 500 || status === 408 || status === 409) return new FalhaDoGuardrailDeSaida('indisponivel', status);
  return new FalhaDoGuardrailDeSaida('requisicao', status);
}
