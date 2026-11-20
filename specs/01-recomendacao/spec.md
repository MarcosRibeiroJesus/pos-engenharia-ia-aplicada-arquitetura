# Spec: Recomendação de e-commerce (plataforma híbrida de recomendação com explicação)

- **Projeto:** `01-recomendacao` · **Disciplina:** 01 (fundamentos de IA e LLMs) · **Tipo:** arquitetura
- **Status:** esclarecida (2026-11-20). As perguntas P01-P1 a P01-P4 foram respondidas (D-051 a D-054) e o plano foi aprovado (D-056); o projeto está na fase analisar.
- **Artigos da constituição que se aplicam:** I, II, III, IV, V, VI, VII, VIII
- **Spec retroativa.** O código foi escrito antes do harness. As histórias, os RF de 001 a 017 e os RNF de 001 a 008 descrevem o que o código faz **hoje**, cada um com o arquivo que o comprova. O que o código não faz e a constituição exige está em "Requisitos de conformidade", com a marca **lacuna (retroativo)**. Quando o código faz o que a constituição proíbe, a marca é **[DIVERGÊNCIA]**. Esta spec não muda código: cada lacuna vira tarefa na fase `tarefas`.

Caminho base do código, abreviado como `U/` nesta spec: `modulos/01-fundamentos-ia-llms/unidades/03-recomendacao/`.

## Problema e objetivo
Uma loja virtual fictícia, com dados sintéticos, precisa recomendar produtos com duas velocidades: o histórico de compras, que muda devagar e cabe num lote diário, e o que o cliente vê agora, que muda a cada clique. Ela também quer responder "por que estou vendo isto?" sem que o texto invente o motivo.

A arquitetura é inspirada no post do AWS Big Data Blog em que o time Everyday Essentials da Amazon descreve a sua recomendação em lote (Lake Formation, Glue, Athena, MWAA, SageMaker, DynamoDB e ECS) e a extensão em tempo real com busca vetorial no MemoryDB (fonte e data na seção "Proveniência"). O projeto não reproduz esse sistema: é um lab de escala mínima, e tudo o que vai além do post está nos ADRs de `U/adr/`.

