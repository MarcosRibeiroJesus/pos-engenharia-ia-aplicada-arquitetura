# Matriz de cobertura: regra → teste

Regra sem teste conta como falha (CLAUDE.md). Camadas:
**TT** = `terraform test` com mock provider (`infra/terraform/tests/regras_base.tftest.hcl`, nome do `run`);
**ST** = regras estruturais (`infra/terraform/tests/static_rules.py`);
**CK** = checkov; **IT** = integração no Floci (`testing/scripts/integracao_01_03_recomendacao.py`, nome do passo);
**VT** = Vitest do serviço (arquivo de teste).

## Regras base do CLAUDE.md

| Id | Regra | Testes |
|---|---|---|
| R1 | Nada público por padrão | TT `rede_privada_por_padrao`, `rede_api_publica_exige_opt_in`, `s3_golden_dataset`, `ecs_menor_privilegio_e_privado`, `mwaa_ligado_privado` · CK (SG, S3, ALB) · IT "S3: bloqueio de acesso público completo", "ALB interno por padrão", "ECS: tasks sem IP público", "Rede: sem internet gateway sem opt-in" |
| R2 | Criptografia em repouso e em trânsito | TT `kms_chave_da_plataforma`, `s3_golden_dataset`, `dynamodb_criptografado`, `memorydb_tls`, `ecs_api_publica_exige_tls`, `ecs_api_publica_com_https`, `glue_criptografado_e_com_logs`, `athena_resultados_kms`, `monitoramento_e_orcamento` (SNS) · CK · IT "S3: SSE-KMS", "S3: política nega acesso sem TLS", "DynamoDB: SSE com KMS", "Log groups com KMS e retenção", "MemoryDB: TLS em trânsito" (lacuna, ver ADR-0006) |
| R3 | Menor privilégio no IAM | TT `ecs_menor_privilegio_e_privado`, `sagemaker_sem_full_access`, `mwaa_ligado_privado`, `lake_formation_concede_a_role_do_glue` · IT "IAM: task role sem Resource \"*\" incondicional" |
| R4 | Tags `project`, `module`, `managed-by` | TT `raiz_tags` · IT "Tags project, module e managed-by" (todos os recursos taggeados do stack) |
| R5 | Sem custo fixo ocioso sem ADR | ST (todo recurso de custo por hora citado em ADR; nenhum NAT Gateway) · TT `rede_endpoints_de_interface_no_lab` (1 AZ), `memorydb_tls` (1 shard, 0 réplica), `ecs_menor_privilegio_e_privado` (1 task), `sagemaker_sem_full_access` (Serverless sem concorrência provisionada), `mwaa_desligado_por_padrao` · IT "Rede: nenhum NAT Gateway", "ECS: ... 1 task no lab" |
| R6 | Logs, métricas e alarmes nos componentes críticos | TT `rede_privada_por_padrao` (flow logs), `ecs_menor_privilegio_e_privado` (logs das tasks), `glue_criptografado_e_com_logs`, `monitoramento_e_orcamento` (7 alarmes com ação, p95 real) · IT "Alarmes com ação no SNS", "Log groups com KMS e retenção" |
| R7 | Destroy sem sobras | TT `kms_chave_da_plataforma` (janela de 7 dias), `s3_golden_dataset` (force_destroy), `dynamodb_criptografado` (sem deletion protection), `ecs_menor_privilegio_e_privado` (ECR force_delete), `sagemaker_sem_full_access` (log group gerenciado), `glue_criptografado_e_com_logs` · IT "Stack: terraform destroy", "Destroy sem sobras" |
| R8 | State remoto com lock | ST (backend `s3`, `use_lockfile = true`, sem DynamoDB) · IT "Stack: init com backend S3 + use_lockfile", "State remoto no S3 e lock liberado após o apply", "State remoto preservado e lock liberado após o destroy" |
| R9 | Teto de custo no AWS Budgets | TT `monitoramento_e_orcamento` (US$ 10, alertas em 80% e 100%) · IT "AWS Budgets com teto de US$ 10" |

## Decisões da unidade

| Origem | Regra | Testes |
|---|---|---|
| ADR-0002 | Saída das tasks só por endpoints; MWAA ligado acrescenta os endpoints dele | TT `rede_endpoints_de_interface_no_lab`, `rede_mwaa_ligado_adiciona_endpoints` · IT "Rede: 6 endpoints de interface e 2 de gateway" |
| ADR-0003 | API pública exige HTTPS com TLS 1.3 | TT `ecs_api_publica_exige_tls`, `ecs_api_publica_com_https` |
| ADR-0004 | Saída estruturada via tool_use com schema estrito e `tool_choice` forçado (4.3) | VT `tests/unit/recommendation-explainer.test.ts` "força a tool..." |
| ADR-0004 | Critérios explícitos e few-shot no prompt (4.1, 4.2) | VT "o prompt tem critérios explícitos e um exemplo" |
| ADR-0004 | Retentativa com o erro de validação como `tool_result` `is_error` (4.4) | VT "reenvia o erro de validação...", "trata resposta sem tool_use...", "respeita o limite de tentativas" |
| ADR-0004 | Proveniência: sinal sem lastro é rejeitado (5.6) | VT "rejeita sinal que os dados do item não sustentam", "rejeita promessa de preço ou desconto e item fora da lista" |
| ADR-0004 | Erros por categoria com flag de retentável (2.2, 5.3) | VT "refusal não é retentado", "429 é retentável...", "400 do modelo não é retentado", "estoura o orçamento de tempo", "abre o disjuntor..." |
| ADR-0004 | Fallback sem explicação, nunca 500, fora do SLO de 60 ms | VT `tests/integration/explanation-in-recommendations.test.ts` (5 casos) · IT "Claude via bedrock-runtime do emulador: nunca lança" |
| ADR-0005 | Workflows com OIDC, ambiente protegido, confirmação pelo nome do stack, verificação de sobras, filtro de caminho | ST (seção de workflows: sem chave estática, `environment: aws-lab`, `id-token: write`, confirmação, `enable_mwaa` repassado, etapas do CI) |
| Unidade | 5 modos de degradação, filtros 100% | VT `tests/integration/fallback-*.test.ts`, `business-filter-enforcement.test.ts`, `tests/unit/*` |
