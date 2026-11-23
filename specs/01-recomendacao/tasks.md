# Tarefas: Recomendação de e-commerce (plataforma híbrida de recomendação com explicação)

- **Projeto:** `01-recomendacao` · **Plano:** `plan.md`, aprovado pelo dono em 2026-11-20 com o teto de US$ 7,10 (D-056). O hash está em `harness/estado.json`, campo `plano_aprovado`
- **Data:** 2026-11-20 · **Autor:** arquiteto-aws (Claude Opus 5.5) · **Matriz requisito → tarefa → teste:** `matriz.md`
- **Decisões aplicadas:** D-006, D-007, D-013, D-021, D-022, D-024, D-029, D-031, D-032, D-033, D-034, D-039, D-042, D-043, D-047, D-050, D-051, D-052, D-053, D-054 e D-056
- **Spec retroativa:** a Fase R marca com `[x]` o que já existe e foi verificado verde nesta sessão (Vitest 39/39, unittest do lote 14/14, `static_rules.py` sem falha, em 2026-11-20). As divergências e lacunas da spec viram tarefas com teste vermelho

`U/` abrevia `modulos/01-fundamentos-ia-llms/unidades/03-recomendacao/`, como na spec e no plano.

Uma tarefa por sessão de trabalho. Cada tarefa começa por um teste que falha.
- `[P]` marca tarefas que podem rodar em paralelo, depois das dependências delas.
- `[x]` só depois do teste verde e do commit (`feat(01-recomendacao): Txxx ...`, com `Revisado-por:` no corpo, skill `executar-tarefas`).
- Cada tarefa cita os requisitos que cobre (RF, RNF ou artigo) e os ids de teste da matriz do plano.
- Entre colchetes, depois do id, fica o especialista dono (`harness/especialistas.json`). `[DONO]` é tarefa do Marcos: nenhum agente a executa.
- **Ids de teste:** VT = Vitest do serviço; PY = unittest do lote; TT = `terraform test` com mock provider; ST = `U/infra/terraform/tests/static_rules.py`; TH = testes do harness; FL = Floci; DM = demonstração real; ES = esteira `seguranca.yml`.
- **Ids novos desta fase** (furos F5, F6 e F2, no fim): TT-J02, VT-20, TH-07 e TH-08. **Ids novos da análise 1:** TH-09 (concorrência dos workflows de state, A04) e TH-10 (unidade do arquivo de uso e linhas não cobertas, A05). Os demais vêm da matriz do plano.
- **Regra de teste vermelho para verificadores:** quando o teste é uma regra transversal (por exemplo, "todo nome com o prefixo"), o vermelho é uma fixture que viola a regra e precisa reprovar. Uma regra que passa sem nada para checar não conta como teste.
- **Terraform roda na máquina do dono (D-042).** Toda tarefa com TT ou ST sobre `.tf` é executada pela sessão local do Claude Code; a sessão de nuvem devolve a tarefa à orquestração em vez de escrever Terraform sem rodar o teste (skill `terraform-tdd`). As tarefas só de Python, TypeScript ou documentação rodam em qualquer sessão.
- **Testes do harness** vão em `harness/testes/test_<assunto>.py`, um arquivo por assunto, nunca no `harness/test_harness.py` (D-043). Os testes do gate de custo ficam em `.github/ia/testes/test_gate_custo.py`, onde já estão.
- **Dependência da plataforma (R9):** "plataforma T0xx" é a tarefa de mesmo id em `specs/00-plataforma-agentes/tasks.md`. Uma tarefa daqui que depende dela só começa com a tarefa da plataforma marcada `[x]` no `main` ou no branch dela.

## Fase 0 · Preparação
- [x] T000 [operador-harness] Mover os ADRs para `U/adr/` · Art. I, Art. VII
  - **Teste vermelho:** `harness/testes/test_adrs_do_projeto.py` afirma que `U/adr/0007-*.md` a `U/adr/0016-*.md` existem, que todo link `adr/...` do `spec.md` e do `plan.md` de `specs/01-recomendacao/` resolve para um arquivo, e que o sha256 do `plan.md` é igual ao de `plano_aprovado` no `harness/estado.json`.
  - **Arquivos:** `git mv specs/01-recomendacao/adr/*.md U/adr/`; um arquivo de redirecionamento por ADR em `specs/01-recomendacao/adr/` (mesmo nome, só o título e o link relativo para o novo local); o teste.
  - **Aceite:**
    - o conteúdo dos ADRs fica só em `U/adr/`, ao lado dos ADRs 0001 a 0006;
    - os links do `plan.md` continuam resolvendo pelos redirecionamentos, sem editar o `plan.md` (mudar o plano derruba a aprovação, D-033);
    - o status de cada ADR movido passa de "proposto (plano da D01 aguardando a aprovação do dono)" para "aceito (plano aprovado pelo dono em 2026-11-20, D-056)", porque os ADRs não entram no hash do plano (furo F7);
    - no ADR-0013, sai também "o valor do teto depende da P01-P5": o teto de US$ 7,10 foi aprovado (D-056), como no plano depois da emenda 1 (A06 da análise 1).
  - **Depende de:** fase `implementar` (o `gate_sdd.py` bloqueia `U/` antes dela).

## Fase R · Já existe e está testado (retroativo)
Estas tarefas registram o comportamento atual que a spec descreve e que já tem teste verde. Elas não mudam código; as tarefas das fases seguintes que mexem nos mesmos arquivos precisam manter esses testes verdes.
- [x] T001 [engenheiro-ml] API de recomendações com validação dos parâmetros e `requestId` · RF-001 · VT `U/tests/contract/recommendations-api.contract.test.ts`
- [x] T002 [engenheiro-ml] Candidatos do lote e da busca vetorial em paralelo, com disjuntor por repositório · RF-002 · VT `U/tests/integration/hybrid-recommendation.test.ts`
- [x] T003 [engenheiro-ml] Junção com proveniência `batch`, `realtime` e `hybrid` · RF-003 · VT `U/tests/unit/candidate-merger.test.ts`
- [x] T004 [engenheiro-ml] Motor de filtros com estoque e compras recentes injetados · RF-004 (o serviço real fica na T074) · VT `U/tests/unit/business-filter-engine.test.ts`, `U/tests/integration/business-filter-enforcement.test.ts`
- [x] T005 [engenheiro-ml] Re-ranking com heurística e matriz de degradação sem 500, com repositórios simulados · RF-005 (o contrato CSV fica na T075), RF-006 (o adaptador real fica na T073) · VT `U/tests/integration/fallback-*.test.ts`
- [x] T006 [engenheiro-claude] Explicação com Claude: critérios, exemplo, tool única com `tool_choice` forçado, validação com retentativa, erros por categoria, disjuntor e fallback (ADR-0004) · RF-007, Art. VII · VT `U/tests/unit/recommendation-explainer.test.ts`, `U/tests/integration/explanation-in-recommendations.test.ts`
- [x] T007 [engenheiro-ml] Contratos de publicação no DynamoDB e no MemoryDB, transformações do Glue e DAG carregado · RF-010 (a versão 2.11 fica na T046), RF-011, RF-012, RF-013 · PY `U/tests/contract/test_dynamodb_publish_contract.py`, `test_memorydb_vector_contract.py`, `U/tests/integration/test_glue_transformations.py`, `U/tests/unit/test_airflow_dag_validation.py`
- [x] T008 [engenheiro-ml] Suíte local sem nuvem (`npm ci && npm test`) · RF-016, RNF-005 · VT (a própria suíte)

## Fase 1 · Regras da constituição como testes e migração para o harness
- [x] T010 [engenheiro-terraform] Workflows da D01 a partir dos modelos, com SHAs únicos e `id-token` só no job · RNF-101, RNF-103, RNF-106, RNF-006, Art. V · TH-05, ST-01, TH-07 (novo)
  - **Teste vermelho:**
    - TH-05: os testes `test_um_sha_por_action` e `test_token_oidc_nunca_no_nivel_do_workflow` (`harness/testes/test_workflows.py`) já estão vermelhos hoje por causa dos `recsys-01-03-*.yml`; eles são o vermelho desta tarefa;
    - ST-01 em `static_rules.py`: reprova se algum workflow cujo filtro de caminho cobre `U/` roda `infracost` (fixture com um job `infracost` precisa reprovar);
    - TH-07 em `harness/testes/test_workflows_01_recomendacao.py`: os workflows de apply e destroy da D01 contêm todos os jobs do modelo preenchido por `novo_projeto.preencher_modelo` (mesmo `environment`, mesmos passos pelo `name`, na mesma ordem), e as extensões ficam em passos a mais; uma fixture sem o passo de verificação de sobras precisa reprovar.
  - **Arquivos:**
    - `.github/workflows/01-recomendacao-apply.yml` e `01-recomendacao-destroy.yml`, gerados de `harness/modelos/apply.yml` e `destroy.yml` com a chave `01-recomendacao` e o stack `01-recomendacao-lab`;
    - `.github/workflows/01-recomendacao-ci.yml`, renomeado de `recsys-01-03-ci.yml`, sem o job do Infracost, com os SHAs dos modelos e `id-token: write` só no job de plan;
    - remoção de `recsys-01-03-apply.yml`, `recsys-01-03-destroy.yml` e `recsys-01-03-ci.yml`;
    - `apply_workflow` e `destroy_workflow` do `harness/estado.json` apontando para os arquivos novos;
    - `U/infra/terraform/tests/static_rules.py`, `harness/testes/test_workflows_01_recomendacao.py`.
  - **Aceite:**
    - `python3 -m unittest harness/test_harness.py` sem falha (as 2 falhas conhecidas somem) e `estado.py validar` ok;
    - os workflows usam `${{ vars.FLOCI_IMAGE || 'floci/floci:latest' }}` (D-013) e nunca `floci/floci:latest` escrito direto;
    - o CI continua rodando lint, build e testes do serviço e do lote, `fmt`, `validate`, `tflint`, `checkov`, `terraform test` e as regras estáticas; o gate de custo do PR passa a ser só o de `seguranca.yml` (RNF-103);
    - as extensões do apply e do destroy (build, duas passadas, cascata, requisitos da plataforma) ficam para a T056 e a T057; aqui os arquivos são o modelo preenchido.
  - **Nota sobre o TH-07 (A11 da análise 1):** o TH-07 compara os workflows da D01 com o modelo do harness de hoje. Quando a plataforma T043 (prazo registrado antes do apply) e a T048 (filtro da chave KMS no destroy) entrarem no `main`, o TH-07 da D01 fica vermelho até a T055 e a T056 regenerarem os arquivos a partir do modelo novo. Esse vermelho é esperado e não é defeito da D01: a correção é regenerar, nunca afrouxar o teste para passar.
  - **Depende de:** T000.
- [x] T011 [engenheiro-terraform] Tags no padrão da política em todo recurso da base · RNF-107, RNF-003, Art. VI · TT-T01
  - **Teste vermelho:** `U/infra/terraform/tests/tags.tftest.hcl`, copiado de `harness/modelos/tags.tftest.hcl` com `projeto = "01-recomendacao"`, iterando sobre todos os recursos tagueáveis do root (output de teste com as tags efetivas, como na plataforma). Hoje reprova com `project = "recsys"` e `module` com barra.
  - **Arquivos:** `U/infra/terraform/{versions.tf,main.tf,variables.tf}`, o `local.tags` de cada um dos 13 módulos, `terraform.tfvars.example`, `backend.hcl.example`, `testing/scripts/integracao_01_03_recomendacao.py`, `tests/tags.tftest.hcl`.
  - **Aceite:**
    - `project = "01-recomendacao"` e `managed-by = "terraform"` no `default_tags`; `environment` sai do `default_tags` (ADR-0014);
    - `module` em kebab no `local.tags` de cada módulo, com os nomes do ADR-0014 (`rede`, `chave-kms`, `dados`, `catalogo`, `recomendacoes-lote`, `busca-vetorial`, `re-ranker`, `treino`, `servico`, `consultas`, `pipeline-glue`, `monitoramento`);
    - nenhum `recsys` em `terraform.tfvars.example`, `backend.hcl.example` e no harness do Floci; a chave do state passa a `01-recomendacao/lab.tfstate`;
    - antes do vermelho, a suíte TT existente (`regras_base.tftest.hcl`) roda verde na máquina do dono como linha de base, e continua verde no fim; `fmt`, `validate`, `tflint` e `checkov` limpos.
  - **Depende de:** T000.
- [x] T012 [engenheiro-terraform] Prefixo `01-recomendacao-` com exceções versionadas · RNF-108, Art. VI · TT-T02, ST-04
  - **Teste vermelho:**
    - TT-T02 em `U/infra/terraform/tests/prefixo.tftest.hcl`: todo nome começa por `01-recomendacao-` ou casa com uma exceção de `U/infra/terraform/tests/excecoes_de_nome.json`; um recurso sintético com nome fora do prefixo e fora da lista precisa reprovar;
    - ST-04 em `static_rules.py`: reprova uma exceção do JSON sem `motivo`, `fonte` e `adr` (fixture vermelha).
  - **Arquivos:** os nomes dos 13 módulos, `tests/excecoes_de_nome.json`, `tests/prefixo.tftest.hcl`, `static_rules.py`.
  - **Aceite:**
    - exceções do ADR-0014: `p01-recomendacao-` no cluster do MemoryDB (confirmado) e, por precaução, no subnet group e no parameter group; `p01_recomendacao_` no banco do Glue Data Catalog e nas tabelas. As do MWAA entram na T061;
    - **confirmação das duas exceções por precaução:** os dois ficam na lista por precaução e só saem, voltando ao prefixo normal, com uma fonte da documentação que trate da regra do subnet group e do parameter group em si, registrada no JSON (ADR-0014, T102). O validador do provider não vale como prova, porque não implementa a regra nem para o cluster;
    - a tag `project` continua `01-recomendacao` em todos os recursos (T011 verde).
  - **Análise 2 (A19):** o log group do serviço e o do Glue passam ao prefixo (`01-recomendacao-servico` e `01-recomendacao-glue-…`, com o `--continuous-log-logGroup` apontando para ele); o do endpoint, de nome imposto pelo SageMaker, entra no `excecoes_de_nome.json` e no ADR-0014 com motivo, fonte e ADR (ST-04).
  - **Depende de:** T011.
