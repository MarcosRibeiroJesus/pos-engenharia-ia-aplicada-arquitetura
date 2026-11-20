# Tarefas: Plataforma de agentes compartilhada na AWS

- **Projeto:** `00-plataforma-agentes` · **Plano:** `plan.md`, aprovado pelo dono em 2026-11-19 (D-035) e, depois da emenda 1, aprovado de novo em 2026-11-20 (D-038). O hash está registrado em `harness/estado.json`, campo `plano_aprovado`
- **Data:** 2026-11-20 · **Autor:** arquiteto-aws (Claude Opus 5.5) · **Matriz requisito → tarefa → teste:** `matriz.md`
- **Decisões aplicadas:** D-006, D-013, D-021, D-022, D-024, D-028, D-029, D-031, D-032, D-033, D-034, D-035, D-036, D-037, D-038 e D-039
- **Correções da análise 1** (2026-11-20, `analise.md`, rodada 1 reprovada): feitas só neste arquivo, no `matriz.md` e nos ADRs, sem mudar o `plan.md`. Há uma linha por achado na seção do fim. As tarefas novas são a T048 e a T069; as demais correções mudam tarefas que já existiam

Uma tarefa por sessão de trabalho. Cada tarefa começa por um teste que falha.
- `[P]` marca tarefas que podem rodar em paralelo, depois das dependências delas.
- `[x]` só depois do teste verde e do commit (`feat(00-plataforma-agentes): Txxx ...`).
- Cada tarefa cita os requisitos que cobre (RF, RNF ou artigo) e os ids de teste da matriz do plano.
- Entre colchetes, depois do id, fica o especialista dono (`harness/especialistas.json`). `[DONO]` é tarefa do Marcos: nenhum agente a executa.
- **Ids de teste:** TT = `terraform test` com mock provider; TS = schema do contrato; RG = respostas gravadas; TH = harness; FL = Floci; DM = demonstração real; ES = esteira `seguranca.yml`.
- **Regra de teste vermelho para verificadores:** quando o teste é uma regra transversal (por exemplo, "nenhuma ação `*` em recurso `*`"), o vermelho é uma fixture que viola a regra e precisa reprovar. Uma regra que passa sem nada para checar não conta como teste.
- **Furos do plano:** os furos F1 a F5 apontados na fase tarefas (no fim deste arquivo) foram resolvidos pela emenda 1 do plano (2026-11-20), e os `[BLOQUEADO: Fn]` saíram. As partes afetadas citam "emenda 1".

## Fase 0 · Preparação
- [ ] T000 [operador-harness] Mover os ADRs para `plataforma/agentes/adr/` · Art. I, Art. VII
  - **Teste vermelho:** um teste em `harness/test_harness.py` afirma que `plataforma/agentes/adr/0001-*.md` a `0013-*.md` existem (os ADRs 0011 a 0013 vêm das correções da análise 1) e que todo link `adr/...` do `spec.md` e do `plan.md` resolve para um arquivo.
  - **Arquivos:** `git mv specs/00-plataforma-agentes/adr/*.md plataforma/agentes/adr/`; um arquivo de redirecionamento por ADR em `specs/00-plataforma-agentes/adr/` (mesmo nome, só o título e o link para o novo local).
  - **Aceite:** o conteúdo dos ADRs fica só em `plataforma/agentes/adr/`; os links do `plan.md` continuam resolvendo, pelos redirecionamentos, sem editar o `plan.md` (mudar o plano derruba a aprovação, D-033); o hash do `plan.md` segue igual ao de `plano_aprovado`.
  - **Depende de:** fase `implementar`.

## Fase 1 · Regras da constituição como testes
- [ ] T001 [engenheiro-terraform] Esqueleto do stack com tags, região e state remoto · Art. VI, RNF-003, RNF-006 · TT-T01, TT-T03, TH-08
  - **Teste vermelho:** `tests/tags.tftest.hcl` copiado de `harness/modelos/tags.tftest.hcl` com `projeto = "00-plataforma-agentes"` e o assert iterando sobre o output `tags_dos_recursos`; `tests/regiao.tftest.hcl` com `var.regiao` padrão `us-east-1`; TH-08 em `harness/test_harness.py` lê `versions.tf` e exige `backend "s3" {}` parcial e `use_lockfile`.
  - **Arquivos:** `plataforma/agentes/infra/terraform/{versions.tf,providers.tf,variables.tf,outputs.tf,terraform.tfvars.example}`, `tests/tags.tftest.hcl`, `tests/regiao.tftest.hcl`.
  - **Aceite:** `default_tags` com `project = "00-plataforma-agentes"` e `managed-by = "terraform"`; `module` vem do `local.tags` de cada módulo (D-031); versão mínima do `hashicorp/aws` fixada depois de `terraform init` confirmar `aws_bedrockagentcore_gateway`, `_gateway_target`, `_policy`, `_policy_engine` e `aws_bedrock_guardrail` com `tier_config` (plano, seção Provider); `fmt`, `validate`, `tflint` e `checkov` limpos.
- [ ] T002 [engenheiro-terraform] Workflow de CI do projeto · Art. III, RNF-005, RNF-007 · TH-12 (novo, desta fase)
  - **Teste vermelho:** teste do harness reprova se `.github/workflows/00-plataforma-agentes-ci.yml` não existe ou não roda `terraform fmt -check`, `terraform validate` e `terraform test` no root e em cada módulo com `tests/`, e `python3 -m unittest discover -s plataforma/agentes/tests`.
  - **Arquivos:** `.github/workflows/00-plataforma-agentes-ci.yml`, `harness/test_harness.py`.
  - **Aceite:** gatilho em `pull_request` com filtro de caminho `plataforma/agentes/**`, `infra/conta/**` e `harness/**`; `permissions: contents: read`; actions fixadas por SHA (`TestVersoesDasActions`); sem OIDC e sem credencial da AWS; o texto do workflow não cita `bedrock` nem `Converse` (TH-11). O job do Floci entra no T080.
  - **Depende de:** T001.

- [ ] T003 [P] [engenheiro-seguranca] Regras transversais de segurança e custo sobre o plan · Art. IV, Art. V, RNF-001, RNF-002, RNF-004 · TT-S01, TT-S03, TT-S05, TT-K02, TT-K03
  - **Teste vermelho:** para cada regra, uma fixture em `plataforma/agentes/tests/plan/fixtures/` que viola a regra (política com `Principal "*"` sem condição de conta; declaração com ação `*` e recurso `*`; credencial em variável, output, tag ou SSM; `aws_nat_gateway`; `aws_vpc_endpoint` do tipo `Interface`; `aws_organizations_account`) e precisa reprovar.
  - **Arquivos:** `plataforma/agentes/tests/plan/test_regras_plan.py` (lê `terraform show -json` do plan com mock provider do root e do módulo), `plataforma/agentes/tests/plan/fixtures/`.
  - **Aceite:** as seis fixtures reprovam com uma mensagem que cita o recurso, e o root do T001 passa. O teste roda no workflow de CI do projeto (T002), sem credencial da AWS.
    - O módulo `registro-produto` ainda não existe aqui: ele entra no teste na T030, e a T032 confirma de novo (análise 1, A14).
  - **Depende de:** T001, T002.
## Fase 2 · Núcleo: stack da plataforma
- [ ] T010 [P] [engenheiro-terraform] Módulo `nucleo`: chave KMS do cliente · Art. IV, RNF-001 · TT-S02 (chave)
  - **Teste vermelho:** `modules/nucleo/tests/kms.tftest.hcl` afirma rotação ligada, `deletion_window_in_days = 7`, alias `alias/00-plataforma-agentes-chave` e a política da chave do ADR-0001 (logs com `kms:EncryptionContext:aws:logs:arn` no prefixo dos grupos da plataforma; `cloudwatch` e `sns` com `aws:SourceAccount` e `aws:SourceArn`; `bedrock-agentcore` com `aws:SourceAccount`).
  - **Arquivos:** `plataforma/agentes/infra/terraform/modules/nucleo/{main.tf,variables.tf,outputs.tf}`, `modules/nucleo/tests/kms.tftest.hcl`.
  - **Aceite:** testes verdes; o T003 continua verde; ADR-0001 cumprido item a item.
  - **Depende de:** T001.
- [ ] T011 [engenheiro-terraform] Módulo `nucleo`: tópico SNS dos alarmes e assinaturas · Art. IV, RNF-001, RNF-003 · TT-S02 (SNS), TT-S04
  - **Teste vermelho:** `modules/nucleo/tests/sns.tftest.hcl` afirma o tópico `00-plataforma-agentes-alarmes` com `kms_master_key_id` da chave do T010, política que nega `aws:SecureTransport = false` e só aceita `sns:Publish` do `cloudwatch.amazonaws.com` da conta, e uma assinatura `email` por endereço de `data "aws_ssm_parameter"` `/00-conta/alertas/emails` (mock com dois endereços sintéticos).
  - **Teste vermelho do TT-S06 (análise 1, A06; ADR-0008):** `plataforma/agentes/tests/plan/test_dados_pessoais.py` lê o `terraform show -json` do plan com mock. Ele reprova se `after_sensitive.endpoint` de alguma `aws_sns_topic_subscription` não for `true`. A fixture com o valor lido de `insecure_value`, ou com `nonsensitive()` em volta da lista, precisa reprovar.
  - **Arquivos:** `modules/nucleo/sns.tf`, `modules/nucleo/tests/sns.tftest.hcl`, `plataforma/agentes/tests/plan/test_dados_pessoais.py`, `plataforma/agentes/tests/plan/fixtures/`.
  - **Aceite:** ADR-0008 cumprido; nenhuma variável nova de e-mail (D-034).
    - O valor vem do atributo sensível `value` do parâmetro. A contagem usa `count = nonsensitive(length(split(",", ...)))`: o `nonsensitive()` fica em volta do `length`, para só a quantidade sair do sensível.
    - O `endpoint` vem de `split(...)[count.index]` sobre o valor sensível e continua sensível.
    - Nenhum output expõe os endereços. O repositório e os logs do Actions são públicos (Art. VIII).
  - **Depende de:** T010.
- [ ] T012 [P] [engenheiro-terraform] Módulo `nucleo`: AWS Budgets diário com o teto · Art. V, RNF-002 · TT-K01, TH-06
  - **Teste vermelho:** `modules/nucleo/tests/budgets.tftest.hcl` afirma `time_unit = "DAILY"`, `limit_amount == var.teto_diario_usd` e filtro `user:project$00-plataforma-agentes`; TH-06 em `harness/test_harness.py` lê o padrão de `teto_diario_usd` em `variables.tf` do root e compara com `teto_diario_usd` do `harness/estado.json` (1,2).
  - **TT-S06 (análise 1, A06):** o `test_dados_pessoais.py` do T011 também reprova se `subscriber_email_addresses` das notificações do `aws_budgets_budget` não for sensível no plan.
  - **Arquivos:** `modules/nucleo/budgets.tf`, `modules/nucleo/tests/budgets.tftest.hcl`, `variables.tf` do root, `harness/test_harness.py`, `plataforma/agentes/tests/plan/test_dados_pessoais.py`.
  - **Aceite:**
    - Os alertas do orçamento vão para os mesmos e-mails do parâmetro `/00-conta/alertas/emails`, lidos do atributo sensível. Mudar o teto num lugar só reprova o TH-06.
    - **O filtro `user:project$00-plataforma-agentes` só enxerga custo depois que a tag `project` estiver ativa como tag de alocação de custo** (D-039, T053). Antes disso, o orçamento diário não vê nada, e sobra só o mensal. O README (T072) e o roteiro do ensaio (T084) dizem isso (análise 1, A17).
  - **Depende de:** T001.
