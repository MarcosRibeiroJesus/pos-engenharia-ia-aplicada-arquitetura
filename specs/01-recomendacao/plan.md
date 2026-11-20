# Plano: Recomendação de e-commerce (plataforma híbrida de recomendação com explicação)

- **Spec:** `specs/01-recomendacao/spec.md` · **Status:** aprovado pelo dono em 2026-11-20 (D-056), com o hash registrado em `harness/estado.json` (D-033)
- **Data:** 2026-11-20 · **Autor:** arquiteto-aws (Claude Opus 5.5), em plan mode, sem chamada à AWS e sem código
- **Decisões do dono aplicadas:** D-006, D-007, D-008, D-013, D-021, D-022, D-024, D-029, D-031, D-034, D-039, D-042, D-050, D-051 (lote como lab sintético fechado), D-052 (MWAA numa janela curta), D-053 (guardrail sem tópico extra), D-054 (publicar só a página e o post AWS), D-055 (disparo deste plano)
- **Delegadas usadas:** D-023 (mecânica do teto e do prazo), D-030 (plataforma compartilhada), D-036 (como explicar)
- **ADRs novos:** `specs/01-recomendacao/adr/0007` a `0016`. O gate SDD bloqueia `modulos/01-fundamentos-ia-llms/unidades/03-recomendacao/` antes da fase implementar, então eles nascem aqui. A primeira tarefa de implementar os move para `U/adr/`, ao lado dos ADRs 0001 a 0006, e deixa redirecionamentos aqui (mesmo padrão do T000 da plataforma).

`U/` abrevia `modulos/01-fundamentos-ia-llms/unidades/03-recomendacao/`, como na spec.

## Resumo
- **Três stacks, uma chave.** Todos com a tag `project=01-recomendacao`:
  - **base** (24 h): serviço, dados, busca vetorial, re-ranker, Glue e Athena;
  - **janela do MWAA** (até 3 h, padrão 2 h): ambiente do Airflow e os endpoints que só ele usa (ADR-0007);
  - **plataforma de agentes** (00-plataforma-agentes): stack próprio, consumido pelo contrato v1.

  O destroy desce em cascata (janela, depois base, depois plataforma), e o prazo de cada nível fica pelo menos 1 hora antes do prazo do nível de cima.
- **Lote fechado com dado sintético (D-051).** Entram os dois jobs de publicação do Glue (Python shell, sem nome fixo) e um XGBoost pequeno. O endpoint serve um artefato semente reproduzível, publicado pelo apply. O DAG treina o mesmo modelo no SageMaker como candidato, sem promover sozinho (ADR-0008).
- **Re-ranker que a AWS aceita.** Serverless Inference sem isolamento de rede, porque o serviço não suporta isolamento. O container é o nativo do XGBoost, sem código nosso, e o artefato é gravado em formato nativo, sem pickle (ADR-0009).
- **Claude pela plataforma (D-053, E1).** Perfil de inferência e guardrail vêm do contrato v1. O guardrail vai nos cabeçalhos do InvokeModel, imposto por IAM. Um `ApplyGuardrail` revisa o texto final, porque o guardrail do modelo não lê os parâmetros de tool. Não há gateway MCP (ADR-0010).
- **Correções de segurança e de verdade:** categoria por lista de caracteres permitidos, vetor da sessão no lugar do vetor de zeros, falha de dependência visível e regra dos 30 dias ligada no serviço real (ADR-0011 e ADR-0012).
- **Teto diário: US$ 7,10** (aprovado pelo dono, D-056), sobre uma estimativa de US$ 6,43 (seção "Custo do lab"). Somado ao teto da plataforma (US$ 1,20), um dia de demonstração cabe em 42% do limite mensal de US$ 20. O valor de 7,10 é proposta e depende da resposta à P01-P5.

## Verificação da constituição
| Artigo | Como o plano cumpre | Risco |
|---|---|---|
| I · SDD | Spec retroativa esclarecida (D-051 a D-054) e este plano. `tasks.md` só depois da aprovação do plano (D-033). ADRs em `specs/` até implementar | nenhum |
| II · Decisões do dono | Nenhuma escolha do dono assumida. O teto é calculado aqui e foi aprovado pelo dono (P01-P5, D-056). A identidade de deploy segue a D-029; o apply do `infra/conta` é ação do dono, não decisão nova | A ativação da tag de custo e o ambiente `aws-lab-destroy` continuam pendentes do dono (D-024, D-039) |
| III · Testes primeiro | Matriz regra → teste abaixo, com todo RF e RNF coberto. Cada tarefa começa por teste vermelho: VT, PY, TT, ST e TH. FL só com o projeto completo. DM para o que só a AWS real prova. Componente Claude só com respostas gravadas (D-006) | O emulador não aplica guardrail nem sobe o endpoint do SageMaker (lacunas com evidência) |
| IV · Segurança por padrão | ALB interno, sem NAT, KMS do cliente, TLS no MemoryDB e no SNS, roles por função, guardrail imposto por IAM, categoria validada, deploy por role do projeto com ABAC (ADR-0015). A troca do isolamento de rede do re-ranker tem proteções substitutas e ADR (ADR-0009) | MemoryDB `open-access` e HTTP entre ALB e task continuam como riscos aceitos do ADR-0003 |
| V · Custo consciente | Teto de um dia calculado com fontes. Budgets diário no stack, e o mensal só no `infra/conta`. MWAA só na janela. Endpoint `monitoring` removido (métricas por EMF, ADR-0013). Gate de custo único na esteira, que passa a somar as raízes e pesar a janela pelo prazo (TH-04). Destroy com `confirm_stack`, cascata e verificação de sobras | O custo da hora do MemoryDB e do `mw1.micro` não apareceu nas páginas oficiais; o plano usa um limite superior e o Infracost confirma (R6) |
| VI · Operável e replicável | Tags pelo `default_tags` e `local.tags` (D-031), testadas a partir do `tags.tftest.hcl`; prefixo `01-recomendacao-` com exceções versionadas (ADR-0014); 7 alarmes do stack, mais 1 de intervenção do guardrail; state remoto com lock; README com 5 passos | Os nomes do MemoryDB, do MWAA e do banco do Glue não aceitam dígito inicial ou hífen (exceções do ADR-0014) |
| VII · Lente da certificação | Componente Claude no cenário de extração de dados estruturados: critérios explícitos, exemplo, saída por tool com `tool_choice` forçado, validação com retentativa, erros por categoria, decisão pelo `stop_reason`, guardrail como gate e proveniência (4.1, 4.2, 4.3, 4.4, 2.2, 2.3, 1.1, 1.4, 5.3, 5.6) | nenhum |
| VIII · Proveniência e privacidade | Dados sintéticos com semente fixa; catálogo com nomes fictícios (RNF-109); fontes com data de consulta; posts revisados na fase publicar (RNF-111) | Captura real das respostas do Claude (RF-111) só depois de revisão humana |

## Arquitetura

### Visão geral
```
 GitHub Actions (OIDC, role 01-recomendacao-deploy com ABAC, ADR-0015)
   apply base (24 h)        apply janela MWAA (2 a 3 h)       roteiro (ECS run-task, ADR-0016)
        |                          |                                 |
+-------v--------------------------+------------------------------+  |
| VPC 01-recomendacao (sem NAT, 2 AZ privadas)                    |  |
|  endpoints base: ecr.api, ecr.dkr, logs, sagemaker.runtime,     |  |
|                  bedrock-runtime (+ gateway S3 e DynamoDB)      |  |
|                                                                 |  |
|  ALB interno --> ECS Fargate (serviço) <------------------------+--+
|                    | GetItem      | KNN + vetor da sessão        |
|                    v              v                              |
|                 DynamoDB       MemoryDB (TLS, KMS)               |
|                    | InvokeEndpoint (CSV)                        |
|                    v                                             |
|                 SageMaker Serverless (XGBoost nativo, semente)   |
|                    | InvokeModel + cabeçalhos do guardrail       |
|                    v      + ApplyGuardrail na saída              |
|                 Bedrock: perfil 01-recomendacao-perfil --> us.anthropic.claude-haiku-5-5
|                                                                 |
|  [janela] MWAA mw1.micro + endpoints sqs, kms, monitoring,      |
|           airflow.api/env/ops, athena, glue, sagemaker.api      |
|     DAG: sensor -> Athena -> Glue features -> treino XGBoost    |
|          (candidato) -> Glue publica DynamoDB || MemoryDB       |
+-----------------------------------------------------------------+
  S3 (dados, scripts, artefatos; KMS)  ·  Lake Formation + Glue Data Catalog
  CloudWatch (EMF, 7 alarmes + 1 do guardrail, painel) -> SNS (KMS)  ·  Budgets diário
  SSM /00-plataforma-agentes/contrato/v1/{comum, produtos/01-recomendacao}  (lido no plan)
```
**Ordem do dia** (ADR-0016):
1. apply da plataforma;
2. apply da base, que registra o produto na plataforma pelo módulo `registro-produto`;
3. apply da janela;
4. roteiro, parte do lote: liga e dispara o DAG pelo `InvokeRestApi`;
5. destroy da janela;
6. roteiro, parte do serviço: os passos 1 a 4 do RF-108;
7. coleta de evidências e gravação;
8. destroy da base e, depois, da plataforma.