- [x] T013 [P] [engenheiro-terraform] AWS Budgets diário com o teto nos três lugares · RNF-102, RNF-002, Art. V · TT-K01, TH-06
  - **Teste vermelho:**
    - TT-K01 no `regras_base.tftest.hcl` (ou num `budgets.tftest.hcl`): `time_unit = "DAILY"`, `limit_amount == var.teto_diario_usd`, filtro `user:project$01-recomendacao`, nenhum `aws_budgets_budget` com `time_unit = "MONTHLY"` no stack e, no Budgets diário, só notificações com `notification_type = "ACTUAL"`; fixture vermelha: o Budgets diário com a notificação `FORECASTED` que o módulo `cloudwatch_monitoring` tem hoje (A09 da análise 1);
    - TH-06 em `harness/testes/test_teto_01_recomendacao.py`: o padrão de `teto_diario_usd` em `U/infra/terraform/variables.tf`, o valor citado no `U/README.md` e o `teto_diario_usd` do `harness/estado.json` (7,1) são iguais; mudar um só precisa reprovar.
  - **Arquivos:** `U/infra/terraform/modules/cloudwatch_monitoring/main.tf` (Budgets), `U/infra/terraform/variables.tf`, a linha de custo do `U/README.md`, o teste do harness.
  - **Aceite:**
    - o Budgets mensal de US$ 10 sai do stack; o limite mensal da conta fica só no `infra/conta` (D-022);
    - o README diz que o filtro por tag só enxerga custo depois da ativação da tag `project` na conta (D-039) e que o custo do Claude, cobrado pelo AWS Marketplace, pode não aparecer no filtro (R7);
    - os destinatários do alerta não aparecem em output nem em log público (mesma regra do TT-S06 da plataforma);
    - **por que só `ACTUAL` (A09, incerto):** o anúncio do orçamento diário diz que ele ainda não aceitava alerta de previsão e que a conversão para diário remove esses alertas ([Launch: daily cost and usage budgets](https://aws.amazon.com/blogs/aws-cost-management/launch-daily-cost-and-usage-budgets), 2020-09-16, consulta em 2026-11-20); o guia de boas práticas diz que a previsão precisa de cerca de 5 semanas de uso ([Best practices for AWS Budgets](https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-best-practices.html), sem data, consulta em 2026-11-20). Não achei fonte atual que diga se o diário aceita previsão hoje, então o suporte fica **incerto** e vai para a T102. A regra do teste vale nos dois casos: num stack de um dia, a previsão nunca dispararia.
  - **Depende de:** T011.
- [x] T014 [engenheiro-terraform] Sem custo fixo ocioso na base: 5 endpoints, sem `monitoring`, sem MWAA, sem snapshot · RNF-002, Art. V · TT-K02, ST-07
  - **Teste vermelho:**
    - TT-K02: o root da base tem exatamente os endpoints de interface `ecr.api`, `ecr.dkr`, `logs`, `sagemaker.runtime` e `bedrock-runtime`, em 1 AZ, mais os de gateway S3 e DynamoDB; nenhum `aws_nat_gateway`; nenhum `aws_mwaa_environment`; MemoryDB com `snapshot_retention_limit = 0`; fixtures com o endpoint `monitoring` e com um MWAA precisam reprovar;
    - ST-07 em `static_rules.py`: todo recurso cobrado por hora do root (endpoint de interface, ALB, MemoryDB, serviço ECS) é citado num ADR da unidade.
  - **Arquivos:** `U/infra/terraform/modules/networking/`, `U/infra/terraform/main.tf` (sai o módulo `mwaa_orchestration` e o `enable_mwaa`), `modules/memorydb_cluster/`, `modules/ecs_service/` (sai `cloudwatch:PutMetricData` da task role), os testes.
  - **Aceite:**
    - os testes TT existentes do MWAA (`mwaa_ligado_privado`, `mwaa_desligado_por_padrao`) saem da base e são reescritos na raiz da janela (T061);
    - **prefixo (revisão da T012):** o assert dos 13 módulos do `prefixo.tftest.hcl` (e o do `tags.tftest.hcl`) passa a listar os módulos que ficam na base; a exceção `mwaa-ambiente` do `excecoes_de_nome.json` continua, porque a raiz da janela a usa;
    - a task role não tem `cloudwatch:PutMetricData`, porque as métricas vão por EMF (ADR-0013);
    - custo fixo da base igual ao da tabela do plano (5 endpoints, 1 ALB, 1 nó do MemoryDB, 1 task).
  - **Depende de:** T011, T015.
- [x] T015 [P] [engenheiro-ml] Métricas do serviço por EMF · RF-009, RNF-003, Art. VI · VT-15
  - **Teste vermelho:** `U/tests/unit/metrics-emf.test.ts` afirma que cada contagem (`DegradedModeCount`, `SageMakerFallbackCount`, `MemoryDbFallbackCount`, `DynamoDbFallbackCount`, `ExplanationRetryCount`, `ExplanationFallbackCount`) sai como uma linha JSON no formato Embedded Metric Format, com `_aws.CloudWatchMetrics[0].Namespace = "Ecommerce/Recommendations"`, a unidade `Count` e sem chamada ao `PutMetricData`.
  - **Arquivos:** `U/src/serving/src/infrastructure/monitoring/cloudwatch-metrics.ts` (ou um publicador EMF novo atrás da mesma interface), o teste.
  - **Aceite:** os nomes e o namespace não mudam, então os 7 alarmes continuam iguais; a linha EMF não leva `userId`, prompt nem texto do modelo; os 39 testes existentes seguem verdes.
  - **Depende de:** T000.

## Fase 2 · Harness: componente com prazo próprio, consumo da plataforma e gate de custo
**Especialistas desta fase:** a T020 tem regra fechada e fica com o `operador-harness`. A T021 a T024 mudam a lógica do `estado.py`, do `infra.py` e do `gate_custo.py` e ficam com o `engenheiro-terraform`, como nas T041 a T044 da plataforma. Ele segue as regras da skill `evolucao-do-harness`, mesmo sem tê-la pré-carregada: teste primeiro, só a biblioteca padrão do Python e o registro da mudança em `harness/VERSAO.md`.

**Ordem com a plataforma:** a plataforma muda os mesmos arquivos nas T040 a T043 (`consome`, `requisitos`, `dependentes` e o limite do consumidor). As tarefas desta fase começam depois delas, para não haver duas lógicas de prazo no `infra.py`.
- [ ] T020 [BLOQUEADO: depende da T040 e da T043 da plataforma, ainda não feitas; as T021 a T024 seguem em cadeia] [operador-harness] `consome: ["00-plataforma-agentes"]` no projeto · RF-110, ADR-0007 da plataforma · `estado.py validar`
  - **Teste vermelho:** um caso em `harness/testes/test_componentes.py` afirma que o projeto `01-recomendacao` do `harness/estado.json` declara `consome` com `00-plataforma-agentes`; hoje reprova.
  - **Arquivos:** `harness/estado.json` (só o campo), o teste.
  - **Aceite:** `estado.py validar` ok com as regras do `consome` da plataforma T040; `infra.py dependentes 00-plataforma-agentes` lista a D01.
  - **Depende de:** T010; plataforma T040 e T043.
- [ ] T021 [engenheiro-terraform] Campo `componentes` no `estado.json` e validação · ADR-0007, RNF-101, Art. V · TH-03, TH-08 (novo)
  - **Teste vermelho:** em `harness/testes/test_componentes.py`, com estado sintético em repositório temporário:
    - TH-03: `estado.py validar` reprova componente sem `nome`, `stack`, `apply_workflow`, `destroy_workflow` ou `prazo_maximo_horas`; reprova `prazo_maximo_horas` fora de 1 a 23; a partir de `verificar`, aplica `checar_apply` e `checar_destroy` aos workflows do componente;
    - TH-08: o `test_excecao_ckv_gha_7_so_em_apply_e_destroy_registrados` passa a aceitar os workflows dos componentes registrados e continua reprovando um workflow sintético com `checkov:skip=CKV_GHA_7` que não está registrado.
  - **Arquivos:** `harness/estado.py`, `harness/testes/test_componentes.py`, `harness/testes/test_workflows.py` (só o teste do CKV_GHA_7), `harness/VERSAO.md`; no `harness/estado.json`, o componente `janela-mwaa` da D01 com `stack = "01-recomendacao-janela-mwaa"`, os dois workflows da T064 e `prazo_maximo_horas = 3`.
  - **Aceite:** projetos sem `componentes` não mudam de comportamento (os 88 testes do harness continuam verdes); a regra é genérica, sem nada da D01 no código (skill `evolucao-do-harness`, regra 4).
  - **Depende de:** T020.
- [ ] T022 [engenheiro-terraform] `infra.py registrar --componente` e `estender` com o limite da base · ADR-0007, D-052, Art. V · TH-01
  - **Teste vermelho:** em `harness/testes/test_componentes.py`:
    - `registrar <chave> --componente janela-mwaa` sem a base registrada é recusado;
    - o prazo do componente é o menor entre `prazo_maximo_horas`, o `prazo_horas` pedido e o prazo da base menos 1 hora; pedido acima disso é recusado com a mensagem do limite;
    - `estender --componente` respeita o mesmo limite;
    - o padrão do `prazo_horas` da janela é 2;
    - **prazo útil mínimo (A10 da análise 1):** se o prazo resultante ficar abaixo de 1 hora, o registro é recusado antes do apply, com a mensagem de que a base pode ser estendida com `infra.py estender 01-recomendacao`; um caso com a base a 1 h 30 min do vencimento (prazo resultante de 30 min) precisa ser recusado.
  - **Arquivos:** `harness/infra.py`, o teste, `harness/VERSAO.md`.
  - **Aceite:** o registro da base continua com o limite de 24 h e com o limite do consumidor da plataforma (plataforma T041); os testes existentes de `TestPrazoDaInfra` seguem verdes; o mínimo de 1 hora é um campo do componente (`prazo_minimo_horas`, padrão 1), não um número da D01 no código (skill `evolucao-do-harness`, regra 4), porque a criação e a remoção do MWAA levam dezenas de minutos cada uma (ADR-0007) e o agendador roda de hora em hora.
  - **Análise 2 (A15):** o `prazo_minimo_horas` da janela sai da soma do pior caso (criação do MWAA, tempos máximos dos passos do DAG da T046 e remoção), e não de 1 h fixa; o valor vem do `estado.json` do componente, sem número da D01 no código. Um caso do teste recusa um prazo abaixo dessa soma.
  - **Depende de:** T021; plataforma T041.
- [ ] T023 [engenheiro-terraform] `vencidos` e `remover --componente`, com o destroy em cascata · ADR-0007, Art. V · TH-02
  - **Teste vermelho:** em `harness/testes/test_componentes.py`:
    - um componente vencido gera o disparo do destroy dele, com o `confirm_stack` do componente;
    - a base vencida com o componente ainda registrado gera **só** o destroy da base, que já derruba o componente antes (T056); o destroy do componente sozinho sai só quando só o componente venceu (A04 da análise 1); uma fixture que gera os dois disparos precisa reprovar;
    - `remover <chave>` sem `--componente` remove também o registro do componente;
    - `remover --componente` remove só o componente.
  - **Arquivos:** `harness/infra.py`, `.github/workflows/expirar-infra.yml` (se o disparo precisar do workflow do componente), o teste, `harness/VERSAO.md`.
  - **Aceite:** a ordem é janela, base e, depois, plataforma (com a espera da plataforma T042), garantida por um só disparo por nível; `expirar-infra.yml` continua sem aprovação, no `aws-lab-destroy` (D-024).
  - **Depende de:** T022; plataforma T042.
- [ ] T024 [P] [engenheiro-terraform] Gate de custo soma as raízes do projeto e pesa o componente · RNF-002, RNF-103, ADR-0013, Art. V · TH-04
  - **Teste vermelho:** em `.github/ia/testes/test_gate_custo.py`: um Infracost sintético com a raiz da base (US$ 4,56 por dia) e a da janela (US$ 14,91 por dia, se ficasse 24 h) dá US$ 4,56 + 14,91 × 3/24 e passa no teto de 7,10; sem o peso, o mesmo JSON reprova (fixture vermelha); duas raízes do mesmo projeto são somadas numa linha só.
  - **Arquivos:** `.github/ia/gate_custo.py`, `.github/ia/testes/test_gate_custo.py`, `harness/VERSAO.md`.
  - **Aceite:**
    - a raiz é ligada ao componente pelo caminho (`pastas` do projeto mais o diretório do `stack` do componente); projetos sem componente têm o mesmo resultado de hoje;
    - **um só lugar para o peso da janela (A05 da análise 1):** o gate é o único que pesa a raiz do componente por `prazo_maximo_horas/24`; o arquivo de uso do Infracost não reduz as horas do MWAA (T096). Um caso do teste com um arquivo de uso que também reduz as horas precisa dar o peso uma vez só;
    - **linhas não cobertas:** o gate cria uma regra genérica (a mesma ideia da A09 da análise da plataforma): por raiz, um arquivo versionado com as linhas que o Infracost não estima (Claude e guardrail, na D01) e o valor do plano, somado ao total antes da comparação com o teto. Um só gate para os dois projetos; a regra é criada nesta tarefa (Análise 2, A17), sem esperar a plataforma T073.
  - **Análise 2 (A17):** a própria tarefa cria a regra genérica no `gate_custo.py`: um arquivo versionado por raiz (por exemplo, `infracost-nao-coberto.yml`, com linha, valor diário e linha da tabela do plano), somado ao total antes da comparação com o teto, sem nada da D01 no código (skill `evolucao-do-harness`, regra 4) e com o registro em `harness/VERSAO.md`. Sai a espera pela plataforma T073; a orquestração registra no `progresso.md` que a plataforma pode adotar o mesmo arquivo na T073, sem mudar o plano dela.
  - **Depende de:** T021 (sem dependência da plataforma T073, A17).

## Fase 3 · Identidade de deploy por projeto no `infra/conta` (ADR-0015)
- [x] T030 [engenheiro-terraform] Provedor OIDC e bucket de state no `infra/conta` · RNF-105, Art. IV, Art. VI · TT em `infra/conta/tests/`
  - **Teste vermelho:** `infra/conta/tests/identidade.tftest.hcl` afirma um `aws_iam_openid_connect_provider` do `token.actions.githubusercontent.com` e um bucket de state com versionamento, KMS do cliente, bloqueio público, política que nega `aws:SecureTransport = false` e tag `project = "00-conta"`.
  - **Arquivos:** `infra/conta/{main.tf,variables.tf,outputs.tf}` (ou `identidade.tf`), `infra/conta/tests/identidade.tftest.hcl`; a remoção de `U/infra/bootstrap/` e das referências a ele no README e nos workflows.
  - **Aceite:** um provedor e um bucket por conta, que servem a todos os projetos; se o `infra/conta` já tiver um dos dois por outra tarefa, ele é reusado; o ADR-0001 da unidade ganha uma nota apontando para o ADR-0015.
  - **Depende de:** T010.
- [ ] T031 [engenheiro-seguranca] Roles `01-recomendacao-deploy` e `01-recomendacao-plan` com ABAC · RNF-105, Art. IV, D-029 · TT-I01
  - **Teste vermelho:** `infra/conta/tests/roles_projeto.tftest.hcl`:
    - a confiança da `01-recomendacao-deploy` tem exatamente os subjects `repo:<dono>/<repo>:environment:aws-lab` e `...:environment:aws-lab-destroy` (valores sintéticos no teste);
    - toda declaração de criação tem `aws:RequestTag/project = 01-recomendacao`, e toda de alteração ou remoção, `aws:ResourceTag/project = 01-recomendacao`;
    - as ações sem condição de tag ficam só na lista nomeada, cada uma limitada por ARN com o prefixo da chave;
    - nenhuma declaração com ação `*` e recurso `*`;
    - fixtures vermelhas: uma ação ampla sem condição e fora da lista; um terceiro subject.
  - **Arquivos:** `infra/conta/roles_projeto.tf` (gerado por uma lista de projetos), `infra/conta/tests/roles_projeto.tftest.hcl`, a lista nomeada versionada junto do teste, com a fonte de cada item.
  - **Aceite:**
    - a lista inicial é a do ADR-0015 (`iam:PassRole` para `01-recomendacao-*`, `Describe*` e `List*` do plan, `ecr:GetAuthorizationToken`, S3 no prefixo do state da chave, `ssm:GetParameter` no contrato da plataforma, `ce:ListCostAllocationTags`), conferida na referência de autorização de cada serviço;
    - **acréscimos que o roteiro exige (furo F3):** `airflow:InvokeRestApi` e `airflow:CreateWebLoginToken` no ARN da role do Airflow do ambiente `p01-recomendacao-lab-mwaa`; `ecs:RunTask` no task definition `01-recomendacao-*` com a condição de tag; `cloudwatch:GetMetricData` para a evidência, que não aceita recurso; cada um com a fonte e a data da consulta;
    - **acréscimos para ler o relatório do roteiro no runner (A02 da análise 1):** `ecs:DescribeTasks` em `task/01-recomendacao-*/*`, com a condição `ecs:cluster` no cluster do projeto, para esperar o fim da tarefa e ler o código de saída; `logs:GetLogEvents` no `log-group:01-recomendacao-*:log-stream:*`, porque o nome do stream do `awslogs` é conhecido a partir do id da tarefa. Fontes, consulta em 2026-11-20: a [referência de autorização do ECS](https://docs.aws.amazon.com/service-authorization/latest/reference/list_amazonelasticcontainerservice.html) (`DescribeTasks` exige o recurso `task`, no formato `task/<cluster>/<id>`, e aceita `ecs:cluster`); a [referência do CloudWatch Logs](https://docs.aws.amazon.com/service-authorization/latest/reference/list_amazoncloudwatchlogs.html) (`GetLogEvents` exige o recurso `log-stream`; `FilterLogEvents` exige `log-group` e não é necessária); o [LogConfiguration do ECS](https://docs.aws.amazon.com/AmazonECS/latest/APIReference/API_LogConfiguration.html) (o stream fica `prefixo/contêiner/id-da-tarefa`). A task role não ganha nenhuma dessas permissões (TT-R01);
    - a `01-recomendacao-plan` só lê e só acessa o state da chave, confiada ao subject de `pull_request`;
    - checkov sem achado alto; onde a referência só aceitar `*`, exceção do checkov com justificativa no próprio recurso.
  - **Análise 2 (A19):** o TT-I01 afirma que o padrão de `logs:GetLogEvents` (`log-group:01-recomendacao-*:log-stream:*`) casa com o nome do log group do serviço fixado na T012.
  - **Depende de:** T030.
- [ ] T032 [engenheiro-terraform] Workflows da D01 com a role do projeto e fallback · RNF-105, D-012 · TH-07 (extensão)
  - **Teste vermelho:** o TH-07 (T010) passa a exigir `role-to-assume: ${{ vars.AWS_DEPLOY_ROLE_ARN_01_RECOMENDACAO || vars.AWS_DEPLOY_ROLE_ARN }}` em todo job com OIDC dos workflows da D01; uma fixture só com `vars.AWS_DEPLOY_ROLE_ARN` precisa reprovar.
  - **Arquivos:** `.github/workflows/01-recomendacao-{apply,destroy,ci}.yml` (e os da janela e do roteiro, quando existirem), `U/README.md` (pré-requisitos).
  - **Aceite:** sem a variável nova, o fallback é a role de hoje; o README lista a variável como pré-requisito do dono, sem valor.
  - **Depende de:** T010, T031.
- [ ] T033 [DONO] Aplicar o `infra/conta` com a identidade da D01 e criar a variável e o ambiente · RNF-105, D-024
  - **Passos:** aplicar o `infra/conta` (provedor OIDC, bucket de state, roles da D01); criar a variável `AWS_DEPLOY_ROLE_ARN_01_RECOMENDACAO` com o ARN da `01-recomendacao-deploy`; criar o ambiente `aws-lab-destroy` sem aprovação e restrito ao `main` (pendência da D-024, compartilhada com a plataforma T083).
  - **Aceite:** um plan da base no PR assume a `01-recomendacao-plan`; um destroy manual de teste roda no `aws-lab-destroy` sem pedir aprovação.
  - **Depende de:** T031, T032; a tarefa do harness (ainda sem id) que põe `kms_key_id` (de `vars.TF_STATE_KMS_KEY_ARN` com fallback seguro) nos modelos `harness/modelos/{apply,destroy}.yml` e nos workflows da plataforma; pendente da plataforma/harness até alguém assumir; esta sessão não edita `harness/modelos` nem os workflows da plataforma.

## Fase 4 · Núcleo: lote sintético fechado (D-051)
- [ ] T040 [P] [engenheiro-ml] Gerador sintético com semente fixa · Art. VIII, RNF-007, RF-012, RNF-104 · PY-07
  - **Teste vermelho:** `U/tests/unit/test_gerador_sintetico.py`: duas execuções com a mesma semente dão bytes iguais; todo registro tem `sintetico: true`; toda categoria casa com `^[A-Za-z0-9_]{1,40}$`; todo item tem `inStock`; nenhum título está fora da lista de nomes fictícios usada pelo VT-14.
  - **Arquivos:** `U/src/batch/gerar_dados_sinteticos.py` (usuários, itens, estoque e interações), o teste.
  - **Aceite:** o gerador recebe destino e volume por argumento; nenhum nome de recurso fixo (PY-01).
  - **Depende de:** T000.
- [ ] T041 [P] [engenheiro-ml] Nenhum nome de recurso fixo nos scripts do lote · RF-107 · PY-01
  - **Teste vermelho:** `U/tests/unit/test_nomes_fixos.py` varre `U/src/batch/**/*.py` e o DAG e reprova literais de bucket, tabela, job, cluster ou workgroup (`s3://`, `ecommerce-`, `recsys-`, `01-recomendacao-`); uma fixture com `s3://ecommerce-golden/` precisa reprovar.
  - **Arquivos:** `U/src/batch/glue/*.py`, `U/src/batch/athena/`, `U/src/batch/airflow/dags/`, o teste.
  - **Aceite:** todos os nomes chegam por argumento do job ou do DAG (`getResolvedOptions` no Glue); os contratos existentes (T007) seguem verdes.
  - **Análise 2 (A13):** o PY-01 varre também `U/src/batch/**/*.sql` e acrescenta os padrões `ecommerce_` e `_golden_db`, com uma fixture SQL vermelha (`ecommerce_golden_db.interactions` precisa reprovar); o SQL recebe banco e tabelas pelo mesmo arquivo de configuração do DAG (T046), por exemplo por template do operador do Athena.
  - **Depende de:** T000.
- [ ] T042 [engenheiro-ml] Treino do re-ranker XGBoost determinístico em formato nativo · RF-014, RF-109, ADR-0008 · PY-03
  - **Teste vermelho:** `U/tests/unit/test_train_reranker.py`: com `xgboost==1.7.6`, a mesma semente e `nthread = 1`, duas execuções dão predições iguais (tolerância 0) num conjunto fixo; o artefato é gravado por `Booster.save_model` (não é pickle: o teste reprova um arquivo que `pickle.load` abre); o `model.tar.gz` tem o arquivo no nome que o container nativo 1.7-1 espera.
  - **Arquivos:** `U/src/batch/sagemaker/train_reranker.py` (3 features: `batchScore`, `vectorScore`, `hibrido`; `binary:logistic`; rótulo sintético por regra conhecida com ruído), o teste; remoção de `U/src/batch/sagemaker/train_model.py` (vetores aleatórios).
  - **Aceite:**
    - o script roda igual no runner do apply (semente) e no SageMaker Training (candidato); `xgboost` fixado com hash no arquivo de requisitos do build;
    - **mesmas entradas que o candidato (A03 da análise 1):** a semente treina sobre o CSV de treino que a função pura da T043 monta a partir dos dados sintéticos do T040, com a mesma semente e o mesmo volume que o lote do dia lê; o `sha256` desse CSV é publicado ao lado do artefato (`reranker/publicado/<hash>/treino.sha256`) e entra no relatório do roteiro;
    - **mesmos hiperparâmetros:** `nthread = 1`, `seed` e os demais hiperparâmetros ficam num só arquivo de configuração, lido pelo script e pelo DAG (T046);
    - **mesma versão:** a versão fixada no build é a do container 1.7-1 que a T102 confirmar; se a T102 achar outra versão que não a 1.7.6, esta fixação muda para ela (o PY-03 continua com tolerância 0 na mesma versão).
  - **Análise 2 (A21):** a tarefa depende da T043, de onde vem a função pura do CSV de treino, e da linha da versão do XGBoost da T102, antecipada como passo de pesquisa antes desta tarefa; o PY-03 fixa a versão confirmada desde o início, sem reabrir tarefa fechada.
  - **Análise 2 (A03 e A12):** a semente treina sobre as mesmas linhas de entrada que o candidato recebe no DAG (as da data de partição fixa da T055), para o `sha256` do CSV fechar.
  - **Depende de:** T040, T043.
- [ ] T043 [engenheiro-ml] Job de features grava as três saídas · RF-013, RF-011, RF-104, ADR-0012 · PY existente `test_glue_transformations` (estendido)
  - **Teste vermelho:** o `test_glue_transformations.py` ganha casos para as três saídas: o CSV de treino com `batchScore`, `vectorScore`, `hibrido` e o rótulo; o top-N por usuário com `inStock` e as compras dos últimos 30 dias (até 100); os vetores de 128 dimensões, sintéticos e determinísticos.
  - **Arquivos:** `U/src/batch/glue/feature_engineering.py`, `U/src/batch/athena/extract_curated_features.sql` (se mudar a projeção), o teste.
  - **Aceite:**
    - os pesos por evento e a poda de partição do RF-013 continuam iguais; a documentação da unidade diz que os vetores são sintéticos, sem aprendizado de embeddings;
    - **CSV de treino determinístico (A03 da análise 1):** a montagem do CSV de treino é uma função pura de Python, sem Spark, chamada pelo job do Glue sobre os dados já coletados (volume do lab, de KB a MB) e pelo runner do apply (T042); a saída é um só objeto, com as linhas ordenadas por `userId` e `itemId` e números em formato fixo; um caso do teste afirma bytes iguais em duas execuções e o `sha256` do arquivo no log do job.
  - **Análise 2 (A12 e A03):** o SQL recebe a data da partição como parâmetro vindo do `ds`, sem `CURRENT_DATE`; a agregação passa para a função pura e o Athena só filtra e projeta (ou o runner aplica a mesma agregação, com um teste de equivalência), de modo que a semente do runner e o candidato do DAG usam as mesmas linhas.
  - **Depende de:** T040, T041.
- [ ] T044 [P] [engenheiro-ml] Publicação no DynamoDB com compras recentes e estoque · RF-011, RF-104, ADR-0012 · PY-04
  - **Teste vermelho:** `U/tests/contract/test_dynamodb_publish_contract.py` ganha o caso: um item por usuário com `userId`, `generatedAt`, `ttlTimestamp` (agora + 604.800 s), `recommendations` com `inStock` em cada uma e `recentPurchases` (item e data, até 100, só dos últimos 30 dias).
  - **Arquivos:** `U/src/batch/glue/publish_dynamodb.py` (Python shell, nomes por argumento), `U/contratos/dynamodb-batch-recs-contract.json` (ou o contrato no caminho atual até a T092), o teste.
  - **Aceite:** o item fica abaixo de 400 KB com o maior usuário sintético (risco do ADR-0012).
  - **Depende de:** T043.
- [ ] T045 [P] [engenheiro-ml] Publicação no MemoryDB com `cat` permitido e `inStock` · RF-012, RF-105, RNF-104 · PY-05
  - **Teste vermelho:** `U/tests/contract/test_memorydb_vector_contract.py` ganha os casos: `FT.CREATE item_idx` só se o índice faltar, com `v` HNSW de 128 dimensões, FLOAT32, COSINE, mais `cat` (TAG) e `inStock`; cada hash `item:<id>` tem `v` de 512 bytes, `cat` no padrão permitido e `inStock`; uma categoria fora do padrão faz o job falhar.
  - **Arquivos:** `U/src/batch/glue/publish_memorydb_vectors.py` (Python shell, TLS, nomes por argumento), o teste.
  - **Aceite:** o cliente Redis vem de um wheel com hash fixado (artefato de build da T056).
  - **Depende de:** T043.
- [ ] T046 [engenheiro-ml] DAG no Airflow 2.11 com o candidato e a configuração por arquivo · RF-010, RF-107, RF-014, D-052 · PY-06
  - **Teste vermelho:** `U/tests/unit/test_airflow_dag_validation.py` passa a carregar o DAG com o Airflow 2.11 (sem rede) e afirma: `@daily`, sem `catchup`, 1 retentativa; a ordem sensor → Athena → Glue de features → treino do XGBoost (Spot, `MaxWaitTimeInSeconds` 7200, saída em `reranker/candidatos/<ds>/`) → as duas publicações em paralelo; todos os nomes lidos de `dags/config/01-recomendacao.json`; nenhuma tarefa cria modelo, endpoint ou endpoint config.
  - **Arquivos:** `U/src/batch/airflow/dags/daily_hybrid_recommendation_pipeline.py`, um `config` de exemplo sintético para o teste, o requirements do Airflow fixado na linha 2.11, o teste.
  - **Aceite:**
    - o candidato nunca é promovido pelo DAG (ADR-0008); os `job_name` do DAG batem com os nomes que a T050 cria (TT-G01 lê a mesma lista);
    - **hiperparâmetros iguais aos da semente (A03 da análise 1):** o job de treino recebe `nthread = 1`, `seed` e os demais valores do mesmo arquivo de configuração da T042; os dois existem como hiperparâmetros do XGBoost do SageMaker ([hiperparâmetros](https://docs.aws.amazon.com/sagemaker/latest/dg/xgboost_hyperparameters.html), consulta em 2026-11-20; o padrão do `nthread` é o máximo de threads, por isso ele precisa ir explícito); o PY-06 reprova um DAG sem os dois;
    - o DAG registra o `sha256` do CSV de treino que o candidato usou, para o DM-07 conferir a pré-condição.
  - **Análise 2 (A12):** um PY novo afirma que a chave do sensor (`interactions/year=…/month=…/day=…/_SUCCESS`) e a data do SQL do Athena saem do mesmo `ds`.
  - **Análise 2 (A15):** `MaxRuntimeInSeconds` e `MaxWaitTimeInSeconds` pequenos (por exemplo, 900 e 1800 s; a API exige espera maior ou igual à execução), no lugar do 7200 de hoje; o PY-06 afirma que a soma dos tempos máximos dos passos mais a criação do MWAA cabe no prazo padrão da janela (T022).
  - **Análise 2 (A16):** o DAG põe as tags `project` e `module` no training job (com `sagemaker:AddTags` na role, T063).
  - **Depende de:** T041, T042.

## Fase 5 · Núcleo: stack base
- [ ] T050 [engenheiro-terraform] Os três jobs do Glue e a conexão de rede do job do MemoryDB · RF-107, RF-010, RF-013, D-051 · TT-G01, TT-G02
  - **Teste vermelho:**
    - TT-G01: todo `job_name` da lista do DAG (lida do mesmo arquivo de configuração de exemplo da T046 ou de um `locals` exportado) tem um `aws_glue_job` no plan; um nome a mais na lista precisa reprovar;
    - TT-G02: os jobs de publicação são `pythonshell` com `max_capacity = 0.0625`; o de features continua Spark com 2 `G.1X`; o job do MemoryDB tem `connections` com uma `aws_glue_connection` do tipo `NETWORK` na subnet privada e no security group que alcança o MemoryDB.
  - **Arquivos:** `U/infra/terraform/modules/glue_pipeline/`, os testes.
  - **Aceite:** os scripts, o wheel e os argumentos (nomes de bucket, tabela, cluster) vêm do Terraform; KMS e logs em todos os jobs (TT existentes `glue_criptografado_e_com_logs`); a role do Glue só escreve na tabela e no prefixo do projeto.
  - **Análise 2 (A12):** um `aws_glue_catalog_table` para `interactions` e outro para `catalog`, com projeção de partição (ou a partição registrada), no banco `p01_recomendacao_` do ADR-0014; um caso novo do TT-G01 reprova o SQL que cita tabela fora do stack.
  - **Análise 2 (A14):** o módulo `lake_formation` dá a permissão `SELECT` às tabelas para a role de execução do MWAA, além da role do Glue.
  - **Depende de:** T012, T044, T045, T046.
- [ ] T051 [engenheiro-terraform] Re-ranker Serverless sem isolamento, com o artefato semente · RF-109, RF-014, RF-005, ADR-0008, ADR-0009 · TT-E01, TT-E02, TT-E03
  - **Teste vermelho:**
    - TT-E03: `expect_failures` para Serverless com `enable_network_isolation = true` (validação ou `precondition`);
    - TT-E01: `model_data_url` aponta para `reranker/publicado/<hash>/model.tar.gz`, o `aws_s3_object` tem `source_hash`, e o hash entra no nome do modelo e na variável `RERANKER_MODEL_VERSION` do serviço;
    - TT-E02: a role do endpoint só lê `reranker/publicado/*` (com `kms:Decrypt` via S3), só puxa a imagem da conta oficial do XGBoost, só escreve no próprio log group e não tem nenhuma escrita em S3.
  - **Arquivos:** `U/infra/terraform/modules/sagemaker_endpoint/`, `modules/s3_golden_dataset/` (prefixos), `variables.tf` (caminho do artefato de build), fixture do `model.tar.gz` para o teste, os testes.
  - **Aceite:** imagem nativa XGBoost 1.7-1 da região; escrita em `reranker/publicado/` só pela role de deploy; o treino (`modules/sagemaker_training/`) só escreve em `reranker/candidatos/`.
  - **Depende de:** T012, T042.
- [ ] T052 [P] [engenheiro-terraform] Saídas da base para a janela · ADR-0007, RF-107 · TT-J02 (novo)
  - **Teste vermelho:** TT-J02 afirma um `aws_ssm_parameter` `/01-recomendacao/lab/janela/entradas`, `type = "String"`, `tier = "Standard"`, com até 4 KB e exatamente os campos que a janela lê (VPC, subnets privadas, chave KMS, bucket, nomes dos jobs, role e imagem do treino, workgroup do Athena e tabela); uma fixture sem o workgroup precisa reprovar; nenhum campo com segredo.
  - **Arquivos:** `U/infra/terraform/main.tf` (ou `janela.tf`), `outputs.tf`, o teste.
  - **Aceite:** a janela não lê o state da base (furo F5).
  - **Depende de:** T012.
- [ ] T053 [engenheiro-terraform] Consumo da plataforma: registro do produto, task role e contrato no task definition · RF-110, RNF-001, ADR-0010, E1 · TT-B01, TT-B02, ST-06
  - **Teste vermelho:**
    - TT-B02: o root chama o módulo `registro-produto` por caminho relativo, com chave `01-recomendacao`, modelo de origem `us.anthropic.claude-haiku-5-5`, tópicos negados vazios (D-053), um agente `explicador` assumido por `ecs-tasks.amazonaws.com`, nenhum alvo e nenhuma tool; o task definition recebe `BEDROCK_PERFIL_ARN`, `GUARDRAIL_ID` e `GUARDRAIL_VERSAO` do `data "aws_ssm_parameter"` do contrato `produtos/01-recomendacao` (mock);
    - TT-B01 (furo F1): o ECS não acrescenta nenhuma ação `bedrock:*` à task role; toda ação `bedrock:*` da role composta (módulo mais ECS) tem recurso só no ARN do perfil do contrato, nos modelos de origem dele e no próprio guardrail, e a de invocação tem a condição `bedrock:GuardrailIdentifier`; a task role é a `01-recomendacao-agente-explicador` do módulo, e o ECS só acrescenta DynamoDB, MemoryDB e SageMaker; as ações de fora do Bedrock que vêm do módulo são só `bedrock-agentcore:InvokeGateway` no ARN do gateway e `ssm:GetParameter` no `comum` e no parâmetro do produto, como diz a linha E do STRIDE do plano depois da emenda 1 (A01 da análise 1); fixture vermelha: uma política do ECS com `bedrock:InvokeModel` em `foundation-model/*`;
    - ST-06 em `static_rules.py`: nenhum `arn:aws:bedrock` nem id de modelo escrito à mão fora de `tests/` e do catálogo do produto.
  - **Arquivos:** `U/infra/terraform/main.tf` (ou `plataforma.tf`), `modules/ecs_service/` (task role vinda de fora, variáveis do task definition), `variables.tf` (sai `bedrock_model_id`), os testes.
  - **Aceite:**
    - sem os valores do contrato, o plan falha cedo com mensagem que manda aplicar a plataforma antes (ordem do dia, ADR-0016);
    - o `bedrock-agentcore:InvokeGateway` que o módulo dá ao agente sem alvo fica como risco residual do R9, negado pela ausência de `permit` no Cedar; se a plataforma adotar a sugestão do R9 (omitir `InvokeGateway` sem alvo), o TT-B01 passa a afirmar a ausência;
    - **catálogo sem tool e sem role de aprovação:** se o módulo exigir alvo, tool ou role de aprovação para um produto como a D01, a tarefa para e devolve o achado à plataforma (R9), sem contorno na D01;
    - checkov e tflint limpos.
  - **Depende de:** T011, T014; plataforma T030, T032, T033, T034, T036, T037 e T038 (R9).
- [ ] T054 [engenheiro-terraform] Sete alarmes do stack e o de intervenção do guardrail · RNF-003, RNF-004, Art. VI · TT-A01
  - **Teste vermelho:** TT-A01 afirma os 7 alarmes do RNF-003 com os limiares, estatísticas e períodos da tabela da spec, todos com ação no tópico SNS com KMS do cliente, e que o alarme de intervenção do guardrail vem do módulo da plataforma com a ação no tópico do contrato; uma fixture sem a ação de um alarme precisa reprovar.
  - **Arquivos:** `U/infra/terraform/modules/cloudwatch_monitoring/`, o teste.
  - **Aceite:** as métricas do serviço vêm por EMF (T015) no namespace `Ecommerce/Recommendations`, sem mudar os alarmes; o TT existente `monitoramento_e_orcamento` continua verde.
  - **Depende de:** T013, T015, T053.
- [ ] T055 [engenheiro-terraform] Workflow de apply da base: requisitos, build e duas passadas · RNF-101, ADR-0008, ADR-0016, D-034 · TH-07 (extensão), `estado.py validar`
  - **Teste vermelho:** o TH-07 passa a exigir no `01-recomendacao-apply.yml`, depois dos passos do modelo:
    - `infra.py requisitos 01-recomendacao` antes do Terraform (plataforma no ar com pelo menos 2 h, plataforma T043);
    - os inputs `enable_serverless_inference` e `explanations_enabled`;
    - o build dos artefatos em `U/build/`: a imagem com tag igual ao SHA do commit, o `model.tar.gz` semente do `train_reranker.py` e o wheel do cliente Redis com hash fixado;
    - duas passadas de `terraform apply` com a mesma configuração e sem `-target`: a primeira com `ecs_desired_count = 0`, depois o push da imagem e a segunda com `desired_count = 1`;
    - o registro do prazo antes do primeiro `terraform apply` (`needs: prazo`, plataforma T043);
    - fixture vermelha: um apply com `-target`.
  - **Arquivos:** `.github/workflows/01-recomendacao-apply.yml`, `harness/testes/test_workflows_01_recomendacao.py`.
  - **Aceite:** `checar_apply` ok (prazo, `infra.py registrar`, `list-cost-allocation-tags`); actions fixadas pelos SHAs dos modelos; `id-token: write` só nos jobs com OIDC.
  - **Análise 2 (A12):** o build roda o gerador da T040 para uma data de partição fixa, e o Terraform sobe os arquivos e o `_SUCCESS` com `source_hash`; os mesmos bytes alimentam a semente do `train_reranker.py`. O TH-07 exige esse passo.
  - **Depende de:** T010, T032, T042, T050, T051; plataforma T043.
- [ ] T056 [engenheiro-terraform] Workflow de destroy da base em cascata e sobras com as exceções · RNF-101, ADR-0006, ADR-0007, Art. V · TH-07 (extensão), TH-02, `estado.py validar`
  - **Teste vermelho:** o TH-07 passa a exigir no `01-recomendacao-destroy.yml`:
    - antes do destroy da base, o destroy da raiz da janela (com state vazio, não faz nada);
    - a verificação de sobras pela tag `project=01-recomendacao`, ignorando só a chave KMS em `PendingDeletion` (filtro do modelo, plataforma T048) e o serviço ECS que não está `ACTIVE` nem `DRAINING` (ADR-0006), e reprovando qualquer log group com o prefixo `airflow-p01-recomendacao`;
    - `infra.py remover` da janela e da base no fim;
    - fixture vermelha: um destroy da base sem o passo da janela.
  - **Arquivos:** `.github/workflows/01-recomendacao-destroy.yml`, `harness/testes/test_workflows_01_recomendacao.py`.
  - **Aceite:** `checar_destroy` ok; ambiente `aws-lab-destroy`, sem aprovação (D-024); `confirm_stack = 01-recomendacao-lab`.
  - **Análise 2 (A16):** a verificação de sobras trata training job em `Completed`, `Failed` ou `Stopped` como exceção sem custo, como o ECS `INACTIVE`, e reprova training job em `InProgress`; a exceção entra no ADR-0006 com fonte e o critério 2 da spec ganha a mesma frase. O log group `/aws/sagemaker/TrainingJobs` é compartilhado pela conta: ou o `infra/conta` o cria com retenção curta, ou a tarefa apaga os streams com o prefixo do projeto, e a verificação confere os streams pelo prefixo.
  - **Depende de:** T010, T023, T032; plataforma T048.

## Fase 6 · Núcleo: janela do MWAA (D-052, ADR-0007)
- [ ] T060 [engenheiro-terraform] Raiz da janela com tags, state remoto e entradas da base · ADR-0007, Art. VI, RNF-107 · TT-T01 (janela), ST (backend)
  - **Teste vermelho:** `U/infra/janela-mwaa/tests/tags.tftest.hcl` do modelo do harness com `projeto = "01-recomendacao"` e `module = "orquestracao-mwaa"` em todo recurso; a regra estática de backend passa a cobrir a raiz nova (`backend "s3" {}` parcial e `use_lockfile`), com a chave `01-recomendacao/janela-mwaa.tfstate`; a raiz lê só o `data "aws_ssm_parameter"` `/01-recomendacao/lab/janela/entradas` (mock), sem `terraform_remote_state`.
  - **Arquivos:** `U/infra/janela-mwaa/{versions.tf,providers.tf,variables.tf,main.tf,outputs.tf,terraform.tfvars.example,backend.hcl.example}`, `tests/tags.tftest.hcl`, `static_rules.py`.
  - **Aceite:** `fmt`, `validate`, `tflint` e `checkov` limpos na raiz nova.
  - **Depende de:** T011, T052.
- [ ] T061 [engenheiro-terraform] Ambiente MWAA `mw1.micro` com log groups do Terraform · RF-010, RNF-001, D-052, ADR-0014 · TT-K03, TT-T02 (janela)
  - **Teste vermelho:** `U/infra/janela-mwaa/tests/mwaa.tftest.hcl` afirma o ambiente `p01-recomendacao-lab-mwaa` com `environment_class = "mw1.micro"`, `airflow_version = "2.11.2"`, `webserver_access_mode = "PRIVATE_ONLY"`, `kms_key` da base; os log groups `airflow-p01-recomendacao-lab-mwaa-*` criados no Terraform com KMS e retenção de 7 dias; o TT-T02 da janela aceita `p01-recomendacao-` só pelo `excecoes_de_nome.json`; TT-K03: tudo da janela usa a chave KMS da base, e o bucket nega `aws:SecureTransport = false`.
  - **Arquivos:** `U/infra/janela-mwaa/mwaa.tf`, os testes reescritos a partir dos TT `mwaa_ligado_privado` e `mwaa_desligado_por_padrao` da base, `U/infra/terraform/tests/excecoes_de_nome.json` (atualiza a fonte da exceção `mwaa-ambiente`, do `CreateEnvironment`, e acrescenta os log groups do Airflow).
  - **Aceite:** o módulo `mwaa_orchestration` sai da base e passa a ser usado só por esta raiz.
  - **Depende de:** T014, T060.
- [ ] T062 [P] [engenheiro-terraform] Nove endpoints da janela em 1 AZ · RNF-002, Art. V · TT-K02 (janela), ST-07 (janela)
  - **Teste vermelho:** a raiz da janela tem exatamente os endpoints de interface `sqs`, `kms`, `monitoring`, `airflow.api`, `airflow.env`, `airflow.ops`, `athena`, `glue` e `sagemaker.api`, em 1 AZ, com o security group da janela; nenhum `aws_nat_gateway`; o ST-07 cobre a raiz e exige o ADR-0007 citado.
  - **Arquivos:** `U/infra/janela-mwaa/endpoints.tf`, os testes, `static_rules.py`.
  - **Aceite:** os endpoints da base não se repetem aqui.
  - **Depende de:** T060.
- [ ] T063 [engenheiro-terraform] Role de execução do MWAA e configuração do DAG · RF-010, RF-107, RNF-001 · TT-J01
  - **Teste vermelho:** TT-J01 afirma a role de execução com `athena:StartQueryExecution` só no workgroup do projeto; `glue:StartJobRun` e `GetJobRun` só nos três jobs; `sagemaker:CreateTrainingJob` e `DescribeTrainingJob` em `training-job/01-recomendacao-*`; `iam:PassRole` só para a role de treino; S3 com leitura de `dags/` e escrita só em `reranker/candidatos/`; o objeto `dags/config/01-recomendacao.json` gerado a partir das entradas da base; fixture vermelha: `glue:StartJobRun` em `*`.
  - **Arquivos:** `U/infra/janela-mwaa/{iam.tf,dags.tf}`, os testes.
  - **Aceite:** o DAG e os scripts não têm nenhum nome escrito (PY-01 verde); o checkov passa sem `*` com `*`.
  - **Análise 2 (A14):** o TT-J01 passa a afirmar o conjunto completo, cada item com fonte e data: `athena:StartQueryExecution`, `GetQueryExecution` e `GetQueryResults` no workgroup; leitura e escrita em `athena_results/` e leitura dos prefixos de dados; `glue:GetDatabase`, `GetTable` e `GetPartitions` no banco e nas tabelas do projeto; `lakeformation:GetDataAccess` (a permissão `SELECT` vem da T050); `kms:GenerateDataKey` e `Decrypt` na chave da base com `kms:ViaService` do S3; `sagemaker:AddTags` no training job. A fixture vermelha continua: `glue:StartJobRun` em `*` e escrita fora de `athena_results/` e `reranker/candidatos/`.
  - **Depende de:** T046, T061.
- [ ] T064 [engenheiro-terraform] Workflows de apply e destroy da janela · RNF-101, ADR-0007, D-024, D-052 · TH-03, TH-08, TH-09 (novo), `estado.py validar`
  - **Teste vermelho:** com o componente registrado (T021), o `estado.py validar` em `verificar` reprova os dois workflows ausentes; o TH-07 passa a exigir no apply da janela `prazo_horas` com padrão 2 e máximo 3, a recusa se a base não está no ar e `infra.py registrar --componente janela-mwaa`; e no destroy da janela `confirm_stack = 01-recomendacao-janela-mwaa`, ambiente `aws-lab-destroy` e sobras por `project=01-recomendacao` e `module=orquestracao-mwaa` juntos.
  - **Arquivos:** `.github/workflows/01-recomendacao-janela-mwaa-apply.yml`, `01-recomendacao-janela-mwaa-destroy.yml`, `harness/testes/test_workflows_01_recomendacao.py`.
  - **Teste vermelho (A04 da análise 1):** TH-09, um caso em `harness/testes/test_workflows_01_recomendacao.py` afirma que os quatro workflows de apply e destroy (base e janela) têm o mesmo `concurrency.group: 01-recomendacao-state`, com `cancel-in-progress: false`; uma fixture com a janela em outro grupo precisa reprovar. O TH-07 compara jobs e passos, não o bloco `concurrency`, por isso o caso é próprio.
  - **Aceite:** mesmos SHAs dos modelos; `id-token: write` só nos jobs; a exceção do CKV_GHA_7 só por estarem registrados como componente (TH-08);
    - **um só grupo serializa os destroys:** com o mesmo grupo, o destroy da janela dentro do destroy da base nunca disputa o lock do state com outro destroy da janela, e o `-lock-timeout=120s` do modelo deixa de ser o árbitro;
    - **execução pendente substituída:** pela documentação do GitHub, uma execução nova no mesmo grupo cancela a que estava pendente, e a opção `queue: max` mantém até 100 pendentes ([concorrência](https://docs.github.com/en/actions/using-jobs/using-concurrency), consulta em 2026-11-20). Um apply da janela enfileirado poderia cancelar um destroy pendente. Os quatro workflows usam `queue: max` se o `actionlint` e o `zizmor` da esteira aceitarem a chave; se não aceitarem, a tarefa para e devolve o achado ao `operador-harness`, porque a mudança é do modelo do harness, e não da D01.
  - **Análise 2 (A22):** sem a chave `queue: max` confirmada por fonte, a tarefa segue e registra no aceite que o risco é coberto pela recusa da T022 (a janela só é registrada com a base a mais de 1 h mais o prazo mínimo do vencimento) e pelo redisparo do `expirar-infra.yml`; com a chave confirmada, ela entra. A tarefa não para por essa chave.
  - **Depende de:** T021, T022, T023, T032, T061.

## Fase 7 · Núcleo: serviço
- [ ] T070 [P] [engenheiro-seguranca] Categoria por lista de caracteres permitidos, no controlador e no repositório · RNF-104, RNF-001, Art. IV · VT-01, VT-02
  - **Teste vermelho:** VT-01 em `U/tests/contract/recommendations-api.contract.test.ts`: `category` com `}`, `|`, `*`, `@`, `)`, espaço ou 41 caracteres dá 400 com `error`, `message` e `requestId`, e o repositório vetorial não é chamado; VT-02 em `U/tests/unit/memorydb-vector-candidate.repository.test.ts`: o repositório lança erro de validação com uma categoria fora do padrão, sem montar a consulta.
  - **Arquivos:** `U/src/serving/src/presentation/controllers/recommendation.controller.ts`, `U/src/serving/src/infrastructure/memorydb/memorydb-vector-candidate.repository.ts`, os testes.
  - **Aceite:** o padrão `^[A-Za-z0-9_]{1,40}$` fica numa constante só, usada pelos dois; o contrato OpenAPI documenta o padrão.
  - **Depende de:** T000.
- [ ] T071 [engenheiro-ml] Consulta `FT.SEARCH` sem `SORTBY`, com `LIMIT 0 k` · RF-002, RNF-104, E8, ADR-0011 · VT-03
  - **Teste vermelho:** VT-03 afirma os argumentos exatos enviados ao cliente Redis: `FT.SEARCH item_idx "<filtro>=>[KNN k @v $vec AS vector_score]" PARAMS 2 vec <bytes> LIMIT 0 k RETURN 3 vector_score cat inStock DIALECT 2`, sem `SORTBY`, com `k` igual ao pedido (até 50).
  - **Arquivos:** `U/src/serving/src/infrastructure/memorydb/memorydb-vector-candidate.repository.ts`, `U/tests/unit/memorydb-vector-candidate.repository.test.ts`.
  - **Aceite:** o serviço recebe até 50 candidatos vetoriais, e não mais 10; o `inStock` do `RETURN` chega ao candidato.
  - **Depende de:** T070.
- [ ] T072 [engenheiro-ml] Vetor da busca pelos itens da sessão · RF-105, E5, ADR-0011 · VT-04
  - **Teste vermelho:** VT-04: com dois `sessionItemIds`, um único pipeline `HGET item:<id> v` é feito e o vetor da consulta é a média normalizada em L2 dos dois (diferente de zero); id ausente é ignorado; sem sessão ou sem nenhum vetor, o repositório vetorial não é chamado e `degradedMode` fica `false`; mais de 10 ids ou id fora do padrão do `userId` dá 400.
  - **Arquivos:** controlador, caso de uso (`get-recommendations.use-case.ts`), repositório do MemoryDB, os testes.
  - **Aceite:** leitura e busca dividem o orçamento de 15 ms; o `new Float32Array(128)` de zeros sai do código.
  - **Depende de:** T071.
- [ ] T073 [P] [engenheiro-ml] Falha de dependência propagada pelos adaptadores reais · RF-106, RF-006, E4, ADR-0011 · VT-05, VT-06
  - **Teste vermelho:** VT-05 e VT-06 em `U/tests/integration/fallback-real-adapters.test.ts`, com o adaptador real sobre o cliente simulado (DynamoDB `send` e Redis `call` que lançam): o caso de uso real devolve 200, `degradedMode: true` e publica `DynamoDbFallbackCount` ou `MemoryDbFallbackCount`; "sem dados" (item ausente) continua lista vazia, sem degradação.
  - **Arquivos:** os dois adaptadores (lançam `DependencyError {dependencia, categoria, retentavel}`), o caso de uso, `U/src/serving/src/domain/` (tipo do erro), os testes.
  - **Aceite:** os quatro testes de fallback existentes (T005) seguem verdes; o disjuntor conta a falha propagada.
  - **Depende de:** T000.
- [ ] T074 [engenheiro-ml] Compras recentes e estoque pelo lote no serviço real · RF-104, RF-004, RF-006, E7, ADR-0012 · VT-07, VT-08
  - **Teste vermelho:** com o `buildDefaultUseCase` e os clientes simulados: VT-07, um item comprado há 10 dias (em `recentPurchases` do item do DynamoDB) não aparece, e um com `inStock: false` não aparece; VT-08, com a fonte fora do ar ou o repositório de elegibilidade lançando, a resposta é 200 com `degradedMode: true`, nunca 500.
  - **Arquivos:** `U/src/serving/src/presentation/server.ts` (`buildDefaultUseCase`), `U/src/serving/src/infrastructure/cache/inventory-eligibility.repository.ts`, o adaptador do DynamoDB (lê `recentPurchases` no mesmo GetItem), os testes.
  - **Aceite:** nenhuma chamada nova no caminho de 60 ms; a documentação diz que o frescor é o do lote (diário).
  - **Depende de:** T071, T073.
- [ ] T075 [P] [engenheiro-ml] Cliente do re-ranker no contrato CSV do container nativo · RF-005, RF-109, ADR-0008 · VT-09, VT-16
  - **Teste vermelho:** VT-09: o cliente manda `Content-Type: text/csv` com uma linha `batchScore,vectorScore,hibrido` por candidato, na ordem, e lê um score por linha; uma resposta com quantidade de scores diferente vira erro de contrato, e a resposta cai na heurística com `degradedMode: true`; VT-16: o `modelId` da resposta vem de `RERANKER_MODEL_VERSION`.
  - **Arquivos:** `U/src/serving/src/infrastructure/sagemaker/sagemaker-scoring.client.ts`, `U/src/serving/src/config/env.ts`, os testes; o contrato JSON legado `sagemaker-inference-contract.json` sai.
  - **Aceite:** o `fallback-sagemaker-degradation` (T005) segue verde; até 100 candidatos por chamada e 35 ms de timeout.
  - **Depende de:** T000.
- [ ] T076 [P] [engenheiro-ml] Saúde com verificadores reais no servidor de produção · RF-008 · VT-19
  - **Teste vermelho:** VT-19: o servidor montado por `buildDefaultUseCase` injeta verificadores do DynamoDB, do MemoryDB e do SageMaker; com um deles simulado fora, `GET /health` dá `DEGRADED`; com todos fora, `DOWN`.
  - **Arquivos:** `U/src/serving/src/presentation/server.ts`, `controllers/health.controller.ts`, o teste.
  - **Aceite:** o health check do ALB continua usando um caminho que só prova o processo, para uma dependência fora não derrubar a task (a resposta 200 do RF-006 depende da task no ar); a decisão fica num comentário do teste.
  - **Depende de:** T000.
- [ ] T077 [P] [engenheiro-ml] Catálogo curado com nomes fictícios · RNF-109, Art. VIII · VT-14
  - **Teste vermelho:** VT-14 confere cada título do catálogo curado de fallback e do `U/scripts/seed-local.ts` contra `U/tests/fixtures/nomes-ficticios.json`; um título com marca real precisa reprovar.
  - **Arquivos:** `U/src/serving/src/infrastructure/fallback/curated-fallback.provider.ts`, `U/scripts/seed-local.ts`, a lista de nomes, o teste.
  - **Aceite:** o gerador do lote usa a mesma lista (PY-07).
  - **Depende de:** T000.

## Fase 8 · Componente Claude (só respostas gravadas, D-006)
- [ ] T080 [avaliador-llm] Proveniência nas respostas gravadas e gravações novas · RF-111, RF-110, E10, Art. III · VT-13
  - **Teste vermelho:** VT-13 em `U/tests/unit/gravacoes.test.ts` reprova uma resposta gravada sem o campo `proveniencia`, ou com valor fora de `sintetica`, `documentacao` e `captura` (furo F8).
  - **Arquivos:** as gravações usadas por `recommendation-explainer.test.ts` e `explanation-in-recommendations.test.ts` movidas para `U/tests/fixtures/claude/`, cada uma com `proveniencia`; gravações novas: intervenção do guardrail no InvokeModel (`amazon-bedrock-guardrailAction: INTERVENED`), intervenção e erro do `ApplyGuardrail`, e 403 por falta do guardrail.
  - **Aceite:** as de formato tirado da documentação da AWS ([testar guardrail](https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails-test.html)) ficam como `documentacao`, com o link; as escritas à mão, `sintetica`; o ADR-0004 diz que o comportamento real do modelo não é validado em CI (D-006).
  - **Depende de:** T000.
- [ ] T081 [engenheiro-claude] Configuração pelo contrato, cabeçalhos do guardrail e falha fechada · RF-110, ADR-0010, E9 · VT-10
  - **Teste vermelho:** VT-10: com `BEDROCK_PERFIL_ARN`, `GUARDRAIL_ID` e `GUARDRAIL_VERSAO`, a requisição sai com `model` igual ao ARN do perfil e os cabeçalhos `X-Amzn-Bedrock-GuardrailIdentifier` e `X-Amzn-Bedrock-GuardrailVersion`, sem `X-Amzn-Bedrock-Trace`, e os cabeçalhos entram na assinatura (verificado sobre a requisição final do SDK com o fetch simulado); sem qualquer um dos três valores, o explicador não chama o modelo e devolve `unavailable` com `internal_error`.
  - **Arquivos:** `U/src/serving/src/infrastructure/bedrock/bedrock-claude.client.ts`, `U/src/serving/src/config/env.ts` (sai `bedrock_model_id`), os testes.
  - **Aceite:** nenhum id de modelo ou ARN escrito no código (ST-06); `@anthropic-ai/bedrock-sdk` fixado em 1.1.2.
  - **Depende de:** T080.
- [ ] T082 [engenheiro-claude] Intervenção no InvokeModel e 403 sem guardrail como categorias não retentáveis · RF-110, RF-007, ADR-0010 · VT-11
  - **Teste vermelho:** VT-11: com a gravação de intervenção, o explicador devolve `unavailable` com a categoria nova `guardrail`, sem segunda tentativa e sem contar no disjuntor; com a gravação de 403, `unavailable`, não retentável.
  - **Arquivos:** `U/src/serving/src/application/recommendation-explainer.ts`, `U/src/serving/src/domain/explanation.ts` (categoria `guardrail`), o cliente, os testes.
  - **Aceite:** o campo é lido do corpo cru pela porta `ClaudeMessagesPort`; sem o campo e sem `tool_use`, segue a validação de hoje (R4); as métricas `ExplanationFallbackCount` contam a intervenção.
  - **Depende de:** T081.
- [ ] T083 [P] [engenheiro-claude] Campos de catálogo entre as marcas de entrada do guardrail · RF-110, ADR-0010 (injeção indireta) · VT-17
  - **Teste vermelho:** VT-17: título e categoria de cada item vão entre as marcas de entrada do guardrail, com um sufixo aleatório por requisição (duas requisições têm sufixos diferentes); nada além desses campos fica marcado; um título que contém a marca de fechamento não fecha a marca.
  - **Arquivos:** `recommendation-explainer.ts` (montagem do prompt), os testes.
  - **Aceite:** o prompt continua com os critérios explícitos e o exemplo do ADR-0004.
  - **Depende de:** T081.
- [ ] T084 [engenheiro-claude] `ApplyGuardrail` na saída, dentro do orçamento de 2,5 s · RF-110, RF-007, ADR-0010 · VT-12
  - **Teste vermelho:** VT-12: depois da validação, as frases aprovadas passam por um `ApplyGuardrail` com `source=OUTPUT` no guardrail do contrato; a gravação de intervenção vira `guardrail`; um erro da chamada segue as categorias do RF-007 (429 retentável, 400 não); o timeout de 2,5 s cobre as duas chamadas.
  - **Arquivos:** um cliente do `ApplyGuardrail` atrás de uma porta, `recommendation-explainer.ts`, os testes.
  - **Aceite:** nenhuma frase chega à resposta sem passar na validação e no `ApplyGuardrail`.
  - **Depende de:** T082.
- [ ] T085 [P] [engenheiro-seguranca] Logger sem prompt nem texto do modelo · RNF-001, Art. IV, Art. VIII · VT-18
  - **Teste vermelho:** VT-18: com o logger real, uma requisição com `explain=true` (sucesso, retentativa e intervenção) não grava prompt, texto do modelo nem título de catálogo; só os campos da lista permitida (`requestId`, status, duração, etapa, categoria do erro).
  - **Arquivos:** `U/src/serving/src/infrastructure/logging/logger.ts`, os testes.
  - **Aceite:** a lista permitida fica numa constante; um campo novo no log exige mudar a lista e o teste.
  - **Depende de:** T081.

## Fase 9 · Operação, custo e documentação
- [ ] T090 [engenheiro-terraform] Workflow do roteiro de demonstração · RF-108, ADR-0016, RNF-001 · TT-R01, TH-08 (extensão)
  - **Teste vermelho:**
    - TT-R01: o roteiro usa o mesmo task definition do serviço (`aws ecs run-task` com `overrides` de comando e de variáveis), e a role do roteiro não tem permissão que a task role não tenha;
    - TH-08: o `01-recomendacao-roteiro.yml` tem, no job da parte `servico`, os passos de esperar a tarefa, ler o relatório do log e ler as métricas, nessa ordem, e uma fixture sem a leitura das métricas precisa reprovar (A02); tem só `workflow_dispatch` com o input `parte` (`lote` ou `servico`), ambiente `aws-lab`, `permissions` com `id-token: write` só no job e `contents: read`, e upload do relatório com `retention-days: 1`; a exceção do CKV_GHA_7 vale para ele porque ele está registrado no campo `workflows_operacao` do projeto no `harness/estado.json` (furo F2); um workflow sintético com o input e sem registro precisa reprovar.
  - **Arquivos:** `.github/workflows/01-recomendacao-roteiro.yml`, `harness/estado.py` (campo `workflows_operacao`, validado como o `componentes`), `harness/estado.json`, `harness/testes/test_workflows.py` e `test_workflows_01_recomendacao.py`, `U/infra/terraform/tests/` (TT-R01).
  - **Aceite:**
    - parte `lote`: liga e dispara o DAG pelo `InvokeRestApi`, consulta o estado em intervalos (timeout de 10 s por chamada) e registra o `dag_run_id` e o caminho do candidato;
    - parte `servico` (A02 da análise 1): roda a tarefa da T091 com `aws ecs run-task`; espera o fim com `aws ecs wait tasks-stopped` (`ecs:DescribeTasks`) e reprova se o código de saída do contêiner não for 0; lê do log da tarefa, no runner, a linha JSON marcada do relatório (`logs:GetLogEvents` no stream `prefixo/contêiner/id-da-tarefa`), e reprova se ela faltar (o modo `non-blocking` do `awslogs` pode perder linhas, e relatório ausente é falha, não sucesso); depois lê as métricas do namespace `Ecommerce/Recommendations` por `GetMetricData`, também no runner, com a janela de tempo da tarefa e uma espera pela chegada das métricas EMF; junta os dois no relatório. Nada disso roda dentro da tarefa, que não tem rota para a API do CloudWatch (sem endpoint `monitoring` na base, TT-K02) nem permissão (TT-R01);
    - o serviço no ar não é alterado (nenhum cabeçalho, flag ou rota de teste);
    - o relatório nunca entra em commit pelo workflow; o dono revisa antes (5.5);
    - se a plataforma T068 já tiver criado um mecanismo de registro de workflow de operação, ele é reusado no lugar do `workflows_operacao`.
  - **Análise 2 (A12):** a parte `lote` dispara o DAG com `logical_date` igual à data da partição gerada na T055.
  - **Análise 2 (A15):** antes de disparar, a parte `lote` confere o tempo que resta à janela e recusa, com a sugestão de `infra.py estender --componente`, se ele não cobrir o pior caso do DAG.
  - **Depende de:** T031, T032, T064, T091.
- [ ] T091 [engenheiro-ml] Script do roteiro dentro da tarefa ECS · RF-108, RNF-004, ADR-0016 · VT-20 (novo)
  - **Teste vermelho:** VT-20 em `U/tests/integration/roteiro.test.ts`, com o servidor e as dependências simuladas: o roteiro produz os quatro passos do RF-108 (híbrida; explicação aceita na primeira tentativa; `unavailable/timeout` com `EXPLANATION_TIMEOUT_MS=1`; `degradedMode: true` com o MemoryDB numa porta fechada), cada um com o `requestId`; calcula o p95 sem explicação sobre 200 chamadas; registra o aquecimento do re-ranker e o cold start; escreve o relatório em stdout numa única linha JSON marcada (`"tipo": "relatorio-roteiro"`), que o teste lê e valida; e não importa nenhum cliente do CloudWatch nem chama API de controle (A02 da análise 1).
  - **Arquivos:** `U/src/serving/src/roteiro.ts` (compilado em `dist/roteiro.js`), o teste.
  - **Aceite:** o relatório é JSON com `requestId`, status e latências, sem dado pessoal, sem prompt e sem texto do modelo (a linha respeita a lista permitida do logger, T085); as métricas do namespace não são lidas aqui, e sim pelo workflow no runner (T090); o passo 2 registra as tentativas como dado, não como falha.
  - **Depende de:** T072, T073, T074, T084, T085.
- [ ] T092 [engenheiro-ml] Contratos em `U/contratos/` e spec legada removida · RNF-110, RNF-008, E14 · ST-03 (parte)
  - **Teste vermelho:** o ST-03 reprova se `U/specs/001-aws-recommendation-platform/` existir, ou se algum teste ler contrato fora de `U/contratos/`.
  - **Arquivos:** `git mv` dos contratos usados (`recommendations-api.yaml`, `dynamodb-batch-recs-contract.json`, `memorydb-vector-contract.md`) para `U/contratos/`; remoção do resto da spec legada; os caminhos nos testes; `static_rules.py`.
  - **Aceite:** Vitest e unittest do lote verdes com os caminhos novos.
  - **Depende de:** T044, T045, T075.
- [ ] T093 [redator-tecnico] `U/CLAUDE.md` curto e README com o teto, 13 módulos e 5 passos · RNF-110, RF-017, Art. VI · ST-03, ST-08, TH-06
  - **Teste vermelho:** ST-03: `U/CLAUDE.md` com menos de 60 linhas, citando `specs/01-recomendacao/`, sem "FIXED", Lambda, Fargate Spot com escala a zero nem `.claude/memory/`; ST-08: `U/README.md` com no máximo 5 passos, o teto diário de US$ 7,10, a contagem certa de módulos e os workflows novos (base, janela e roteiro).
  - **Arquivos:** `U/CLAUDE.md`, `U/README.md`, `static_rules.py`.
  - **Aceite:** o CLAUDE.md da unidade só acrescenta o que é da pasta e não repete nem contradiz o da raiz (hierarquia de CLAUDE.md, 3.1); o TH-06 segue verde.
  - **Depende de:** T013, T055, T064, T090.
- [ ] T094 [redator-tecnico] Posts e textos da unidade sem os termos antigos · RNF-110, RNF-111, RF-017 · ST-02
  - **Teste vermelho:** ST-02 reprova `US$ 10`, `recsys` e "FIXED" em qualquer arquivo da unidade fora do histórico dos ADRs 0001 a 0006 (seção marcada como histórico).
  - **Arquivos:** `U/posts/aws.md`, `U/posts/gcp.md` (design doc, não publicado, D-054), `U/docs/matriz-cobertura.md` (aponta para `specs/01-recomendacao/matriz.md`), os ADRs antigos (nota de histórico), `static_rules.py`.
  - **Aceite:** o post AWS troca o "US$ 10/mês" pelo teto de um dia; o post GCP mantém o mapeamento do plano; toda afirmação sobre empresa tem fonte e data, ou fica marcada como inferência (Art. VIII); a revisão final é a T107.
  - **Depende de:** T011, T012, T092, T093.
- [ ] T095 [P] [desenvolvedor-site] Site sem link para o post GCP · RF-017, D-054 · ST-05
  - **Teste vermelho:** ST-05 reprova se `site/` tiver link ou item em `ITEMS` para o post GCP da D01.
  - **Arquivos:** `site/projetos/01-03-recomendacao.html`, `site/posts/`, `site/index.html`, `static_rules.py`.
  - **Aceite:** a página continua com status "Em revisão"; a publicação é a T110 e a T111.
  - **Depende de:** T000.
- [ ] T096 [finops-demonstracao] Custo do PR contra o teto, com as raízes somadas · Art. V, RNF-002, RNF-102, R6 · ES (Infracost), TH-04, TH-10 (novo)
  - **Teste vermelho:** o comentário do gate de custo no PR mostra a base e a janela numa linha só do projeto, com a janela pesada por 3/24; um valor acima de US$ 7,10 reprova.
  - **Teste vermelho (A05 da análise 1):** TH-10 em `harness/testes/test_custo_01_recomendacao.py` lê o `infracost-usage.yml` da unidade e reprova se faltar uma premissa do plano, se uma quantidade não for a premissa diária × 730/24 (a unidade que o Infracost lê é mensal), se houver horas do MWAA no arquivo (o peso da janela é só do gate, T024), ou se o arquivo de linhas não cobertas não tiver o Claude e o guardrail com o valor do plano.
  - **Arquivos:** comentário de revisão no PR; o `infracost-usage.yml` da unidade com as premissas do plano (requisições e invocações), cada valor com um comentário que o liga à linha da tabela "Custo do lab", como a T073 da plataforma; o arquivo de linhas não cobertas (T024); o teste.
  - **Aceite:**
    - confere os três preços sem tabela (R6): MemoryDB `db.t4g.small`, `mw1.micro` e treino `ml.m5.large`, cada um com a fonte e a data;
    - se o dia passar de US$ 7,10, a tarefa para e leva a pergunta ao dono com o número medido; o teto nunca sobe sozinho (skill `custo-diario`);
    - separa as linhas cobertas pelo Infracost das que ele não estima (Claude, guardrail), somando as duas no total;
    - **o gate fecha com a tabela:** com o Infracost real do PR, o valor diário calculado pelo gate é igual ao da tabela "Custo do lab", dentro de 1 centavo, mais a correção da A07 abaixo; diferença maior vira achado com as linhas que divergem;
    - **guardrail no pior caso com a retentativa (A07 da análise 1):** o arquivo de linhas não cobertas usa 16 unidades por explicação (6 × 2 na entrada e 1 × 2 na saída do InvokeModel, mais 2 no `ApplyGuardrail`), e não 9: a linha vai de US$ 0,45 para 0,80 e o dia, de US$ 6,43 para 6,78, ainda abaixo do teto de US$ 7,10. O teto não muda.
  - **Análise 2 (A18):** o TH-10 compara a linha do guardrail com o valor do plano corrigido pela A07 (US$ 0,80) e exige também a linha do treino (US$ 0,023, criado pelo DAG fora do Terraform); o arquivo de uso fica em `U/infra/terraform/infracost-usage.yml`, e a raiz da janela não tem arquivo de uso (o peso é só do gate, T024). Sem espera pela plataforma T073 além do `usage_file` no `seguranca.yml` (A17).
  - **Depende de:** T024, T050, T051, T053, T054, T061, T062; plataforma T073 (só o `usage_file` no `seguranca.yml`).
- [ ] T097 [engenheiro-seguranca] Modelo de ameaças contra os testes e esteira limpa · Art. IV, RNF-001 · ES
  - **Teste vermelho:** cada linha do STRIDE e das fronteiras de LLM do plano precisa apontar para um teste verde com tarefa `[x]`; linha sem prova reprova a revisão.
  - **Arquivos:** comentário de revisão no PR; exceções versionadas (`.checkov.yaml`, `.trivyignore`, `.semgrepignore`) só com ADR.
  - **Aceite:** gitleaks, Semgrep, CodeQL, zizmor, Trivy, checkov e tflint sem achado alto ou crítico; os riscos aceitos do ADR-0003 (MemoryDB `open-access`, HTTP entre ALB e task) continuam escritos, com o próximo passo.
  - **Depende de:** T031, T053, T070, T085, T090.

## Fase 10 · Verificação
- [ ] T100 [testador-integracao] Integração no Floci e relatório · RF-015, Art. III, Art. V · FL-01, FL-02, FL-03, FL-04, FL-05
  - **Teste vermelho:** asserts escritos antes do apply: FL-01 base com tags, alarmes com SNS e Budgets diário; FL-02 janela com o DAG carregado no MWAA em modo real; FL-03 o explicador contra o `bedrock-runtime` do emulador nunca lança exceção e cai no fallback com a configuração do contrato lida do SSM do Floci; FL-04 destroy em cascata (janela, depois base) sem recurso com `project=01-recomendacao` e sem log group `airflow-p01-recomendacao*`; FL-05 relatório.
  - **Arquivos:** `testing/scripts/integracao_01_03_recomendacao.py` (as duas raízes, com a chave nova), relatório em `testing/reports/` e `testing/reports/latest.html`, `site/relatorios/01-03-recomendacao.html`.
  - **Aceite:**
    - **contrato da plataforma no Floci (furo F4):** a integração aplica antes a composição da plataforma no Floci (plataforma T080) para publicar o `comum`, e o root da D01 chama o `registro-produto` com a variável de separação da parte não emulada (plataforma T038);
    - imagem `${FLOCI_IMAGE:-floci/floci:latest}` (D-013);
    - o relatório separa falha real de lacuna, e cada lacuna tem evidência (ADR-0006, R11, R12): `InvokeRestApi` ausente (FL-02 usa o token de login web), guardrail não aplicado, endpoint do SageMaker que não sobe, EMF não documentado, Airflow 2.11.2 fora da lista (versão mais próxima só no override do harness);
    - nenhum código correto alterado para agradar o emulador; o relatório vai para o dono.
  - **Depende de:** T010 a T015, T021 a T024, T050 a T056, T060 a T064, T070 a T077, T080 a T085, T090 a T095; plataforma T038 e T080.
- [ ] T101 [revisor-independente] Revisão independente da entrega · Art. III, Art. VII
  - **Teste vermelho:** a revisão parte do `matriz.md`: cada linha precisa de tarefa `[x]` e teste verde; linha sem prova reprova.
  - **Arquivos:** comentário de revisão no PR.
  - **Aceite:** instância diferente de quem escreveu (4.6); achados com severidade, local e correção sugerida, no formato da D-036.
  - **Depende de:** T096, T097, T100.
- [ ] T102 [pesquisador] Disponibilidade e preços antes do primeiro apply real · R6, R12, E16, RNF-002
  - **Teste vermelho:** tabela de achados com uma linha por item, em `us-east-1`: Airflow 2.11.2 e `mw1.micro` no MWAA; Haiku 5.5 pelo perfil `us.` e o preço dele no Bedrock; guardrail no `bedrock-runtime` para o modelo; Serverless Inference com XGBoost 1.7-1; preço do MemoryDB `db.t4g.small`; item sem fonte oficial datada reprova. Mais três linhas (duas da análise 1 e uma da revisão da T012):
    - **versão exata do XGBoost no container 1.7-1 (A03):** a [página do algoritmo](https://docs.aws.amazon.com/sagemaker/latest/dg/xgboost.html) diz só que a versão se baseia na 1.7, e o [README do container](https://github.com/aws/sagemaker-xgboost-container/blob/master/README.rst) não traz a versão de correção (consulta em 2026-11-20); hoje é **incerto** se é a 1.7.6. A linha procura a fonte da versão exata (por exemplo, o arquivo de dependências do container no repositório oficial, na tag da 1.7-1); sem fonte, o DM-07 registra a pré-condição de versão como não confirmada;
    - **alerta de previsão no Budgets diário (A09):** a fonte de 2020 diz que o diário não aceitava previsão, e não achei fonte atual (T013); a linha confirma o estado de hoje, com fonte e data.
    - **nomes com dígito inicial (revisão da T012):** uma linha por regra de nome ainda sem fonte que trate da regra em si: letra inicial no subnet group e no parameter group do MemoryDB (exceções por precaução do ADR-0014; o validador do provider não implementa a regra nem para o cluster, então não serve de prova) e a regra de nomes de banco e tabela do Athena; a exceção só sai do `excecoes_de_nome.json` com fonte que trate da regra, e o log group do endpoint do SageMaker tem o nome imposto conferido na página de logs;
  - **Arquivos:** relatório para a orquestração; se algo mudou, ADR de implementação em `U/adr/` (nunca edição do plano sem nova aprovação).
  - **Aceite:** fonte, data da fonte, data da consulta e certeza em cada linha (5.6); diferença que muda custo ou escopo vira pergunta ao dono.
  - **Análise 2 (A21):** a linha da versão exata do XGBoost roda antes da T042 (passo de pesquisa antecipado), para a T042 fixar a versão confirmada.
  - **Análise 2 (A16):** uma linha nova confirma, com fonte e data, se o índice de tags lista training jobs terminados.
- [ ] T103 [DONO] Caso de uso da Anthropic no Bedrock · D-034, E16
  - O plano registra que o Haiku 5.5 é posterior ao Claude Opus 4.7, então o envio não é exigido. Confirmar no console que o modelo responde antes da demonstração; se pedir o formulário, o envio é à mão pelo dono, nunca por agente.
  - **Aceite:** o modelo responde no console pelo perfil `us.`, ou o envio foi feito.
- [ ] T104 [DONO] Dia da demonstração · RF-108, RF-109, RF-110, RF-111, RNF-004, Art. V · DM-01 a DM-09
  - **Ordem (ADR-0016):** apply da plataforma; apply da base (registra o produto); apply da janela; roteiro `lote` (DM-07: o DAG roda ponta a ponta e o candidato prediz igual à semente, dentro de 1e-6, sobre o conjunto fixo de avaliação; antes da comparação, o roteiro confere as três pré-condições da A03 da análise 1, que são o mesmo `sha256` do CSV de treino (T042 e T046), os mesmos hiperparâmetros (`nthread = 1` e `seed`) e a mesma versão do XGBoost (T102); pré-condição que falha é registrada como tal, com o valor encontrado, e não como defeito do modelo); destroy da janela; roteiro `servico` (DM-01 a DM-05: os quatro passos com `requestId` e o p95; DM-06: endpoint `InService`; DM-08: resposta real com `amazon-bedrock-guardrailAction` e uma intervenção provocada); coleta de evidências; destroy da base e, depois, da plataforma (DM-09: zero recurso com a tag, fora a chave KMS em `PendingDeletion`).
  - **R1:** se o DM-05 mostrar o p95 quente do re-ranker acima de 35 ms, a escolha entre concorrência provisionada, endpoint em instância ou timeout maior volta ao dono como pergunta, com o número medido.
  - **Análise 2 (A20 e A03):** o DM-09 cita as mesmas exceções do critério 2 da spec (chave KMS em `PendingDeletion`, serviço ECS `INACTIVE` e training job terminado, A16); a pré-condição do DM-07 inclui as mesmas linhas de entrada do CSV (A12).
  - **Depende de:** T033, T100, T101, T102, T103; plataforma T053 (tag `project` ativa, D-039), T083 e T084.
- [ ] T105 [finops-demonstracao] Custo real do dia contra o teto · Art. V, RNF-102, R7 · DM-10
  - **Teste vermelho:** a comparação reprova se o custo real da D01 passar de US$ 7,10, se um item cobrado não tiver linha na tabela "Custo do lab" do plano, ou se uma linha não disser como se mede (pela tag, ou pelo serviço e tipo de uso no dia e na região, como "sem tag"). A linha do guardrail é comparada com o pior caso de 16 unidades por explicação, e não 9 (A07 da análise 1).
  - **Arquivos:** comentário no PR de verificação; nenhum número estimado no lugar de medido (`nao-medido` quando faltar).
  - **Aceite:** o dono lê o Cost Explorer depois da latência dos dados e entrega os números; o especialista não chama a AWS. O Claude, cobrado pelo AWS Marketplace, entra como "sem tag" (R7).
  - **Depende de:** T104.
- [ ] T106 [DONO] Revisão humana do relatório da demonstração e das capturas · RF-111, RNF-007, Art. VIII
  - Confirmar que só há dados sintéticos, sem dado pessoal, e decidir o que entra no repositório (5.5).
  - **Depende de:** T104, T105.
- [ ] T107 [avaliador-llm] Capturas reais no lugar das gravações sintéticas · RF-111, E10 · VT-13
  - **Teste vermelho:** VT-13 passa a exigir uma gravação `captura` para cada caminho: sucesso, retentativa por validação e intervenção do guardrail.
  - **Arquivos:** `U/tests/fixtures/claude/` (as capturas aprovadas na T106), os testes do explicador.
  - **Aceite:** sem dado pessoal; as sintéticas que sobram continuam marcadas; Vitest verde.
  - **Depende de:** T106.
- [ ] T108 [redator-tecnico] Checklist de proveniência dos posts e da página · RNF-111, Art. VIII · revisão
  - **Teste vermelho:** cada afirmação sobre empresa no post AWS, no design doc GCP e na página precisa de fonte e data, ou da marca de inferência; afirmação sem isso reprova.
  - **Arquivos:** checklist no relatório da fase verificar; correções em `U/posts/`.
  - **Aceite:** os números de custo e de latência citados vêm da T104 e da T105, ou ficam como pendentes.
  - **Depende de:** T094, T105.

## Fase 11 · Publicação (só com o dono, D-054)
- [ ] T110 [desenvolvedor-site] Página da D01 e post AWS no site · RF-017, D-054
  - **Teste vermelho:** teste do harness reprova se a página do projeto não tiver diagrama, ADRs, custo de um dia, último relatório de teste e link para o código, ou se tiver link para o post GCP.
  - **Arquivos:** `site/projetos/01-03-recomendacao.html`, `site/posts/modulo-01-recomendacao.html`, `site/index.html` (`ITEMS`), `harness/testes/test_<assunto>.py`.
  - **Aceite:** segue a skill `site-projeto`; HTML e CSS estáticos; o que não foi medido aparece como pendente.
  - **Depende de:** T106, T107, T108.
- [ ] T111 [DONO] Aprovar a publicação e o merge · D-054, D-032
  - **Depende de:** T110.

## Furos do plano encontrados na fase tarefas
Nenhum furo muda o desenho aprovado. F1 e F7 pediam uma emenda só de texto do `plan.md`, que exige nova aprovação do dono (D-033); a emenda 1 do plano (2026-11-20) fez as duas (achados A01 e A06 da análise 1). Os outros foram resolvidos nas tarefas, sem mudar o plano.

| id | Furo | Onde | Efeito | Situação |
|---|---|---|---|---|
| F1 | O plano diz que a role do serviço tem "só `InvokeModel` no ARN do perfil" (STRIDE, linha E), mas a task role nasce no módulo `registro-produto`, que dá `InvokeModel` e `Converse`, `InvokeGateway` e `ssm:GetParameter` (plano da plataforma, "Cria") | plano, STRIDE e "Stack base" | o TT-B01 escrito ao pé da letra reprova a composição correta | resolvido na T053 pela leitura segura: o ECS não acrescenta ação do Bedrock, e toda ação do Bedrock fica no perfil, nos modelos de origem e no guardrail, com a condição de guardrail. Texto do STRIDE e da matriz alinhado na emenda 1 do plano (A01) |
| F2 | Os workflows da janela e o do roteiro têm inputs de `workflow_dispatch`, e o teste do harness só aceita a exceção do CKV_GHA_7 em apply e destroy registrados. A seção "Harness" do plano não cita isso | plano, "Harness" e "Workflows" | o primeiro PR com esses workflows reprova no harness | resolvido nas T021 (componentes) e T090 (`workflows_operacao`), com o TH-08, novo |
| F3 | A lista inicial do ADR-0015 não tem as ações que o roteiro usa: `airflow:InvokeRestApi`, `airflow:CreateWebLoginToken`, `ecs:RunTask` e `cloudwatch:GetMetricData` | ADR-0015 e ADR-0016 | o roteiro falharia com `AccessDenied` no dia da demonstração | resolvido na T031: o ADR-0015 já manda conferir a lista na tarefa |
| F4 | O plano não diz como o contrato da plataforma (`comum` e `produtos/01-recomendacao`) existe no Floci, e o plan da base lê os dois por data source | plano, "Estratégia de testes" (FL) | o FL-01 não teria como fazer o plan | resolvido na T100: a integração aplica a composição da plataforma no Floci (plataforma T080) e usa a variável de separação (plataforma T038) |
| F5 | O parâmetro `/01-recomendacao/lab/janela/entradas` não tem teste na matriz do plano | plano, "Stack base" | regra sem teste (Art. III) | resolvido na T052 com o TT-J02, novo |
| F6 | O script do roteiro (`node dist/roteiro.js`) não tem teste unitário na matriz; só o DM prova | plano, "Estratégia de testes" e ADR-0016 | código sem teste vermelho, que só falharia na AWS real | resolvido na T091 com o VT-20, novo |
| F7 | O plano diz em dois lugares que o teto "é proposta e depende da resposta à P01-P5" e "só vale com a aprovação do plano" (Resumo e Custo do lab), e os ADRs 0007 a 0016 dizem "proposto, aguardando a aprovação", embora a D-056 tenha aprovado os dois | plano, "Resumo" e "Custo do lab"; cabeçalho dos ADRs | cosmético; o leitor pode tomar o teto como pendente | ADRs corrigidos na T000 (não entram no hash do plano). Plano alinhado na emenda 1 (A06) |
| F8 | A spec define `proveniencia` como `sintetica` ou `documentacao`, mas o RF-111 pede a troca por captura real sem dar o valor | spec, RF-111 | o VT-13 não saberia aceitar a captura | resolvido na T080 com o valor `captura` |

**Divergência entre spec e plano (resolvida em `d846805`: o RNF-101 da spec agora descreve a janela do MWAA em stack próprio):** o RNF-101 da spec cita o input `enable_mwaa` no apply da base, e o plano trocou esse input pela janela em stack próprio (ADR-0007, D-052). As tarefas seguem o plano aprovado; o texto da spec precisa ser alinhado.

## Perguntas ao dono
Nenhuma aberta. As emendas de texto de F1 e F7 entraram na emenda 1 do plano, autorizada pelo dono na D01-P6 (emenda de texto do plano da recomendação); o registro da nova aprovação é da orquestração.

## Correções da análise 1
Achados da rodada 1 da análise (`analise.md`, 2026-11-20) e onde cada um foi corrigido. A01 e A06 entraram na emenda 1 do `plan.md`, autorizada pelo dono na D01-P6 (emenda de texto do plano da recomendação); os demais só mudam tarefas, matriz, spec e ADRs, que não entram no hash do plano. Cada linha traz a boa prática e o erro comum que ela evita (D-036).

| Achado | Onde foi corrigido | Boa prática e erro comum |
|---|---|---|
| A01 · permissões do Bedrock na task role (bloqueante) | `plan.md` (emenda 1: STRIDE linha E, matriz Art. IV e RF-110); `spec.md` (RF-110, item IAM e aceite TT); T053 (TT-B01 passa a afirmar também as ações de fora do Bedrock que o módulo dá); ADR-0010 (item 4); linha F1 dos furos | **A afirmação de segurança é a mesma em todos os artefatos e testável como está escrita.** Erro comum: uma garantia mais forte que a real, que a revisão confere sem que ninguém a implemente |
| A02 · roteiro lendo métricas de dentro da tarefa | ADR-0016 (item 3 e trade-offs); T090 (espera, log e métricas no runner; TH-08 com os três passos); T091 (relatório numa linha JSON marcada em stdout, sem API de controle); T031 (`ecs:DescribeTasks` e `logs:GetLogEvents`, com fonte) | **Cada passo roda onde tem rede e permissão.** Erro comum: descobrir no apply real que a tarefa não alcança a API, com o relógio do teto correndo |
| A03 · DM-07 sem entradas fixadas | T042 (mesmo CSV, hash publicado, uma configuração de hiperparâmetros, versão do container); T043 (CSV de treino por função pura e ordem fixa); T046 (`nthread = 1` e `seed` no job, com fonte); T102 (versão exata do XGBoost, hoje incerta); T104 (pré-condições do DM-07) | **Igualdade numérica só com as entradas fixadas.** Erro comum: um critério preciso sobre entradas que ninguém garante, que reprova por ruído |
| A04 · destroys concorrentes no mesmo state | T023 (com a base vencida, só o destroy da base); T064 (TH-09: um só grupo de concorrência nos quatro workflows; `queue: max` com fonte, ou devolução ao `operador-harness`) | **Destroy em cascata serializado por construção.** Erro comum: confiar na ordem de dois disparos assíncronos e deixar o lock decidir |
| A05 · peso duplo e unidade do arquivo de uso | T024 (peso só no gate; linhas não cobertas pela regra da plataforma T073); T096 (TH-10: quantidades mensais equivalentes, sem horas do MWAA; gate igual à tabela dentro de 1 centavo) | **Uma conversão por lugar, com a unidade escrita e testada.** Erro comum: aplicar a mesma redução duas vezes e o gate passar com um número que ninguém calculou |
| A06 · teto como "proposta" (menor) | `plan.md` (emenda 1: Resumo e Custo do lab); T000 (também a frase do ADR-0013 sobre a P01-P5); linha F7 dos furos | **Estado do documento igual ao registro.** Erro comum: reabrir com o dono uma decisão já tomada |
| A07 · guardrail sem a retentativa (menor) | T096 e T105 (16 unidades no pior caso: US$ 0,80 na linha e US$ 6,78 no dia, abaixo do teto de US$ 7,10, que não muda) | **A mesma premissa de pior caso em todas as linhas que ela afeta.** Erro comum: dobrar uma linha e esquecer a vizinha |
| A08 · spec atrás das tarefas (menor) | `spec.md` (critério 2 com a exceção do ECS `INACTIVE`; RF-111 com `captura`; duas entradas em "Alinhamento com o plano aprovado") | **A spec acompanha o que as tarefas testam.** Erro comum: a verificação final reprovar uma exceção que as tarefas aceitam |
| A09 · previsão no Budgets diário (menor, incerto) | T013 (TT-K01 só com `ACTUAL`, com a fonte de 2020 e o guia de boas práticas); T102 (confirmar o estado atual). Continua **incerto**: não achei fonte atual | **Afirmação de serviço só com fonte; a dúvida vira item de conferência.** Erro comum: levar uma configuração do recurso antigo para o novo sem conferir |
| A10 · janela com prazo menor que a criação (menor) | T022 (prazo útil mínimo de 1 hora, como campo do componente; recusa com a sugestão de `infra.py estender`) | **Recusar cedo o que não tem tempo de dar certo.** Erro comum: pagar a criação de um recurso que é destruído antes de servir |
| A11 · TH-07 vermelho pela mudança do modelo (menor) | T010 (nota com a causa e as tarefas que devolvem o verde) | **Dependência entre branches escrita onde o teste falha.** Erro comum: afrouxar o teste para passar e perder a regra |

## Correções da análise 2
Achados da rodada 2 da análise (`analise.md`, 2026-11-20, veredito APROVADO, nenhum bloqueante). Nenhum muda o `plan.md`; todos cabem em tarefas que ainda não começaram. A linha `Análise 2 (Axx)` de cada tarefa traz o que ela passa a fazer.

| Achado | Tarefa que absorve |
|---|---|
| A03 · DM-07 sem entradas fixadas (parcial da rodada 1) | T042, T043, T046, T102, T104 |
| A05 · peso duplo e linhas não cobertas (parcial da rodada 1) | T024 (regra criada na tarefa), T096 |
| A08 · DM-09 com a exceção antiga (parcial da rodada 1) | T104 (e `spec.md`, critério 2) |
| A12 · dados sintéticos, tabelas do Athena e data da partição | T043, T046, T050, T055, T090 |
| A13 · nomes fixos no SQL do Athena | T041 |
| A14 · role do MWAA para o Athena e o Lake Formation | T063, T050 |
| A15 · tempo do DAG contra a janela | T046, T022, T090, e o RF-010 da `spec.md` |
| A16 · sobras criadas fora do Terraform | T046, T056, T102 |
| A17 · T024 esperando a plataforma T073 | T024, T096, `matriz.md` |
| A18 · TH-10 com o valor antigo e sem o treino | T096 |
| A19 · nomes de log group e padrão da T031 | T012, T031 |
| A20 · DM-09 só com a chave KMS | T104 |
| A21 · ordem da T042, T043 e da versão do XGBoost | T042, T102 |
| A22 · `queue: max` sem confirmação | T064 |
