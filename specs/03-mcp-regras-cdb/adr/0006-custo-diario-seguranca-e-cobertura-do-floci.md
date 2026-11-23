# ADR-0006: Custo diário, segurança em conta única e cobertura do Floci

- **Status:** aceito (plano e teto diário de US$ 0,50 aprovados pelo dono em 2026-11-22, D-073)
- **Data:** 2026-11-22 · **Autor:** arquiteto-aws (orquestração Antigravity)
- **Requisitos:** RF-025, RNF-001 a RNF-007; D-006, D-013, D-021, D-022, D-024, D-029, D-031, D-034, D-044

## Contexto
A D03 compartilha a conta AWS única do laboratório (D-029) com a plataforma `00-plataforma-agentes` e os projetos D01 e D02, sob o limite mensal global de US$ 20 (D-022) e ciclo de demonstração de 1 dia com destroy automático sem aprovação no ambiente `aws-lab-destroy` (D-021, D-024). Além disso, o emulador local Floci (`floci/floci:2.5.0`, D-013) emula Lambda, DynamoDB, KMS, SSM e CloudWatch, mas não emula a invocação MCP através do AgentCore Gateway, a avaliação de políticas Cedar no AgentCore Policy Engine nem o Bedrock Guardrails (ADR-0009 da plataforma).

## Decisão
1. **Chave KMS do cliente e isolamento em conta única (`RNF-001`, `RNF-003`, `D-029`, `D-031`):**
   - O stack `03-mcp-regras-cdb-lab` cria uma chave KMS gerenciada pelo cliente (`03-mcp-regras-cdb-kms`, com `enable_key_rotation = true` e `deletion_window_in_days = 7`) que cifra as duas tabelas DynamoDB (`regras` e `aplicacoes`), os grupos de log do CloudWatch (retenção de 7 dias) e as variáveis de ambiente das duas Lambdas (`servidor` e `agente`).
   - Todo recurso recebe as tags `project = "03-mcp-regras-cdb"`, `module` em kebab (`nucleo`, `dados`, `servidor-mcp`, `agente`, `observabilidade`, `registro-produto`) e `managed-by = "terraform"`.
   - Todo nome começa por `03-mcp-regras-cdb-`, exceto onde a API da AWS impõe restrição documentada no módulo `registro-produto` da plataforma (ADR-0012 da plataforma: políticas Cedar `p03_mcp_regras_cdb_*` que exigem letra inicial e underscore, e caminho hierárquico do parâmetro SSM `/00-plataforma-agentes/contrato/v1/produtos/03-mcp-regras-cdb`).
2. **Observabilidade e alarmes (`RF-025`):**
   - Os 4 alarmes do servidor MCP (`erro-interno >= 1`, `dados-indisponiveis >= 3`, `erro-protocolo >= 5`, `erro-execucao-lambda >= 1`, todos com período de 300 s, 1 período de avaliação, estatística `Sum` e `treat_missing_data = "notBreaching"`) e o alarme de intervenção do guardrail criado pelo módulo `registro-produto` publicam no `topico_alarmes_arn` lido do contrato `comum` da plataforma (sem criar tópico SNS duplicado na D03, `RNF-001`).
   - Orçamento diário `aws_budgets_budget` (`03-mcp-regras-cdb-budget-diario`) com `time_unit = "DAILY"`, `limit_amount = var.teto_diario_usd` e filtro `TagKeyValue = user:project$03-mcp-regras-cdb`.
3. **Ordem de apply e destroy entre produto e plataforma (`RNF-002`, ADR-0007 da plataforma):**
   - No dia da demonstração: (1) apply da `00-plataforma-agentes` (`prazo_horas = 24`); (2) apply da `03-mcp-regras-cdb` com `prazo_horas <= prazo_restante_plataforma - 1` (padrão `8` horas, máximo `23` horas), carregando as regras e aplicações sintéticas no DynamoDB e registrando o alvo `mcp_server` e as políticas Cedar no gateway; (3) execução do roteiro de demonstração (`RF-023`) e coleta de evidências; (4) destroy da `03-mcp-regras-cdb` (que remove as políticas Cedar e o alvo do gateway antes de destruir a Lambda e as tabelas); (5) destroy da `00-plataforma-agentes`.
4. **Estratégia de integração no Floci e separação de lacunas (`RNF-004`):**
   - No Floci (`FL`), assim como na plataforma (ADR-0009 da plataforma), um root/modo de integração local aplica as tabelas DynamoDB, a chave KMS, os logs/alarmes, o parâmetro SSM de contrato simulado e as duas Lambdas (`servidor` e `agente` em modo de respostas gravadas), exercitando chamadas HTTP reais `2026-07-28` e `2025-11-25` contra o servidor MCP apoiado no DynamoDB do Floci e medindo o p95 ≤ 500 ms (`RNF-007`).
   - Os recursos que o Floci não executa no plano de dados (invocação MCP via AgentCore Gateway, avaliação Cedar no Policy Engine, Bedrock Guardrails e perfil de inferência) são provados no CI por `terraform test` com mock provider (`TT`), testes de contrato HTTP (`CT`) e testes com respostas gravadas (`RG`), e validados ponta a ponta na AWS real durante a demonstração (`DM`).

## Alternativas rejeitadas
- **Reutilizar a chave KMS da plataforma nas tabelas e logs da D03:** acoplaria a política da chave da plataforma às roles internas da D03 e exigiria alterar o state da plataforma a cada recurso novo do produto; ter 1 chave KMS por stack de produto custa apenas `US$ 0,033/dia` (US$ 1/mês rateado por hora e US$ 0 em `PendingDeletion` após o destroy) e mantém o isolamento do state.
- **Criar tópico SNS próprio na D03:** rejeitado pela própria `spec.md` (`RNF-001` e `RF-025`), que determina reutilizar o tópico de alarmes publicado no contrato `comum` da plataforma.

## Trade-offs
- **Ganho:** custo diário estimado do stack da D03 em **US$ 0,39** (teto proposto **US$ 0,50/dia**, apenas 2,5% do limite mensal de US$ 20 da conta), zero sobra cobrada após o destroy e separação limpa entre falha real e lacuna do Floci.
- **Perda:** o caminho completo passando pelo AgentCore Gateway e pelo Policy Engine só roda na demonstração real (`DM`), enquanto no CI cada metade do contrato é provada por `TT` + `CT` + `RG`.

## Custo
Estimativa de 24 h da D03: **US$ 0,39**; teto proposto: **US$ 0,50/dia** (`D03-P7`, sujeito à aprovação do dono).

## Risco
- **R5 da spec:** diferença entre o comportamento simulado no `RG`/`FL` e o plano de dados real do AgentCore Gateway. Mitigado pelos passos `DM-01` a `DM-06` do roteiro de demonstração e pela verificação estática do contrato `v1.1.0`.

## Tarefas da prova exercitadas
- **3.6 e 4.5:** governança na esteira CI/CD, controle de custo por tag/perfil de inferência e observabilidade operacional.
- **5.6:** separação explícita e documentada entre cobertura emulada e verificação em nuvem real.

## Curso Skilljar relacionado
*Claude with Amazon Bedrock* e *Claude Code in Action*.

## O que um arquiteto sênior faria em produção
Automatizaria testes sintéticos contínuos (Canary) contra o endpoint do gateway em ambiente de staging e manteria alertas de anomalia de custo no AWS Cost Anomaly Detection por tag de produto.
