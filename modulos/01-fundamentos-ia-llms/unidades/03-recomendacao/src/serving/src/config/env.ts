import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test', 'poc']).default('development'),
  PORT: z.coerce.number().default(8080),
  AWS_REGION: z.string().default('us-east-1'),
  DYNAMODB_TABLE_NAME: z.string().default('user_recommendations'),
  DYNAMODB_ENDPOINT: z.string().optional(),
  MEMORYDB_CLUSTER_ENDPOINT: z.string().default('localhost:6379'),
  SAGEMAKER_ENDPOINT_NAME: z.string().default('recommendation-serverless-endpoint'),
  SAGEMAKER_ENDPOINT_URL: z.string().optional(),
  // Versão do artefato do re-ranker (hash do model.tar.gz publicado pelo apply, ADR-0008). É o
  // `modelId` que o cliente informa; o container nativo do XGBoost não devolve versão no CSV. Lista
  // permitida de caracteres; sem a variável, um valor neutro que não se passa por versão real.
  RERANKER_MODEL_VERSION: z
    .string()
    .regex(/^[A-Za-z0-9._-]{1,128}$/, 'must match ^[A-Za-z0-9._-]{1,128}$')
    .default('reranker-sem-versao'),
  MEMORYDB_TLS: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  // Contrato da plataforma (RF-110, ADR-0010): o task definition recebe os três valores do
  // parâmetro `produtos/01-recomendacao`. Sem default e sem validação aqui, de propósito: um valor
  // faltando ou inválido não derruba o serviço; desliga só a explicação (falha fechada em
  // `contratoBedrock`). Nenhum id de modelo fica escrito no código (ST-06).
  BEDROCK_PERFIL_ARN: z.string().optional(),
  GUARDRAIL_ID: z.string().optional(),
  GUARDRAIL_VERSAO: z.string().optional(),
  BEDROCK_ENDPOINT_URL: z.string().optional(),
  EXPLANATIONS_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  EXPLANATION_TIMEOUT_MS: z.coerce.number().int().positive().default(2500),
  METRICS_NAMESPACE: z.string().default('Ecommerce/Recommendations'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function loadEnv(override?: Partial<EnvConfig>): EnvConfig {
  const parsed = envSchema.safeParse({
    ...process.env,
    ...override,
  });

  if (!parsed.success) {
    const errorDetails = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
    throw new Error(`Environment configuration validation error: ${errorDetails}`);
  }

  return parsed.data;
}

export const env = loadEnv();

// ---------------------------------------------------------------- contrato do Bedrock

/** Configuração do Claude vinda do contrato da plataforma, já validada, ou o motivo da recusa. */
export type ContratoBedrock =
  | { valido: true; perfilArn: string; guardrailId: string; guardrailVersao: string }
  | { valido: false; motivo: string };

// Listas permitidas (ADR-0010). Só o perfil de inferência de APLICAÇÃO do produto (é ele que atribui
// o custo pela tag); id de modelo e perfil de sistema ficam de fora. O guardrail vem por id e na
// versão numerada publicada no contrato v1; `DRAFT` é recusado. Os padrões também barram quebra de
// linha, então nenhum valor injeta cabeçalho.
const PADROES_CONTRATO = {
  BEDROCK_PERFIL_ARN:
    /^arn:aws(-cn|-us-gov|-iso|-iso-b)?:bedrock:[a-z0-9-]{1,20}:[0-9]{12}:application-inference-profile\/[a-z0-9]{1,64}$/,
  GUARDRAIL_ID: /^[a-z0-9]{1,64}$/,
  GUARDRAIL_VERSAO: /^[1-9][0-9]{0,7}$/,
} as const;

type VariavelContrato = keyof typeof PADROES_CONTRATO;

/**
 * Valida os três valores do contrato. Falha fechada: qualquer um ausente ou fora da lista permitida
 * devolve `valido: false`, e o explicador não chama o modelo. O motivo nomeia só a variável, nunca
 * o valor recebido, porque ele vai para o detalhe do erro e pode chegar a log.
 */
export function contratoBedrock(
  cfg: Partial<Record<VariavelContrato, string | undefined>>
): ContratoBedrock {
  const problemas: string[] = [];
  for (const nome of Object.keys(PADROES_CONTRATO) as VariavelContrato[]) {
    const valor = cfg[nome];
    if (valor === undefined || valor === '') problemas.push(`${nome} ausente`);
    else if (!PADROES_CONTRATO[nome].test(valor)) problemas.push(`${nome} fora do formato permitido`);
  }
  if (problemas.length > 0) {
    return { valido: false, motivo: `configuração do contrato da plataforma inválida: ${problemas.join('; ')}` };
  }
  return {
    valido: true,
    perfilArn: cfg.BEDROCK_PERFIL_ARN!,
    guardrailId: cfg.GUARDRAIL_ID!,
    guardrailVersao: cfg.GUARDRAIL_VERSAO!,
  };
}

/**
 * Rótulo público do modelo, que vai no `explanation.modelId` da resposta da API. Só o id final do
 * perfil de aplicação: o ARN traz a conta e a região e não sai para o cliente.
 */
export function rotuloDoPerfil(contrato: ContratoBedrock): string {
  return contrato.valido ? `perfil/${contrato.perfilArn.split('/').pop()}` : 'sem-contrato';
}