**O que existe hoje** (PR #1, ainda fora do `main`):
- um serviço HTTP que junta candidatos do lote e da busca vetorial, aplica regras de negócio, pede o score a um re-ranker no SageMaker e devolve o top-N, com fallback para cada dependência;
- uma explicação opcional por item, gerada pelo Claude no Bedrock, com saída estruturada validada;
- o lote (Athena, Glue, SageMaker e DAG do Airflow) com geradores sintéticos;
- 13 módulos Terraform, testes de regra, integração no Floci, 6 ADRs, posts AWS e GCP e a página do projeto no site, marcada "Em revisão".

**O que muda com esta spec:** o projeto passa a seguir a constituição e as decisões em vigor:
- tag e prefixo `01-recomendacao`;
- teto de um dia;
- ciclo de demonstração com destroy automático;
- consumo da plataforma de agentes;
- workflows dos modelos do harness.

**Deu certo quando** (verificado na fase verificar):
1. **Harness verde:** o `estado.py validar` aprova o projeto na fase `verificar`, e os testes do harness passam sem as duas falhas de hoje (RNF-106).
2. **Demonstração de um dia:** o roteiro de demonstração (RF-108) roda no stack real, dentro do teto (`teto_diario_usd`, calculado no plano), e o destroy termina com zero recurso com a tag `project=01-recomendacao`. A única exceção é a chave KMS com exclusão agendada (`PendingDeletion`), que não gera custo.
3. **Cobertura:** todo RF e RNF desta spec tem teste na matriz regra → teste do plano.

## Histórias de usuário
- **H1.** Como cliente da loja, quero recomendações que misturem o que já comprei com o que vejo agora, para encontrar produtos relevantes.
  - **Dado** um usuário com candidatos no lote e na busca vetorial, **quando** chamo `GET /v1/recommendations?userId=u-12345&limit=10`, **então** recebo 200 com até 10 itens, cada um com `provenance` em `batch`, `realtime` ou `hybrid`, e `degradedMode: false`. Prova: `U/tests/integration/hybrid-recommendation.test.ts`.
- **H2.** Como cliente, não quero ver produto fora de estoque nem produto que comprei nos últimos 30 dias.
  - **Dado** um candidato com `inStock: false` ou comprado há menos de 30 dias, **quando** peço recomendações, **então** ele não aparece. Prova: `U/tests/integration/business-filter-enforcement.test.ts`, com o repositório de estoque em memória. No serviço montado para produção, a regra dos 30 dias nunca dispara (RF-004, lacuna RF-104).
- **H3.** Como dono da loja, quero que a página nunca quebre por falha de uma dependência, para não perder venda.
  - **Dado** o SageMaker, o MemoryDB, o DynamoDB ou todos fora do ar, **quando** peço recomendações, **então** recebo 200, com o fallback do RF-006 e `degradedMode: true`. Prova: os quatro `U/tests/integration/fallback-*.test.ts`.
- **H4.** Como cliente, quero saber em uma frase por que cada produto foi recomendado, sem promessa de preço nem motivo inventado.
  - **Dado** `explain=true`, **quando** o Claude responde dentro das regras, **então** cada item traz `explanation.reason` com 20 a 160 caracteres, `signals` sustentados pelos dados do item e `source: "claude"`.
  - **Dado** qualquer falha do Claude, **então** as mesmas recomendações voltam sem explicação, com `explanation.status: "unavailable"` e o motivo.
  - Prova: `U/tests/unit/recommendation-explainer.test.ts` e `U/tests/integration/explanation-in-recommendations.test.ts`.
- **H5.** Como dono do repositório, quero subir a arquitetura, gravar a demonstração e destruir tudo no mesmo dia, com teto de custo, para não ter conta esquecida ligada.
  - **Dado** o apply disparado com `prazo_horas`, **quando** o prazo vence, **então** o destroy roda sozinho no ambiente `aws-lab-destroy` e termina sem sobras. Hoje isso não existe (lacunas RNF-101 a RNF-103).

## Requisitos funcionais (comportamento atual)
Na verificação: **VT** = Vitest do serviço; **PY** = unittest do lote; **TT** = `terraform test` com mock provider; **ST** = `U/infra/terraform/tests/static_rules.py`; **FL** = integração no Floci; **DM** = evidência da demonstração real.

- **RF-001: API de recomendações.** O serviço DEVE expor `GET /v1/recommendations` com estes parâmetros:
  - `userId` obrigatório, no padrão `^[a-zA-Z0-9_-]+$`;
  - `limit` inteiro de 1 a 50, padrão 10;
  - `category` e `sessionItemIds` (lista separada por vírgula) opcionais;
  - `explain` igual a `true` ou `false`.

  Parâmetro inválido devolve 400 com `error`, `message` e `requestId`. O `requestId` vem do cabeçalho `x-request-id` ou é gerado como `req-<uuid>`.
  - **Aceite:** limite fora de 1 a 50, `userId` fora do padrão e `explain=talvez` dão 400; uma chamada válida dá 200 no formato do contrato OpenAPI. (VT `U/tests/contract/recommendations-api.contract.test.ts`)
  - **Código:** `U/src/serving/src/presentation/controllers/recommendation.controller.ts`, `U/src/serving/src/presentation/server.ts`, contrato em `U/specs/001-aws-recommendation-platform/contracts/recommendations-api.yaml`.
- **RF-002: candidatos em paralelo.** O caso de uso DEVE buscar ao mesmo tempo:
  - os candidatos do lote no DynamoDB: um item por usuário, até 50 recomendações, timeout de 20 ms;
  - os candidatos da busca vetorial no MemoryDB: KNN no índice `item_idx`, k até 50, filtro opcional por categoria, timeout de 15 ms.

  Cada repositório tem disjuntor: abre com 20% de erro depois de 5 chamadas e fica 10 s aberto.
  - **Aceite:** com os dois repositórios simulados, as duas chamadas começam antes de qualquer uma terminar. (VT `U/tests/integration/hybrid-recommendation.test.ts`)
  - **Código:** `U/src/serving/src/application/get-recommendations.use-case.ts`, `U/src/serving/src/infrastructure/dynamodb/dynamodb-batch-candidate.repository.ts`, `U/src/serving/src/infrastructure/memorydb/memorydb-vector-candidate.repository.ts`, `U/src/serving/src/infrastructure/resilience/circuit-breaker.ts`.
  - **Comportamento atual a registrar:**
    - o vetor de consulta é sempre um vetor de 128 zeros (`new Float32Array(128)`): os `sessionItemIds` não entram na busca vetorial (lacuna RF-105);
    - a `category` entra sem escape na consulta do RediSearch (lacuna RNF-104).
- **RF-003: junção com proveniência.** O sistema DEVE deduplicar os candidatos por `itemId` e marcar a proveniência:
  - `batch`: só do lote;
  - `realtime`: só da busca vetorial;
  - `hybrid`: das duas fontes, com os dois scores.
  - **Aceite:** um item presente nas duas listas sai uma vez, como `hybrid`. (VT `U/tests/unit/candidate-merger.test.ts`)
  - **Código:** `U/src/serving/src/application/candidate-merger.ts`, `U/src/serving/src/domain/candidate.ts`.
- **RF-004: filtros de negócio.** O motor de filtros DEVE excluir 100% dos candidatos inelegíveis pelas regras ligadas:
  - por padrão, `OutOfStockFilterRule` (exclui `inStock === false`) e `RecentPurchaseSuppressionRule` (exclui compra há 30 dias ou menos);
  - `CategorySuppressionRule` e `GeoRestrictionRule` existem no domínio, mas não são ligadas por padrão.
  - **Aceite:** nenhum item fora de estoque nem comprado nos últimos 30 dias chega à resposta quando o repositório de estoque e compras é injetado. (VT `U/tests/unit/business-filter-engine.test.ts`, `U/tests/integration/business-filter-enforcement.test.ts`)
  - **Código:** `U/src/serving/src/application/business-filter-engine.ts`, `U/src/serving/src/domain/filter-rule.ts`, `U/src/serving/src/infrastructure/cache/inventory-eligibility.repository.ts`, `U/src/serving/src/infrastructure/cache/lru-cache.provider.ts`.
  - **Comportamento atual a registrar:** o `buildDefaultUseCase` de `server.ts`, que monta o serviço do contêiner, não injeta repositório de estoque nem de compras. Em produção, o estoque vem só do campo `inStock` do candidato, e a regra dos 30 dias nunca dispara (lacuna RF-104).
- **RF-005: re-ranking com degradação.** O sistema DEVE pedir o score ao endpoint do SageMaker, com no máximo 100 candidatos por chamada, timeout de 35 ms e disjuntor (20% de erro, 10 s). Se o SageMaker falhar ou estourar o tempo, o sistema DEVE:
  - reordenar pela heurística `0,6 × batchScore + 0,4 × vectorScore`;
  - marcar `degradedMode: true`;
  - publicar as métricas `SageMakerFallbackCount` e `DegradedModeCount`.
  - **Aceite:** com o SageMaker lançando erro, a resposta é 200, ordenada pela heurística, com `degradedMode: true`. (VT `U/tests/integration/fallback-sagemaker-degradation.test.ts`)
  - **Código:** `U/src/serving/src/application/reranker.ts`, `U/src/serving/src/application/heuristic-reranker.ts`, `U/src/serving/src/infrastructure/sagemaker/sagemaker-scoring.client.ts`; contrato em `U/specs/001-aws-recommendation-platform/contracts/sagemaker-inference-contract.json`.
- **RF-006: matriz de degradação sem 500.** Falha de dependência DEVE resultar em 200, nunca em 500:

  | situação | candidatos | ordenação | `provenance` | `degradedMode` |
  |---|---|---|---|---|
  | tudo saudável | lote e vetorial | SageMaker | `hybrid`, `batch` ou `realtime` | `false` |
  | SageMaker falha | lote e vetorial | heurística | a do candidato | `true` |
  | MemoryDB falha | só lote | SageMaker | `batch` | `true` |
  | DynamoDB falha | só vetorial | SageMaker | `realtime` | `true` |
  | sem candidato elegível | catálogo curado de 8 itens | ordem fixa | `fallback` | `true` |

  - **Aceite:** os quatro testes de fallback passam. (VT `U/tests/integration/fallback-*.test.ts`)
  - **Código:** `U/src/serving/src/application/get-recommendations.use-case.ts`, `U/src/serving/src/infrastructure/fallback/curated-fallback.provider.ts`.
  - **Comportamento atual a registrar:** nos testes, os repositórios simulados rejeitam a promessa. Os adaptadores reais do DynamoDB e do MemoryDB capturam o erro e devolvem lista vazia. Assim, com um deles fora do ar, o serviço real não liga `degradedMode` nem publica `DynamoDbFallbackCount` ou `MemoryDbFallbackCount`; só o pool vazio liga o modo degradado (lacuna RF-106). Uma exceção fora das dependências, como a do repositório de estoque quando ele for ligado, ainda vira 500 no controlador.
- **RF-007: explicação com Claude.** Com `explain=true` e `EXPLANATIONS_ENABLED=true`, o sistema DEVE pedir ao Claude no Bedrock uma frase por item do top-N, numa única chamada por requisição, e só devolver o texto que passar na validação. O comportamento de hoje (ADR-0004):
  - **cliente:** `AnthropicBedrock`, no caminho InvokeModel (`bedrock-runtime`), assinado pela task role, com `maxRetries: 0`, atrás da porta `ClaudeMessagesPort`;
  - **modelo:** `anthropic.claude-haiku-5-5`, configurável por `bedrock_model_id`;
  - **saída estruturada:** uma única tool, `record_explanations`, com `strict: true` e `additionalProperties: false`; `tool_choice` forçado nela; `thinking` desligado; `max_tokens` 1024;
  - **prompt:** critérios explícitos (uma explicação por item, na ordem, 20 a 160 caracteres, só os sinais permitidos, sem preço, desconto, frete, estoque ou números) e um exemplo;
  - **sinais com lastro**, calculados pelo código:
    - `purchase_history` exige `batchScore`;
    - `similar_items` exige `vectorScore`;
    - `session_context` exige `vectorScore` e itens de sessão;
    - `popular` só vale para o catálogo curado;
    - `category_affinity` exige categoria;
  - **validação:** zod e regras semânticas: ids exatos, sem repetição, tamanho, sinais sustentados e sem promessa comercial. Resposta cortada por `max_tokens` é inválida;
  - **retentativa:** no máximo 2 tentativas no total. A resposta inválida fica no histórico, e a próxima mensagem é um `tool_result` com `is_error: true` listando cada problema;
  - **orçamento de tempo:** 2,5 s para todas as tentativas (`EXPLANATION_TIMEOUT_MS`). O timeout encerra na hora;
  - **erros por categoria, cada um com indicação de retentável:** `validation`, `timeout`, `throttled`, `model_error`, `refusal`, `circuit_open` e `internal_error`.
    - Retentáveis: 429, 408, 409, 5xx e erro de conexão.
    - Não retentáveis: 400, 401, 403, 404, 422 e `refusal`;
  - **disjuntor:** 5 falhas seguidas de disponibilidade abrem o circuito por 30 s. Validação e recusa não contam;
  - **fallback:** qualquer falha, inclusive exceção inesperada, devolve as mesmas recomendações sem `explanation` nos itens e com `explanation: {status: "unavailable", reason, attempts}` no topo, sem ligar `degradedMode`;
  - **métricas:** `ExplanationRetryCount` e `ExplanationFallbackCount`, esta com alarme.
  - **Aceite:** os testes do explicador e os cinco casos da integração passam com respostas sintéticas, sem chamada ao Claude real (D-006). (VT)
  - **Código:** `U/src/serving/src/application/recommendation-explainer.ts`, `U/src/serving/src/infrastructure/bedrock/bedrock-claude.client.ts`, `U/src/serving/src/domain/explanation.ts`, `U/src/serving/src/config/env.ts`.
- **RF-008: saúde do serviço.** `GET /health` DEVE devolver `UP`, `DEGRADED` ou `DOWN` a partir de verificadores do DynamoDB, do MemoryDB e do SageMaker. Hoje o servidor de produção não injeta verificadores, e o status é sempre `UP`: o health check do ALB e do contêiner só prova que o processo responde.
  - **Aceite:** com verificadores simulados, todos `UNREACHABLE` dá `DOWN` e um só dá `DEGRADED`. (VT, pelo controlador)
  - **Código:** `U/src/serving/src/presentation/controllers/health.controller.ts`, `U/src/serving/Dockerfile` (`HEALTHCHECK`).
- **RF-009: logs estruturados e métricas.** O serviço DEVE:
  - registrar em JSON (pino) cada requisição, com `requestId`, status e duração, e cada etapa, com a duração (`StageTimer`);
  - publicar no namespace `Ecommerce/Recommendations` as contagens `DegradedModeCount`, `SageMakerFallbackCount`, `MemoryDbFallbackCount`, `DynamoDbFallbackCount`, `ExplanationRetryCount` e `ExplanationFallbackCount`.
  - **Aceite:** coberto indiretamente pelos testes de fallback. Teste próprio de métrica entra como lacuna na RNF-105.
  - **Código:** `U/src/serving/src/infrastructure/logging/logger.ts`, `U/src/serving/src/infrastructure/monitoring/cloudwatch-metrics.ts`.
- **RF-010: pipeline diário do lote.** O DAG `daily_hybrid_recommendation_pipeline` DEVE rodar `@daily`, sem `catchup` e com 1 retentativa, na ordem:
  1. sensor das interações do dia;
  2. consulta de features no Athena;
  3. job de features no Glue;
  4. treino no SageMaker com Spot gerenciado, `MaxWaitTimeInSeconds` 7200 e checkpoint;
  5. em paralelo, os jobs do Glue que publicam no DynamoDB e no MemoryDB.
  - **Aceite:** o DAG carrega, tem as tarefas e a ordem acima. (PY `U/tests/unit/test_airflow_dag_validation.py`)
  - **Código:** `U/src/batch/airflow/dags/daily_hybrid_recommendation_pipeline.py`, `U/infra/terraform/modules/mwaa_orchestration/`.
  - **Comportamento atual a registrar:**
    - o Terraform cria só o job de features do Glue: os dois jobs de publicação que o DAG chama não existem no stack;
    - os scripts usam nomes fixos (`s3://ecommerce-golden/`, `ecommerce-recommendations-poc-user_recommendations`) que não batem com os nomes do Terraform;
    - os dados são gerados: vetores determinísticos ou aleatórios e usuários de amostra (lacuna RF-107 e pergunta P01-P1, escopo do lote).
- **RF-011: publicação no DynamoDB.** O lote DEVE gravar um item por usuário, com `userId`, `generatedAt`, `ttlTimestamp` (agora + 604.800 s, 7 dias) e `recommendations` (hoje 20 itens sintéticos por usuário). A tabela é `PAY_PER_REQUEST`, com TTL em `ttlTimestamp`.
  - **Aceite:** o item publicado passa no contrato. (PY `U/tests/contract/test_dynamodb_publish_contract.py`; TT `dynamodb_criptografado`)
  - **Código:** `U/src/batch/glue/publish_dynamodb.py`, `U/infra/terraform/modules/dynamodb_table/`; contrato em `U/specs/001-aws-recommendation-platform/contracts/dynamodb-batch-recs-contract.json`.
- **RF-012: publicação dos vetores no MemoryDB.** O lote DEVE criar, se não existir, o índice `item_idx` (HASH, campo `v` do tipo VECTOR HNSW, 128 dimensões, FLOAT32, distância COSINE) e gravar um vetor de 512 bytes por item, com a categoria. Hoje são 50 vetores sintéticos.
  - **Aceite:** o comando de criação e o tamanho do vetor passam no contrato. (PY `U/tests/contract/test_memorydb_vector_contract.py`)
  - **Código:** `U/src/batch/glue/publish_memorydb_vectors.py`; contrato em `U/specs/001-aws-recommendation-platform/contracts/memorydb-vector-contract.md`.
- **RF-013: features no Athena e no Glue.** O lote DEVE:
  - extrair as features do dia anterior com poda de partição (ano, mês e dia) e peso por evento (compra 5, carrinho 3, clique 2, visualização 1, outro 0,5);
  - processar no Glue 4.0, com 2 workers `G.1X`, job bookmarks e Parquet Snappy.
  - **Aceite:** a transformação local reproduz os pesos e o particionamento. (PY `U/tests/integration/test_glue_transformations.py`; TT `athena_resultados_kms`, `glue_criptografado_e_com_logs`)
  - **Código:** `U/src/batch/athena/extract_curated_features.sql`, `U/src/batch/glue/feature_engineering.py`, `U/infra/terraform/modules/athena_queries/`, `U/infra/terraform/modules/glue_pipeline/`, `U/infra/terraform/modules/lake_formation/`.
- **RF-014: treino.** O script de treino DEVE gravar um artefato de embeddings de 128 dimensões por item no diretório do modelo. Hoje os vetores são aleatórios e normalizados, sem aprendizado. O endpoint do re-ranker usa a imagem oficial do XGBoost 1.7-1, com `model_data_url` nulo por padrão: não há artefato de modelo de re-ranking no stack (pergunta P01-P1 e risco RF-109).
  - **Código:** `U/src/batch/sagemaker/train_model.py`, `U/infra/terraform/modules/sagemaker_training/`, `U/infra/terraform/modules/sagemaker_endpoint/`.
- **RF-015: integração no Floci.** O harness `testing/scripts/integracao_01_03_recomendacao.py` DEVE rodar contra o Floci:
  - bootstrap do state, `init` com backend S3 e `use_lockfile`, `plan`, `apply`;
  - asserts por regra e o componente Claude contra o `bedrock-runtime` do emulador;
  - `destroy` e verificação de sobras;
  - relatório HTML em `testing/reports/`.

  Último relatório versionado: 27 ok, 0 falha e 7 lacunas do emulador, com evidência no ADR-0006.
  - **Código:** `testing/scripts/integracao_01_03_recomendacao.py`, `testing/reports/latest.html`, `site/relatorios/01-03-recomendacao.html`, `U/adr/0006-integracao-no-floci-e-lacunas.md`.
- **RF-016: execução local.** O repositório DEVE permitir testar o serviço sem nuvem (`npm ci && npm test`) e semear DynamoDB Local e Redis Stack (`npm run seed:local`).
  - **Código:** `U/package.json`, `U/package-lock.json`, `U/vitest.config.ts`, `U/tsconfig.json`, `U/src/serving/package.json`, `U/src/serving/tsconfig.json`, `U/scripts/seed-local.ts`, `U/.eslintrc.json`, `U/.prettierrc` e os arquivos de ignore.
- **RF-017: documentação e publicação.** O projeto DEVE ter:
  - README com arquitetura, custo, 5 passos e testes;
  - ADRs de 0001 a 0006;
  - post da arquitetura AWS e post comparativo em GCP (D-007), ambos "rascunho para revisão";
  - página no site com status "Em revisão".

  A publicação depende do dono: respondido pelo dono (D-054): publicar a página do projeto e o post AWS, com o relatório de teste; o post GCP não é publicado (o design doc da GCP continua no repositório).
  - **Código:** `U/README.md`, `U/adr/`, `U/posts/aws.md`, `U/posts/gcp.md`, `U/docs/matriz-cobertura.md`, `site/projetos/01-03-recomendacao.html`, `site/posts/modulo-01-recomendacao.html`, `site/index.html`, `docs/curso/PROGRESSO.md`.

## Requisitos não funcionais (comportamento atual)
- **RNF-001** (segurança, Art. IV). O que o stack já garante:
  - **nada público por padrão:**
    - ALB interno;
    - API pública só com `expose_api_publicly = true` e `certificate_arn`, em HTTPS com TLS 1.3;
    - internet gateway e subnets públicas só com esse opt-in;
    - buckets com bloqueio de acesso público;
    - tasks sem IP público;
    - MWAA com a UI `PRIVATE_ONLY`;
  - **criptografia:**
    - uma chave KMS do cliente, com rotação e janela de exclusão de 7 dias, para S3, DynamoDB, MemoryDB, Logs, SNS, ECR, Glue, Athena e MWAA;
    - TLS no MemoryDB;
    - buckets negam requisições sem `aws:SecureTransport`;
  - **menor privilégio:**
    - task role com leitura só da tabela, invocação só do endpoint e do modelo configurado, e `kms:Decrypt` só via DynamoDB;
    - `PutMetricData` com `Resource "*"` só com condição de namespace;
    - sem `AmazonSageMakerFullAccess` e sem `AWSGlueServiceRole`;
    - permissões explícitas no Lake Formation;
  - **saída de rede:** sem NAT. Só endpoints de interface (ECR, Logs, CloudWatch, SageMaker Runtime e Bedrock Runtime) e de gateway (S3 e DynamoDB). Nada sai para `0.0.0.0/0`.
  - **Aceite:** checkov sem falha, com 18 exceções justificadas no próprio recurso (ADR-0003); TT `rede_privada_por_padrao`, `rede_api_publica_exige_opt_in`, `ecs_menor_privilegio_e_privado`, `ecs_api_publica_exige_tls`, `ecs_api_publica_com_https`, `memorydb_tls`, `kms_chave_da_plataforma`, `s3_golden_dataset`, `sagemaker_sem_full_access`, `mwaa_ligado_privado`, `lake_formation_concede_a_role_do_glue`, `ecs_bedrock_via_perfil_de_inferencia`; FL.
  - **Código:** `U/infra/terraform/modules/{kms_key,networking,s3_golden_dataset,ecs_service,memorydb_cluster,sagemaker_endpoint,glue_pipeline,mwaa_orchestration,lake_formation}/`, `U/adr/0002-*`, `U/adr/0003-*`.
  - **Riscos aceitos no ADR-0003:**
    - MemoryDB com ACL `open-access`, protegido só por SG e TLS;
    - TLS termina no ALB, e o trecho ALB → task é HTTP dentro da VPC.
- **RNF-002** (custo, Art. V). Hoje:
  - sem NAT Gateway; endpoints de interface em 1 AZ; MemoryDB `db.t4g.small` com 1 shard e 0 réplica; 1 task Fargate (base on-demand, o resto em Spot);
  - SageMaker Serverless sem concorrência provisionada;
  - MWAA desligado por padrão (`enable_mwaa = false`), como `count` dentro do stack base. A janela do MWAA em stack próprio substitui esse input (RNF-101, ADR-0007);
  - inventário do custo fixo no ADR-0002 (cerca de US$ 0,16 por hora com o padrão do lab, valor do próprio ADR, a recalcular no plano);
  - AWS Budgets **mensal** de US$ 10 no stack, com alertas em 80% (real) e 100% (previsto).
  - **Aceite:** ST (todo recurso de custo por hora citado em ADR; nenhum NAT); TT `rede_endpoints_de_interface_no_lab`, `memorydb_tls`, `mwaa_desligado_por_padrao`, `monitoramento_e_orcamento`.
  - **Código:** `U/infra/terraform/variables.tf`, `U/infra/terraform/modules/cloudwatch_monitoring/main.tf`, `U/adr/0002-saida-de-rede-e-custo-fixo.md`.
  - O que falta para o Art. V está nas RNF-101 a RNF-103.
- **RNF-003** (operação, Art. VI). Hoje:
  - **tags:** `default_tags` com `project = var.project_name` (padrão `recsys`), `module = "01-fundamentos-ia-llms/03-recomendacao"`, `managed-by = "terraform"` e `environment`;
  - **state:** remoto no S3, com lock nativo (`use_lockfile`), criado pelo stack de bootstrap (ADR-0001);
  - **logs:** flow logs da VPC; logs das tasks, do Glue e do endpoint, com KMS e retenção de 14 dias;
  - **sete alarmes com ação no SNS:**

    | alarme | métrica | estatística | limiar | períodos |
    |---|---|---|---|---|
    | latência | `TargetResponseTime` do ALB | p95 | > 0,060 s | 3 |
    | erro 5xx | `HTTPCode_Target_5XX_Count` | Sum | > 0 | 1 |
    | hosts saudáveis | `HealthyHostCount` | Minimum | < 1 | 2 |
    | tasks em execução | `RunningTaskCount` | Minimum | < 1 | 2 |
    | modo degradado | `DegradedModeCount` | Sum | > 50 | 5 |
    | fallback da explicação | `ExplanationFallbackCount` | Sum | > 20 | 5 |
    | erro do re-ranker | `Invocation5XXErrors` do SageMaker | Sum | > 5 | 3 |

  - **painel** no CloudWatch;
  - **README** com 5 passos.
  - **Aceite:** TT `raiz_tags`, `monitoramento_e_orcamento`; ST (backend); FL ("Tags project, module e managed-by", "Alarmes com ação no SNS").
  - **Código:** `U/infra/terraform/main.tf`, `U/infra/terraform/versions.tf`, `U/infra/terraform/backend.hcl.example`, `U/infra/terraform/terraform.tfvars.example`, `U/infra/terraform/outputs.tf`, `U/infra/bootstrap/`, `U/infra/terraform/modules/cloudwatch_monitoring/`.
  - O que falta para o Art. VI está nas RNF-107, RNF-108 e RF-106.
- **RNF-004** (desempenho). Sem `explain=true`, o objetivo é p95 abaixo de 60 ms no alvo do ALB. As dependências têm timeout fixo: 20 ms no DynamoDB, 15 ms no MemoryDB e 35 ms no SageMaker. A explicação fica fora desse objetivo, com orçamento próprio de 2,5 s.
  - **Aceite:** o alarme de latência p95 de 0,060 s existe (TT `monitoramento_e_orcamento`); a latência real é medida na demonstração (DM).
- **RNF-005** (testes, Art. III). Hoje:
  - 39 testes Vitest em 11 arquivos;
  - 14 unittest do lote;
  - 20 runs de `terraform test` com mock provider e 67 asserts em `U/infra/terraform/tests/regras_base.tftest.hcl`;
  - regras estáticas, tflint e checkov;
  - a matriz regra → teste em `U/docs/matriz-cobertura.md`, com R1 a R9 e as regras dos ADRs.
  - **Aceite:** em 2026-11-20, nesta sessão, `npx vitest run` deu 39 de 39, `python3 -m unittest discover -s tests` deu 14 de 14 e `static_rules.py` deu 0 falha. O `terraform test` não rodou nesta sessão, porque o Terraform roda na máquina do dono (D-042).
- **RNF-006** (CI e cadeia de suprimentos). O workflow `.github/workflows/recsys-01-03-ci.yml` roda, com filtro de caminho:
  - lint, build e testes do serviço e do lote;
  - `fmt`, `validate`, `tflint`, `checkov`, `terraform test` e as regras estáticas;
  - a integração no Floci como container de serviço, com `${{ vars.FLOCI_IMAGE || 'floci/floci:latest' }}` (D-013);
  - o plan comentado no PR, quando `AWS_PLAN_ROLE_ARN` existe;
  - um job próprio de Infracost.

  As actions são fixadas por SHA, mas em versões diferentes das do resto do repositório (RNF-106).
- **RNF-007** (proveniência e privacidade, Art. VIII). Os dados de teste e de lote são sintéticos, e o README e o post citam a fonte da AWS com data de leitura. O catálogo curado de fallback usa nomes de produtos reais de marcas conhecidas (lacuna RNF-109).
- **RNF-008** (fonte única da verdade). Hoje convivem três descrições do projeto:
  - a spec legada do Spec Kit em `U/specs/001-aws-recommendation-platform/`, com spec, plano, tarefas, pesquisa, modelo de dados, quickstart, checklists e contratos;
  - o `U/CLAUDE.md`;
  - esta spec.

  O `U/CLAUDE.md` contradiz o código e a constituição em vários pontos (lacuna RNF-110):
  - diz que a arquitetura de 11 serviços, com Lambda, é "FIXA";
  - fala em Fargate Spot com escala até zero;
  - cita `.claude/memory/` e um `tests/integration/fallback-resilience.test.ts` que não existe;
  - fala de um custo de PoC mensal.

  O README fala em 14 módulos Terraform; o stack tem 13.

## Requisitos de conformidade (lacunas, retroativo)
Cada item abaixo é **lacuna (retroativo)**: a constituição ou uma decisão em vigor exige, e o código ainda não faz. A correção vem nas tarefas, com teste vermelho primeiro (Art. III).

### Ciclo de demonstração e custo (Art. V; D-021 a D-024)
- **RNF-101: workflows de apply e destroy dos modelos do harness.** Lacuna (retroativo) e **[DIVERGÊNCIA]**: hoje o destroy roda no ambiente `aws-lab`, com aprovação. Isso impede o destroy automático sem aprovação que a D-024 exige.

  Os workflows de apply e destroy DEVEM nascer de `harness/modelos/apply.yml` e `harness/modelos/destroy.yml`, preenchidos para a chave `01-recomendacao`, com os nomes `01-recomendacao-apply.yml` e `01-recomendacao-destroy.yml`. O que entra:
  - **no apply:** input `prazo_horas` (padrão e máximo 24); registro do prazo com `harness/infra.py registrar`; conferência da tag de custo `project` com `list-cost-allocation-tags`;
  - **no destroy:** ambiente `aws-lab-destroy`, restrito ao `main` e sem aprovação; input `confirm_stack`; OIDC; verificação de sobras pela tag `project=01-recomendacao`, ignorando só a chave KMS em `PendingDeletion` e o serviço ECS que não está `ACTIVE` nem `DRAINING` (regra do ADR-0006); `harness/infra.py remover` no fim;
  - **os inputs próprios do stack base:** `enable_serverless_inference` e `explanations_enabled`, mais o state remoto da chave atual. O apply da base não tem input `enable_mwaa`, e o stack base não cria MWAA;
  - **a janela do MWAA em stack próprio** (D-052, ADR-0007): o MWAA fica ligado só numa janela curta do dia da demonstração, numa raiz Terraform separada (`U/infra/janela-mwaa/`), com state próprio, que lê as entradas da base de um parâmetro SSM, e não do state dela. A janela DEVE ter:
    - **prazo próprio:** o workflow `01-recomendacao-janela-mwaa-apply.yml`, com input `prazo_horas` de padrão 2 e máximo 3. Ele recusa o apply se a base não está no ar e registra o componente com `harness/infra.py registrar --componente janela-mwaa`. O prazo fica limitado ao menor de 3 h e do prazo da base menos 1 h;
    - **destroy próprio:** o workflow `01-recomendacao-janela-mwaa-destroy.yml`, no ambiente `aws-lab-destroy`, sem aprovação, com `confirm_stack = 01-recomendacao-janela-mwaa`. A verificação de sobras filtra por `project=01-recomendacao` e `module=orquestracao-mwaa` juntos, porque a base continua no ar;
    - **destroy em cascata:** o destroy da base roda primeiro o destroy da janela (com o state vazio, não faz nada), depois o da base, e remove os dois registros de prazo;
  - **o `harness/estado.json`:** `apply_workflow` e `destroy_workflow` passam a apontar para os arquivos novos, e os `recsys-01-03-apply.yml` e `recsys-01-03-destroy.yml` saem. O projeto ganha o componente `janela-mwaa` em `componentes`, com o stack, os dois workflows e `prazo_maximo_horas: 3`.
  - **Aceite:**
    - o `estado.py validar` aprova o projeto em `verificar`, com os workflows da base e da janela, e a regra estática da unidade e os testes do harness reconhecem os arquivos novos (CI do harness, ST);
    - nenhum workflow da D01 tem input `enable_mwaa`, e o plan do stack base não tem recurso `aws_mwaa_environment` (ST, TT);
    - o registro da janela recusa prazo acima de 3 h ou acima do prazo da base menos 1 h, e recusa a janela sem a base no ar (TH);
    - o destroy da base derruba a janela antes e remove os dois registros (TH).
- **RNF-102: teto diário.** Lacuna (retroativo) e **[DIVERGÊNCIA]**: hoje o stack tem Budgets mensal de US$ 10, e a D-021 trocou os tetos mensais por disciplina pelo teto de um dia. O que DEVE existir:
  - o `teto_diario_usd` do projeto, hoje `null`, calculado no plano como o custo de 24 horas do stack na postura da demonstração. A postura segue a D-052 (MWAA ligado só numa janela curta): o teto soma 24 h do stack base e só a janela do MWAA, de até 3 h (RNF-101, ADR-0007);
  - o valor gravado em `harness/estado.json`, no README e num AWS Budgets com período **diário** no stack, no lugar do mensal;
  - o limite mensal da conta só no `infra/conta` (D-022), sem um segundo Budgets mensal no stack.
  - **Aceite:** TT do Budgets com `time_unit = "DAILY"` e `limit_amount` igual ao teto; o `estado.py validar` aprova a partir de `tarefas`; o gate de FinOps da esteira compara o custo de 24 horas com o teto. (TT, CI do harness, esteira)
- **RNF-103: gate de custo único.** Lacuna (retroativo): o job de Infracost do `recsys-01-03-ci.yml` compara o custo mensal sem teto. O gate DEVE ser só o de `seguranca.yml` (`gate_custo.py`), que lê o teto diário do `harness/estado.json` (D-023). O job duplicado sai.
  - **Aceite:** nenhum workflow da unidade roda `infracost`; o PR mostra o comentário do gate da esteira. (ST, esteira)

### Segurança (Art. IV)
- **RNF-104: consulta vetorial sem injeção.** Lacuna (retroativo): o parâmetro `category` entra sem escape na expressão `(@cat:{<categoria>})` do RediSearch. O sistema DEVE validar `category` contra uma lista de caracteres permitidos (o padrão exato fica no plano) e responder 400 fora dela, antes de montar a consulta.
  - **Aceite:** um valor com `}`, `|`, `*`, `@` ou `)` dá 400, e o repositório não é chamado. (VT, teste vermelho primeiro)
- **RNF-105: identidade de deploy por projeto, com ABAC.** Lacuna (retroativo). Hoje a role de deploy do `U/infra/bootstrap/` tem `PowerUserAccess` sem condição de tag e só aceita tokens do ambiente `aws-lab`. Ela DEVE:
  - aceitar também o subject `repo:<dono>/<repo>:environment:aws-lab-destroy`;
  - limitar a criação e a alteração de recursos à tag `project=01-recomendacao` por condição (`aws:RequestTag/project` e `aws:ResourceTag/project`), como exige a D-029.

  O plano decide se o bootstrap continua no projeto ou passa a reusar a identidade da conta, e lista as ações que não aceitam condição de tag. O apply do bootstrap e a criação do ambiente são do dono (pendência já registrada na memória, D-024).
  - **Aceite:** TT da política de confiança com os dois subjects e da política de permissão sem ação ampla sem condição de tag, salvo a lista do plano. (TT, checkov)
- **RNF-106: workflows dentro das regras de cadeia de suprimentos do harness.** Lacuna (retroativo). Hoje dois testes do harness falham neste branch por causa dos workflows da unidade:
  - `test_um_sha_por_action`: `actions/checkout`, `aws-actions/configure-aws-credentials` e `hashicorp/setup-terraform` usam SHAs diferentes dos de `harness/modelos/` e dos outros workflows;
  - `test_token_oidc_nunca_no_nivel_do_workflow`: `recsys-01-03-apply.yml` e `recsys-01-03-destroy.yml` declaram `id-token: write` no topo do workflow.

  Toda action DEVE usar o mesmo SHA do resto do repositório, e `id-token: write` DEVE ficar só no job que assume a role.
  - **Aceite:** `python3 -m unittest harness/test_harness.py` sem falha. (CI do harness)

### Operação e isolamento (Art. VI; D-029, D-031)
- **RNF-107: tags no padrão da política.** Lacuna (retroativo) e **[DIVERGÊNCIA]**: `project=recsys` e `module="01-fundamentos-ia-llms/03-recomendacao"` (com barra) reprovam a política de tags bloqueante do Infracost (D-031). O stack DEVE ter:
  - `project = "01-recomendacao"` e `managed-by = "terraform"` no `default_tags` do provider;
  - `module` em kebab por componente, no `local.tags` de cada módulo (a lista de nomes fica no plano);
  - o teste do stack começando por `harness/modelos/tags.tftest.hcl`, com a chave do projeto;
  - a mesma troca de `recsys` no harness do Floci, nos workflows, no `terraform.tfvars.example`, no `backend.hcl.example`, no bootstrap e no README.
  - **Aceite:** o `tags.tftest.hcl` e um assert sobre as tags de todos os recursos tagueáveis passam; o Infracost do PR não aponta violação de tag. (TT, esteira)
- **RNF-108: nome com o prefixo da chave.** Lacuna (retroativo): os nomes começam por `recsys-lab-`. Todo nome DEVE começar por `01-recomendacao-` (D-029). Quando a API do serviço exige letra inicial, vale a exceção versionada `p01-recomendacao-`, no padrão do ADR-0012 da plataforma:
  - a lista das exceções fica num lugar só, junto do teste de prefixo, com o motivo e o ADR de cada uma;
  - o MemoryDB é exceção confirmada, porque o nome do cluster precisa começar por letra (fonte na "Proveniência");
  - o MWAA e qualquer outro caso são confirmados no plano;
  - a tag `project` continua `01-recomendacao` em todos os recursos.
  - **Aceite:** um teste de prefixo reprova um nome fora do prefixo e fora da lista. (TT)
- **RF-106: falha de dependência visível.** Lacuna (retroativo). Hoje os adaptadores reais do DynamoDB e do MemoryDB transformam a falha em lista vazia, então o modo degradado e as métricas `DynamoDbFallbackCount` e `MemoryDbFallbackCount` não acontecem no serviço real. A falha de dependência DEVE chegar ao caso de uso como falha, com `degradedMode: true` e a métrica da dependência, mantendo o 200 do RF-006.
  - **Aceite:** com o cliente do DynamoDB (ou do Redis) simulado lançando erro, o caso de uso real devolve `degradedMode: true` e publica a métrica. (VT, teste vermelho primeiro, com o adaptador real e não um repositório simulado)

### Comportamento declarado e ainda não entregue
- **RF-104: supressão de compras recentes no serviço real.** Lacuna (retroativo). O serviço montado para produção DEVE ter uma fonte de compras recentes e de estoque, para que o RF-004 valha fora dos testes, e uma falha dessa fonte DEVE seguir a regra do RF-006 (200 e `degradedMode`, nunca 500). A fonte de dados é decidida no plano, sem serviço novo de custo fixo.
  - **Aceite:** com o `buildDefaultUseCase`, um item comprado há 10 dias não aparece; com a fonte fora do ar, a resposta é 200 com `degradedMode: true`. (VT)
- **RF-105: busca vetorial pelo contexto da sessão.** Lacuna (retroativo). Hoje a consulta usa um vetor de zeros. Com `sessionItemIds`, a consulta DEVE usar um vetor derivado dos itens da sessão, já gravados no MemoryDB (RF-012). Sem itens de sessão, a busca vetorial não roda, e os candidatos vêm só do lote, sem ligar `degradedMode`, porque não é falha. O cálculo do vetor fica no plano.
  - **Aceite:** com dois itens de sessão, o repositório recebe um vetor diferente de zero, derivado dos dois; sem sessão, o repositório não é chamado. (VT)
- **RF-107: lote coerente com o stack.** Lacuna (retroativo): os scripts do lote usam nomes fixos que não batem com os do Terraform, e o DAG chama dois jobs do Glue que o stack não cria. O tamanho da correção depende de D-051 (lab sintético fechado: criar os dois jobs do Glue que faltam e treinar um XGBoost pequeno sobre os dados sintéticos). Em qualquer opção, DEVE valer o mínimo: nenhum nome fixo nos scripts (todos vêm de argumentos do job ou do DAG), e todo job chamado pelo DAG existe no stack.
  - **Aceite:** um teste reprova o script com nome de recurso fixo, e um teste confere que cada `job_name` do DAG tem um `aws_glue_job` no plan. (PY, TT)
- **RF-108: roteiro de demonstração.** Lacuna (retroativo). O projeto DEVE ter um roteiro versionado, com dados sintéticos, que rode no stack real e gere evidência:
  1. uma recomendação híbrida;
  2. uma recomendação com `explain=true` aceita na primeira tentativa;
  3. uma resposta com `explain=true` que cai no fallback sem explicação;
  4. um modo degradado com uma dependência desligada.

  A evidência são os números das métricas do RNF-003, tirados antes do destroy, e a latência p95 do caminho sem explicação.
  - **Aceite:** o relatório da fase verificar tem os quatro passos, com o `requestId` de cada um. (DM)
- **RF-109: re-ranker que o serviço consegue subir.** Lacuna (retroativo), com risco.
  - **Situação:** o endpoint usa a imagem do XGBoost sem artefato de modelo (`model_data_url` nulo) e com `enable_network_isolation = true` em Serverless Inference. A documentação da AWS lista o isolamento de rede entre os recursos que o Serverless Inference não suporta (fonte na "Proveniência"). O emulador não chega a subir o endpoint (ADR-0006), então nada disso foi provado.
  - **Requisito:** a configuração do endpoint DEVE ser uma que a AWS aceita, e o endpoint DEVE ter um modelo que responda ao contrato do RF-005. O conteúdo do modelo depende de D-051 (lab sintético fechado: criar os dois jobs do Glue que faltam e treinar um XGBoost pequeno sobre os dados sintéticos). A troca do isolamento de rede por outra proteção é decidida no plano, com ADR.
  - **Aceite:** TT reprova a combinação de Serverless com isolamento de rede; na demonstração, o endpoint chega a `InService` e responde ao contrato. (TT, DM)

### Componente Claude na plataforma compartilhada (Art. VII; D-030)
- **RF-110: perfil de inferência e guardrail da plataforma.** Lacuna (retroativo). Hoje o serviço chama o Bedrock direto, com IAM sobre o modelo e o perfil `us.` de mesmo id. O que DEVE mudar:
  - **registro:** a D01 entra no catálogo da `00-plataforma-agentes` como produto que chama o Claude;
  - **inferência:** passa pelo perfil de inferência de aplicação dela, com a tag `project=01-recomendacao`, e pelo guardrail dela, na versão numerada publicada no contrato v1 (RF-004, RF-005 e RF-007 da spec da plataforma);
  - **contrato:** o ARN do perfil e o id e a versão do guardrail vêm do parâmetro SSM do contrato, nunca escritos à mão;
  - **IAM:** a task role só invoca o próprio perfil;
  - **fallback:** uma intervenção do guardrail vira a categoria `guardrail` no explicador, não retentável, com o fallback do RF-007;
  - **gateway MCP:** a D01 não registra alvo no gateway, porque não tem tool de ação (E1).

  Os tópicos negados do guardrail da D01 (recomendação) ficam definidos pela D-053: nenhum tópico extra, porque o código já barra preço, desconto e frete; o guardrail fica com a defesa de injeção e dados sensíveis da plataforma. O mecanismo para aplicar o guardrail no caminho InvokeModel do `AnthropicBedrock` fica no plano (incerto, E9).
  - **Aceite:**
    - TT: a task role só tem `bedrock:InvokeModel` no ARN do perfil vindo do contrato;
    - VT: com uma resposta gravada de intervenção do guardrail, o explicador devolve `unavailable` com a categoria `guardrail`, sem retentar;
    - busca por `arn:aws:bedrock` sem ocorrência fora de testes (TT e grep).
- **RF-111: respostas gravadas com proveniência.** Lacuna (retroativo). As respostas usadas nos testes do explicador são sintéticas, escritas à mão. Cada uma DEVE trazer `proveniencia: sintetica`, e as de formato confirmado pela documentação, `proveniencia: documentacao`. Na primeira demonstração, uma captura real de cada caminho (sucesso, retentativa por validação e intervenção do guardrail) DEVE substituir a sintética, sem dado pessoal. O comportamento real do modelo continua sem validação em CI (D-006), e isso fica dito no ADR-0004.
  - **Aceite:** um teste reprova uma resposta gravada sem o campo `proveniencia`. (VT)

### Proveniência, privacidade e fonte única (Art. VIII; prática da hierarquia de CLAUDE.md)
- **RNF-109: catálogo sintético.** Lacuna (retroativo). O catálogo curado de fallback e os dados de semente DEVEM usar nomes de produtos fictícios, sem marca real, para que nada no site ou na demonstração sugira parceria ou dado de empresa.
  - **Aceite:** um teste confere os títulos do catálogo curado contra uma lista de nomes fictícios. (VT)
- **RNF-110: uma fonte da verdade.** Lacuna (retroativo):
  - esta spec passa a ser a fonte dos requisitos do projeto;
  - a spec legada `U/specs/001-aws-recommendation-platform/` DEVE ganhar um aviso de substituída no topo, apontando para `specs/01-recomendacao/`, ou sair, mantendo os contratos que os testes usam (decisão no plano);
  - o `U/CLAUDE.md` DEVE ser reescrito curto, só com o que vale nesta pasta, e apontar para a spec, sem repetir nem contradizer o `CLAUDE.md` da raiz;
  - o README DEVE trazer o teto diário no lugar do mensal, a contagem certa de módulos e os passos com os workflows novos;
  - os posts DEVEM trocar o "US$ 10/mês" pelo teto diário.
  - **Aceite:** busca por `US$ 10`, `recsys` e "FIXED" sem ocorrência na unidade fora do histórico dos ADRs; o `U/CLAUDE.md` tem menos de 60 linhas e cita `specs/01-recomendacao/`. (ST)
- **RNF-111: afirmações dos posts com fonte e data.** Lacuna (retroativo). Toda afirmação sobre empresa nos posts AWS e GCP e na página do site DEVE ter fonte e data. Quando a fonte não detalhar a arquitetura, a afirmação fica marcada como inferência (Art. VIII). A revisão é feita na fase publicar, antes de pedir a publicação ao dono.
  - **Aceite:** checklist de proveniência dos posts no relatório da fase verificar. (revisão)

## Esclarecimentos
Cada linha diz a ambiguidade, o tipo, a decisão, a boa prática que guia a decisão e o erro comum que ela evita (D-036). Os ids das tarefas da prova vêm no fim, entre parênteses.

| id | ambiguidade | tipo | decisão | boa prática e erro comum que ela evita |
|---|---|---|---|---|
| E1 | O que a D01 consome da plataforma de agentes | técnica (D-030, delegada) | Perfil de inferência de aplicação, guardrail e observabilidade da plataforma. Sem gateway MCP: a tool `record_explanations` é só o formato da saída estruturada, não uma ação no mundo | **Acesso ao modelo governado num ponto só**: o arquiteto põe atribuição de custo e filtro de conteúdo na plataforma, não em cada produto. Erro comum: cada produto chamar o modelo direto, com IAM amplo, sem saber quanto custa nem filtrar a saída (1.4, 2.3) |
| E2 | Nome que não pode começar por dígito | técnica | Exceção `p01-recomendacao-`, versionada numa lista com ADR, no padrão do ADR-0012 da plataforma | **Regra estrita com exceção explícita e testada**. Erro comum: afrouxar o teste para "contém a chave" e perder o controle por nome da D-029 (1.4) |
| E3 | Onde ficam os workflows da D01 | técnica | Apply e destroy gerados dos modelos do harness (RNF-101). O CI da unidade continua, com os SHAs alinhados e sem o Infracost duplicado (RNF-103, RNF-106) | **Um caminho padrão, um gate por assunto**. Erro comum: um workflow por projeto feito à mão, que diverge do modelo e escapa das regras do harness, como já acontece hoje (1.4, 3.6) |
| E4 | Falha de dependência engolida pelo adaptador | técnica | A falha chega ao caso de uso, e o caso de uso decide a degradação (RF-106) | **Propagação estruturada do erro**: a camada que sabe degradar recebe a falha com o motivo. Erro comum: devolver lista vazia, que não se distingue de "sem dados" e deixa o alarme cego (5.3) |
| E5 | Vetor da busca em tempo real | técnica | Derivado dos itens da sessão; sem sessão, a busca vetorial não roda (RF-105) | **Contexto real em vez de valor de preenchimento**. Erro comum: consultar com vetor nulo e chamar o resultado de "tempo real", enganando quem lê a proveniência (5.6) |
| E6 | `category` livre na consulta do RediSearch | técnica | Validação por lista de caracteres permitidos e 400 fora dela (RNF-104) | **Validar a entrada antes de montar uma consulta**. Erro comum: interpolar texto do usuário numa linguagem de consulta e confiar no timeout para conter o estrago (2.2) |
| E7 | Fonte de compras recentes e estoque em produção | técnica | Uma fonte sem custo fixo novo, decidida no plano (RF-104) | **O teste prova o que roda em produção**. Erro comum: um teste verde com um repositório injetado que o serviço real nunca injeta (4.1) |
| E8 | `SORTBY` no `FT.SEARCH` do MemoryDB | técnica, incerta | O plano confirma se o MemoryDB aceita `SORTBY` (a página do comando não o lista) ou se a ordem do KNN basta; até lá, fica como risco do RF-002 | **Afirmação de serviço só com fonte**. Erro comum: supor que o MemoryDB é igual ao Redis Stack porque o emulador aceita (5.6) |
| E9 | Guardrail no caminho InvokeModel do `AnthropicBedrock` | técnica, incerta | O plano confirma como passar o guardrail nesse caminho. Se o SDK não permitir, avalia a chamada `ApplyGuardrail` antes e depois, com ADR | **Defesa em camadas sem trocar de cliente às cegas**. Erro comum: trocar o cliente no meio do projeto e quebrar o endpoint privado e o emulador (ADR-0004) |
| E10 | Respostas "gravadas" que são sintéticas | técnica | Campo `proveniencia` em cada resposta, com captura real na primeira demonstração (RF-111) | **Proveniência explícita dos dados de teste**. Erro comum: tratar resposta escrita à mão como prova do comportamento do modelo (5.6, 4.4) |
| E11 | Budgets mensal do stack | decidida pelo dono (D-021, D-022) | Budgets diário com o teto no stack; o mensal só no `infra/conta` (RNF-102) | Aplicação de decisão já tomada; nada a decidir |
| E12 | Teto diário | calculado no plano (D-021) | Calculado na postura da demonstração, que depende da P01-P2 | O valor sai do plano, não desta spec |
| E13 | Isolamento de rede do re-ranker em Serverless | técnica, incerta | O plano escolhe entre tirar o isolamento no Serverless, com outra proteção e ADR, ou usar instância. A instância tem custo por hora, então entra no teto e, se mudar a postura de custo, vira pergunta ao dono (RF-109) | **Configuração que o serviço aceita, provada antes do apply real**. Erro comum: só descobrir no apply da demonstração, com o relógio do teto correndo (1.4) |
| E14 | Spec legada e `U/CLAUDE.md` | técnica | Esta spec é a fonte; o legado ganha aviso ou sai; o `U/CLAUDE.md` fica curto e aponta para cá (RNF-110) | **Hierarquia de CLAUDE.md sem contradição**: a pasta só acrescenta o que é dela. Erro comum: um CLAUDE.md de subpasta desatualizado que o agente lê como regra e que contradiz a raiz (3.1) |
| E15 | Nomes de marca no catálogo de fallback | técnica | Nomes fictícios (RNF-109) | **Dados sintéticos de verdade**. Erro comum: dado "de exemplo" com marca real, que vai parar no site e na demonstração (Art. VIII) |
| E16 | Id do modelo Claude Haiku 5.5 no Bedrock e região | técnica, incerta | Com o RF-110, o produto recebe o ARN do perfil pelo contrato. O plano confirma o modelo de origem do perfil e a disponibilidade em `us-east-1` | **Configuração vinda do contrato, não de memória**. Erro comum: id de modelo escrito à mão que muda entre regiões e perfis (2.1) |

## Componente Claude e tarefas da prova
O Claude escreve, numa chamada por requisição, uma frase por item recomendado. A saída é estruturada e validada por código. O cenário da prova mais próximo é a **extração de dados estruturados**: a saída é JSON com regras, não texto livre. Cada linha diz a boa prática, onde ela está no código e o erro comum que ela evita. Os ids vêm entre parênteses.

| boa prática | onde aparece | erro comum que ela evita |
|---|---|---|
| **Critérios explícitos e mensuráveis no prompt** (4.1) | regras numeradas no `SYSTEM_PROMPT`: 20 a 160 caracteres, só os sinais permitidos, sem preço nem número | pedir "uma explicação curta e honesta" e não conseguir validar nada |
| **Exemplo no prompt** (4.2) | um exemplo de entrada e de chamada da tool | o modelo acertar o formato e errar o tom ou a granularidade |
| **Saída estruturada por tool com schema estrito e `tool_choice` forçado** (4.3, 2.3) | tool única `record_explanations`, `strict: true`, `tool_choice: {type: "tool"}` | analisar texto livre com regex, que quebra quando o modelo muda o formato |
| **Validação e retentativa com o erro devolvido ao modelo** (4.4) | zod e regras semânticas; `tool_result` com `is_error: true`; no máximo 2 tentativas | repetir a mesma pergunta sem dizer o que estava errado, ou retentar sem limite |
| **Decisão pelo `stop_reason`** (1.1) | `refusal` encerra sem retentar; `max_tokens` invalida a resposta; sem `tool_use`, falha de validação | tratar toda resposta como sucesso e exibir texto cortado ou recusado |
| **Erros estruturados com categoria e indicação de retentável** (2.2, 5.3) | sete categorias e a regra por status HTTP | retentar um 400 ou um `refusal`, ou desistir num 429 que passaria |
| **Gate programático antes do cliente** (1.4) | nenhuma frase chega à resposta sem passar na validação; falha vira `unavailable` | deixar o modelo decidir sozinho o que o cliente vê |
| **Proveniência verificável** (5.6) | sinais calculados dos dados de cada item; `signals` e `source: "claude"` na resposta | o texto dizer "parecido com o que você viu" para um item que veio só do histórico |
| **Degradação com estado explícito** (5.3) | disjuntor de 5 falhas e 30 s; `explanation.status` e `reason`; métrica com alarme | uma falha do modelo derrubar a recomendação ou virar 500 |
| **Acesso ao modelo governado pela plataforma** (1.4, 2.3; RF-110) | perfil de inferência e guardrail da D01 vindos do contrato v1 | IAM sobre `foundation-model/*` e custo do modelo sem dono |

**Como é testado:** só com respostas gravadas, sem chamada ao Claude real (D-006, Art. III).
- **Hoje:** respostas sintéticas em `U/tests/unit/recommendation-explainer.test.ts` cobrem sucesso, retentativa por validação, resposta sem `tool_use`, `refusal`, 429, 400, timeout, disjuntor e o limite de tentativas. `U/tests/integration/explanation-in-recommendations.test.ts` cobre os cinco caminhos na resposta da API. A integração no Floci chama o `bedrock-runtime` do emulador e confere que o serviço nunca lança exceção.
- **Depois das lacunas:** cada resposta tem `proveniencia` (RF-111), e entra uma resposta gravada de intervenção do guardrail (RF-110).

## Proveniência (consulta em 2026-11-20)
| afirmação | fonte | data da fonte | certeza |
|---|---|---|---|
| O time Everyday Essentials da Amazon descreve recomendação em lote com Lake Formation, S3, Glue, Athena, MWAA, SageMaker, DynamoDB e ECS, e uma extensão em tempo real com busca vetorial no MemoryDB e embeddings por endpoint do SageMaker | [Building a scalable personalized recommendation system on AWS: From batch to real-time](https://aws.amazon.com/blogs/big-data/building-a-scalable-personalized-recommendation-system-on-aws-from-batch-to-real-time/) (AWS Big Data Blog) | 2026-07-27 | confirmado |
| No post, a busca vetorial do lote usa FAISS em jobs de processamento do SageMaker, e o MemoryDB entra só no tempo real, com o índice atualizado pelo lote | mesma fonte | 2026-07-27 | confirmado |
| O AWS Budgets aceita orçamento de custo com período diário e compara o dia anterior completo com o valor | [AWS Budgets now offers daily granularity for cost and usage budgets](https://aws.amazon.com/about-aws/whats-new/2020/09/aws-budgets-offer-daily-granularity-cost-usage-budgets) | 2020-09-16 | confirmado |
| A busca vetorial do MemoryDB aceita índices FLAT e HNSW e os comandos `FT.CREATE` e `FT.SEARCH`; o índice novo passa por backfill, e consultas falham enquanto ele roda | [Vector search overview (Amazon MemoryDB)](https://docs.aws.amazon.com/en_us/memorydb/latest/devguide/vector-search-overview.html) | sem data (página viva) | confirmado |
| O `FT.SEARCH` do MemoryDB aceita `PARAMS`, KNN com `DIALECT 2` e `RETURN`; a página não lista `SORTBY`; os resultados do KNN vêm ordenados pela distância | [FT.SEARCH (Amazon MemoryDB)](https://docs.aws.amazon.com/en_us/memorydb/latest/devguide/vector-search-commands-ft.search.html) | sem data | confirmado; suporte a `SORTBY`: incerto (E8) |
| O nome do cluster do MemoryDB tem de 1 a 40 caracteres, começa por letra, não tem dois hífens seguidos nem termina em hífen | [Getting started with MemoryDB](https://docs.aws.amazon.com/memorydb/latest/devguide/getting-started.html) | sem data | confirmado |
| O SageMaker Serverless Inference escala a zero sem cobrança de computação ociosa; a memória vai de 1.024 a 6.144 MB; a concorrência máxima por endpoint é 200; não suporta, entre outros recursos, configuração de VPC e isolamento de rede | [Deploy models with Amazon SageMaker Serverless Inference](https://docs.aws.amazon.com/sagemaker/latest/dg/serverless-endpoints.html) | sem data | confirmado |
| O perfil de inferência de aplicação do Bedrock aceita tags para alocação de custo e pode ser criado a partir de um modelo, numa região, ou de um perfil entre regiões | [Create an application inference profile](https://docs.aws.amazon.com/bedrock/latest/userguide/inference-profiles-create.html) | sem data | confirmado |
| Os preços por hora do ADR-0002 e o custo por requisição do ADR-0004 | valores dos próprios ADRs, de preços públicos de 2026-11, não reconferidos nesta fase | 2026-11-18 | a recalcular no plano, com a página de preços de cada serviço |
| O nome do ambiente do MWAA precisa começar por letra | não verificado nesta fase | — | incerto: confirmado no plano (RNF-108) |

## Fora de escopo
- **Explicação gerada no lote** com inferência em lote do Bedrock e cache por item e sinais: é a recomendação de produção do ADR-0004, não o lab.
- **Gateway MCP, tools de ação e memória de longo prazo:** a D01 não tem agente com tools (E1).
- **Autenticação IAM e ACL por função no MemoryDB, WAF e access logs no ALB público:** são os próximos passos do ADR-0003, com a API pública desligada por padrão.
- **Implementar a comparativa em GCP:** o post continua design doc, sem conta GCP (D-007).
- **Passo de revisão do plan com Claude no CI:** fica para a disciplina de DevOps, como diz o ADR-0005.
- **Revisão humana por amostragem e avaliador automático das explicações:** a avaliação sob demanda da plataforma cobre a demonstração. Um avaliador próprio da D01 fica fora.

## Decisões do dono que esta spec usa
- D-006 (testes do componente Claude só com respostas gravadas)
- D-007 (cloud comparativa GCP na D01)
- D-008 (D01 é a recomendação de e-commerce)
- D-013 (Floci por tag de versão via variável)
- D-021 (teto de um dia e destroy obrigatório)
- D-022 (limite mensal da conta e destroy automático)
- D-024 (destroy em até 24 h, sem aprovação)
- D-029 (conta única com isolamento por tag e prefixo)
- D-031 (padrão de tags da política do Infracost; `recsys` vira `01-recomendacao`)
- D-033 (delegação dentro do plano aprovado)
- D-036 (explicar pela boa prática e pelo erro comum)
- D-042 (Terraform roda na máquina do dono)
- D-050 (códigos sempre com nome)

Delegadas usadas: D-023 (mecânica do teto diário e do prazo) e D-030 (plataforma de agentes compartilhada).

## Cobertura do código existente
Todo componente de `U/` e os arquivos do PR #1 fora da unidade aparecem em pelo menos um requisito.

| componente | requisitos |
|---|---|
| `src/serving/src/presentation/` (servidor, controladores) | RF-001, RF-006, RF-008, RF-009 |
| `src/serving/src/application/` (caso de uso, junção, filtros, re-rankers, explicador) | RF-002 a RF-007, RF-104 a RF-106, RF-110, RF-111 |
| `src/serving/src/domain/` | RF-003, RF-004, RF-007 |
| `src/serving/src/infrastructure/` (DynamoDB, MemoryDB, SageMaker, Bedrock, cache, fallback, resiliência, logs, métricas) | RF-002, RF-004 a RF-009, RF-104 a RF-106, RF-110, RNF-104, RNF-109 |
| `src/serving/src/config/env.ts`, `src/serving/Dockerfile`, `src/serving/package.json`, `src/serving/tsconfig.json` | RF-007, RF-008, RF-016 |
| `src/batch/airflow/`, `src/batch/athena/`, `src/batch/glue/`, `src/batch/sagemaker/` | RF-010 a RF-014, RF-107 |
| `infra/terraform/` (raiz e 13 módulos) | RNF-001 a RNF-003, RF-010 a RF-014, RF-109, RF-110, RNF-102, RNF-107, RNF-108 |
| `infra/terraform/tests/` (`regras_base.tftest.hcl`, `static_rules.py`) | RNF-005, RNF-107, RNF-108 |
| `infra/bootstrap/` | RNF-003, RNF-105 |
| `tests/unit/`, `tests/integration/`, `tests/contract/` | RNF-005 e os aceites de RF-001 a RF-013 |
| `scripts/seed-local.ts`, `package.json`, `package-lock.json`, `vitest.config.ts`, `tsconfig.json`, configs de lint e formatação | RF-016, RNF-109 |
| `adr/0001` a `adr/0006` | RNF-001 a RNF-003, RF-007, RF-015, RF-111 |
| `docs/matriz-cobertura.md` | RNF-005 |
| `posts/aws.md`, `posts/gcp.md`, `README.md`, `notas/` (vazia) | RF-017, RNF-110, RNF-111 |
| `CLAUDE.md` da unidade e `specs/001-aws-recommendation-platform/` (legado e contratos) | RNF-008, RNF-110; contratos em RF-001, RF-005, RF-011 e RF-012 |
| `.github/workflows/recsys-01-03-{apply,destroy,ci}.yml` | RNF-006, RNF-101, RNF-103, RNF-106 |
| `testing/scripts/integracao_01_03_recomendacao.py`, `testing/reports/latest.html` | RF-015, RNF-107 |
| `site/projetos/01-03-recomendacao.html`, `site/posts/modulo-01-recomendacao.html`, `site/relatorios/01-03-recomendacao.html`, `site/index.html`, `site/assets/site.css`, `docs/curso/PROGRESSO.md` | RF-015, RF-017, RNF-111 |

## Alinhamento com o plano aprovado
Cada linha diz o que mudou na spec para seguir o `plan.md` aprovado, a boa prática que guia a mudança e o erro comum que ela evita (D-036). Os ids das tarefas da prova vêm no fim, entre parênteses.

- **2026-11-20 · RNF-101, RNF-002 e RNF-102: janela do MWAA em stack próprio no lugar do input `enable_mwaa`** (D-052, ADR-0007). A spec citava um input `enable_mwaa` no apply da base; o plano pôs o MWAA numa raiz própria, com prazo de até 3 h, destroy sem aprovação e destroy em cascata a partir da base. **Boa prática: workflow com gate programático e ordem garantida pelo código.** O arquiteto põe o prazo, a ordem e o desligamento da parte cara em regras que o harness aplica sozinho, e a spec descreve o mesmo ciclo que o plano. **Erro comum:** desligar a parte cara por um novo apply com uma flag, que fica esperando aprovação, ou deixar a spec e o plano descreverem mecanismos diferentes, e a análise e os testes seguirem um texto que o código não implementa (1.4, 1.6, 5.3).

## Perguntas ao dono
| id | pergunta | bloqueia | opções | recomendação |
|---|---|---|---|---|

Nenhuma pergunta aberta.

## Perguntas respondidas
| id | resposta do dono (2026-11-20) |
|---|---|
| P01-P1 | D-051: lab sintético fechado |
| P01-P2 | D-052: MWAA ligado numa janela curta |
| P01-P3 | D-053: nenhum tópico extra |
| P01-P4 | D-054: só a página e o post AWS |