- [ ] T013 [engenheiro-terraform] Módulo `gateway`: gateway MCP com IAM na entrada · RF-001, RF-003, Art. IV · TT-G01, TT-G02, TT-S02 (gateway)
  - **Teste vermelho:** `modules/gateway/tests/gateway.tftest.hcl` com `expect_failures` para `authorizer_type = "NONE"` e `"AUTHENTICATE_ONLY"`; asserts de exatamente um `aws_bedrockagentcore_gateway`, `protocol_type = "MCP"`, `kms_key_arn` da chave da plataforma, `supported_versions` padrão `["2025-11-25", "2026-07-28"]` (ADR-0010), sem `search_type = "SEMANTIC"` e sem `exception_level = "DEBUG"`.
  - **Arquivos:** `plataforma/agentes/infra/terraform/modules/gateway/{main.tf,variables.tf,outputs.tf}`, `modules/gateway/tests/gateway.tftest.hcl`.
  - **Contrato da entrada do motor (análise 1, A03; [ADR-0011](adr/0011-entrada-do-motor-no-gateway.md)):**
    - `motor_politica_arn` é anulável no `gateway`, com padrão `null`, e o `policy_engine_configuration` é um bloco `dynamic`;
    - teste vermelho: com o ARN nulo, o plan do módulo não tem o bloco; com o ARN preenchido, tem o bloco com `mode = var.modo_politica`;
    - no `observabilidade` (T017) e no `contrato` (T018), o id e o ARN são obrigatórios, sem padrão;
    - quem garante o valor no root real é o TT-P01 (T015 e T020).
  - **Aceite:** o ARN do motor de política entra como variável de composição anulável (ADR-0009 e ADR-0011); a role de execução do gateway não tem permissão de invocar alvos e tem `bedrock:InvokeGuardrailChecks` no recurso mais estreito que a documentação aceitar (R4; se exigir `*`, condição `aws:SourceAccount`, exceção do checkov e ADR).
  - **Depende de:** T010.
- [ ] T014 [P] [engenheiro-terraform] Role de fumaça · RF-002, RNF-001, RNF-002 · TT-R09
  - **Teste vermelho:** `modules/gateway/tests/fumaca.tftest.hcl` afirma a role `00-plataforma-agentes-fumaca`, confiada só pela role de deploy (variável), com uma única declaração `bedrock-agentcore:InvokeGateway` no ARN do gateway.
  - **Arquivos:** `modules/gateway/fumaca.tf`, `modules/gateway/tests/fumaca.tftest.hcl`.
  - **Aceite:** nenhum `permit` no Cedar cita esta role (conferido de novo no T036). A role não tem `bedrock:ApplyGuardrail`, e o TT-R09 falha se ela ganhar uma segunda declaração (emenda 1, F1).
  - **Depende de:** T013.
- [ ] T015 [engenheiro-terraform] Módulo `politica`: motor em `ENFORCE` · RF-002, Art. IV · TT-P01, TT-P02, TT-S02 (motor)
  - **Teste vermelho:** `modules/politica/tests/politica.tftest.hcl` com `expect_failures` para `modo_politica = "LOG_ONLY"` sem `calibracao = true`; asserts do nome `p00_plataforma_agentes` (regex `^[A-Za-z][A-Za-z0-9_]*$`) e de `encryption_key_arn` da chave da plataforma; `tests/composicao.tftest.hcl` no root afirma `length(policy_engine_configuration) == 1` no gateway, com `mode = "ENFORCE"` por padrão e o ARN vindo de `module.politica`. Uma fixture de root que passa `motor_politica_arn = null` ao gateway precisa reprovar o TT-P01 (análise 1, A03; ADR-0011).
  - **Arquivos:** `plataforma/agentes/infra/terraform/modules/politica/`, `tests/composicao.tftest.hcl` do root.
  - **Aceite:** ADR-0005 cumprido; o modo nunca é input de workflow.
  - **Depende de:** T013.
- [ ] T016 [P] [engenheiro-terraform] Módulo `observabilidade`: entrega de logs e traces · RF-006, Art. VI · TT-O01, TT-O02
  - **Teste vermelho:** `modules/observabilidade/tests/entrega.tftest.hcl` afirma `aws_cloudwatch_log_delivery_source` dos `APPLICATION_LOGS` do gateway, destino no grupo `/aws/vendedlogs/bedrock-agentcore/gateway/APPLICATION_LOGS/{gateway_id}` com retenção de 7 dias e `kms_key_id` da chave, e a entrega de traces para o X-Ray.
  - **Arquivos:** `plataforma/agentes/infra/terraform/modules/observabilidade/{entrega.tf,variables.tf,outputs.tf}`, `modules/observabilidade/tests/entrega.tftest.hcl`.
  - **Aceite:** todos os recursos entram no destroy; o grupo `aws/spans` não é criado aqui (é da conta, `infra/conta`).
  - **Depende de:** T010, T013.
- [ ] T017 [engenheiro-terraform] Módulo `observabilidade`: cinco alarmes da plataforma · RNF-003, Art. VI · TT-O03
  - **Teste vermelho:** `modules/observabilidade/tests/alarmes.tftest.hcl` afirma os cinco alarmes do RNF-003 (`SystemErrors` ≥ 1, `Throttles` ≥ 1 e `UserErrors` ≥ 3 do gateway; `SystemErrors` do motor ≥ 1; `DenyDecisions` ≥ 5 só em `Mode = ENFORCE`), todos com período de 300 s, 1 avaliação, `Sum`, `treat_missing_data = "notBreaching"` e ação no tópico do T011.
  - **Dimensões (análise 1, A05; [ADR-0013](adr/0013-alarmes-sem-dimensoes-publicadas.md)):** um alarme comum só casa com a série que tem exatamente o mesmo conjunto de dimensões.
    - **Métrica com conjunto de dimensões publicado:** o assert fixa o conjunto completo, com o link da página e a data da consulta num comentário do teste.
    - **Métrica sem conjunto publicado:** usa alarme por consulta do Metrics Insights, filtrada pelo id do recurso e somada numa série só, sem `GROUP BY`.
      - É o caso de `DenyDecisions` e do `SystemErrors` do motor: a página do Policy, consultada em 2026-11-20, lista só as dimensões disponíveis.
      - Vale também para as métricas do gateway, se a página de métricas do Gateway não fechar o conjunto.
      - O assert confere a consulta (`SELECT SUM(...)`, `WHERE` com o id e `Mode = 'ENFORCE'` nas negações).
    - **Fixture vermelha:** um alarme comum de `DenyDecisions` só com `Mode` precisa reprovar.
    - O CloudWatch não aceita alarme sobre expressão `SEARCH`, então ela não é opção.
  - **Arquivos:** `modules/observabilidade/alarmes.tf`, `modules/observabilidade/tests/alarmes.tftest.hcl`.
  - **Aceite:** nomes com o prefixo `00-plataforma-agentes-`; o alarme de negações não dispara num apply de calibração (ADR-0005). O disparo real é provado no ensaio (DM-09, T069 e T084). O custo por métrica analisada entra na revisão do T073 (ADR-0013). O id do motor é entrada de composição obrigatória do módulo: no root real vem do módulo `politica`, e no root do Floci, de um valor sintético fixo (emenda 1, F3; ADR-0009).
  - **Depende de:** T011, T015, T016.
- [ ] T018 [engenheiro-terraform] Módulo `contrato`: parâmetro `comum`, schema e output `contrato_v1` · RF-007, RF-011 · TS-01, TT-C01
  - **Teste vermelho:** `plataforma/agentes/tests/contrato/test_contrato.py` valida o output `contrato_v1` do plan com mock contra `plataforma/agentes/contrato/v1.schema.json` e falha com uma fixture sem `mapa_erros`; `modules/contrato/tests/contrato.tftest.hcl` afirma `/00-plataforma-agentes/contrato/v1/comum` com `type = "String"`, `tier = "Standard"` e valor de até 4 KB.
  - **Arquivos:** `plataforma/agentes/contrato/v1.schema.json`, `plataforma/agentes/infra/terraform/modules/contrato/`, `plataforma/agentes/tests/contrato/`.
  - **Aceite:** campos do `comum` iguais aos da tabela "Contrato v1" do plano, com `versao_contrato = "1.0.0"`; `mapa_erros` com as oito categorias do RF-011 e o retentável de cada uma; o schema também cobre o parâmetro `produtos/<chave>`. `motor_politica_id` e `motor_politica_arn` são obrigatórios no schema e entram no módulo como entradas de composição; no root do Floci, com valores sintéticos fixos (emenda 1, F3; ADR-0009).
  - **Depende de:** T013, T015, T016, T011.
- [ ] T019 [P] [engenheiro-seguranca] Contrato sem segredo · RF-003, RF-007, Art. IV · TS-02, ES (gitleaks)
  - **Teste vermelho:** fixtures de contrato com um campo `token` e com um valor no formato de chave de acesso da AWS precisam reprovar no `test_contrato.py`.
  - **Arquivos:** `plataforma/agentes/contrato/v1.schema.json` (nomes proibidos do ADR-0002: `segredo`, `senha`, `token`, `chave_secreta`, `password`), `plataforma/agentes/tests/contrato/test_segredos.py`.
  - **Aceite:** o `comum` e o parâmetro de produto passam; o gitleaks da esteira segue sem achado.
  - **Depende de:** T018.
- [ ] T020 [engenheiro-terraform] Root da plataforma: composição, prefixos e tags em todo recurso · RF-001, Art. VI, RNF-003 · TT-T01, TT-T02
  - **Teste vermelho:** `tests/prefixo.tftest.hcl` afirma que todo nome começa por `00-plataforma-agentes` ou está na lista de exceções do [ADR-0012](adr/0012-excecoes-ao-prefixo.md) (análise 1, A07). O `tags.tftest.hcl` do T001 passa a iterar sobre todos os recursos tagueáveis do root.
    - **As exceções do root:** `p00_` (regex da API); o nome depois de `alias/` na chave; o grupo de log entregue `/aws/vendedlogs/bedrock-agentcore/gateway/APPLICATION_LOGS/<id do gateway>` (RF-006).
    - A lista fica num lugar só, com o motivo e o link do ADR-0012.
    - **Fixture vermelha:** um recurso sintético com nome fora do prefixo e fora da lista precisa reprovar.
  - **Arquivos:** `plataforma/agentes/infra/terraform/main.tf`, `outputs.tf`, `terraform.tfvars.example`, `tests/prefixo.tftest.hcl`.
  - **Aceite:** `terraform test` do root e dos módulos, `fmt`, `validate`, `tflint` e `checkov` limpos; os testes do T003 verdes sobre o root completo; o `composicao.tftest.hcl` (TT-P01) também afirma que o id e o ARN do motor no `contrato` e no `observabilidade` vêm do módulo `politica` (emenda 1, F3).
  - **Depende de:** T010 a T019.

## Fase 3 · Núcleo: módulo `registro-produto` (no state do produto)
- [ ] T030 [engenheiro-terraform] Interface do catálogo e validações de identidade · RF-001, RF-007 · TT-R01, TT-R02, TT-R03
  - **Teste vermelho:** `modules/registro-produto/tests/catalogo.tftest.hcl` com dois produtos sintéticos (`91-produto-a`, `92-produto-b`, só nos testes) e `expect_failures` para: chave diferente da tag `project` de `data.aws_default_tags`; alvo sem o prefixo da chave; tool sem classe; alvo sem schema estático.
  - **Arquivos:** `plataforma/agentes/infra/terraform/modules/registro-produto/{variables.tf,validacoes.tf,contrato.tf}`, `modules/registro-produto/tests/catalogo.tftest.hcl`.
  - **Aceite:** o módulo lê o `comum` por `data "aws_ssm_parameter"` (mock) e não recebe nenhum ARN da plataforma por variável (critério de sucesso 1); classes aceitas: `dado_privado`, `conteudo_nao_confiavel`, `canal_saida`, `sensivel`. O `test_regras_plan.py` do T003 passa a rodar também sobre o módulo, e as seis fixtures continuam reprovando (análise 1, A14).
  - **Depende de:** T003, T018.
