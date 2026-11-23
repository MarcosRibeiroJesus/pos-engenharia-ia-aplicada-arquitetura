---
title: "A mesma recomendação híbrida no Google Cloud: o que muda e por quê"
tema: "Sistemas de recomendação"
data: 2026-11-19
status: rascunho para revisão (design doc; não implementado)
---

# A mesma recomendação híbrida no Google Cloud: o que muda e por quê

Este é o design comparativo da arquitetura do [post AWS](aws.md): mesmo fluxo (lote diário + busca vetorial em tempo real + re-ranking + explicação com Claude), mesmas regras (privado por padrão, criptografia com chave do cliente, menor privilégio, custo fixo explícito, degradação sem 500). Não foi implementado: validar exigiria uma conta GCP com faturamento, e o objetivo aqui é o mapeamento e os trade-offs. Disponibilidade de produtos, modelos e preços muda rápido; confira na documentação do Google Cloud antes de implementar.

## Mapeamento serviço a serviço

| Papel | AWS (implementado) | Google Cloud (proposto) | O que muda |
|---|---|---|---|
| Golden dataset | S3 + KMS, versionado | Cloud Storage + Cloud KMS (CMEK), versionamento de objetos | Equivalente direto |
| Governança do lake | Lake Formation + Glue Data Catalog | Dataplex + BigLake | O controle de acesso por tabela fica no BigQuery/BigLake, não em grants separados do bucket |
| Consulta ao lake | Athena | BigQuery sobre tabelas BigLake | O teto de custo vira `maximum_bytes_billed` por consulta, no lugar do limite do workgroup |
| Feature engineering (Spark) | Glue 4.0 | Dataproc Serverless (Spark) | Mesmo PySpark; não há job bookmark: a incrementalidade vai para partições e marcas d'água no próprio job |
| Treino | SageMaker com Spot | Vertex AI custom training com Spot VMs | Equivalente; checkpoint no Cloud Storage |
| Re-ranker sem custo ocioso | SageMaker Serverless Inference | Cloud Run com o modelo no container | O endpoint do Vertex AI mantém réplica mínima; para escalar a zero, o modelo pequeno vai para o Cloud Run |
| Recomendações por usuário | DynamoDB on-demand, TTL | Firestore (modo nativo), TTL policy | Leitura por chave com latência baixa e cobrança por operação; Bigtable só se o volume justificar nós fixos |
| Busca vetorial | MemoryDB (TLS) | Memorystore com busca vetorial, ou Vertex AI Vector Search | Memorystore mantém o mesmo cliente Redis do serviço; Vector Search é gerenciado, mas tem custo fixo de nós e outra API |
| Serviço | ECS Fargate (Spot) atrás de ALB interno | Cloud Run com ingress interno e Load Balancer interno | Cloud Run escala a zero: some o custo fixo da task e, em boa parte, o do balanceador |
| Saída privada sem NAT | Endpoints de interface + gateway | Direct VPC egress + Private Google Access / Private Service Connect | APIs do Google ficam acessíveis sem NAT e sem cobrança por endpoint, o que elimina a maior linha de custo fixo do lab AWS |
| Orquestração | MWAA (desligado por padrão) | Cloud Composer (desligado por padrão) | Mesmo DAG do Airflow; Composer também tem custo fixo alto, então segue o mesmo opt-in |
| Explicação com Claude | Bedrock (`anthropic.claude-haiku-5-5`) | Claude no Vertex AI (Model Garden), cliente `AnthropicVertex` | Só o adaptador muda (ver abaixo); confirme no Model Garden se o Haiku 5.5 está disponível na região |
| Observabilidade | CloudWatch, alarmes, SNS | Cloud Monitoring, Cloud Logging, canais de notificação | Equivalente; métricas customizadas pelo OpenTelemetry |
| Orçamento | AWS Budgets, US$ 10/mês | Cloud Billing budgets, alertas em 80% e 100% | Equivalente |
| CI sem chave estática | OIDC do GitHub + roles IAM | Workload Identity Federation para o GitHub | Equivalente |
| State do Terraform | S3 com `use_lockfile` | backend `gcs` (lock nativo) | Mais simples: o lock já vem no backend |

## O componente com Claude não muda

O serviço fala com o Claude por uma porta (`ClaudeMessagesPort`): o explainer monta a requisição (tool `record_explanations` com schema estrito, `tool_choice` forçado, thinking desligado), valida a resposta, devolve o erro como `tool_result` com `is_error` e cai no fallback sem explicação. No Google Cloud, a única troca é o adaptador: no lugar de `AnthropicBedrock`, o `AnthropicVertex` do SDK da Anthropic, com `projectId` e `region`, e o id do modelo sem o prefixo `anthropic.`. Prompt, validação, retentativa, disjuntor e métricas ficam iguais. É o tipo de decisão que vale a pena tomar cedo: o LLM é uma dependência como outra qualquer, atrás de uma interface.

## Onde não há equivalente direto

- **Lake Formation ↔ Dataplex/BigLake**: o modelo de permissão é diferente. Na AWS, os grants ficam no Lake Formation e o consumidor lê o S3 por credenciais temporárias; no Google Cloud, o acesso fino fica no BigQuery/BigLake e o bucket é fechado. O efeito (consumidor não lê o bucket direto) é o mesmo; a operação, não.
- **Serverless Inference ↔ Cloud Run**: o SageMaker Serverless gerencia o container de inferência; no Cloud Run você empacota o servidor do modelo. Mais controle, mais código para manter.
- **Glue job bookmarks**: sem equivalente no Dataproc Serverless. O job precisa ler por partição de data.

## Custo de lab, em ordem de grandeza

A maior diferença está no custo fixo. No lab AWS, os endpoints de interface, o ALB e a task Fargate respondem por boa parte dos cerca de US$ 0,16 por hora com o stack de pé. No desenho GCP, Cloud Run escala a zero e o acesso privado às APIs do Google não cobra por endpoint, então o custo fixo fica concentrado no Memorystore (e no Composer, se ligado). A conta exata depende de região e tamanho; faça a estimativa na calculadora de preços do Google Cloud antes de implementar.

## Se eu fosse implementar

Terraform com o provider `google`, os mesmos testes de regra em `terraform test` com mock provider, e o mesmo serviço TypeScript com o adaptador do Vertex. A validação de integração seria em um projeto sandbox com orçamento de US$ 10 e destroy obrigatório, porque não há emulador local que cubra Cloud Run, Firestore e Memorystore juntos com fidelidade.