### Serviços
Fontes consultadas em 2026-11-20. Floci: [lista de serviços](https://floci.io/floci/services/), [MWAA](https://floci.io/floci/services/mwaa/), [MemoryDB](https://floci.io/floci/services/memorydb/), [Bedrock](https://floci.io/floci/services/bedrock/) e [Bedrock Runtime](https://floci.io/floci/services/bedrock-runtime/). A CLI `floci` não está disponível nesta sessão.

| Serviço | Papel | Por que este | Alternativa rejeitada | Fonte oficial da AWS | Floci |
|---|---|---|---|---|---|
| Amazon ECS no Fargate + ALB interno | serviço HTTP de recomendação (RF-001 a RF-009) | contêiner sem servidor para gerenciar; 1 task no lab; ALB faz health check e TLS no opt-in público | Lambda: o cold start e o limite de conexões ao MemoryDB pesam no p95 de 60 ms | [Fargate pricing](https://aws.amazon.com/fargate/pricing/); [ELB pricing](https://aws.amazon.com/elasticloadbalancing/pricing/) | ECS (59 operações, contêiner real) e ELB v2 (37) |
| Amazon ECR | imagem do serviço, com tag imutável pelo SHA do commit | registro privado na mesma rede, por endpoint | `public.ecr.aws`: exige saída para a internet (ADR-0002) | [ADR-0002](../../modulos/01-fundamentos-ia-llms/unidades/03-recomendacao/adr/0002-saida-de-rede-e-custo-fixo.md) | emulado (47 operações; exige o socket do Docker, ADR-0006) |
| Amazon DynamoDB | candidatos do lote e compras recentes por usuário, num único item (RF-002, RF-011, RF-104) | on-demand, sem custo fixo; um GetItem traz as duas coisas | tabela de compras separada: mais uma chamada no caminho de 60 ms | [post do Big Data Blog](https://aws.amazon.com/blogs/big-data/building-a-scalable-personalized-recommendation-system-on-aws-from-batch-to-real-time/) (2026-07-27) | emulado (54 operações) |
| Amazon MemoryDB | busca vetorial KNN em tempo real, com o vetor da sessão e o estoque por item (RF-002, RF-012, RF-105) | é o padrão do post de referência; durável, com TLS e KMS | OpenSearch Serverless: custo mínimo por OCU muito acima do teto; ElastiCache: sem a durabilidade do post | [FT.SEARCH](https://docs.aws.amazon.com/memorydb/latest/devguide/vector-search-commands-ft.search.html); [visão geral](https://docs.aws.amazon.com/memorydb/latest/devguide/vector-search-overview.html) | 13 operações; contêiner Valkey 8 sem módulo de busca documentado; subnet e parameter group sem suporte (lacunas do ADR-0006) |
| SageMaker Serverless Inference | re-ranker XGBoost (RF-005, RF-109) | custo zero ocioso; container nativo do XGBoost 1.7-1 | endpoint em instância com isolamento de rede: cerca de US$ 1,30 por dia a mais e mais uma pergunta de custo (ADR-0009) | [Serverless Inference](https://docs.aws.amazon.com/sagemaker/latest/dg/serverless-endpoints.html); [XGBoost](https://docs.aws.amazon.com/sagemaker/latest/dg/xgboost-how-to-use.html) | SageMaker (20 operações) e Runtime (1); o endpoint não sobe no emulador (ADR-0006) |
| SageMaker Training (Spot) | treino do XGBoost candidato no DAG (RF-010, RF-014) | job efêmero, cobrado por segundo, com Spot | treino dentro do Glue: mistura ETL e ML e não exercita o padrão do post | [XGBoost](https://docs.aws.amazon.com/sagemaker/latest/dg/xgboost-how-to-use.html) | `CreateTrainingJob` emulado no plano de controle |
| AWS Glue (Spark e Python shell) | features (Spark, 2 G.1X); publicação no DynamoDB e no MemoryDB (Python shell, D-051) | Spark para o job de features, como no post; Python shell para as publicações, a 0,0625 DPU | Spark nos três: cerca de 30 vezes o custo por publicação, sem ganho com o volume do lab | [Glue pricing](https://aws.amazon.com/glue/pricing/) | emulado (140 operações) |
| Amazon Athena | extração das features do dia com poda de partição (RF-013) | SQL sem servidor sobre o S3, cobrado por dado lido | Redshift Serverless: custo base por RPU | [Athena pricing](https://aws.amazon.com/athena/pricing/) | emulado (27 operações) |
| Lake Formation + Glue Data Catalog | permissões explícitas do catálogo para a role do Glue | governança do lago como no post | só IAM no S3: perde a permissão por tabela | post de referência | emulado (17 operações; lacuna na revogação, ADR-0006) |
| Amazon MWAA (só na janela) | orquestra o DAG diário (RF-010, D-052) | é o orquestrador do post; `mw1.micro` é a menor classe; `InvokeRestApi` dispara o DAG sem rede até o webserver privado | Step Functions: troca o padrão ensinado; MWAA Serverless: DAG em YAML, outra reescrita | [classes](https://docs.aws.amazon.com/mwaa/latest/userguide/environment-class.html); [REST API](https://docs.aws.amazon.com/mwaa/latest/userguide/access-mwaa-apache-airflow-rest-api.html); [CreateEnvironment](https://docs.aws.amazon.com/mwaa/latest/API/API_CreateEnvironment.html); [versões](https://docs.aws.amazon.com/mwaa/latest/userguide/airflow-versions.html); [endpoints](https://docs.aws.amazon.com/mwaa/latest/userguide/vpc-vpe-create-access.html) | emulado (10 operações); no modo real, sobe um Airflow de verdade; sem `InvokeRestApi` (lacuna) |
| Amazon Bedrock (Claude Haiku 5.5) | uma frase de explicação por item (RF-007) | tarefa curta e sensível a latência; o modelo aceita guardrail no `bedrock-runtime` | Sonnet 5.5: mais caro e mais lento para uma frase (ADR-0004) | [model card](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-haiku-5-5.html); [InvokeModel](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_InvokeModel.html) | Runtime: `InvokeModel` sempre devolve o stub; guardrail fora de escopo |
| Bedrock Guardrails e perfil de inferência (pela plataforma) | filtro de conteúdo, ataque de prompt e dado sensível; custo por tag (RF-110) | governança num ponto só (E1) | guardrail próprio da D01: duplica o que a plataforma já faz | [testar guardrail (InvokeModel)](https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails-test.html); [criar perfil](https://docs.aws.amazon.com/bedrock/latest/userguide/inference-profiles-create.html) | controle emulado (guardrails e perfis de inferência); aplicação no Runtime não emulada |
| AWS KMS | chave do cliente para S3, DynamoDB, MemoryDB, Logs, SNS, ECR, Glue, Athena e MWAA | uma chave por stack, com rotação e exclusão em 7 dias | chaves gerenciadas: o alarme não publica em SNS com `aws/sns` | [KMS pricing](https://aws.amazon.com/kms/pricing/) | emulado (45 operações) |
| Amazon S3 | lago sintético, scripts, wheels, artefato semente e candidatos | gateway endpoint sem custo | EFS: custo fixo | — | emulado |
| VPC endpoints (PrivateLink) | saída privada sem NAT | sem rota para a internet (ADR-0002) | NAT Gateway: saída para qualquer destino | [PrivateLink pricing](https://aws.amazon.com/privatelink/pricing/) | EC2 (233 operações); sem linha própria para endpoints |
| CloudWatch (EMF, alarmes, painel) e SNS | métricas, alarmes e avisos (RF-009, RNF-003) | EMF dispensa o endpoint `monitoring` e o `PutMetricData` (ADR-0013) | `PutMetricData` por requisição: um endpoint a mais ligado o dia todo | [CloudWatch pricing](https://aws.amazon.com/cloudwatch/pricing/) | Logs (53) e Metrics (25) emulados; extração de EMF não documentada (lacuna) |
| SSM Parameter Store | contrato v1 da plataforma e entradas da janela | sem custo; lido por data source no plan | `terraform_remote_state`: a role leria o state inteiro | [camadas](https://docs.aws.amazon.com/systems-manager/latest/userguide/parameter-store-advanced-parameters.html) | emulado (48 operações) |
| AWS Budgets | orçamento **diário** com o teto (RNF-102) | gratuito sem ações | só o mensal da conta: avisa tarde | [diário](https://aws.amazon.com/about-aws/whats-new/2020/09/aws-budgets-offer-daily-granularity-cost-usage-budgets) | emulado (26 operações) |
| IAM e STS | roles por função e role de deploy do projeto com ABAC (ADR-0015) | sem custo | `PowerUserAccess` sem condição (hoje) | D-029 | emulado (180 e 11 operações) |

### Stack base (`U/infra/terraform/`, state `01-recomendacao/lab.tfstate`)
- **O que muda nos 13 módulos existentes:**
  - prefixo, tags e exceções de nome (ADR-0014);
  - endpoint `monitoring` fora da lista base (ADR-0013);
  - Budgets mensal trocado por diário (ADR-0013);
  - MWAA fora do stack base (ADR-0007);
  - Serverless sem isolamento de rede e com o artefato semente (ADR-0008 e ADR-0009);
  - task role vinda do módulo da plataforma (ADR-0010);
  - os dois jobs de publicação do Glue (D-051).
- **Módulo `registro-produto` da plataforma**, chamado por caminho relativo. O catálogo do produto é:
  - chave `01-recomendacao`;
  - modelo de origem `us.anthropic.claude-haiku-5-5`, porque o Haiku 5.5 não tem invocação na própria região em `us-east-1`, só por perfil geográfico ou global ([model card](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-haiku-5-5.html));
  - tópicos negados vazios (D-053);
  - um agente, `explicador`, assumido por `ecs-tasks.amazonaws.com`;
  - nenhum alvo e nenhuma tool (E1).

  O ECS usa a role `01-recomendacao-agente-explicador` como task role e acrescenta a ela as políticas de DynamoDB, MemoryDB e SageMaker. O módulo também cria o perfil `01-recomendacao-perfil`, o guardrail `01-recomendacao-guardrail` na versão numerada, o alarme de intervenção e o parâmetro do contrato.
- **Saídas para a janela:** parâmetro `String` `/01-recomendacao/lab/janela/entradas`, com VPC, subnets privadas, chave KMS, bucket, nomes dos jobs, role e imagem do treino, workgroup do Athena e tabela. A janela lê só esse parâmetro (mesmo padrão do contrato da plataforma, ADR-0002 dela).
- **Artefatos de build** (ADR-0008), gerados pelo job de apply antes do Terraform, em `U/build/`:
  - a imagem do serviço, com tag igual ao SHA do commit;
  - o `model.tar.gz` semente, do `train_reranker.py` com semente fixa e `xgboost==1.7.6`;
  - o wheel do cliente Redis para o job Python shell, baixado com hash fixado.

  O Terraform sobe os dois últimos com `source_hash`. Nos testes, os dois vêm de fixtures.
- **Apply em duas passadas no mesmo job:** primeiro com `ecs_desired_count = 0`, que cria o ECR; depois o push da imagem; por fim a segunda passada, com `desired_count = 1` e a tag da imagem. As duas usam a mesma configuração e não usam `-target`.

### Stack da janela (`U/infra/janela-mwaa/`, state `01-recomendacao/janela-mwaa.tfstate`, ADR-0007)
- **MWAA:**
  - nome `p01-recomendacao-lab-mwaa`, porque a API exige letra inicial ([CreateEnvironment](https://docs.aws.amazon.com/mwaa/latest/API/API_CreateEnvironment.html));
  - classe `mw1.micro`: até 3 tarefas simultâneas e 25 DAGs, o que basta para o DAG do lab;
  - Airflow 2.11.2, a última linha 2.x disponível no MWAA. O 3.x exigiria reescrever o DAG, e o 2.8.1 de hoje é mais antigo;
  - `webserver_access_mode = PRIVATE_ONLY`.
- **Log groups `airflow-p01-recomendacao-lab-mwaa-*` criados pelo Terraform**, com KMS e retenção de 7 dias. Se o MWAA criar os próprios, a verificação de sobras pelo prefixo os acusa (R5).
- **Endpoints que só a janela usa:** `sqs`, `kms`, `monitoring` e `airflow.api`, `airflow.env`, `airflow.ops` (exigidos pela [página de rede privada](https://docs.aws.amazon.com/mwaa/latest/userguide/vpc-vpe-create-access.html)), mais `athena`, `glue` e `sagemaker.api`, que o DAG chama. São 9 no total, em 1 AZ.
- **Role de execução:**
  - `StartQueryExecution` só no workgroup do projeto;
  - `StartJobRun` e `GetJobRun` só nos três jobs;
  - `CreateTrainingJob` e `DescribeTrainingJob` em `training-job/01-recomendacao-*`;
  - `iam:PassRole` só para a role de treino;
  - S3: leitura de `dags/` e escrita em `reranker/candidatos/`.
- **Configuração do DAG:** o arquivo `dags/config/01-recomendacao.json` é gerado pelo Terraform a partir das entradas da base. O DAG e os scripts recebem tudo dele, por argumentos (RF-107). Nenhum nome fica escrito no código.
- **Tag `module = "orquestracao-mwaa"`** em todo recurso da janela. A verificação de sobras dela filtra por `project` e `module` ao mesmo tempo, porque a base continua no ar.

### Lote (D-051, ADR-0008)
1. **Gerador sintético** (`gerar_dados_sinteticos.py`, semente fixa, `sintetico: true`): usuários, itens com categoria na lista permitida, estoque e interações.
2. **Athena** extrai o dia com poda de partição (RF-013).
3. **Glue de features** (Spark) grava três saídas:
   - o CSV de treino do re-ranker: `batchScore`, `vectorScore`, `hibrido` e o rótulo sintético;
   - o top-N por usuário, com `inStock` e as compras dos últimos 30 dias;
   - os vetores dos itens.

   Os vetores são sintéticos e determinísticos, e a documentação diz isso: não há aprendizado de embeddings no lab. O `train_model.py` de vetores aleatórios sai.
4. **Treino do XGBoost** no SageMaker, com o container nativo 1.7-1, Spot e `binary:logistic`. A saída vai para `reranker/candidatos/<ds>/`, sem promoção automática.
5. **Glue Python shell, em paralelo:**
   - publica no DynamoDB: um item por usuário, com TTL de 7 dias, `recommendations` e `recentPurchases`;
   - publica no MemoryDB: o índice `item_idx`, se faltar, e os campos `v`, `cat` e `inStock` de cada item. Este job usa uma conexão de rede na subnet privada.

### Serviço (correções da spec)
- **RNF-104:**
  - `category` precisa casar com `^[A-Za-z0-9_]{1,40}$` no controlador; fora disso, 400;
  - o repositório confere de novo e recusa (defesa em profundidade);
  - as categorias do gerador obedecem ao mesmo padrão (PY-05).
- **E8 (`SORTBY` no MemoryDB), resolvida pelo desenho:**
  - a consulta deixa de usar `SORTBY`, que a página do `FT.SEARCH` não lista;
  - os resultados do KNN já vêm ordenados pela distância, segundo a mesma página;
  - entra `LIMIT 0 k`, porque o padrão é `LIMIT 0 10` e hoje o serviço pede até 50 e recebe no máximo 10 (achado deste plano);
  - o `AS vector_score` continua: a gramática da [visão geral](https://docs.aws.amazon.com/memorydb/latest/devguide/vector-search-overview.html) aceita `AS <campo de distância>`.
- **RF-105:**
  - `sessionItemIds` aceita até 10 ids no padrão do `userId`; fora disso, 400;
  - o vetor da consulta é a média, normalizada em L2, dos vetores `v` dos itens da sessão, lidos num único pipeline `HGET`;
  - item que não existe é ignorado;
  - sem nenhum vetor, a busca vetorial não roda e `degradedMode` fica `false`;
  - leitura e busca dividem o mesmo orçamento de 15 ms.
- **RF-106:**
  - os adaptadores lançam `DependencyError` com a dependência, a categoria e a indicação de retentável;
  - o caso de uso decide a degradação e publica a métrica.
- **RF-104 (ADR-0012):**
  - as compras recentes vêm do item do usuário no DynamoDB, no mesmo GetItem;
  - o estoque vem de `inStock`, publicado pelo lote no candidato e no hash do item no MemoryDB;
  - `buildDefaultUseCase` injeta o repositório real;
  - falha dessa fonte segue o RF-006: 200 e `degradedMode: true`.
- **RF-005 (ADR-0008):**
  - o cliente do SageMaker converte os candidatos em linhas CSV, com `Content-Type: text/csv`, e lê um score por candidato, na ordem;
  - quantidade de scores diferente da de candidatos vira erro de contrato, e a resposta cai na heurística;
  - o `modelId` vem da variável de ambiente com a versão do artefato;
  - o contrato JSON legado sai.
- **Contratos:** os arquivos que os testes usam vão de `U/specs/001-aws-recommendation-platform/contracts/` para `U/contratos/`, e a spec legada sai (RNF-110).

### Componente Claude (ADR-0010)
- **Configuração vinda do contrato:** o task definition recebe `BEDROCK_PERFIL_ARN`, `GUARDRAIL_ID` e `GUARDRAIL_VERSAO` do parâmetro `produtos/01-recomendacao`, por data source no plan. Sem esses valores, o explicador não chama o modelo (falha fechada) e devolve `unavailable`, com a categoria `internal_error`.
- **Chamada:** `AnthropicBedrock` no caminho InvokeModel, com `model` igual ao ARN do perfil de aplicação. O padrão de `modelId` do InvokeModel aceita `application-inference-profile` ([API](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_InvokeModel.html)).
- **Guardrail no InvokeModel (E9):**
  - **O cabeçalho chega assinado:** os cabeçalhos `X-Amzn-Bedrock-GuardrailIdentifier` e `X-Amzn-Bedrock-GuardrailVersion` vão por requisição. O SDK `@anthropic-ai/bedrock-sdk` 1.1.2 assina com SigV4 depois de montar os cabeçalhos ("the signature always covers the final, middleware-mutated request", `client.js` do pacote instalado), então eles entram na assinatura.
  - **IAM fecha o caminho sem guardrail:** a role exige `bedrock:GuardrailIdentifier` na condição. Uma chamada sem o guardrail recebe 403, não retentável.
- **O que o guardrail avalia:**
  - os campos de catálogo (título e categoria) vão entre as marcas de entrada do guardrail, com sufixo aleatório por requisição, porque são o ponto de injeção indireta em produção (dado de vendedor);
  - a resposta é lida pelo campo `amazon-bedrock-guardrailAction`. Com `INTERVENED`, o resultado é a categoria `guardrail`, não retentável ([testar guardrail](https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails-test.html)).
- **Saída revisada por `ApplyGuardrail`:**
  - depois da validação, as frases aprovadas passam por um `ApplyGuardrail` com `source=OUTPUT`, porque o guardrail do modelo não alcança parâmetros de tool, onde as frases estão ([blog de segurança da AWS](https://aws.amazon.com/blogs/security/extend-amazon-bedrock-guardrails-to-tool-interactions-using-the-strands-agents-sdk/), 2026-08-27);
  - uma intervenção vira `guardrail`;
  - uma falha da chamada segue as categorias do RF-007;
  - tudo cabe no mesmo orçamento de 2,5 s.
- **Testes:** as respostas gravadas ganham `proveniencia` (RF-111), e entram gravações de intervenção nos dois pontos.

### Identidade de deploy (ADR-0015)
- **O `U/infra/bootstrap/` sai do projeto.** O provedor OIDC é único por conta, e o bucket de state é da conta inteira, então os dois vão para o `infra/conta`, aplicado pelo dono.
- **Roles da D01 no `infra/conta`:**
  - `01-recomendacao-deploy`, confiada aos subjects dos ambientes `aws-lab` e `aws-lab-destroy`;
  - a permissão de criar e alterar recursos tem condição `aws:RequestTag/project` e `aws:ResourceTag/project` igual a `01-recomendacao`;
  - as ações que não aceitam condição de tag ficam numa lista nomeada, limitada por ARN com o prefixo da chave (ADR-0015, com a lista inicial);
  - `01-recomendacao-plan`, só de leitura, para o plan comentado no PR.
- **Variáveis:** os workflows usam `vars.AWS_DEPLOY_ROLE_ARN_01_RECOMENDACAO`, com fallback para `vars.AWS_DEPLOY_ROLE_ARN`. Criar a variável e dar o valor é com o dono.

### Workflows (RNF-101, RNF-103, RNF-106)
| Arquivo | Origem | O que acrescenta ao modelo |
|---|---|---|
| `01-recomendacao-apply.yml` | `harness/modelos/apply.yml` | inputs `enable_serverless_inference` e `explanations_enabled`; `infra.py requisitos` (plataforma no ar); build dos artefatos; apply em duas passadas; prazo com `infra.py registrar` |
| `01-recomendacao-destroy.yml` | `harness/modelos/destroy.yml` | antes do destroy da base, destroy da janela (state vazio é no-op); verificação de sobras pela tag, ignorando a chave KMS em `PendingDeletion` e o serviço ECS `INACTIVE` (ADR-0006), mais o prefixo `airflow-p01-recomendacao`; `infra.py remover` da janela e da base |
| `01-recomendacao-janela-mwaa-apply.yml` | `harness/modelos/apply.yml` | `prazo_horas` com padrão 2 e máximo 3; recusa se a base não está no ar; registra o componente |
| `01-recomendacao-janela-mwaa-destroy.yml` | `harness/modelos/destroy.yml` | `confirm_stack = 01-recomendacao-janela-mwaa`; sobras por `project` e `module = orquestracao-mwaa` |
| `01-recomendacao-roteiro.yml` | novo, no padrão do workflow de evidências da plataforma | `workflow_dispatch` com `parte` igual a `lote` ou `servico`; ambiente `aws-lab`; OIDC só no job; relatório como artefato de 1 dia (ADR-0016) |
| `01-recomendacao-ci.yml` | renomeia `recsys-01-03-ci.yml` | sem o job do Infracost (o gate é o de `seguranca.yml`); SHAs iguais aos dos modelos; `id-token: write` só no job de plan |

Os `recsys-01-03-*.yml` saem, e `apply_workflow` e `destroy_workflow` no `harness/estado.json` passam a apontar para os novos.

### Harness (trabalho do especialista operador-harness)
- **Componente com prazo próprio** (ADR-0007):
  - campo `componentes` no projeto do `estado.json`, com `nome`, `stack`, os dois workflows e `prazo_maximo_horas`;
  - `infra.py registrar --componente`: exige a base no ar e limita o prazo ao menor entre o máximo do componente e o prazo da base menos 1 hora;
  - `estender` com o mesmo limite;
  - `vencidos` dispara o destroy do componente;
  - `remover --componente`.
- **`consome: ["00-plataforma-agentes"]`** no projeto, pelo mecanismo do ADR-0007 da plataforma (comandos `requisitos` e `dependentes`).
- **`gate_custo.py`:** soma as raízes de um mesmo projeto e pesa a raiz de um componente por `prazo_maximo_horas/24`. Sem isso, o MWAA contaria 24 horas e reprovaria o PR.
- **`estado.py validar`:** confere os workflows dos componentes a partir de `verificar`.
- **Testes:** TH-01 a TH-06.

## Decisões técnicas (ADRs)
- [ADR-0007](adr/0007-janela-do-mwaa-como-componente.md): janela do MWAA como stack e componente com prazo próprio (1.4, 1.6, 5.3)
- [ADR-0008](adr/0008-re-ranker-xgboost-semente-e-candidato.md): re-ranker XGBoost com artefato semente reproduzível, candidato sem promoção automática e contrato CSV do container nativo (1.4, 4.4, 5.6)
- [ADR-0009](adr/0009-serverless-sem-isolamento-de-rede.md): Serverless Inference sem isolamento de rede, com proteções substitutas (1.4, 5.6)
- [ADR-0010](adr/0010-claude-pela-plataforma-com-guardrail.md): Claude pelo perfil e pelo guardrail da plataforma, guardrail imposto por IAM e `ApplyGuardrail` na saída (1.4, 2.2, 2.3, 4.3, 4.4, 5.2, 5.3, 5.6)
- [ADR-0011](adr/0011-busca-vetorial-segura-e-falha-visivel.md): categoria permitida, vetor da sessão, `LIMIT` sem `SORTBY` e falha de dependência propagada (2.2, 5.3, 5.6)
- [ADR-0012](adr/0012-compras-recentes-e-estoque-pelo-lote.md): compras recentes e estoque pelos dados do lote, sem serviço novo (4.1, 5.3)
- [ADR-0013](adr/0013-custo-de-um-dia-e-metricas-por-emf.md): teto de um dia, Budgets diário, gate único e métricas por EMF sem o endpoint `monitoring`; substitui a parte de custo do ADR-0002 (5.3, 5.5)
- [ADR-0014](adr/0014-nomes-tags-e-excecoes.md): prefixo `01-recomendacao-`, tags por módulo e exceções de nome versionadas (1.4)
- [ADR-0015](adr/0015-identidade-de-deploy-por-projeto.md): identidade de deploy por projeto no `infra/conta`, com ABAC (1.4)
- [ADR-0016](adr/0016-roteiro-de-demonstracao-com-falhas-injetadas.md): roteiro de demonstração por tarefa ECS avulsa, com falhas injetadas por configuração (1.4, 5.3, 5.5, 5.6)

Curso Skilljar de cada ADR: Claude with Amazon Bedrock e Building with the Claude API (0008, 0010 e 0016); Claude Code in Action (0007, 0013, 0014 e 0015, pela parte de harness e CI); AI Fluency (0011 e 0012, pela proveniência).

## Modelo de ameaças

### Fluxo de dados e fronteiras
| id | Fronteira | Atores e dados |
|---|---|---|
| F1 | GitHub Actions → AWS | role `01-recomendacao-deploy` por OIDC; Terraform; state; imagem e artefatos de build |
| F2 | cliente → ALB interno → serviço | `userId`, `category`, `sessionItemIds`, `explain` (entrada não confiável) |
| F3 | serviço → DynamoDB, MemoryDB e SageMaker | histórico e compras do usuário (dado privado, sintético); consulta vetorial |
| F4 | serviço → Bedrock | prompt com itens, títulos de catálogo (conteúdo não confiável em produção) e sinais; resposta do modelo |
| F5 | lote → S3, DynamoDB e MemoryDB | dados sintéticos, artefato do modelo |
| F6 | serviço e lote → CloudWatch | logs EMF com `requestId`; sem prompt nem texto do modelo |
| F7 | roteiro → serviço | tarefa avulsa com configuração injetada (ADR-0016) |

### STRIDE
| Ameaça | Fronteira | Mitigação | Teste que prova |
|---|---|---|---|
| S: chamada de fora da VPC | F2 | ALB interno; API pública só com opt-in, certificado e TLS 1.3 | TT existentes `rede_privada_por_padrao`, `ecs_api_publica_exige_tls` |
| S: workflow de outro projeto assume a role da D01 | F1 | role por projeto, ABAC; workflows revisados no PR; apply com aprovação | TT-I01; risco residual no ADR-0015 |
| T: injeção no RediSearch pela `category` | F2, F3 | lista de caracteres permitidos no controlador e no repositório | VT-01, VT-02 |
| T: artefato do re-ranker trocado no S3 | F5 | formato nativo do XGBoost (sem pickle); escrita em `reranker/publicado/` só pela role de deploy; `source_hash` no Terraform; leitura só pela role do endpoint | PY-03, TT-E01, TT-E02 |
| R: falha de dependência sem registro | F3, F6 | `DependencyError` com categoria; métrica por dependência; alarme de modo degradado | VT-05, VT-06, VT-15 |
| I: prompt ou resposta do modelo em log | F4, F6 | logger com lista de campos permitidos; trace do guardrail desligado (`X-Amzn-Bedrock-Trace` ausente) | VT-18 |
| I: dado de outro usuário na explicação | F3, F4 | o prompt só tem itens do próprio usuário; os ids da resposta precisam ser exatamente os do pedido | VT existentes do explicador |
| D: `sessionItemIds` enorme ou `limit` alto | F2 | até 10 ids; `limit` de 1 a 50; disjuntores e timeouts | VT-04, VT existentes |
| D: custo esquecido ligado | F1 | prazo de 24 h na base e de até 3 h na janela, destroy em cascata, Budgets diário, mensal da conta | TH-01, TH-02, TT-K01 |
| E: role do serviço amplia acesso ao Bedrock | F4 | só `InvokeModel` no ARN do perfil, com condição de guardrail; só `ApplyGuardrail` no próprio guardrail | TT-B01 |
| E: endpoint Serverless sem isolamento de rede | F3 | container nativo sem código nosso; role sem escrita em S3; payload só com scores e flags | TT-E02; ADR-0009 |

### Fronteiras específicas de LLM
- **Injeção direta:** o usuário não manda texto livre. Os parâmetros são validados por padrão, então não há prompt do usuário.
- **Injeção indireta:** títulos de catálogo entram no prompt.
  - **Detecção:** o filtro de ataque de prompt do guardrail, nos campos marcados.
  - **Contenção estrutural:** a frase só chega ao cliente se passar na validação (ids exatos, 20 a 160 caracteres, sinais com lastro, sem preço ou números) e no `ApplyGuardrail`. O pior caso é uma frase curta e inócua.
- **Tool com efeito colateral:** não existe. `record_explanations` é só o formato da saída (E1).
- **Tríade letal:** o explicador tem dado privado (histórico do usuário) e conteúdo não confiável (catálogo), mas nenhum canal de saída para terceiros: a frase volta só ao mesmo usuário. Se um dia entrar uma tool de saída, o agente precisa ser dividido, como manda a skill da plataforma.
- **Descrição de tool MCP maliciosa:** não se aplica, porque não há gateway nem tool remota.

## Incertezas da spec e como o plano as resolve
| Incerteza | O que a pesquisa mostrou (2026-11-20) | Como o plano resolve |
|---|---|---|
| E8 · `SORTBY` no MemoryDB | A [página do FT.SEARCH](https://docs.aws.amazon.com/memorydb/latest/devguide/vector-search-commands-ft.search.html) lista `RETURN`, `TIMEOUT`, `PARAMS`, `LIMIT` e `COUNT`, sem `SORTBY`; os resultados do KNN vêm ordenados pela distância; o `LIMIT` padrão é 0 10 | **Desenho que não depende dela:** sem `SORTBY`, com `LIMIT 0 k` (VT-03). Achado extra: hoje o serviço recebe no máximo 10 candidatos vetoriais |
| E9 · guardrail no InvokeModel do `AnthropicBedrock` | O [InvokeModel](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_InvokeModel.html) aceita os cabeçalhos de id e versão, e o id sem versão dá erro; o SDK 1.1.2 assina depois de montar os cabeçalhos (código do pacote); o guardrail do modelo não alcança parâmetros de tool ([blog](https://aws.amazon.com/blogs/security/extend-amazon-bedrock-guardrails-to-tool-interactions-using-the-strands-agents-sdk/), 2026-08-27) | **Fonte oficial e código:** cabeçalhos por requisição, impostos por IAM, mais `ApplyGuardrail` na saída (ADR-0010). **Teste na demonstração:** DM-08 captura a resposta real com `amazon-bedrock-guardrailAction` e provoca uma intervenção |
| E13 · isolamento de rede no Serverless | A [página do Serverless](https://docs.aws.amazon.com/sagemaker/latest/dg/serverless-endpoints.html) lista o isolamento de rede entre os recursos sem suporte | **Desenho:** Serverless sem isolamento, com proteções substitutas (ADR-0009); TT reprova a combinação |
| E16 · id do modelo e região | O [model card](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-haiku-5-5.html) traz o id `anthropic.claude-haiku-5-5` e os perfis `us.` e `global.`; não há invocação na região em `us-east-1`; o modelo aceita guardrail no `bedrock-runtime` e foi lançado em 2026-10-07 | **Fonte oficial:** o perfil de aplicação nasce do perfil `us.anthropic.claude-haiku-5-5`, e o ARN chega pelo contrato. O modelo é posterior ao Opus 4.7, então não precisa do formulário de caso de uso (D-034) |
| Regra de nome do MWAA | `[a-zA-Z][0-9a-zA-Z-_]*`, de 1 a 80 caracteres ([CreateEnvironment](https://docs.aws.amazon.com/mwaa/latest/API/API_CreateEnvironment.html)) | **Fonte oficial:** exceção `p01-recomendacao-lab-mwaa` (ADR-0014) |
| Disparo do DAG com webserver privado | `InvokeRestApi` funciona pela internet com `airflow:InvokeRestApi` e `airflow:CreateWebLoginToken` no recurso de role do Airflow, com timeout de 10 s ([REST API](https://docs.aws.amazon.com/mwaa/latest/userguide/access-mwaa-apache-airflow-rest-api.html)) | **Fonte oficial:** o roteiro liga e dispara o DAG por essa chamada e consulta o estado em intervalos (ADR-0016). Lacuna do Floci: sem `InvokeRestApi`; lá o FL usa o token de login web |
| Formato do artefato do XGBoost | A partir do 1.3-1, o container nativo grava com `Booster.save_model`, sem pickle ([XGBoost](https://docs.aws.amazon.com/sagemaker/latest/dg/xgboost-how-to-use.html)) | **Fonte oficial:** a semente usa o mesmo formato (PY-03). O carregamento de um modelo treinado fora pelo container nativo não está documentado e fica no DM-06 (R3) |

## Estratégia de testes
- **Unitários do serviço (VT):** Vitest, com os 39 testes de hoje mais os VT-01 a VT-18 desta tabela. Clientes da AWS simulados; para o RF-106, o adaptador é o real, sobre o cliente simulado.
- **Lote (PY):** `unittest` sobre os scripts, o DAG carregado no Airflow 2.11 (sem rede) e o treino local da semente.
- **Infraestrutura (TT, ST):**
  - `terraform test` com `mock_provider "aws"` e `command = plan` nas três raízes de teste: base, janela e `infra/conta`;
  - o teste de tags começa pelo `harness/modelos/tags.tftest.hcl`;
  - checkov e tflint sem achado alto;
  - regras estáticas em `static_rules.py`.
- **Componente Claude:** só respostas gravadas (D-006), com `proveniencia` em cada uma (RF-111):
  - sucesso;
  - retentativa por validação;
  - sem `tool_use`;
  - `refusal`, 429, 400 e timeout;
  - disjuntor;
  - intervenção do guardrail no InvokeModel e no `ApplyGuardrail`;
  - 403 por falta do guardrail.
- **Harness (TH):** testes por assunto em `harness/testes/` (D-043).
- **Integração (FL):** só com o projeto completo. Base e janela no Floci, com o MWAA no modo real (DAG carregado) e os overrides das lacunas já evidenciadas no ADR-0006. Relatório em `testing/reports/`.
- **Demonstração (DM):** evidência tirada da AWS real pelo roteiro, revisada pelo dono antes de entrar no repositório (5.5).

### Matriz regra → teste
Ids: VT (Vitest), PY (unittest do lote), TT (`terraform test`), ST (`static_rules.py`), TH (testes do harness), FL (Floci), DM (demonstração), ES (esteira `seguranca.yml`). O `matriz.md` com a coluna de tarefa nasce na fase tarefas.

| Regra | Teste(s) | O que o teste afirma |
|---|---|---|
| Art. I · código só em implementar | TH (existente: `gate_sdd`, `pre-commit`) | edição em `U/` bloqueada antes de implementar |
| Art. III · cobertura | TH (existente, matriz) | todo RF e RNF aparece em `matriz.md` com teste |
| Art. IV · nada público | TT existentes `rede_privada_por_padrao`, `rede_api_publica_exige_opt_in`, `s3_golden_dataset` | ALB interno, sem IP público, buckets bloqueados |
| Art. IV · criptografia | TT existentes `kms_chave_da_plataforma`, `memorydb_tls`; TT-K03 | KMS em tudo, inclusive na janela; TLS no MemoryDB; `aws:SecureTransport` |
| Art. IV · menor privilégio | TT existentes; TT-B01, TT-E02, TT-J01, TT-I01 | sem `*` com `*`; Bedrock só no perfil; endpoint só lê o artefato; MWAA só nos jobs do projeto; deploy com ABAC |
| Art. IV · segredos fora | ES (gitleaks); ST-06 | nenhum segredo nem ARN do Bedrock escrito à mão |
| Art. IV · achado alto bloqueia | ES | checkov, tflint, Trivy, Semgrep e zizmor sem alto |
| Art. V · sem custo fixo ocioso | TT-K02, ST-07 | sem NAT; endpoints da base só os 5 da lista; nenhum MWAA na base |
| Art. V · Budgets diário com o teto | TT-K01, TH-06 | `time_unit = "DAILY"`, `limit_amount = var.teto_diario_usd`, igual ao `estado.json` e ao README; nenhum Budgets mensal no stack |
| Art. V · custo do PR ≤ teto | TH-04; ES (Infracost) | raízes somadas, janela pesada pelo prazo, total ≤ teto |
| Art. V · destroy com prazo, cascata e sobras | TH-01, TH-02, TH-03; `estado.py validar`; DM-09; FL-04 | prazo da janela ≤ base − 1 h; destroy da base derruba a janela antes; zero recurso com a tag; nenhum log group com o prefixo do MWAA |
| Art. VI · tags | TT-T01 | todo recurso tagueável com `project=01-recomendacao`, `module` em kebab, `managed-by=terraform` |
| Art. VI · prefixo | TT-T02, ST-04 | nome com `01-recomendacao-` ou exceção da lista, com ADR |
| Art. VI · logs, métricas e alarmes | TT existente `monitoramento_e_orcamento`; TT-A01; VT-15 | 7 alarmes com SNS, mais o de intervenção; EMF no formato certo |
| Art. VI · state remoto com lock | ST (existente: backend) | backend `s3` parcial com `use_lockfile` nas duas raízes |
| Art. VI · README com até 5 passos | ST-08 | `U/README.md` com no máximo 5 passos e o teto diário |
| Art. VII · componente Claude | VT-10 a VT-13, VT-17, VT existentes do explicador | ver RF-007, RF-110 e RF-111 |
| Art. VIII · sintético e proveniência | PY-07, VT-14; revisão (RNF-111) | semente fixa e `sintetico: true`; catálogo fictício |
| RF-001 · API | VT existente (contrato) | 400 e 200 como no contrato |
| RF-002 · candidatos em paralelo | VT existente `hybrid-recommendation` | as duas chamadas começam antes de qualquer uma terminar |
| RF-003 · junção | VT existente `candidate-merger` | item nas duas listas sai uma vez, `hybrid` |
| RF-004 · filtros | VT existentes; VT-07 | inelegível nunca aparece, também com o `buildDefaultUseCase` |
| RF-005 · re-ranking CSV com degradação | VT existente `fallback-sagemaker-degradation`; VT-09, VT-16; DM-06 | heurística no erro; CSV na ordem; contagem errada vira heurística; endpoint real responde |
| RF-006 · sem 500 | VT existentes `fallback-*`; VT-08 | 200 em toda linha da matriz, inclusive com falha do estoque |
| RF-007 · explicação | VT existentes do explicador e da integração | as regras do RF-007 |
| RF-008 · saúde | VT existente; VT-19 | verificadores injetados no servidor de produção: uma dependência fora dá `DEGRADED` |
| RF-009 · logs e métricas | VT-15 | uma linha EMF por contagem, no namespace `Ecommerce/Recommendations` |
| RF-010 · DAG | PY-06 | carrega no Airflow 2.11, com a ordem do RF-010 e o treino do candidato |
| RF-011 · DynamoDB | PY existente (contrato); PY-04; TT existente `dynamodb_criptografado` | item com TTL de 7 dias, `recentPurchases` e `inStock` |
| RF-012 · MemoryDB | PY existente (contrato); PY-05 | índice HNSW de 128 dimensões; `cat` permitido; `inStock` |
| RF-013 · features | PY existente `test_glue_transformations`; TT existentes | pesos e partições; KMS e logs |
| RF-014 · treino | PY-03; DM-07 | XGBoost determinístico em formato nativo; o candidato do DAG prediz igual à semente, dentro de 1e-6 |
| RF-015 · Floci | FL-01 a FL-05 | apply, asserts, destroy, relatório, lacunas com evidência |
| RF-016 · execução local | VT (o próprio `npm test`) | suíte roda sem nuvem |
| RF-017 · documentação e publicação | ST-05, ST-08; revisão | página e post AWS publicados; nenhum link para o post GCP (D-054) |
| RF-104 · 30 dias no serviço real | VT-07, VT-08 | item comprado há 10 dias some; fonte fora dá 200 e `degradedMode` |
| RF-105 · vetor da sessão | VT-04 | vetor diferente de zero com dois itens; sem sessão, repositório não chamado; mais de 10 ids, 400 |
| RF-106 · falha visível | VT-05, VT-06 | adaptador real com cliente que lança: `degradedMode` e métrica |
| RF-107 · lote coerente | PY-01, TT-G01, TT-G02 | nenhum nome fixo; todo `job_name` do DAG tem `aws_glue_job`; publicações em Python shell |
| RF-108 · roteiro | DM-01 a DM-05; TT-R01 | quatro passos com `requestId`; p95 sem explicação; task definition do roteiro sem permissão extra |
| RF-109 · re-ranker aceito | TT-E01, TT-E03; DM-06 | Serverless com isolamento reprova; `model_data_url` aponta para a semente; `InService` |
| RF-110 · plataforma | TT-B01, TT-B02, ST-06, VT-10 a VT-12, VT-17; DM-08 | role só no perfil e no guardrail do contrato; nada escrito à mão; intervenção vira `guardrail` sem retentativa |
| RF-111 · proveniência das gravadas | VT-13 | gravação sem `proveniencia` reprova |
| RNF-001 · segurança | itens do Art. IV | — |
| RNF-002 · custo | itens do Art. V | — |
| RNF-003 · operação | itens do Art. VI | — |
| RNF-004 · desempenho | TT existente `monitoramento_e_orcamento`; DM-05 | alarme de p95 de 0,060 s; p95 real medido |
| RNF-005 · testes | CI (`01-recomendacao-ci.yml`) | todas as suítes verdes |
| RNF-006 · CI e cadeia | TH-05; ES (zizmor) | SHAs únicos; permissões mínimas |
| RNF-007 · proveniência | VT-14, PY-07; revisão | sintético e fontes |
| RNF-008 · fonte única | ST-02, ST-03 | ver RNF-110 |
| RNF-101 · workflows do harness | TH (existentes) e `estado.py validar` | apply e destroy completos e iguais aos modelos |
| RNF-102 · teto diário | TT-K01, TH-06 | acima |
| RNF-103 · gate único | ST-01 | nenhum workflow da unidade roda `infracost` |
| RNF-104 · sem injeção | VT-01, VT-02, VT-03 | 400 com `}`, `\|`, `*`, `@` ou `)`; repositório não chamado; consulta sem `SORTBY` e com `LIMIT` |
| RNF-105 · deploy com ABAC | TT-I01 | dois subjects; nenhuma ação ampla sem condição de tag, fora da lista nomeada |
| RNF-106 · cadeia do harness | TH-05 | `test_um_sha_por_action` e `test_token_oidc_nunca_no_nivel_do_workflow` verdes |
| RNF-107 · tags | TT-T01; ES (política do Infracost) | acima |
| RNF-108 · prefixo | TT-T02, ST-04 | acima |
| RNF-109 · catálogo fictício | VT-14 | títulos contra a lista de nomes fictícios |
| RNF-110 · fonte única | ST-02, ST-03 | sem `recsys`, `US$ 10` e "FIXED" fora do histórico; `U/CLAUDE.md` com menos de 60 linhas, apontando para `specs/01-recomendacao/`; spec legada removida |
| RNF-111 · posts com fonte | revisão na fase publicar | checklist de proveniência no relatório da fase verificar |

**Testes novos, por id** (a fase tarefas transforma cada um em tarefa com teste vermelho):
- **VT:**
  - VT-01: categoria proibida dá 400;
  - VT-02: o repositório recusa a categoria;
  - VT-03: forma da consulta `FT.SEARCH`;
  - VT-04: vetor da sessão;
  - VT-05: falha real do DynamoDB;
  - VT-06: falha real do Redis;
  - VT-07: regra dos 30 dias no serviço real;
  - VT-08: falha do estoque;
  - VT-09: CSV do re-ranker;
  - VT-10: cabeçalhos do guardrail e falha fechada;
  - VT-11: intervenção no InvokeModel;
  - VT-12: intervenção ou erro do `ApplyGuardrail`;
  - VT-13: `proveniencia`;
  - VT-14: catálogo fictício;
  - VT-15: EMF;
  - VT-16: `modelId` da configuração;
  - VT-17: marcas de entrada do guardrail;
  - VT-18: logger sem prompt nem texto do modelo;
  - VT-19: saúde com verificadores reais.
- **PY:**
  - PY-01: nome fixo;
  - PY-03: semente determinística em formato nativo;
  - PY-04: item do DynamoDB;
  - PY-05: item do MemoryDB;
  - PY-06: DAG no 2.11;
  - PY-07: gerador sintético.
- **TT:**
  - TT-T01: tags;
  - TT-T02: prefixo;
  - TT-K01: Budgets;
  - TT-K02: endpoints da base;
  - TT-K03: janela;
  - TT-B01: IAM do Bedrock;
  - TT-B02: contrato por data source;
  - TT-E01: semente;
  - TT-E02: role do endpoint;
  - TT-E03: Serverless com isolamento reprova;
  - TT-G01: jobs do DAG;
  - TT-G02: Python shell;
  - TT-J01: role do MWAA;
  - TT-A01: alarmes;
  - TT-R01: roteiro;
  - TT-I01: role de deploy.
- **ST:**
  - ST-01: Infracost;
  - ST-02: termos antigos;
  - ST-03: `U/CLAUDE.md`;
  - ST-04: lista de exceções;
  - ST-05: sem post GCP no site;
  - ST-06: ARN do Bedrock;
  - ST-07: custo fixo citado em ADR;
  - ST-08: README.
- **TH:**
  - TH-01: prazo do componente;
  - TH-02: destroy em cascata;
  - TH-03: validar componente;
  - TH-04: gate de custo;
  - TH-05: cadeia;
  - TH-06: teto igual nos três lugares.
- **FL:**
  - FL-01: base;
  - FL-02: janela com DAG carregado;
  - FL-03: Claude contra o stub;
  - FL-04: destroy em cascata;
  - FL-05: relatório.
- **DM:**
  - DM-01: híbrida;
  - DM-02: explicação na 1ª tentativa;
  - DM-03: explicação em fallback;
  - DM-04: degradado;
  - DM-05: p95;
  - DM-06: endpoint `InService`;
  - DM-07: DAG ponta a ponta;
  - DM-08: guardrail real;
  - DM-09: sobras;
  - DM-10: custo real do dia ≤ teto, no Cost Explorer.

## Cloud comparativa (GCP, D-007)
O design doc continua em `U/posts/gcp.md`, no repositório, e **não é publicado no site** (D-054, ST-05). Mapeamento a manter no documento:

| AWS | GCP | O que muda |
|---|---|---|
| ECS Fargate + ALB interno | Cloud Run com ingress interno + balanceador interno | Cloud Run escala a zero; o lab da GCP não teria a task fixa |
| DynamoDB | Firestore ou Bigtable | Bigtable tem custo por nó; Firestore é o equivalente sem custo fixo |
| MemoryDB (busca vetorial) | Memorystore for Valkey com busca vetorial | sem a durabilidade transacional do MemoryDB |
| SageMaker Serverless (XGBoost) | Cloud Run com o modelo XGBoost | evita a réplica mínima de um endpoint do Vertex AI; o escalonamento a zero do Vertex AI fica a confirmar no design doc, com fonte |
| SageMaker Training | Vertex AI Training (custom job) | equivalente direto |
| Glue + Athena + Lake Formation | Dataproc Serverless + BigQuery + Dataplex | o BigQuery cobre consulta e catálogo |
| MWAA | Cloud Composer | mesma ideia de janela curta, com custo mínimo do ambiente |
| Bedrock (Claude) + perfil de inferência | Claude no Vertex AI, com rótulos por requisição | custo por rótulo no lugar do perfil |
| Bedrock Guardrails | Model Armor | filtros equivalentes, sem a condição de IAM do guardrail |
| VPC endpoints | Private Google Access e Private Service Connect | sem custo por hora para o Private Google Access |
| KMS, CloudWatch, Budgets | Cloud KMS, Cloud Monitoring e Logging, budgets do Cloud Billing | equivalentes diretos |

## Custo do lab (um dia de execução)
Premissas do dia de demonstração:
- base no ar por 24 h e janela do MWAA por até 3 h (o padrão é 2 h);
- até 2.000 requisições sem explicação e 200 com `explain=true` (o roteiro usa cerca de 10; o resto é margem para ensaios);
- 1.500 tokens de entrada e 400 de saída por explicação, com retentativa no pior caso (dobro);
- guardrail no pior caso: o prompt inteiro avaliado (6 unidades de texto), mais 1 na saída e 2 no `ApplyGuardrail`;
- até 2 execuções do DAG;
- até 10 métricas EMF, 8 alarmes e 1 painel;
- 100 MB de logs.

Região `us-east-1`. Consultas de preço em 2026-11-20. Sem camada gratuita, que é da conta.

| Componente | Custo de 24 h (US$) | Fonte da estimativa |
|---|---|---|
| **Base** | | |
| 5 endpoints de interface × 24 h | 5 × 0,01 × 24 = **1,200** | [PrivateLink](https://aws.amazon.com/privatelink/pricing/): US$ 0,01 por hora por ENI (exemplo da página em us-east-1) |
| ALB: horas | 0,0225 × 24 = **0,540** | [ELB](https://aws.amazon.com/elasticloadbalancing/pricing/) |
| ALB: LCU (reserva de 0,25 LCU em média) | 0,25 × 0,008 × 24 = **0,048** | mesma página |
| MemoryDB `db.t4g.small`, 1 nó | 0,05 × 24 = **1,200** (limite superior) | a [página do MemoryDB](https://aws.amazon.com/memorydb/pricing/) não exibiu a tabela na consulta; valor do ADR-0002 (2026-11-18). Confirmação pelo Infracost (R6) |
| Fargate: 1 task (0,5 vCPU, 1 GB, x86) | (0,5 × 0,04048 + 1 × 0,004446) × 24 = **0,592** | [Fargate](https://aws.amazon.com/fargate/pricing/): US$ 0,000011244 por vCPU-segundo e US$ 0,000001235 por GB-segundo |
| Fargate: 4 tarefas do roteiro de 2 min | **0,003** | mesma página (mínimo de 1 minuto) |
| KMS: 1 chave | 1,00 × 24/730 = **0,033** | [KMS](https://aws.amazon.com/kms/pricing/) |
| KMS: requisições | **0,030** | mesma página (US$ 0,03 por 10.000) |
| CloudWatch: 8 alarmes | 8 × 0,10 × 24/730 = **0,026** | [CloudWatch](https://aws.amazon.com/cloudwatch/pricing/) |
| CloudWatch: 1 painel | 3,00 × 24/730 = **0,099** | mesma página |
| CloudWatch: até 10 métricas EMF | 10 × 0,30 × 24/730 = **0,099** | mesma página |
| CloudWatch Logs: 0,1 GB | 0,1 × 0,50 = **0,050** | mesma página |
| SageMaker Serverless: cerca de 2.200 invocações de 0,1 s a 2 GB | **0,010** | [SageMaker](https://aws.amazon.com/sagemaker/ai/pricing/): US$ 0,00004 por segundo a 2 GB (exemplo 13) |
| S3, DynamoDB on-demand, ECR, SNS e Athena | **0,030** (reserva) | volumes de KB a MB |
| Claude Haiku 5.5: 200 explicações, pior caso | 200 × 2 × (1.500 × 0,11 + 400 × 0,55)/10⁶ = **0,154** | [preços da Anthropic](https://platform.claude.com/docs/en/about-claude/pricing): US$ 0,10 e 0,50 por MTok, mais 10% no endpoint regional (perfil `us.`). A página do Bedrock não exibiu a linha do Haiku 5.5; confirmação na tarefa de verificação |
| Guardrails: 200 × 9 unidades | 200 × 9 × 0,25/1.000 = **0,450** | [Bedrock](https://aws.amazon.com/bedrock/pricing/): filtro de conteúdo US$ 0,15 e PII US$ 0,10 por 1.000 unidades de até 1.000 caracteres |
| Budgets diário | **0,000** | [Budgets](https://aws.amazon.com/aws-cost-management/aws-budgets/pricing/) |
| **Subtotal da base** | **4,564** | |
| **Janela do MWAA (até 3 h)** | | |
| MWAA: ambiente, 3 h | 0,49 × 3 = **1,470** (limite superior: preço do `mw1.small`) | [MWAA](https://aws.amazon.com/managed-workflows-for-apache-airflow/pricing/): US$ 0,49/h no `mw1.small`; a página não traz o `mw1.micro`, que é menor. Confirmação pelo Infracost (R6) |
| 9 endpoints de interface × 3 h | 9 × 0,01 × 3 = **0,270** | [PrivateLink](https://aws.amazon.com/privatelink/pricing/) |
| Glue de features (2 DPU, 3 min, 2 execuções) | 2 × 0,05 × 0,44 × 2 = **0,088** | [Glue](https://aws.amazon.com/glue/pricing/): US$ 0,44 por DPU-hora |
| Glue Python shell (2 jobs, 0,0625 DPU, 1 min, 2 execuções) | **0,002** | mesma página |
| Treino do XGBoost (`ml.m5.large`, 6 min, 2 execuções, sem o desconto do Spot) | 0,115 × 0,1 × 2 = **0,023** | a [página do SageMaker](https://aws.amazon.com/sagemaker/ai/pricing/) não exibiu a tabela de treino; US$ 0,115/h é o preço público conhecido, a confirmar pelo Infracost (R6) |
| Athena e logs do MWAA | **0,011** | [Athena](https://aws.amazon.com/athena/pricing/): US$ 5 por TB; volume de KB |
| **Subtotal da janela** | **1,864** (com 2 h: 1,284) | |
| **Total estimado do dia** | **6,428** | |

- **Teto diário: US$ 7,10** (o total mais cerca de 10%, como na plataforma), aprovado pelo dono (P01-P5, D-056). Gravado em `teto_diario_usd` no `harness/estado.json`. Ele vai para o README e para o `aws_budgets_budget` diário na implementação, e só vale com a aprovação do plano e a resposta à P01-P5.
  - A alternativa sem margem é US$ 6,50, o total arredondado para a dezena de centavo seguinte, com 1% de folga. Com ela, o Budgets diário avisaria por ruído, porque os volumes são premissas.
  - O Budgets diário filtra pela tag `user:project`. O Claude é cobrado pelo AWS Marketplace, sob o provedor do modelo ([model card](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-haiku-5-5.html)), e pode não aparecer no filtro da tag (R7). O limite mensal da conta cobre esse caso.
- **Peso no mês (D-022):**
  - uma demonstração da D01 com a plataforma soma cerca de US$ 7,60 na estimativa (6,43 + 1,08 + 0,09 do ensaio) e US$ 8,30 nos tetos (7,10 + 1,20);
  - isso é 42% do limite de US$ 20;
  - duas demonstrações da D01 no mesmo mês passariam de 80%;
  - demonstrações da D02 e da D03 no mesmo mês dividem o que sobra (R8).
- **Maiores linhas e alavancas:** endpoints de interface (1,20), MemoryDB (1,20), MWAA (até 1,47) e ALB (0,59).
  - **Já aplicada neste plano:** sem o endpoint `monitoring` na base (EMF, ADR-0013), economia de US$ 0,24 por dia.
  - **Avaliada e fora deste plano:** MemoryDB com o motor Valkey, que tem preço menor por nó. O suporte à busca vetorial nesse motor não foi confirmado.
- **Fica cobrando depois do destroy?**
  - chave KMS em exclusão: US$ 0, porque a página do KMS diz que não há cobrança por chave agendada para exclusão;
  - log groups: criados pelo Terraform e removidos no destroy. Os do MWAA são pré-criados, e a verificação de sobras confere o prefixo;
  - objetos de state (dois) no bucket da conta: alguns KB, abaixo de US$ 0,01 por mês;
  - registros de jobs de treino e do Glue: sem custo;
  - nenhum snapshot: MemoryDB com `snapshot_retention_limit = 0`.
- **Workflows de destroy:**
  - base: `.github/workflows/01-recomendacao-destroy.yml`, stack `01-recomendacao-lab`;
  - janela: `.github/workflows/01-recomendacao-janela-mwaa-destroy.yml`, stack `01-recomendacao-janela-mwaa`.

## Riscos e lacunas do emulador
| id | Risco | Probabilidade e impacto | O que fazer |
|---|---|---|---|
| R1 | O re-ranker Serverless quente não cabe no timeout de 35 ms | média; o serviço fica em heurística o tempo todo, com `degradedMode: true` | DM-05 mede o p95 quente do endpoint. Se passar de 35 ms, as saídas são concorrência provisionada (custo), endpoint em instância (custo) ou timeout maior (SLO). Todas mudam custo ou produto e viram pergunta ao dono, com o número medido |
| R2 | O cold start do Serverless no primeiro pedido | alta; o primeiro pedido cai na heurística | É o comportamento certo (RF-006). O roteiro aquece o endpoint antes do passo 1 e registra o cold start como dado |
| R3 | O container nativo do XGBoost não carrega um modelo treinado fora dele | baixa; o endpoint falha no apply | Mesmo formato (`save_model`) e mesma versão (1.7). O apply falha cedo, antes da gravação (DM-06). Se falhar, a semente passa a ser treinada por um job de treino no próprio apply (ADR-0008, alternativa B) |
| R4 | `amazon-bedrock-guardrailAction` não chega pelo SDK no objeto da resposta | baixa | O explicador lê o corpo cru pela porta do cliente; sem o campo e sem `tool_use`, a resposta cai na validação, e as duas tentativas terminam em `unavailable`. DM-08 captura o formato real |
| R5 | O MWAA cria log groups próprios fora do Terraform | média; sobra sem tag | Pré-criar os nomes no Terraform; verificação de sobras pelo prefixo no destroy (DM-09) |
| R6 | Preços sem tabela na consulta (MemoryDB, `mw1.micro`, treino) | média; teto diferente do real | Os valores usados são limites superiores. O Infracost do primeiro PR de implementação confirma; se o dia passar do teto, a mudança vai ao dono |
| R7 | O custo do Claude (AWS Marketplace) não entra no Budgets filtrado por tag | média; o aviso diário subestima | É cerca de 2% do teto; o Budgets mensal da conta não filtra por tag. DM-10 confere no Cost Explorer |
| R8 | Várias demonstrações no mesmo mês passam de US$ 20 | média | Cada demonstração consome uma fatia conhecida (42% para a D01). O planejamento do mês é do dono |
| R9 | O módulo `registro-produto` da plataforma ainda não existe | alta no tempo; bloqueia o RF-110 | As tarefas do RF-110 dependem das tarefas do módulo na `00-plataforma-agentes`. O módulo dá `InvokeGateway` ao agente mesmo sem alvo; sem `permit` no Cedar, toda chamada ao gateway é negada. Sugestão para uma versão menor da plataforma: omitir `InvokeGateway` quando não há alvo |
| R10 | O perfil geográfico `us.` roteia para regiões dos EUA além de `us-east-1` | baixa | A política do módulo cobre os modelos de origem do perfil, com a condição `bedrock:InferenceProfileArn` (plano da plataforma) |
| R11 | O Floci não tem `InvokeRestApi`, não aplica guardrail, não sobe o endpoint e não documenta EMF | certa | Lacunas com evidência na documentação: FL usa o token de login web para o DAG; o resto é provado por TT, VT e DM |
| R12 | O Airflow 2.11.2 não está na lista do Floci | média | Não muda o código correto (ADR-0006). Registrar como lacuna com evidência e usar a versão mais próxima só no override do harness |

## Trabalho que o plano cria (entra em `tasks.md` depois da aprovação)
- **T000 (operador-harness):** mover os ADRs de `specs/01-recomendacao/adr/` para `U/adr/`, com redirecionamentos.
- **Harness:**
  - `componentes` e `consome` no `estado.json`;
  - `infra.py` com componente;
  - `gate_custo.py` com soma e peso;
  - `validar`;
  - TH-01 a TH-06;
  - correções do RNF-106.
- **`infra/conta` (aplicado pelo dono):** provedor OIDC, bucket de state e roles da D01 (ADR-0015).
- **Base:** tags, prefixo, exceções, Budgets diário, endpoints, semente e Serverless, jobs do Glue, consumo da plataforma, task role, EMF e saídas da janela.
- **Janela:** raiz nova, role, endpoints, log groups e configuração do DAG.
- **Serviço:** RNF-104, RF-104, RF-105, RF-106, RF-005 (CSV), RF-008 (verificadores), RF-110, RF-111 e RNF-109.
- **Lote:** gerador, features, `train_reranker.py`, as duas publicações e o DAG no 2.11.
- **Workflows:** os seis da tabela, os SHAs e a remoção dos `recsys-01-03-*`.
- **Documentação:** `U/CLAUDE.md` curto, spec legada fora, contratos em `U/contratos/`, README com o teto, posts sem "US$ 10/mês".
- **Verificação:** FL e o roteiro na AWS real, com o relatório.
- **Publicação:** só a página e o post AWS (D-054), e só com a aprovação do dono.

## Perguntas ao dono
Registro (o dono responde no chat, D-041).

| id | pergunta | bloqueia | opções | recomendação |
|---|---|---|---|---|
| P01-P5 (teto diário da recomendação) | ~~US$ 7,10 ou US$ 6,50?~~ **Respondida (D-056):** US$ 7,10. | — | — | — |
| Aprovação do plano (D-033) | ~~O plano da D01 está aprovado?~~ **Respondida (D-056):** aprovado pelo dono em 2026-11-20. | — | — | — |

## Fontes (consulta em 2026-11-20)
Além das fontes da spec (seção "Proveniência"):

| Afirmação | Fonte | Data da fonte | Certeza |
|---|---|---|---|
| `FT.SEARCH` aceita `RETURN`, `TIMEOUT`, `PARAMS`, `LIMIT` e `COUNT`, sem `SORTBY`; `LIMIT 0 10` por padrão; KNN ordenado pela distância | [FT.SEARCH (MemoryDB)](https://docs.aws.amazon.com/memorydb/latest/devguide/vector-search-commands-ft.search.html) | sem data | confirmado |
| A cláusula KNN aceita `AS <campo de distância>`; o filtro de tag é `@campo:{tag}`; a página não traz regras de escape | [Vector search overview](https://docs.aws.amazon.com/memorydb/latest/devguide/vector-search-overview.html) | sem data | confirmado |
| Os cabeçalhos de guardrail do InvokeModel; o id sem versão dá erro; `modelId` aceita perfil de aplicação | [InvokeModel](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_InvokeModel.html) | sem data | confirmado |
| `amazon-bedrock-guardrailAction` com `INTERVENED` ou `NONE` no corpo do InvokeModel | [Test your guardrail](https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails-test.html) | sem data | confirmado; formato com mensagens da Anthropic: DM-08 |
| O SDK assina depois de montar os cabeçalhos da requisição | `@anthropic-ai/bedrock-sdk` 1.1.2, `client.js` (pacote instalado em `U/node_modules`) | versão 1.1.2 | confirmado pelo código |
| O guardrail do modelo não alcança parâmetros e resultados de tool | [AWS Security Blog](https://aws.amazon.com/blogs/security/extend-amazon-bedrock-guardrails-to-tool-interactions-using-the-strands-agents-sdk/) | 2026-08-27 | confirmado |
| Haiku 5.5: id, perfis `us.` e `global.`, sem invocação na região em `us-east-1`, guardrail no `bedrock-runtime`, lançado em 2026-10-07, cobrado pelo AWS Marketplace | [Model card](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-haiku-5-5.html) | sem data | confirmado |
| Haiku 5.5 a US$ 0,10 e 0,50 por MTok até 100 mil tokens; 10% a mais em endpoint regional | [Pricing (Claude)](https://platform.claude.com/docs/en/about-claude/pricing) | sem data | confirmado; preço do Bedrock a confirmar |
| Guardrails: US$ 0,15 (conteúdo) e 0,10 (PII) por 1.000 unidades de até 1.000 caracteres | [Bedrock pricing](https://aws.amazon.com/bedrock/pricing/) | sem data | confirmado |
| Nome do MWAA `[a-zA-Z][0-9a-zA-Z-_]*`; classes válidas incluem `mw1.micro` | [CreateEnvironment](https://docs.aws.amazon.com/mwaa/latest/API/API_CreateEnvironment.html) | sem data | confirmado |
| `mw1.micro`: 25 DAGs, 3 tarefas simultâneas, sem auto scaling | [Environment class](https://docs.aws.amazon.com/mwaa/latest/userguide/environment-class.html); [blog](https://aws.amazon.com/blogs/big-data/introducing-amazon-mwaa-micro-environments-for-apache-airflow) | 2024-11-19 (blog) | confirmado; preço não encontrado |
| `mw1.small` a US$ 0,49/h; MWAA sem mínimo; cobrança por segundo | [MWAA pricing](https://aws.amazon.com/managed-workflows-for-apache-airflow/pricing/) | sem data | confirmado pelos exemplos |
| Versões do Airflow no MWAA, incluindo 2.11.2 e 3.3.1 | [Airflow versions](https://docs.aws.amazon.com/mwaa/latest/userguide/airflow-versions.html) | sem data | confirmado |
| `InvokeRestApi` com webserver privado, pela internet, com `airflow:InvokeRestApi` e `airflow:CreateWebLoginToken` | [Airflow REST API](https://docs.aws.amazon.com/mwaa/latest/userguide/access-mwaa-apache-airflow-rest-api.html) | sem data | confirmado |
| Endpoints exigidos pelo MWAA privado: S3 (gateway), `monitoring`, `logs`, `sqs`, `kms` e os três do Airflow | [Private routing](https://docs.aws.amazon.com/mwaa/latest/userguide/vpc-vpe-create-access.html) | sem data | confirmado |
| O XGBoost 1.3-1 em diante grava com `Booster.save_model`, sem pickle | [XGBoost how to use](https://docs.aws.amazon.com/sagemaker/latest/dg/xgboost-how-to-use.html) | sem data | confirmado |
| Fargate por segundo, com mínimo de 1 minuto | [Fargate pricing](https://aws.amazon.com/fargate/pricing/) | sem data | confirmado |
| ALB a US$ 0,0225/h e US$ 0,008 por LCU-hora; endpoint de interface a US$ 0,01/h por ENI | [ELB pricing](https://aws.amazon.com/elasticloadbalancing/pricing/); [PrivateLink pricing](https://aws.amazon.com/privatelink/pricing/) | sem data | confirmado pelos exemplos |
| Floci: MWAA real ou mock, sem `InvokeRestApi`; MemoryDB em Valkey 8; Bedrock com guardrails e perfis no controle; Runtime com `InvokeModel` sempre em stub e guardrail fora de escopo | [MWAA](https://floci.io/floci/services/mwaa/), [MemoryDB](https://floci.io/floci/services/memorydb/), [Bedrock](https://floci.io/floci/services/bedrock/), [Bedrock Runtime](https://floci.io/floci/services/bedrock-runtime/) | sem data | confirmado |