- [ ] T031 [P] [engenheiro-seguranca] Tríade letal e ação sensível recusadas no plan · RF-009, RF-012, RNF-001 · TT-R05, TT-R07 (catálogo)
  - **Teste vermelho:** `modules/registro-produto/tests/triade.tftest.hcl` com um agente que soma `dado_privado`, `conteudo_nao_confiavel` e `canal_saida` e com um agente chamador de tool `sensivel`; os dois precisam falhar o plan.
  - **Arquivos:** `modules/registro-produto/validacoes.tf`, `modules/registro-produto/tests/triade.tftest.hcl`.
  - **Aceite:** a mensagem cita o principal e as tools (RF-009); um catálogo dividido em dois agentes (leitor sem canal de saída e executor sem conteúdo não confiável) passa.
  - **Depende de:** T030.
- [ ] T032 [engenheiro-terraform] Roles do agente e de aprovação · RF-003, RF-005, RNF-001 · TT-R11 (role), TT-S03
  - **Teste vermelho:** `modules/registro-produto/tests/roles.tftest.hcl` afirma, para `<chave>-agente-<nome>`: `InvokeGateway` só no ARN do gateway do contrato; `bedrock:InvokeModel` e `Converse` só no próprio perfil e nos modelos de origem, com condição `bedrock:InferenceProfileArn` e `bedrock:GuardrailIdentifier` igual ao próprio guardrail; `bedrock:ApplyGuardrail` no próprio guardrail; `ssm:GetParameter` no `comum` e no próprio parâmetro. Para `<chave>-aprovacao`: assumida só pelo principal declarado.
  - **Arquivos:** `modules/registro-produto/roles.tf`, `modules/registro-produto/tests/roles.tftest.hcl`.
  - **Aceite:** o produto A não recebe nenhum ARN do produto B; o T003 segue verde sobre o módulo.
  - **Depende de:** T030.
- [ ] T033 [P] [engenheiro-terraform] Guardrail do produto e versão numerada · RF-004 · TT-R08
  - **Teste vermelho:** `modules/registro-produto/tests/guardrail.tftest.hcl` afirma as cinco categorias em `HIGH` nos dois sentidos; `PROMPT_ATTACK` `HIGH`/`NONE`; `AWS_ACCESS_KEY`, `AWS_SECRET_KEY`, `PASSWORD`, `PIN` e `CREDIT_DEBIT_CARD_CVV` com `BLOCK` nos dois sentidos; regex de CPF e CNPJ com `ANONYMIZE` na saída; `tier_config.tier_name = "STANDARD"` com `cross_region_config`; mensagens fixas em português; `aws_bedrock_guardrail_version`.
  - **Arquivos:** `modules/registro-produto/guardrail.tf`, `modules/registro-produto/tests/guardrail.tftest.hcl`.
  - **Aceite:** tópicos negados só os do catálogo do produto (E3); a base não tem tópico negado; a versão publicada nunca é `DRAFT`.
  - **Depende de:** T030.
- [ ] T034 [P] [engenheiro-terraform] Perfil de inferência de aplicação por produto · RF-005 · TT-R11 (perfil)
  - **Teste vermelho:** `modules/registro-produto/tests/perfil.tftest.hcl` afirma um perfil `<chave>-perfil` por produto, com a tag `project` igual à chave e origem no modelo do catálogo.
  - **Arquivos:** `modules/registro-produto/perfil.tf`, `modules/registro-produto/tests/perfil.tftest.hcl`.
  - **Aceite:** o ARN do perfil é o único que a role do T032 pode invocar.
  - **Depende de:** T030.
- [ ] T035 [engenheiro-terraform] Alvos Lambda e servidor MCP · RF-001, RF-003 · TT-R04
  - **Teste vermelho:** `modules/registro-produto/tests/alvos.tftest.hcl` com um alvo `lambda` (credencial `GATEWAY_IAM_ROLE` e `aws_lambda_permission` com `source_arn` igual ao gateway) e um alvo `mcp_server` (SigV4 com a role do gateway, ou provedor do Identity para alvo fora da AWS), os dois com schema estático das tools.
  - **Arquivos:** `modules/registro-produto/alvos.tf`, `modules/registro-produto/tests/alvos.tftest.hcl`.
  - **Aceite:** nome do alvo `<chave>-<alvo>`; nenhum segredo no Terraform (RF-003). Se o provider não aceitar schema estático para servidor MCP (R5), o fallback do plano (sincronização e comparação no DM-05) entra num ADR de implementação, sem mudar o restante.
  - **Depende de:** T032.
- [ ] T036 [engenheiro-terraform] Políticas Cedar geradas · RF-002, RF-010, RF-012 · TT-R06, TT-R07 (política), TT-R10
  - **Teste vermelho:** `modules/registro-produto/tests/cedar.tftest.hcl` afirma: um `permit` por agente com a lista exata de ações `<alvo>___<tool>`, principal `AgentCore::IamEntity` com o ARN da role e recurso igual ao gateway; nenhum `permit` de tool `sensivel` para role de agente; um `permit` da role de aprovação para as tools `sensivel`; `forbid` `BedrockGuardrails::PromptAttack` (JAILBREAK, PROMPT_INJECTION, PROMPT_LEAKAGE) acima de 0,4 em toda tool; `forbid` `BedrockGuardrails::SensitiveInformation` acima de 0,2 nas tools `canal_saida`; nenhuma política cita a role de fumaça.
  - **Arquivos:** `modules/registro-produto/cedar.tf` (e templates, se houver), `modules/registro-produto/tests/cedar.tftest.hcl`.
  - **Aceite:** nomes `p<NN>_<slug>_<regra>`; `depends_on` nos alvos; `validation_mode = "FAIL_ON_ANY_FINDINGS"` (ADR-0005); o produto A não tem `permit` com ação do produto B.
  - **Depende de:** T031, T035.
