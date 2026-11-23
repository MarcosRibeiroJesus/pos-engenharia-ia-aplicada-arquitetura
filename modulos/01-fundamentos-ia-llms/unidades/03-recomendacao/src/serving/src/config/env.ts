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
  BEDROCK_MODEL_ID: z.string().default('anthropic.claude-haiku-5-5'),
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
