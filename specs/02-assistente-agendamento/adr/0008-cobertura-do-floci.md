# ADR-0008: Cobertura do Floci e lacunas do emulador

- **Status:** proposto (vai com o plano)
- **Data:** 2026-11-21 · **Autor:** arquiteto-aws (Claude Opus 5.5)

## Contexto
A integração roda no Floci só com o projeto completo (Art. III). A [lista de serviços do Floci](https://floci.io/floci/services/), consultada em 2026-11-21, inclui Lambda, API Gateway v1, DynamoDB, Step Functions, SNS, S3, KMS, IAM, STS, CloudWatch Logs e Metrics, X-Ray, WAF v2, AWS Budgets, Amazon Bedrock, Bedrock Runtime e Bedrock AgentCore. A CLI `floci` não está instalada nesta sessão.

## Decisão
- **No Floci:** o stack inteiro com `modo_llm = gravado` (sem chamada ao Claude), relógio fixo (`relogio_fixo`) e asserts sobre a API: agendar, pedir cancelamento, aprovar com a role de aprovação, conferir a agenda, apagar a memória e a trilha de cada camada (`EXPOR_TRILHA` só no lab).
- **Fora do Floci, com evidência na documentação do emulador** (a mesma que a plataforma usou no ADR-0009 dela): guardrail do Bedrock (fora de escopo na página do Bedrock Runtime), perfil de inferência de aplicação (`CreateInferenceProfile` não descrito) e entrega real de alarme. A prova fica no `terraform test` com mock e na demonstração real (DM).
- **Nunca alterar código correto para agradar o emulador** (CLAUDE.md); uma lacuna só é registrada com evidência.

## Alternativas rejeitadas
- **Testar o guardrail com um mock próprio no Floci.** Rejeitado: provaria o mock, não o serviço.

## Trade-offs
A integração não prova o guardrail nem a atribuição de custo; esses ficam na demonstração.

## Custo
Zero (local).

## Risco
Diferença de comportamento do Step Functions `waitForTaskToken` no emulador; se houver, o relatório separa a lacuna da falha real.

## Tarefas da prova exercitadas
3.6 (CI), 5.6 (lacunas com evidência).

## Curso Skilljar relacionado
*Claude Code in Action*.

## O que um arquiteto sênior faria em produção
Um ambiente de homologação real e efêmero por PR para os serviços sem emulação, com destroy automático.