- [ ] T037 [engenheiro-terraform] Alarme de intervenção e parâmetro do produto · RF-006, RF-007, RNF-003 · TT-O04, TS-01 (produto)
  - **Teste vermelho:** `modules/registro-produto/tests/operacao.tftest.hcl` afirma:
    - o alarme `AWS/Bedrock/Guardrails` `InvocationsIntervened` ≥ 5, com os parâmetros do RNF-003 e ação em `topico_alarmes_arn` do contrato;
    - o parâmetro `/00-plataforma-agentes/contrato/v1/produtos/<chave>`, `String`, `Standard`, com até 4 KB e válido no `v1.schema.json`.
  - **Dimensões do alarme (análise 1, A05; ADR-0013):** o assert fixa o conjunto completo publicado na [página de métricas do Guardrails](https://docs.aws.amazon.com/bedrock/latest/userguide/monitoring-guardrails-cw-metrics.html), hoje `GuardrailArn` e `GuardrailVersion`, com a data da consulta. Se a página mostrar a métrica também com `Operation`, o alarme passa a ser por consulta do Metrics Insights filtrada pelo `GuardrailArn`.
  - **Exceção de prefixo do parâmetro (análise 1, A07; ADR-0012):** o teste de prefixo do módulo aceita `produtos/<chave>` sob o caminho da plataforma só com `<chave>` igual à tag `project` do provider. A fixture com `produtos/<outra-chave>` precisa reprovar. O isolamento continua pela tag do produto e pelo ARN na política IAM (T032).
  - **Arquivos:** `modules/registro-produto/{alarme.tf,contrato.tf}`, `modules/registro-produto/tests/operacao.tftest.hcl`, `plataforma/agentes/tests/contrato/test_contrato.py`.
  - **Aceite:** campos `versao_contrato`, `perfil_inferencia_arn`, `guardrail_id`, `guardrail_versao`, `alvos` e `roles`.
  - **Depende de:** T033, T034, T036.
- [ ] T038 [engenheiro-terraform] Variável de separação da parte não emulada · ADR-0009, RNF-007
  - **Teste vermelho:** `modules/registro-produto/tests/separacao.tftest.hcl` afirma que, com o valor padrão, o plan tem guardrail, perfil e políticas Cedar, e que só o valor explícito do root de integração os retira.
  - **Arquivos:** `modules/registro-produto/variables.tf`, `modules/registro-produto/tests/separacao.tftest.hcl`.
  - **Aceite:** nenhum produto real consegue omitir guardrail, perfil ou política sem mudar a variável no próprio Terraform, revisado no PR.
  - **Depende de:** T037.

## Fase 4 · Harness: dependência, prazo, ordem de destroy e gates
**Especialistas desta fase (análise 1, A16):**
- **T041 a T044 e T048 ficam com o `engenheiro-terraform`.** Elas mudam a lógica do `infra.py` e os modelos de apply e destroy. No `harness/especialistas.json`, esse especialista é o que tem os "workflows de apply e destroy" na descrição, a skill `ciclo-demonstracao` e o modelo de nível máximo. Ele também é o que o `agente.py proximo --tarefa codigo` devolve.
- **O `operador-harness` não serve para elas.** Ele é de nível rápido, só para tarefas mecânicas, e o papel dele manda devolver como bloqueio qualquer coisa que exija decisão.
- **Fica com o `operador-harness` só o que tem regra fechada no texto da tarefa,** sem decisão: T040, T046 e T047.
- **Nas T041 a T044 e na T048,** o especialista segue as regras da skill `evolucao-do-harness`, mesmo sem tê-la pré-carregada: teste primeiro, só a biblioteca padrão do Python e o registro em `harness/VERSAO.md`.

- [ ] T040 [operador-harness] Campo `consome` no `estado.json` · RF-008, ADR-0007 · TH-01 (pré-requisito)
  - **Teste vermelho:** testes em `harness/test_harness.py`: `estado.py validar` reprova `consome` que cita chave inexistente, o próprio projeto ou projeto que não é do tipo `plataforma`.
  - **Arquivos:** `harness/estado.py`, `harness/estado.json` (`"consome": ["00-plataforma-agentes"]` no `03-mcp-regras-cdb`, D-034), `harness/test_harness.py`.
  - **Aceite:** `validar` ok; 64 testes atuais e os novos verdes.
- [ ] T041 [engenheiro-terraform] `infra.py registrar` e `estender` com o limite do consumidor · RF-008, ADR-0007 · TH-01
  - **Teste vermelho:** `TestPrazoDaInfra` ganha casos:
    - registrar consumidor sem a plataforma no ar falha;
    - o prazo do consumidor fica limitado a `expira_em(plataforma) − 1 h`;
    - `estender` do consumidor tem o mesmo limite;
    - a plataforma continua limitada a 24 h desde o próprio apply (D-024);
    - **análise 1, A10:** registrar consumidor quando faltam menos de 2 h para a plataforma vencer falha. São 1 h de margem (ADR-0007) mais 1 h de prazo útil mínimo, porque o agendador roda de hora em hora.
  - **Arquivos:** `harness/infra.py`, `harness/test_harness.py`.
  - **Aceite:** mensagens de erro dizem o limite e o motivo (o que falhou e se é retentável, 5.3). No caso de pouco tempo, a mensagem diz quanto falta e que a plataforma pode ser estendida com `infra.py estender`, até 24 h desde o apply dela.
  - **Depende de:** T040.
- [ ] T042 [engenheiro-terraform] `vencidos` com espera da plataforma e destroy dos consumidores primeiro · RF-008, ADR-0007 · TH-02
  - **Teste vermelho:** casos em `TestPrazoDaInfra`: plataforma vencida com consumidor registrado vai para `aguardando`; quando a plataforma vence, todo consumidor registrado vai para `destruir`, mesmo antes do próprio prazo; o redisparo de 3 horas continua valendo.
  - **Arquivos:** `harness/infra.py`, `harness/test_harness.py`; `.github/workflows/expirar-infra.yml` só se o tratamento de `aguardando` precisar de passo novo.
  - **Aceite:** o agendador nunca dispara o destroy da plataforma com consumidor registrado.
  - **Depende de:** T041.
- [ ] T043 [engenheiro-terraform] Comandos `dependentes` e `requisitos` nos modelos de apply e destroy · RF-008, ADR-0007 · TH-03
  - **Teste vermelho:** testes do `infra.py`:
    - `dependentes 00-plataforma-agentes` sai com código 1 e lista o consumidor no ar, e sai com 0 para um produto;
    - `requisitos 03-mcp-regras-cdb` sai com 1 sem a plataforma no ar e, pela análise 1 (A10), também quando faltam menos de 2 h para a plataforma vencer (mesma regra do T041);
    - `estado.checar_destroy` e `estado.checar_apply` reprovam workflow sem o passo;
    - **análise 1, A10:** o `estado.checar_apply` também reprova um modelo de apply em que o registro do prazo roda depois do `terraform apply`. A fixture é o modelo de hoje, com o job `prazo` em `needs: apply`.
  - **Arquivos:** `harness/infra.py`, `harness/estado.py`, `harness/modelos/apply.yml`, `harness/modelos/destroy.yml` (passo `dependentes` antes do `terraform destroy`), `.github/workflows/00-plataforma-agentes-{apply,destroy}.yml` regenerados do modelo, `harness/test_harness.py`.
    - **No `apply.yml`, o `requisitos` e o registro do prazo rodam antes do `terraform apply`.** O `requisitos` é o primeiro passo do job `prazo`, e o job `apply` passa a ter `needs: prazo`. Assim, o prazo é registrado antes de criar custo (ADR-0007, correção da análise 1). Se o apply falhar no meio, o registro fica, e o agendador destrói o que foi criado no prazo.
  - **Aceite:** `test_workflows_da_plataforma_iguais_ao_modelo` verde; o mesmo modelo serve plataforma e produtos; actions continuam fixadas por SHA.
    - **D-039:** o aviso do passo "Pré-requisitos da conta" deixa de pedir o `infra/conta` "pelo menos 48 h antes da demonstração". Ele passa a dizer que a tag `project` é ativada uma vez na conta, assim que a chave aparecer no Billing (T053).
    - Se a orquestração já tiver mudado esse texto ao aplicar a D-039, a tarefa só confere que o modelo e os workflows regenerados estão iguais.
    - O passo continua só avisando (`TestPreRequisitosDaConta`).
  - **Depende de:** T041.
- [ ] T044 [engenheiro-terraform] Apply recusa `LOG_ONLY` antes do Terraform · RF-002, ADR-0005 · TH-05
  - **Teste vermelho:** teste do harness: um apply com `TF_VAR_modo_politica=LOG_ONLY` no ambiente do passo, ou `modo_politica` igual a `LOG_ONLY` num `.tfvars` do stack, faz o passo sair com 1; `estado.checar_apply` reprova workflow sem o passo.
  - **Arquivos:** `harness/modelos/apply.yml`, `.github/workflows/00-plataforma-agentes-apply.yml` regenerado, `harness/estado.py`, `harness/test_harness.py`.
  - **Aceite:** o passo vai no modelo, porque o teste de igualdade exige workflow da plataforma idêntico ao modelo; para projetos sem a variável, ele não tem efeito. A calibração roda fora do workflow de demonstração (ADR-0005).
  - **Depende de:** T043.
- [ ] T045 [P] [engenheiro-seguranca] Gate de recursos brutos do AgentCore fora da plataforma · RF-001, RNF-001 · TH-04
  - **Teste vermelho:** teste do harness com um `.tf` sintético em `modulos/` que declara `aws_bedrockagentcore_gateway_target`; o gate precisa reprovar. Os quatro tipos proibidos: `aws_bedrockagentcore_gateway`, `_gateway_target`, `_policy` e `_policy_engine`.
  - **Arquivos:** `harness/estado.py` (subcomando `checar-recursos`, que lê os `.tf` alterados), `.githooks/pre-commit`, `.github/workflows/harness.yml`, `harness/test_harness.py`.
  - **Aceite:** arquivos sob `plataforma/agentes/infra/terraform/` (inclui `modules/registro-produto`) passam; qualquer outro caminho reprova no `pre-commit` e no CI.
- [ ] T046 [P] [operador-harness] Cobertura da matriz · Art. III, RNF-007 · TH-07
  - **Teste vermelho:** teste do harness que extrai todo `RF-0NN` e `RNF-0NN` do `spec.md` e reprova se algum não aparece em `matriz.md` com pelo menos uma tarefa e um teste; fixture de matriz sem o RF-009 reprova.
  - **Arquivos:** `harness/test_harness.py`.
  - **Aceite:** verde com o `matriz.md` desta fase.
- [ ] T047 [P] [operador-harness] Nenhum valor da plataforma à mão e CI de código sem Bedrock · RF-007, RNF-002, RNF-005 · TH-10, TH-11
  - **Teste vermelho:** teste do harness: uma ocorrência sintética de `arn:aws:bedrock` em `plataforma/agentes/src/` reprova (fora de `tests/gravacoes/`); um workflow sintético com `bedrock-runtime` ou `Converse` fora dos de apply e destroy reprova.
  - **Arquivos:** `harness/test_harness.py`.
  - **Aceite:** o repositório atual passa; a busca vale também para `modulos/03-mcp/` quando a D03 tiver código (critério de sucesso 1).
    - **Análise 1, A12:** o critério 1 cita "o código **e o Terraform** do produto". Então a busca do TH-10 inclui de forma explícita os `.tf` e `.tfvars` de `modulos/03-mcp/arquitetura/`, além do código.
    - Uma fixture sintética de `.tf` com `arn:aws:bedrock-agentcore` precisa reprovar. As gravações em `tests/gravacoes/` continuam fora da busca.

- [ ] T048 [engenheiro-terraform] Verificação de sobras no modelo de destroy: chave KMS em exclusão e caminho do SSM (análise 1, A01 e A12) · Art. V, RF-008, critério de sucesso 3 · TH-14 (novo, da análise 1)
  - **Teste vermelho:** `TestVerificacaoDeSobras` em `harness/test_harness.py`. Ele usa uma saída sintética da Tagging API e estados sintéticos do `kms describe-key`, sem chamar a AWS:
    - só uma chave KMS em `PendingDeletion`: passa;
    - essa chave mais qualquer outro ARN: reprova e lista o outro ARN;
    - uma chave KMS `Enabled`: reprova;
    - uma chave KMS cuja consulta falha, por exemplo com `AccessDenied`: reprova (falha fechada);
    - caminho `/<chave>/` do SSM com algum parâmetro: reprova e lista os nomes; caminho vazio: passa;
    - o `estado.checar_destroy` reprova um workflow de destroy sem o passo de caminho ou sem o filtro.
  - **Arquivos:**
    - `harness/infra.py`: a lógica, numa função pura testável, que recebe os ARNs, os estados das chaves e os nomes de parâmetro e devolve as sobras;
    - `harness/estado.py`, `harness/test_harness.py`;
    - `harness/modelos/destroy.yml`, no passo "Verificar sobras pela tag do projeto". Ele chama `aws kms describe-key` para cada ARN `arn:aws:kms:` e `aws ssm get-parameters-by-path --path "/$CHAVE/" --recursive`, e entrega as saídas à função;
    - `.github/workflows/00-plataforma-agentes-destroy.yml`, regenerado do modelo.
  - **Aceite:**
    - O filtro ignora só a chave KMS com `KeyState = PendingDeletion`, que não tem custo (ADR-0001). O comentário "Ajuste por projeto" sai do modelo, porque uma exceção só existe com teste.
    - Para produtos, o caminho `/<chave do produto>/` fica vazio depois do destroy, então o mesmo modelo serve a todos.
    - `test_workflows_da_plataforma_iguais_ao_modelo` verde.
    - **Permissões:** a role de deploy precisa de `kms:DescribeKey` e `ssm:GetParametersByPath`. Se faltar alguma, o passo falha fechado, com uma mensagem que diz a permissão. A T083 confere.
    - O job `prazo` do destroy continua com `needs: destroy`.
  - **Depende de:** T043, que mexe no mesmo arquivo.

## Fase 5 · Configuração da conta (`infra/conta`, D-034)
- [ ] T050 [engenheiro-terraform] Tag `project` como tag de alocação de custo · RF-005, D-034 · TT em `infra/conta/tests/`
  - **Teste vermelho:** `infra/conta/tests/conta.tftest.hcl` afirma `aws_ce_cost_allocation_tag` com `tag_key = "project"` e `status = "Active"`.
  - **Arquivos:** `infra/conta/main.tf`, `infra/conta/tests/conta.tftest.hcl`.
  - **Aceite:** o `orcamento.tftest.hcl` atual segue verde.
    - **O README do `infra/conta` explica o calendário da tag (R2 e D-039):**
      - a chave aparece até 24 h depois de a tag ser aplicada a recursos, e ativa em até mais 24 h;
      - a ativação é única na conta e vale para todos os projetos;
      - o dono a faz assim que a chave aparecer no Billing (T053);
      - enquanto a chave não aparece, a ativação falha, e basta reaplicar depois.
    - **A falha da ativação não impede o resto do `infra/conta`.** Nenhum recurso tem `depends_on` no `aws_ce_cost_allocation_tag`, então o Transaction Search e o parâmetro de e-mails são criados mesmo assim.
- [ ] T051 [P] [engenheiro-terraform] Transaction Search do CloudWatch · RF-006, D-034 · TT em `infra/conta/tests/`
  - **Teste vermelho:** asserts do destino de segmentos do X-Ray no CloudWatch Logs e da política de recurso do Logs que o permite, com condição de conta.
  - **Arquivos:** `infra/conta/main.tf`, `infra/conta/tests/conta.tftest.hcl`.
  - **Aceite:** sem custo fixo; o passo "Pré-requisitos da conta" do apply passa a achar o Transaction Search ligado.
- [ ] T052 [P] [engenheiro-terraform] Parâmetro `/00-conta/alertas/emails` · RNF-003, ADR-0008, D-034 · TT em `infra/conta/tests/`
  - **Teste vermelho:** assert de `aws_ssm_parameter` `String`, `Standard`, valor `join(",", var.emails_alerta)` e tags do `infra/conta`.
  - **Arquivos:** `infra/conta/main.tf`, `infra/conta/outputs.tf`, `infra/conta/tests/conta.tftest.hcl`.
  - **Aceite:** nenhuma variável nova; os valores de e-mail continuam só no `tfvars` do dono, fora do repositório.
- [ ] T053 [DONO] Aplicar o `infra/conta` e ativar a tag `project` assim que a chave aparecer no Billing · D-034, D-039
  - **Quando (D-039, resposta à P00-P9, 2026-11-20):** a ativação da chave `project` como tag de alocação de custo é única na conta e vale para todos os projetos. O dono a faz assim que a chave aparecer no Billing, bem antes da primeira demonstração. **Nenhuma demonstração espera 48 h, e esta tarefa não depende mais do ensaio.**
  - **Como a chave aparece:**
    - **O que a documentação diz:** a [página de ativação](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/activating-tags.html) diz só que a chave aparece até 24 h depois de a tag ser criada e aplicada a recursos, e que a ativação leva até mais 24 h.
    - **O que ela não diz:** se o recurso precisa ter cobrança.
      - A [página de tags definidas pelo usuário](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/custom-tags.html) admite ativar tag de serviço sem medição, que só não aparece nos relatórios de custo. Isso sugere que basta o recurso existir, mas é **inferido**.
      - A [página de datas das tags](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/cost-allocation-tags-timeline.html) define o "último mês de uso" pela associação a um recurso, e não pela cobrança.
      - Todas foram consultadas em 2026-11-20.
    - **Recurso mais barato que pode bastar:** o próprio `infra/conta`, por US$ 0. O `default_tags` já põe `project = "00-conta"` no Budgets mensal e no parâmetro de e-mails da T052. Eles não têm custo e não exigem recurso novo. **É incerto** se recurso sem cobrança faz a chave aparecer.
    - **Se a chave não aparecer em 24 h:** o recurso mais barato com cobrança e com a tag, já previsto no plano, é o ensaio da plataforma (T084). A chave KMS custa US$ 0,033 por dia, e o ensaio inteiro cerca de US$ 0,09. A ativação fica então para depois do ensaio, e ainda antes da demonstração.
    - Não criar nem marcar recurso fora do Terraform para isso. O que escapa do Terraform escapa também do destroy e da verificação de sobras.
  - **Passos:**
    1. Aplicar o `infra/conta` com o T050 a T052 no `main`.
    2. Conferir a chave no console, em Cost allocation tags, ou com `aws ce list-cost-allocation-tags --tag-keys project`.
    3. Se a ativação tiver falhado porque a chave ainda não existia, reaplicar quando ela aparecer (R2).
  - **Rede de segurança, opção do dono:** se a ativação sair depois de uma demonstração, a [página de backfill](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/cost-allocation-backfill.html) permite pedir a reaplicação do status das tags por até 12 meses para trás, uma vez a cada 24 h.
    - Ela só preenche os meses em que a tag já estava nos recursos.
    - A página fala da conta de gerenciamento. Para conta avulsa, como esta (RNF-004), isso é inferido.
  - **Aceite:**
    - `aws ce list-cost-allocation-tags --tag-keys project --status Active` devolve a chave antes do apply da demonstração. O passo de pré-requisitos do apply confere e só avisa.
    - O Transaction Search está ligado, e o parâmetro de e-mails existe.
  - **Depende de:** T050, T051, T052.

## Fase 6 · Componente Claude: agente de exemplo (só respostas gravadas, D-006)
- [ ] T060 [avaliador-llm] Roteiro sintético e gravações · RF-010, RF-011, RNF-008, Art. VIII · RG-09
  - **Teste vermelho:** `plataforma/agentes/tests/test_gravacoes.py` reprova gravação sem o campo `proveniencia` (`documentada` ou `sintetica`) e roteiro sem `sintetico: true`.
  - **Arquivos:** `plataforma/agentes/tests/gravacoes/` (uma por linha do RF-011 e uma por passo do roteiro: permitido, negado por política, negado pelo guardrail de tools, bloqueado pelo guardrail do modelo; um resultado de tool com injeção indireta para o RG-05 e o DM-05), `plataforma/agentes/tests/gravacoes/roteiro.json`, `plataforma/agentes/tests/test_gravacoes.py`.
  - **Aceite:** negação de política e chamada permitida no formato da documentação do Gateway com Policy; bloqueio do guardrail no formato do `Converse`; saída suprimida marcada `proveniencia: sintetica`; só dados sintéticos, sem dado pessoal real.
- [ ] T061 [engenheiro-claude] Loop do agente pelo `stopReason` · Art. VII, RF-010 · RG-01
  - **Teste vermelho:** `plataforma/agentes/tests/test_loop.py`: `tool_use` chama o gateway, `end_turn` encerra, `guardrail_intervened` para e classifica, e a 11ª volta de tool encerra a sessão com erro de limite.
  - **Arquivos:** `plataforma/agentes/src/agente_exemplo/{__init__.py,loop.py,contrato.py}`, `plataforma/agentes/tests/test_loop.py`.
  - **Aceite:** guardrail id e versão, perfil e URL do gateway vêm só do contrato (lido de um arquivo gravado no teste); nenhum ARN escrito no código (TH-10).
  - **Depende de:** T060, T018.
- [ ] T062 [engenheiro-claude] Classificador de erros e handoff para humano · RF-011, RF-012 · RG-06
  - **Teste vermelho:** `plataforma/agentes/tests/test_erros.py`, uma gravação por linha do RF-011: categoria e retentável esperados; texto inédito cai em `erro_desconhecido` e é tratado como negação; `limite_taxa` e `falha_transitoria` tentam até 3 vezes com espera de 1, 2 e 4 s (relógio falso); negação de tool `sensivel` para o loop e devolve `requer_aprovacao_humana` com o nome da tool e o motivo.
  - **Arquivos:** `plataforma/agentes/src/agente_exemplo/erros.py`, `plataforma/agentes/tests/test_erros.py`.
  - **Aceite:** o mapa usado pelo classificador é o `mapa_erros` do contrato, não uma cópia no código; o erro propagado leva categoria, retentável e o que já foi tentado (5.3).
  - **Depende de:** T061.
- [ ] T063 [P] [engenheiro-claude] Cliente MCP com SigV4 e versão de protocolo · RF-003, ADR-0010 · RG-08
  - **Teste vermelho:** `plataforma/agentes/tests/test_cliente_mcp.py`: toda requisição tem assinatura SigV4 (credenciais sintéticas) e o cabeçalho `MCP-Protocol-Version` com uma versão de `versoes_mcp` do contrato; versão fora da lista é recusada antes de enviar.
  - **Arquivos:** `plataforma/agentes/src/agente_exemplo/cliente_mcp.py`, `plataforma/agentes/tests/test_cliente_mcp.py`.
  - **Aceite:** nenhuma credencial em arquivo ou log.
  - **Depende de:** T061.
- [ ] T064 [engenheiro-claude] Conteúdo não confiável checado e trace fora do log · RF-010, RF-011, RNF-008 · RG-05, RG-07
  - **Teste vermelho:** `plataforma/agentes/tests/test_nao_confiavel.py`: resultado de tool `conteudo_nao_confiavel` passa por `ApplyGuardrail` com `source=INPUT` no guardrail do produto antes de entrar no contexto, e a intervenção vira `guardrail_entrada`; um teste captura os logs da sessão e reprova se o trace do guardrail aparecer.
  - **Arquivos:** `plataforma/agentes/src/agente_exemplo/nao_confiavel.py`, `plataforma/agentes/tests/test_nao_confiavel.py`.
  - **Aceite:** ADR-0004 cumprido; as classes das tools vêm do parâmetro do produto.
  - **Depende de:** T062.
- [ ] T065 [engenheiro-claude] Roteiro de quatro passos com respostas gravadas · RF-002, RF-004, RF-010 · RG-02, RG-03, RG-04
  - **Teste vermelho:** `plataforma/agentes/tests/test_roteiro.py` roda o `roteiro.json`: permitido; negado por política (`AuthorizeActionException` → `politica_negada`); negado pelo guardrail de tools; bloqueado pelo guardrail do modelo (`guardrail_intervened` → `guardrail_entrada`).
  - **Arquivos:** `plataforma/agentes/tests/test_roteiro.py`, `plataforma/agentes/src/agente_exemplo/roteiro.py`.
  - **Aceite:** o resultado de cada passo tem a categoria e o id da gravação usada.
  - **Depende de:** T063, T064.
- [ ] T066 [engenheiro-claude] Script de fumaça sem Claude · RF-002, RNF-002 · DM-01 (fumaça), DM-03, TH-11
  - **Teste vermelho:** `plataforma/agentes/tests/test_fumaca.py` com respostas gravadas:
    - com a role de fumaça, `tools/list` vem vazio e um `tools/call` é negado;
    - o script não importa nem chama `Converse`;
    - **análise 1, A04: a ordem das credenciais.** O script lê o contrato do SSM com a credencial de quem o chama e só depois assume a role de fumaça para falar com o gateway. Um teste com credenciais falsas reprova se a leitura do SSM usar a role de fumaça, que só tem `InvokeGateway` (TT-R09).
    - **DM-03, com dois casos gravados.** Uma chamada sem assinatura é recusada pela autenticação `AWS_IAM`. Uma chamada assinada pela role de evidências (T068), que não tem `InvokeGateway`, recebe `AccessDenied`. Os dois são classificados como erro de autenticação, sem retentativa. O formato não publicado fica marcado `proveniencia: sintetica`.
    - **`--negacoes N`:** padrão 1. O ensaio usa 5 para levar o alarme de negações a `ALARM` (DM-09).
  - **Arquivos:** `plataforma/agentes/scripts/fumaca.py`, `plataforma/agentes/tests/test_fumaca.py`, gravações em `plataforma/agentes/tests/gravacoes/`.
  - **Aceite:** a saída traz o resultado e o horário de cada chamada, para conferir `DenyDecisions` ≥ 1. O script não chama `ApplyGuardrail`, e o teste também reprova essa chamada. A chamada direta ao guardrail sem o Claude é o DM-05, feito pelo agente do produto (emenda 1, F1). Quem roda o script na AWS é o job de fumaça da T069, e não o dono à mão.
  - **Depende de:** T060, T063.
- [ ] T067 [avaliador-llm] Coleta de evidências e avaliação sob demanda · RF-006 · DM-04, DM-08
  - **Teste vermelho:** `plataforma/agentes/tests/test_evidencias.py` com respostas gravadas do CloudWatch e do Evaluations: o relatório tem, por produto, `AllowDecisions`, `DenyDecisions` (por `Mode`), `InvocationsIntervened`, pelo menos um id de trace e a nota de `Builtin.Helpfulness`, `Builtin.GoalSuccessRate` e `Builtin.ToolSelectionAccuracy`; falta de um campo reprova em vez de sair vazio.
  - **Arquivos:** `plataforma/agentes/scripts/evidencias.py`, `plataforma/agentes/tests/test_evidencias.py`, `plataforma/agentes/docs/relatorio-demonstracao.md` (modelo).
  - **Aceite:** o relatório marca cada número com a fonte e a hora da leitura (5.6). O script roda na AWS com a role de evidências, pelo workflow de evidências (T068; emenda 1, F4).
  - **Depende de:** T060.

- [ ] T068 [engenheiro-terraform] Role e workflow de evidências (emenda 1, F4) · RF-006, RNF-001, RNF-005 · TT-O05, TH-13, TH-11 (extensão)
  - **Teste vermelho:** `modules/observabilidade/tests/evidencias.tftest.hcl` afirma a role `00-plataforma-agentes-evidencias`, confiada só pela role de deploy, com exatamente as ações `cloudwatch:GetMetricData`, `logs:StartQuery` (nos grupos `aws/spans` e de logs do gateway), `logs:GetQueryResults`, `ssm:GetParameter` (no `comum` e em `produtos/*`) e `bedrock-agentcore:Evaluate`, sem `bedrock:InvokeModel` e sem `iam:PassRole`. TH-13 em `harness/test_harness.py` reprova se `.github/workflows/00-plataforma-agentes-evidencias.yml` não tem só `workflow_dispatch` com o input `produto`, o ambiente `aws-lab`, OIDC, `permissions` com `id-token: write` e `contents: read`, e upload do relatório com `retention-days: 1`. O TH-11 do T047 passa a aceitar esse workflow como de operação e continua reprovando um workflow sintético com gatilho `pull_request` que cite `bedrock`.
  - **Arquivos:** `plataforma/agentes/infra/terraform/modules/observabilidade/evidencias.tf`, `modules/observabilidade/tests/evidencias.tftest.hcl`, `.github/workflows/00-plataforma-agentes-evidencias.yml`, `harness/test_harness.py`.
  - **Aceite:** actions fixadas por SHA (`TestVersoesDasActions`); nenhuma declaração com ação `*` e recurso `*` (T003 verde); onde a referência de autorização só aceitar `*`, exceção do checkov com ADR de implementação (R9); o relatório nunca entra em commit pelo workflow.
  - **Depende de:** T016, T047, T067.

- [ ] T069 [engenheiro-terraform] Job manual de fumaça no workflow de evidências (análise 1, A04 e A05) · RF-002, RF-003, RNF-002, RNF-003, RNF-005 · TH-13 (extensão), TH-11, DM-01 (fumaça), DM-03, DM-09
  - **Teste vermelho:** o TH-13 passa a exigir, no `.github/workflows/00-plataforma-agentes-evidencias.yml`, um job `fumaca` disparado pelo input `etapa: fumaca`. O padrão do input continua `evidencias`, e o `produto` só é exigido na etapa `evidencias`. O teste reprova se o job `fumaca`:
    - não estiver no ambiente `aws-lab`;
    - não usar OIDC na role de deploy;
    - não assumir a role de fumaça só para o gateway e a role de evidências só para o caso do DM-03;
    - tiver gatilho diferente de `workflow_dispatch`;
    - não enviar o relatório como artefato com `retention-days: 1`.

    O TH-11 continua reprovando um workflow sintético com gatilho `pull_request` que cite `bedrock`.
  - **Arquivos:** `.github/workflows/00-plataforma-agentes-evidencias.yml`, `harness/test_harness.py`.
  - **Aceite:**
    - **Execução:** o job roda `scripts/fumaca.py --negacoes 5` (T066). Assim, o dono só dispara o job, sem credencial local para encadear roles, porque a role de fumaça é confiada só pela role de deploy.
    - **Leituras com a credencial de quem chama** (a role de deploy, só leitura): o contrato, o estado dos alarmes (`describe-alarms`) e o `list-metrics` do namespace `AWS/Bedrock-AgentCore`.
      - Os dois últimos entram no relatório do ensaio, como evidência dos conjuntos reais de dimensões (ADR-0013).
      - As roles de fumaça e de evidências não ganham permissão nova (TT-R09 e TT-O05 iguais).
    - Actions fixadas por SHA; `permissions` com `id-token: write` e `contents: read`; nenhum relatório em commit.
  - **Depende de:** T066, T068.

## Fase 7 · Operação, custo e revisão
- [x] T070 [engenheiro-terraform] Workflows de apply e destroy da plataforma (existem e estão testados) · RF-008, Art. V · TH existente
  - `.github/workflows/00-plataforma-agentes-apply.yml` (input `prazo_horas`, ambiente `aws-lab`, `infra.py registrar`, conferência da tag de custo e do Transaction Search da D-034) e `00-plataforma-agentes-destroy.yml` (`confirm_stack`, ambiente `aws-lab-destroy`, OIDC, verificação de sobras pela tag, `infra.py remover`). Provados por `TestWorkflowsDeImplantacao`, `TestVersoesDasActions`, `TestPreRequisitosDaConta` e `estado.py validar`. T043 e T044 os regeneram.
- [x] T071 [operador-harness] Gate SDD e caminho padrão (existem e estão testados) · Art. I, H1 · TH existente
  - `gate_sdd.py`, `pre-commit` e `estado.py checar-arquivos` bloqueiam `plataforma/agentes/` antes de implementar (`TestGateSddPorArquivo`); o projeto nasceu por `novo_projeto.py` (`TestCaminhoPadrao`).
- [ ] T072 [engenheiro-terraform] README com até 5 passos e o teto · Art. V, Art. VI, RNF-003 · TH-09
  - **Teste vermelho:** teste do harness reprova `plataforma/agentes/README.md` com mais de 5 passos numerados ou sem o teto `US$ 1,20`.
  - **Arquivos:** `plataforma/agentes/README.md`, `harness/test_harness.py`.
  - **Aceite:** o README traz:
    - **pré-requisitos:** conta com OIDC, `infra/conta` aplicado e tag `project` ativa como tag de alocação de custo, que é ativada uma vez na conta assim que a chave aparece (D-039, T053);
    - **ordem do dia:** plataforma, produto, roteiro, evidências, destroy do produto e destroy da plataforma;
    - **como o produto consome o contrato;**
    - **análise 1, A17:** o Budgets diário só enxerga custo depois da ativação da tag. Antes dela, inclusive num ensaio que sirva para a chave aparecer, só o Budgets mensal da conta protege.
    - **a confirmação do e-mail do SNS a cada apply** (ADR-0008), sem nenhum endereço escrito no README.
  - **Depende de:** T020, T038, T043.
- [ ] T073 [finops-demonstracao] Custo do PR contra o teto e custo fixo ocioso · Art. V, RNF-002 · ES (Infracost), TT-K02
  - **Teste vermelho:** o `gate_custo.py` roda sobre a saída do Infracost do branch, e uma fixture com recurso de custo fixo (por exemplo, endpoint de interface) precisa reprovar.
    - **TH-15 (novo, análise 1, A09):** um teste em `harness/test_harness.py` reprova se `plataforma/agentes/infra/terraform/infracost-usage.yml` não existir. Também reprova se o arquivo não tiver as premissas da tabela "Custo do lab" para os recursos cobrados por uso: 1.000 chamadas, 100 tools, 10 MB de logs, as publicações do SNS e as requisições do KMS.
    - Também reprova se a geração do `infracost.yml` no `seguranca.yml` não passar `usage_file` quando o diretório tiver esse arquivo.
  - **Arquivos:**
    - `plataforma/agentes/infra/terraform/infracost-usage.yml`;
    - o passo que gera o `infracost.yml` no `.github/workflows/seguranca.yml`, que acrescenta `usage_file` por diretório quando o arquivo existe, sem mudar nada para os outros projetos;
    - `harness/test_harness.py`;
    - o comentário de revisão no PR.
  - **Aceite:** custo de 24 h do root ≤ US$ 1,20; nenhum recurso fora do destroy; diferenças contra a estimativa do plano explicadas.
    - **O comentário lista, linha a linha da tabela "Custo do lab", o que o Infracost cobriu e o que ficou "não coberto",** com o valor do plano ao lado. O AgentCore e o `InvokeGuardrailChecks` provavelmente não são cobertos (inferido).
    - **O "verde" do Infracost só vale para as linhas cobertas.** O total comparado com o teto é a soma das linhas cobertas mais o valor do plano para as não cobertas.
    - A linha de `ApplyGuardrail` da fumaça é US$ 0 na plataforma. A reserva do SNS e a da coleta de evidências (US$ 0,010 cada) são conferidas pelo arquivo de uso, ou declaradas "não cobertas" (emenda 1, F1 e F4).
    - O custo dos alarmes por consulta do Metrics Insights, que é por métrica analisada, é comparado com a linha de alarmes do plano (ADR-0013).
  - **Depende de:** T017, T020.
- [ ] T074 [engenheiro-seguranca] Modelo de ameaças contra os testes e esteira limpa · Art. IV, RNF-001 · ES
  - **Teste vermelho:** para cada linha do STRIDE do plano, o teste citado precisa existir e estar verde; uma linha sem teste reprova a revisão.
  - **Arquivos:** comentário de revisão no PR; exceções só com justificativa versionada (`.checkov.yaml`, `.trivyignore`, `.semgrepignore`) e ADR em `plataforma/agentes/adr/`.
  - **Aceite:** gitleaks, Semgrep, CodeQL, zizmor, Trivy, checkov e tflint sem achado alto ou crítico; R4 resolvido com o recurso mais estreito ou exceção com ADR.
  - **Depende de:** T020, T038, T045, T048, T067, T068, T069.

## Fase 8 · Verificação
- [ ] T080 [testador-integracao] Integração no Floci e relatório · RF-001, RF-007, RNF-003, RNF-007, Art. III, Art. V · FL-01, FL-02, FL-03, FL-04
  - **Teste vermelho:** asserts escritos antes do apply: FL-01 cinco alarmes com os parâmetros do RNF-003; FL-02 alvo do produto sintético registrado no gateway; FL-03 produto sintético monta a chamada só pelo SSM do Floci; FL-04 nenhum recurso com `project=00-plataforma-agentes` e nada sob `/00-plataforma-agentes/` depois do destroy.
  - **Arquivos:** `plataforma/agentes/tests/floci/` (root que compõe `nucleo`, `gateway`, `observabilidade`, `contrato` e o produto sintético com a variável do T038), job do Floci como container de serviço no `00-plataforma-agentes-ci.yml` (disparo manual), relatório em `testing/reports/` e `testing/reports/latest.html`.
  - **Aceite:** só com as Fases 2, 3, 4 e 6 concluídas e com o código da Fase 5 (T050 a T052). A T053 é do dono, aplica a conta real e não bloqueia a integração no Floci (análise 1, A15). Imagem `${FLOCI_IMAGE:-floci/floci:latest}` (D-013); o relatório separa falha real de lacuna, cada lacuna com o link de evidência do ADR-0009; nenhum código correto alterado para agradar o emulador. O root do Floci passa id e ARN sintéticos fixos do motor ao `observabilidade` e ao `contrato`, e o relatório os marca como sintéticos com o link do ADR-0009 (emenda 1, F3).
    - O root do Floci passa `motor_politica_arn = null` ao `gateway` (ADR-0011).
    - Se o Floci não aceitar os alarmes por consulta do Metrics Insights (ADR-0013), o FL-01 afirma só a configuração gravada, e a lacuna vai ao relatório com evidência.
  - **Depende de** (análise 1, A15; lista completa): T020, T038, T040, T041, T042, T043, T044, T045, T046, T047, T048, T050, T051, T052, T060, T061, T062, T063, T064, T065, T066, T067, T068, T069. A T020 e a T038 já trazem as tarefas de que dependem (T010 a T019 e T030 a T037).
- [ ] T081 [revisor-independente] Revisão independente da entrega · Art. III, Art. VII
  - **Teste vermelho:** a revisão parte da matriz: cada linha precisa de tarefa `[x]` e teste verde; linha sem prova reprova.
  - **Arquivos:** comentário de revisão no PR.
  - **Aceite:** instância diferente de quem escreveu (4.6); achados com severidade, local e correção sugerida.
  - **Depende de:** T074, T080.
- [ ] T082 [pesquisador] Disponibilidade regional e versão do provider antes do primeiro apply real · RNF-006
  - **Teste vermelho:** tabela de achados com uma linha por peça (Gateway, Policy, Guardrails no Policy, Evaluations, guardrail `STANDARD`, perfil de aplicação) em `us-east-1`, mais as permissões do `Evaluate` sob demanda na referência de autorização (R9, emenda 1); peça sem fonte oficial datada reprova.
  - **Arquivos:** relatório para a orquestração; se algo mudou, ADR em `plataforma/agentes/adr/` (nunca edição do plano sem nova aprovação).
  - **Aceite:** fonte, data da fonte, data da consulta e certeza em cada linha (5.6).
- [ ] T083 [DONO] Conta e ambientes para o apply real · RNF-004, D-024, P00-P2
  - Criar a conta com OIDC quando o primeiro produto estiver pronto (P00-P2); criar o ambiente `aws-lab-destroy` sem aprovação e restrito ao `main`; incluir o subject desse ambiente na confiança OIDC da role de deploy (pendência já registrada na memória compartilhada).
  - **Aceite:** um destroy manual de teste roda no `aws-lab-destroy` sem pedir aprovação e assume a role por OIDC.
    - A role de deploy tem `kms:DescribeKey` e `ssm:GetParametersByPath`, que a verificação de sobras usa (T048).
    - A role de deploy pode assumir as roles de fumaça e de evidências (T069).
- [ ] T084 [DONO] Ensaio da plataforma num dia separado, antes da demonstração · RF-002, RF-003, RF-008, RNF-003, R2, R8 · DM-01 (fumaça), DM-03, DM-09, DM-06 (sobras)
  - **Quando (D-039):** num dia separado, antes da demonstração, como o plano já prevê pelo custo do ensaio. Não há mais janela de 48 h entre o ensaio e a demonstração. A tag de custo é ativada uma vez na conta, assim que a chave aparecer (T053). O ensaio só serve para isso se a chave não aparecer com o `infra/conta`.
  - **Passos:**
    1. Disparar o apply da plataforma e confirmar a assinatura de e-mail do SNS (ADR-0008).
    2. **Disparar o job `fumaca` do workflow de evidências (T069).** Ele roda `scripts/fumaca.py --negacoes 5`: `tools/list` vazio e `tools/call` negado (DM-01) e os dois casos do DM-03 (sem assinatura, e assinado pela role de evidências, sem `InvokeGateway`).
    3. **DM-09 (análise 1, A05):** em até 10 minutos, o alarme de negações vai a `ALARM`, e o e-mail chega.
       - O relatório do job traz o estado dos alarmes e o `list-metrics` do namespace (ADR-0013).
       - Se `DenyDecisions` não subir e `NoDeterminingPolicies` subir, isso é um achado. Ele vira ADR e correção na T017 antes da demonstração.
    4. Conferir o destroy automático. A verificação de sobras passa com a chave KMS em `PendingDeletion` e sem parâmetro sob `/00-plataforma-agentes/` (T048).
  - **Limite do dia (análise 1, A17):** se a tag `project` ainda não estiver ativa, o Budgets diário da plataforma não enxerga o custo do ensaio, e só o Budgets mensal da conta protege. O prazo de 24 h e o destroy automático continuam valendo. O ensaio é só da plataforma, sem produto sintético na AWS real (emenda 1, F2), e custa cerca de US$ 0,09; as 5 negações a mais custam menos de US$ 0,001.
  - **Opcional, decidido pelo dono no dia:** aplicar também a D03, se ela já estiver em `verificar`, para antecipar o R8. O custo vai no teto da D03.
  - **Depende de:** T048, T069, T080, T081, T082, T083.
- [ ] T085 [DONO] Caso de uso da Anthropic no Bedrock, só se o modelo da D03 for anterior ao Claude Opus 4.7 · D-034
  - Envio à mão no console; a orquestração só lembra no board.
  - **Aceite:** o modelo da D03 responde no console do Bedrock antes da demonstração, ou o plano da D03 registra que o modelo não exige o envio.
- [ ] T086 [DONO] Demonstração com a D03 · RF-002, RF-004, RF-006, RF-008, RF-010, Art. V · DM-01 a DM-06, DM-08
  - Ordem: apply da plataforma, apply da D03 (registra alvos e políticas pelo módulo), roteiro de quatro passos, DM-05 (injeção indireta sintética), workflow de evidências (`scripts/evidencias.py`, T068) antes de qualquer destroy, destroy da D03, destroy da plataforma, verificação de sobras (DM-06).
  - **Depende de:**
    - T053: tag `project` com status `Active` antes do apply da demonstração, sem janela de 48 h (D-039);
    - T068 (workflow de evidências), T084 e T085, se aplicável;
    - a D03 em `verificar`, hoje em `especificar`.
- [ ] T087 [finops-demonstracao] Custo real do dia contra o teto · RF-005, critério de sucesso 2 · DM-07
  - **Teste vermelho:** a comparação reprova se:
    - o custo real da plataforma passa de US$ 1,20;
    - o da D03 passa do teto dela;
    - um item cobrado não tem linha correspondente na tabela "Custo do lab" do plano;
    - **análise 1, A08:** uma linha da tabela não diz "como se mede", ou uma linha "sem tag" fica fora da soma.
  - **Como se mede cada linha (análise 1, A08):** a soma real é o que tem a tag mais o que é atribuído sem tag. O teste "custo real ≤ teto" não pode passar só porque a leitura deixou de fora a maior despesa.
    - **Pela tag `project=00-plataforma-agentes`, quando a cobrança vier com o recurso:** chave KMS, alarmes, gateway (invocações e indexação), motor (autorizações), logs entregues e SNS. A ligação de cada uma à tag é **inferida** e é conferida no primeiro dia medido.
    - **Pelo serviço e tipo de uso no dia da demonstração, em `us-east-1`, como "sem tag":**
      - Evaluations sob demanda (US$ 0,744, 69% da estimativa), chamado pela role de evidências sem recurso com tag;
      - `InvokeGuardrailChecks` (US$ 0,18), sem documentação de alocação por tag (inferido);
      - coleta de evidências (`GetMetricData` e Logs Insights);
      - spans, porque o grupo `aws/spans` é do `infra/conta`, com `project=00-conta`;
      - requisições do KMS, se não vierem com o recurso da chave.
    - **Linha sem tag que mistura plataforma e D03 no mesmo dia:** entra inteira na soma da plataforma, que é o lado conservador para o teto dela, com uma nota.
    - Identity, SSM e Budgets: conferir que ficam em US$ 0.
  - **Arquivos:** comentário no PR de verificação; nenhum número estimado no lugar de medido (marcar `nao-medido` quando faltar).
  - **Aceite:**
    - O dono lê o Cost Explorer pelo menos 48 h depois do fim da demonstração e entrega os números; o especialista não chama a AWS.
      - Essa janela é a latência dos dados do Cost Explorer, do critério de sucesso 2 da spec. Ela não é a ativação da tag, que a D-039 tirou do caminho da demonstração.
      - A leitura é feita duas vezes: agrupada por `project`, e por serviço e tipo de uso, filtrada pelo dia e pela região.
    - Se a tag não estava ativa no dia, o dono pode pedir um backfill antes da leitura (T053, opção dele).
    - Cada diferença contra o plano tem explicação.
    - **Alinhar o texto do critério 2:** ele fala só na leitura "pela tag", e esta tarefa mede mais que isso. A pergunta para alinhar o texto vai ao especificador, junto com a A02.
  - **Depende de:** T086.
- [ ] T088 [DONO] Revisão humana do relatório da demonstração · RF-006, RNF-008, Art. VIII
  - Confirmar que só há dados sintéticos e que os números têm fonte; decidir o que vai para fora do repositório (5.5).
  - **Depende de:** T086, T087.
- [ ] T089 [redator-tecnico] Post da plataforma (D-037) · Art. VIII, D-037
  - **Teste vermelho:** teste do harness reprova se `plataforma/agentes/posts/aws.md` não existe, se não traz link para a página do produto que consome a plataforma (a D03 primeiro), se cita número de custo ou de demonstração sem fonte, ou se fala do curso (regras do site).
  - **Arquivos:** `plataforma/agentes/posts/aws.md`, `harness/test_harness.py`.
  - **Aceite:** tom técnico para engenheiros seniores; o que ainda não foi medido aparece como pendente; sem post de cloud comparativa, porque a plataforma não tem cloud comparativa (skill `site-projeto`).
  - **Depende de:** T087, T088.
- [ ] T090 [desenvolvedor-site] Página da plataforma na trilha Arquiteturas AWS (D-037) · D-037
  - **Teste vermelho:** teste do harness reprova se `site/index.html` não tem um item `type: "arquitetura"` da `00-plataforma-agentes`, ou se a página não tem diagrama, ADRs, custo de um dia, último relatório de teste, link para o código e link para a página da D03, com o link de volta na página da D03.
  - **Arquivos:** `site/index.html` (`ITEMS`), a página do projeto em `site/`, `harness/test_harness.py`.
  - **Aceite:** segue a skill `site-projeto`; HTML e CSS estáticos; o post do T089 aparece em Posts; publicar no GitHub Pages (merge) continua com o dono.
  - **Depende de:** T089.

## Furos do plano encontrados na fase tarefas
F1 a F5 foram resolvidos pela emenda 1 do plano (2026-11-20, seção "Emenda 1" do `plan.md`), autorizada e aprovada pelo dono (D-038). O F6 já estava resolvido pela T002, sem mudar o plano.

| id | Furo | Onde | Efeito | Situação |
|---|---|---|---|---|
| F1 | O teste de fumaça da plataforma chama `ApplyGuardrail` (RNF-002 da spec; linha de US$ 0,025 no custo do lab), mas o stack da plataforma não tem guardrail (todo guardrail nasce no módulo, no state do produto) e a role de fumaça só tem `InvokeGateway` | plano, "Role de fumaça" e "Custo do lab" | T014, T066 e T073 não sabem contra qual guardrail testar nem se a linha de custo é da plataforma | resolvido (emenda 1): a fumaça ficou só com o gateway; o guardrail direto é o DM-05, no produto; a linha de custo saiu da plataforma (T014, T066, T073) |
| F2 | O ensaio de 48 h antes (R2, R8) prevê "um produto sintético" na AWS real, mas o plano só define o produto sintético do Floci: não há root, chave em `estado.json`, workflow nem custo para ele | plano, R2 e R8 | T084 cobre só a plataforma e a fumaça; a falha assíncrona `CREATE_FAILED` das políticas (R8) só aparece na demonstração com a D03 | resolvido (emenda 1): o ensaio é só da plataforma; o R8 é provado no primeiro apply da D03 (T084) |
| F3 | O root de integração compõe sem o motor de política (ADR-0009), mas o contrato `comum` publica `motor_politica_id` e `motor_politica_arn`, e dois alarmes usam a dimensão do motor | plano, "Contrato v1", "Estratégia de testes" e ADR-0009 | T017, T018 e T080 não sabem se esses campos são opcionais no schema ou se o root do Floci recebe valores sintéticos | resolvido (emenda 1): id e ARN do motor como entradas de composição, com valores sintéticos fixos no root do Floci; o schema segue exigindo os campos (T017, T018, T080; ADR-0009) |
| F4 | A avaliação sob demanda e a coleta de métricas antes do destroy (DM-04, DM-08) não têm executor nem role definidos: nenhuma role do plano tem permissão de Evaluations, `GetMetricData` ou leitura de `aws/spans` | plano, "Estratégia de testes" (DM) e RF-006 | T067 escreve o script, mas não a role nem o passo que o roda | resolvido (emenda 1): role de evidências e workflow manual no `aws-lab` (T067, T068) |
| F5 | O cabeçalho do plano ainda diz "rascunho; aguarda a aprovação do dono", embora esteja aprovado (D-035); depois do T000, os links `adr/...` do plano apontam para redirecionamentos | plano, cabeçalho e "Decisões técnicas" | cosmético; não bloqueia tarefa | resolvido (emenda 1): cabeçalho com o status real e nota sobre os links depois do T000 |
| F6 | A seção "Trabalho que o plano cria" não lista um workflow de CI que rode o `terraform test` da plataforma e os testes Python (TS, RG); hoje só o `infra-conta.yml` roda `terraform test`, e só para o `infra/conta` | plano, "Trabalho que o plano cria" e "Estratégia de testes" | resolvido sem mudar o plano pela T002, que só acrescenta execução; o id TH-12 é desta fase e não está na matriz do plano | resolvido pela T002, sem mudar o plano |

## Perguntas ao dono
Nenhuma aberta neste arquivo.
- A P00-P8, sobre o teto diário depois da emenda 1, foi respondida na D-038 e está no `plan.md`.
- A P00-P9, sobre o relógio das 48 h da tag de custo, foi feita na `analise.md`. Ela foi respondida pela D-039, e a resposta está registrada no `matriz.md`, seção "Decisões do dono".

## Perguntas respondidas
| id | pergunta | resposta |
|---|---|---|
| P00-P7 | A plataforma ganha página no site e post, como os projetos das disciplinas? | **Respondida, D-037 (dono, 2026-11-20):** (a) página e post próprios, na trilha Arquiteturas AWS. A recomendação era (b). Aplicada nas T089 e T090 |

## Correções da análise 1
A rodada 1 da `analise.md` (2026-11-20) foi reprovada. Esta seção tem uma linha por achado: o que mudou, a boa prática que guia a correção e o erro comum que ela evita (D-036). Os ids da prova vêm no fim, entre parênteses. O `plan.md` não mudou: o hash continua igual ao de `plano_aprovado`.

| Achado | O que mudou | Boa prática | Erro comum que ela evita |
|---|---|---|---|
| A01 · bloqueante | Nova **T048**, do `engenheiro-terraform`. O filtro fica no modelo `harness/modelos/destroy.yml`, para todo projeto: ignora só a chave KMS com `KeyState = PendingDeletion` e falha fechado se a consulta der erro. O teste TH-14 começa vermelho, com saída sintética da Tagging API, e os workflows da plataforma são regenerados. O ADR-0001 agora diz que a garantia está na T048, e não num comentário. A T084 depende da T048 | **O gate de verificação precisa conseguir passar no caminho correto.** O arquiteto escreve a verificação de sobras sabendo o que o serviço deixa para trás de propósito e prova isso com teste antes do primeiro destroy real | Deixar a exceção num comentário: o gate reprova sempre, a equipe se acostuma com o vermelho, e uma sobra real passa despercebida (1.4, 5.3) |
| A02 · importante | **Não corrigido aqui.** O RNF-002 está na `spec.md` e fica com o especificador, como o briefing manda | **Uma fonte de verdade por nível.** O nível que mudou atualiza os outros no mesmo ciclo | O revisor conferir contra a spec antiga e reprovar uma entrega certa (5.1, 4.1) |
| A03 · importante | A **T013** fixa a entrada do motor: anulável no `gateway`, com bloco `dynamic`, e obrigatória no `observabilidade` e no `contrato`. O TT-P01 (T015 e T020) reprova o root real com nulo, a partir de uma fixture vermelha. A decisão está no **ADR-0011**. A frase "obrigatórias" do plano, em "Stack da plataforma", fica para a próxima emenda | **Contrato de módulo explícito.** Para cada entrada, o arquiteto diz se é obrigatória ou opcional e quem garante o valor | Cada implementador decidir de um jeito, e o teste de composição não ver o caso que importa (2.1, 3.6) |
| A04 · importante | A **T066** lê o contrato com a credencial de quem chama e só depois assume a role de fumaça. O DM-03 tem dois casos gravados: sem assinatura, e com a role de evidências, que não tem `InvokeGateway`. A nova **T069** roda a fumaça como job manual do workflow de evidências no `aws-lab`, então o dono só dispara. A T084 usa esse job | **Não planejar trabalho sem dono, artefato e credencial.** Cada passo do ensaio tem quem execute, o que execute e a credencial com que executa | Descobrir no dia do ensaio que o passo não roda, por `AccessDenied` ou por falta de credencial local (1.4, 1.6) |
| A05 · importante | A **T017** e a **T037** fixam o conjunto completo de dimensões com a fonte. Onde a documentação não publica o conjunto, como no Policy (consulta de 2026-11-20), usam alarme por consulta do Metrics Insights, somada numa série. Não usam `SEARCH`, que o CloudWatch não aceita em alarme. Na **T084**, o novo DM-09 força o alarme de negações a `ALARM` e confere o e-mail. Decisão, custo e plano B no **ADR-0013** | **Alarme só conta se já disparou uma vez.** O arquiteto fixa as dimensões a partir da documentação, ou soma as séries, e força um disparo no ensaio | Ter alarmes "verdes" que nunca poderiam ficar vermelhos, com `notBreaching` escondendo a dimensão errada (5.2, 5.6) |
| A06 · importante | **T011:** `count = nonsensitive(length(split(...)))`, com o `nonsensitive()` só em volta da contagem, e `endpoint` sensível. **T012:** destinatários do Budgets sensíveis. O novo TT-S06 lê o plan em JSON e reprova `endpoint` ou destinatário não sensível. O ADR-0008 ganhou a prova | **Dado pessoal fora dos canais públicos, provado por teste.** Só o que não identifica ninguém, como a quantidade, sai do sensível | Cumprir "fora do repositório" e esquecer o log do CI de um repositório público (Art. VIII; 5.6) |
| A07 · importante | A **T020** e a **T037** listam as exceções ao prefixo num lugar só, com motivo e link: o grupo de log entregue do RF-006 e o parâmetro `produtos/<chave>`, que só aceita a chave igual à tag do provider. Há fixtures vermelhas para nome fora da lista e para `produtos/<outra-chave>`. A decisão está no **ADR-0012**, ligado ao ADR-0006 | **Exceção à regra fica versionada, com o porquê.** A regra continua estrita, e cada exceção tem teste | Afrouxar o teste de prefixo em silêncio e tirar o valor do isolamento por nome da D-029 (Art. VI; 1.4) |
| A08 · importante | A **T087** ganhou a regra "como se mede" para cada linha de custo: pela tag, ou pelo serviço e tipo de uso no dia e na região, como "sem tag", e sempre dentro da soma. O teste reprova linha sem forma de medição. Evaluations, `InvokeGuardrailChecks`, coleta e spans foram marcados "sem tag". O alinhamento do texto do critério 2 vai ao especificador | **A métrica de aceite precisa enxergar o que promete medir.** O arquiteto define onde cada linha de custo aparece | Aprovar o orçamento com uma leitura que deixa de fora a maior despesa: o Evaluations é 69% da estimativa (5.6) |
| A09 · importante | A **T073** versiona o `infracost-usage.yml` com as premissas do plano, e o novo TH-15 reprova quando ele falta ou não é passado ao Infracost. O comentário do PR separa linha "coberta" de "não coberta", com o valor do plano. O total comparado com o teto soma as duas | **Um gate que sempre passa não é gate.** O arquiteto alimenta a ferramenta com as premissas e declara o que ela não cobre | Ler o "verde" do Infracost, que estima zero para o que é cobrado por uso, como confirmação do teto (4.1, 1.4) |
| A10 · importante | **T041 e T043:** o `requisitos` do consumidor recusa com menos de 2 h de plataforma (1 h de margem mais 1 h útil). O modelo de apply registra o prazo antes do `terraform apply`, com `apply` em `needs: prazo`. Há casos novos no TH-01 e no TH-03, e o `checar_apply` reprova o registro depois do apply. Está no ADR-0007, na seção de correção | **Registrar a obrigação antes de criar o custo.** O prazo existe antes do primeiro recurso, e o apply sem tempo é recusado cedo | O caminho de erro, como um apply parcial, deixar infraestrutura cobrando sem prazo e sem destroy automático (5.3; Art. V) |
| A11 · importante | **D-039** aplicada (P00-P9 respondida pelo dono em 2026-11-20). A **T053** ativa a tag assim que a chave aparecer, com `Depende de` formal (T050 a T052), e não depende mais do ensaio. Ela diz que é incerto se os recursos sem custo do `infra/conta` bastam, e que o ensaio é a alternativa paga mais barata, com cerca de US$ 0,09. A **T084** e a **T086** perderam a janela de 48 h. A T050, a T072 e o aviso do apply (T043) seguem a D-039. A **T087** diz que as 48 h dela são a latência do Cost Explorer. O R2 e o "pré-requisito da demonstração" do plano ficam para a próxima emenda | **Critério de tempo mensurável, com o relógio explícito.** Cada prazo diz de qual evento conta | Cada tarefa contar as 48 h a partir de um evento diferente, ou tratar a latência do relatório como se fosse a ativação (4.1) |
| A12 · importante | A **T048** também verifica o caminho `/<chave>/` do SSM depois do destroy (TH-14), e para produtos o caminho fica vazio. O **TH-10 (T047)** inclui de forma explícita os `.tf` e `.tfvars` de `modulos/03-mcp/arquitetura/`, com fixture vermelha | **O teste cobre o texto inteiro do critério.** O arquiteto prova cada parte da frase do critério de sucesso | Provar metade do critério, só a tag ou só o código, e marcá-lo como cumprido (4.1) |
| A13 · menor | Status corrigidos no cabeçalho deste arquivo, na seção de furos, no cabeçalho do `matriz.md` e nos 10 ADRs, que estavam "proposto": agora dizem aprovado (D-035) e emenda 1 aprovada (D-038). O ADR-0004 perdeu a linha de US$ 0,025 da fumaça | **O estado do documento é igual ao do registro.** O status de cada artefato diz o que o `estado.json` e a memória dizem | O leitor tomar a versão errada como a vigente (5.1) |
| A14 · menor | A **T003** aceita só o root. O módulo `registro-produto` entra no teste na **T030**, que passa a depender da T003, e a T032 confirma | **O aceite cabe no que já existe.** Cada tarefa prova só o que ela e as anteriores criaram | A tarefa ficar meio verde e ser marcada `[x]` assim mesmo (1.6) |
| A15 · menor | O `Depende de` da **T080** lista todas as tarefas de agente das Fases 2, 3, 4 e 6, incluindo a T048 e a T069, e o código da Fase 5 (T050 a T052). A T053, do dono, sai do caminho da integração | **A dependência declarada é a que a ferramenta lê.** A lista é explícita, sem "fases concluídas" no texto | O `estado.py` sugerir a próxima tarefa fora de ordem, ou a integração esperar uma tarefa do dono que não a afeta (1.6) |
| A16 · menor | **Corrigido de outra forma.** A T041 a T044 e a nova T048 ficam com o `engenheiro-terraform`, que o `harness/especialistas.json` define com os workflows de apply e destroy, a skill `ciclo-demonstracao` e o nível máximo. O `operador-harness` é de nível rápido, só para trabalho mecânico sem decisão, e fica com a T040, a T046 e a T047, que têm regra fechada. As cinco tarefas seguem as regras da `evolucao-do-harness`. A skill que falta ao especialista está registrada como recomendação no relatório | **Cada agente com as ferramentas e skills da sua função.** O arquiteto entrega a tarefa ao especialista com o papel e o nível certos e corrige a configuração do especialista, em vez de trocar de dono | Dar lógica de prazo e destroy a um agente mecânico de nível rápido, cujo papel manda devolver como bloqueio o que exige decisão (2.3) |
| A17 · menor | A **T012**, a **T072** e a **T084** dizem que o Budgets diário só enxerga custo depois da ativação da tag. Num ensaio antes dela, só o Budgets mensal protege, além do prazo de 24 h | **Saber quando cada camada de proteção está ligada.** O roteiro diz qual alarme vale em cada momento | Contar com um alarme de custo que ainda não enxerga nada (5.2) |
