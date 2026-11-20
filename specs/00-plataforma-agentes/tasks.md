# Tarefas: Plataforma de agentes compartilhada na AWS

- **Projeto:** `00-plataforma-agentes` · **Plano:** `plan.md`, aprovado pelo dono em 2026-11-19 (D-035, hash registrado em `harness/estado.json`, campo `plano_aprovado`); a emenda 1 (2026-11-20) mudou o plano, e a **nova aprovação está pendente** com o dono
- **Data:** 2026-11-20 · **Autor:** arquiteto-aws (Claude Opus 5.5) · **Matriz requisito → tarefa → teste:** `matriz.md`
- **Decisões aplicadas:** D-006, D-013, D-021, D-022, D-024, D-028, D-029, D-031, D-032, D-033, D-034, D-035, D-036 e D-037

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
  - **Teste vermelho:** um teste em `harness/test_harness.py` afirma que `plataforma/agentes/adr/0001-*.md` a `0010-*.md` existem e que todo link `adr/...` do `spec.md` e do `plan.md` resolve para um arquivo.
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
  - **Aceite:** as seis fixtures reprovam com mensagem que cita o recurso; o root e o módulo `registro-produto` passam; o teste roda no workflow de CI do projeto (T002), sem credencial da AWS.
  - **Depende de:** T001, T002.
## Fase 2 · Núcleo: stack da plataforma
- [ ] T010 [P] [engenheiro-terraform] Módulo `nucleo`: chave KMS do cliente · Art. IV, RNF-001 · TT-S02 (chave)
  - **Teste vermelho:** `modules/nucleo/tests/kms.tftest.hcl` afirma rotação ligada, `deletion_window_in_days = 7`, alias `alias/00-plataforma-agentes-chave` e a política da chave do ADR-0001 (logs com `kms:EncryptionContext:aws:logs:arn` no prefixo dos grupos da plataforma; `cloudwatch` e `sns` com `aws:SourceAccount` e `aws:SourceArn`; `bedrock-agentcore` com `aws:SourceAccount`).
  - **Arquivos:** `plataforma/agentes/infra/terraform/modules/nucleo/{main.tf,variables.tf,outputs.tf}`, `modules/nucleo/tests/kms.tftest.hcl`.
  - **Aceite:** testes verdes; o T003 continua verde; ADR-0001 cumprido item a item.
  - **Depende de:** T001.
- [ ] T011 [engenheiro-terraform] Módulo `nucleo`: tópico SNS dos alarmes e assinaturas · Art. IV, RNF-001, RNF-003 · TT-S02 (SNS), TT-S04
  - **Teste vermelho:** `modules/nucleo/tests/sns.tftest.hcl` afirma o tópico `00-plataforma-agentes-alarmes` com `kms_master_key_id` da chave do T010, política que nega `aws:SecureTransport = false` e só aceita `sns:Publish` do `cloudwatch.amazonaws.com` da conta, e uma assinatura `email` por endereço de `data "aws_ssm_parameter"` `/00-conta/alertas/emails` (mock com dois endereços sintéticos).
  - **Arquivos:** `modules/nucleo/sns.tf`, `modules/nucleo/tests/sns.tftest.hcl`.
  - **Aceite:** ADR-0008 cumprido; nenhuma variável nova de e-mail (D-034).
  - **Depende de:** T010.
- [ ] T012 [P] [engenheiro-terraform] Módulo `nucleo`: AWS Budgets diário com o teto · Art. V, RNF-002 · TT-K01, TH-06
  - **Teste vermelho:** `modules/nucleo/tests/budgets.tftest.hcl` afirma `time_unit = "DAILY"`, `limit_amount == var.teto_diario_usd` e filtro `user:project$00-plataforma-agentes`; TH-06 em `harness/test_harness.py` lê o padrão de `teto_diario_usd` em `variables.tf` do root e compara com `teto_diario_usd` do `harness/estado.json` (1,2).
  - **Arquivos:** `modules/nucleo/budgets.tf`, `modules/nucleo/tests/budgets.tftest.hcl`, `variables.tf` do root, `harness/test_harness.py`.
  - **Aceite:** alertas do orçamento para os mesmos e-mails do parâmetro `/00-conta/alertas/emails`; mudar o teto num lugar só reprova o TH-06.
  - **Depende de:** T001.
- [ ] T013 [engenheiro-terraform] Módulo `gateway`: gateway MCP com IAM na entrada · RF-001, RF-003, Art. IV · TT-G01, TT-G02, TT-S02 (gateway)
  - **Teste vermelho:** `modules/gateway/tests/gateway.tftest.hcl` com `expect_failures` para `authorizer_type = "NONE"` e `"AUTHENTICATE_ONLY"`; asserts de exatamente um `aws_bedrockagentcore_gateway`, `protocol_type = "MCP"`, `kms_key_arn` da chave da plataforma, `supported_versions` padrão `["2025-11-25", "2026-07-28"]` (ADR-0010), sem `search_type = "SEMANTIC"` e sem `exception_level = "DEBUG"`.
  - **Arquivos:** `plataforma/agentes/infra/terraform/modules/gateway/{main.tf,variables.tf,outputs.tf}`, `modules/gateway/tests/gateway.tftest.hcl`.
  - **Aceite:** o ARN do motor de política entra como variável de composição (ADR-0009); a role de execução do gateway não tem permissão de invocar alvos e tem `bedrock:InvokeGuardrailChecks` no recurso mais estreito que a documentação aceitar (R4; se exigir `*`, condição `aws:SourceAccount`, exceção do checkov e ADR).
  - **Depende de:** T010.
- [ ] T014 [P] [engenheiro-terraform] Role de fumaça · RF-002, RNF-001, RNF-002 · TT-R09
  - **Teste vermelho:** `modules/gateway/tests/fumaca.tftest.hcl` afirma a role `00-plataforma-agentes-fumaca`, confiada só pela role de deploy (variável), com uma única declaração `bedrock-agentcore:InvokeGateway` no ARN do gateway.
  - **Arquivos:** `modules/gateway/fumaca.tf`, `modules/gateway/tests/fumaca.tftest.hcl`.
  - **Aceite:** nenhum `permit` no Cedar cita esta role (conferido de novo no T036). A role não tem `bedrock:ApplyGuardrail`, e o TT-R09 falha se ela ganhar uma segunda declaração (emenda 1, F1).
  - **Depende de:** T013.
- [ ] T015 [engenheiro-terraform] Módulo `politica`: motor em `ENFORCE` · RF-002, Art. IV · TT-P01, TT-P02, TT-S02 (motor)
  - **Teste vermelho:** `modules/politica/tests/politica.tftest.hcl` com `expect_failures` para `modo_politica = "LOG_ONLY"` sem `calibracao = true`; asserts do nome `p00_plataforma_agentes` (regex `^[A-Za-z][A-Za-z0-9_]*$`) e de `encryption_key_arn` da chave da plataforma; `tests/composicao.tftest.hcl` no root afirma `policy_engine_configuration` presente no gateway, com `mode = "ENFORCE"` por padrão.
  - **Arquivos:** `plataforma/agentes/infra/terraform/modules/politica/`, `tests/composicao.tftest.hcl` do root.
  - **Aceite:** ADR-0005 cumprido; o modo nunca é input de workflow.
  - **Depende de:** T013.
- [ ] T016 [P] [engenheiro-terraform] Módulo `observabilidade`: entrega de logs e traces · RF-006, Art. VI · TT-O01, TT-O02
  - **Teste vermelho:** `modules/observabilidade/tests/entrega.tftest.hcl` afirma `aws_cloudwatch_log_delivery_source` dos `APPLICATION_LOGS` do gateway, destino no grupo `/aws/vendedlogs/bedrock-agentcore/gateway/APPLICATION_LOGS/{gateway_id}` com retenção de 7 dias e `kms_key_id` da chave, e a entrega de traces para o X-Ray.
  - **Arquivos:** `plataforma/agentes/infra/terraform/modules/observabilidade/{entrega.tf,variables.tf,outputs.tf}`, `modules/observabilidade/tests/entrega.tftest.hcl`.
  - **Aceite:** todos os recursos entram no destroy; o grupo `aws/spans` não é criado aqui (é da conta, `infra/conta`).
  - **Depende de:** T010, T013.
- [ ] T017 [engenheiro-terraform] Módulo `observabilidade`: cinco alarmes da plataforma · RNF-003, Art. VI · TT-O03
  - **Teste vermelho:** `modules/observabilidade/tests/alarmes.tftest.hcl` afirma os cinco alarmes do RNF-003 (`SystemErrors` ≥ 1, `Throttles` ≥ 1 e `UserErrors` ≥ 3 do gateway; `SystemErrors` do motor ≥ 1; `DenyDecisions` ≥ 5 com a dimensão `Mode = ENFORCE`), todos com `period = 300`, `evaluation_periods = 1`, `statistic = "Sum"`, `treat_missing_data = "notBreaching"` e ação no tópico do T011.
  - **Arquivos:** `modules/observabilidade/alarmes.tf`, `modules/observabilidade/tests/alarmes.tftest.hcl`.
  - **Aceite:** nomes com o prefixo `00-plataforma-agentes-`; o alarme de negações não dispara num apply de calibração (ADR-0005). O id do motor é entrada de composição obrigatória do módulo: no root real vem do módulo `politica`, e no root do Floci, de um valor sintético fixo (emenda 1, F3; ADR-0009).
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
  - **Teste vermelho:** `tests/prefixo.tftest.hcl` afirma que todo nome começa por `00-plataforma-agentes` ou, onde a API exige letra inicial, por `p00_` (exceções do ADR-0006); o `tags.tftest.hcl` do T001 passa a iterar sobre todos os recursos tagueáveis do root.
  - **Arquivos:** `plataforma/agentes/infra/terraform/main.tf`, `outputs.tf`, `terraform.tfvars.example`, `tests/prefixo.tftest.hcl`.
  - **Aceite:** `terraform test` do root e dos módulos, `fmt`, `validate`, `tflint` e `checkov` limpos; os testes do T003 verdes sobre o root completo; o `composicao.tftest.hcl` (TT-P01) também afirma que o id e o ARN do motor no `contrato` e no `observabilidade` vêm do módulo `politica` (emenda 1, F3).
  - **Depende de:** T010 a T019.

## Fase 3 · Núcleo: módulo `registro-produto` (no state do produto)
- [ ] T030 [engenheiro-terraform] Interface do catálogo e validações de identidade · RF-001, RF-007 · TT-R01, TT-R02, TT-R03
  - **Teste vermelho:** `modules/registro-produto/tests/catalogo.tftest.hcl` com dois produtos sintéticos (`91-produto-a`, `92-produto-b`, só nos testes) e `expect_failures` para: chave diferente da tag `project` de `data.aws_default_tags`; alvo sem o prefixo da chave; tool sem classe; alvo sem schema estático.
  - **Arquivos:** `plataforma/agentes/infra/terraform/modules/registro-produto/{variables.tf,validacoes.tf,contrato.tf}`, `modules/registro-produto/tests/catalogo.tftest.hcl`.
  - **Aceite:** o módulo lê o `comum` por `data "aws_ssm_parameter"` (mock) e não recebe nenhum ARN da plataforma por variável (critério de sucesso 1); classes aceitas: `dado_privado`, `conteudo_nao_confiavel`, `canal_saida`, `sensivel`.
  - **Depende de:** T018.
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
  - **Teste vermelho:** `modules/registro-produto/tests/operacao.tftest.hcl` afirma o alarme `AWS/Bedrock/Guardrails` `InvocationsIntervened` ≥ 5, com as dimensões `GuardrailArn` e `GuardrailVersion`, os parâmetros do RNF-003 e ação em `topico_alarmes_arn` do contrato; e o parâmetro `/00-plataforma-agentes/contrato/v1/produtos/<chave>` `String`, `Standard`, até 4 KB, válido no `v1.schema.json`.
  - **Arquivos:** `modules/registro-produto/{alarme.tf,contrato.tf}`, `modules/registro-produto/tests/operacao.tftest.hcl`, `plataforma/agentes/tests/contrato/test_contrato.py`.
  - **Aceite:** campos `versao_contrato`, `perfil_inferencia_arn`, `guardrail_id`, `guardrail_versao`, `alvos` e `roles`.
  - **Depende de:** T033, T034, T036.
- [ ] T038 [engenheiro-terraform] Variável de separação da parte não emulada · ADR-0009, RNF-007
  - **Teste vermelho:** `modules/registro-produto/tests/separacao.tftest.hcl` afirma que, com o valor padrão, o plan tem guardrail, perfil e políticas Cedar, e que só o valor explícito do root de integração os retira.
  - **Arquivos:** `modules/registro-produto/variables.tf`, `modules/registro-produto/tests/separacao.tftest.hcl`.
  - **Aceite:** nenhum produto real consegue omitir guardrail, perfil ou política sem mudar a variável no próprio Terraform, revisado no PR.
  - **Depende de:** T037.

## Fase 4 · Harness: dependência, prazo, ordem de destroy e gates
- [ ] T040 [operador-harness] Campo `consome` no `estado.json` · RF-008, ADR-0007 · TH-01 (pré-requisito)
  - **Teste vermelho:** testes em `harness/test_harness.py`: `estado.py validar` reprova `consome` que cita chave inexistente, o próprio projeto ou projeto que não é do tipo `plataforma`.
  - **Arquivos:** `harness/estado.py`, `harness/estado.json` (`"consome": ["00-plataforma-agentes"]` no `03-mcp-regras-cdb`, D-034), `harness/test_harness.py`.
  - **Aceite:** `validar` ok; 64 testes atuais e os novos verdes.
- [ ] T041 [engenheiro-terraform] `infra.py registrar` e `estender` com o limite do consumidor · RF-008, ADR-0007 · TH-01
  - **Teste vermelho:** `TestPrazoDaInfra` ganha casos: registrar consumidor sem a plataforma no ar falha; o prazo do consumidor fica limitado a `expira_em(plataforma) − 1 h`; `estender` do consumidor tem o mesmo limite; a plataforma continua limitada a 24 h desde o próprio apply (D-024).
  - **Arquivos:** `harness/infra.py`, `harness/test_harness.py`.
  - **Aceite:** mensagens de erro dizem o limite e o motivo (o que falhou e se é retentável, 5.3).
  - **Depende de:** T040.
- [ ] T042 [engenheiro-terraform] `vencidos` com espera da plataforma e destroy dos consumidores primeiro · RF-008, ADR-0007 · TH-02
  - **Teste vermelho:** casos em `TestPrazoDaInfra`: plataforma vencida com consumidor registrado vai para `aguardando`; quando a plataforma vence, todo consumidor registrado vai para `destruir`, mesmo antes do próprio prazo; o redisparo de 3 horas continua valendo.
  - **Arquivos:** `harness/infra.py`, `harness/test_harness.py`; `.github/workflows/expirar-infra.yml` só se o tratamento de `aguardando` precisar de passo novo.
  - **Aceite:** o agendador nunca dispara o destroy da plataforma com consumidor registrado.
  - **Depende de:** T041.
- [ ] T043 [engenheiro-terraform] Comandos `dependentes` e `requisitos` nos modelos de apply e destroy · RF-008, ADR-0007 · TH-03
  - **Teste vermelho:** testes do `infra.py`: `dependentes 00-plataforma-agentes` sai com código 1 e lista o consumidor no ar, e sai com 0 para um produto; `requisitos 03-mcp-regras-cdb` sai com 1 sem a plataforma no ar. `estado.checar_destroy` e `estado.checar_apply` reprovam workflow sem o passo.
  - **Arquivos:** `harness/infra.py`, `harness/estado.py`, `harness/modelos/apply.yml` (passo `requisitos` antes do apply), `harness/modelos/destroy.yml` (passo `dependentes` antes do `terraform destroy`), `.github/workflows/00-plataforma-agentes-{apply,destroy}.yml` regenerados do modelo, `harness/test_harness.py`.
  - **Aceite:** `test_workflows_da_plataforma_iguais_ao_modelo` verde; o mesmo modelo serve plataforma e produtos; actions continuam fixadas por SHA.
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

## Fase 5 · Configuração da conta (`infra/conta`, D-034)
- [ ] T050 [engenheiro-terraform] Tag `project` como tag de alocação de custo · RF-005, D-034 · TT em `infra/conta/tests/`
  - **Teste vermelho:** `infra/conta/tests/conta.tftest.hcl` afirma `aws_ce_cost_allocation_tag` com `tag_key = "project"` e `status = "Active"`.
  - **Arquivos:** `infra/conta/main.tf`, `infra/conta/tests/conta.tftest.hcl`.
  - **Aceite:** o `orcamento.tftest.hcl` atual segue verde; README do `infra/conta` diz que a chave só aparece depois de um recurso cobrado com a tag (até 24 h) e ativa em até mais 24 h (R2).
- [ ] T051 [P] [engenheiro-terraform] Transaction Search do CloudWatch · RF-006, D-034 · TT em `infra/conta/tests/`
  - **Teste vermelho:** asserts do destino de segmentos do X-Ray no CloudWatch Logs e da política de recurso do Logs que o permite, com condição de conta.
  - **Arquivos:** `infra/conta/main.tf`, `infra/conta/tests/conta.tftest.hcl`.
  - **Aceite:** sem custo fixo; o passo "Pré-requisitos da conta" do apply passa a achar o Transaction Search ligado.
- [ ] T052 [P] [engenheiro-terraform] Parâmetro `/00-conta/alertas/emails` · RNF-003, ADR-0008, D-034 · TT em `infra/conta/tests/`
  - **Teste vermelho:** assert de `aws_ssm_parameter` `String`, `Standard`, valor `join(",", var.emails_alerta)` e tags do `infra/conta`.
  - **Arquivos:** `infra/conta/main.tf`, `infra/conta/outputs.tf`, `infra/conta/tests/conta.tftest.hcl`.
  - **Aceite:** nenhuma variável nova; os valores de e-mail continuam só no `tfvars` do dono, fora do repositório.
- [ ] T053 [DONO] Aplicar o `infra/conta` · D-034
  - Depois do ensaio (T084), para a chave `project` já existir. Se a ativação falhar porque a chave ainda não apareceu, aplicar de novo no dia seguinte (R2).
  - **Aceite:** tag `project` ativa pelo menos 48 h antes da demonstração; Transaction Search ligado; parâmetro de e-mails criado.

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
  - **Teste vermelho:** `plataforma/agentes/tests/test_fumaca.py` com respostas gravadas: com a role de fumaça, `tools/list` vem vazio e um `tools/call` é negado; o script não importa nem chama `Converse`.
  - **Arquivos:** `plataforma/agentes/scripts/fumaca.py`, `plataforma/agentes/tests/test_fumaca.py`.
  - **Aceite:** o script lê o contrato do SSM; a saída traz o resultado e o horário para conferir `DenyDecisions` ≥ 1. O script não chama `ApplyGuardrail` (o teste também reprova essa chamada); a chamada direta ao guardrail sem o Claude é o DM-05, feito pelo agente do produto (emenda 1, F1).
  - **Depende de:** T063.
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

## Fase 7 · Operação, custo e revisão
- [x] T070 [engenheiro-terraform] Workflows de apply e destroy da plataforma (existem e estão testados) · RF-008, Art. V · TH existente
  - `.github/workflows/00-plataforma-agentes-apply.yml` (input `prazo_horas`, ambiente `aws-lab`, `infra.py registrar`, conferência da tag de custo e do Transaction Search da D-034) e `00-plataforma-agentes-destroy.yml` (`confirm_stack`, ambiente `aws-lab-destroy`, OIDC, verificação de sobras pela tag, `infra.py remover`). Provados por `TestWorkflowsDeImplantacao`, `TestVersoesDasActions`, `TestPreRequisitosDaConta` e `estado.py validar`. T043 e T044 os regeneram.
- [x] T071 [operador-harness] Gate SDD e caminho padrão (existem e estão testados) · Art. I, H1 · TH existente
  - `gate_sdd.py`, `pre-commit` e `estado.py checar-arquivos` bloqueiam `plataforma/agentes/` antes de implementar (`TestGateSddPorArquivo`); o projeto nasceu por `novo_projeto.py` (`TestCaminhoPadrao`).
- [ ] T072 [engenheiro-terraform] README com até 5 passos e o teto · Art. V, Art. VI, RNF-003 · TH-09
  - **Teste vermelho:** teste do harness reprova `plataforma/agentes/README.md` com mais de 5 passos numerados ou sem o teto `US$ 1,20`.
  - **Arquivos:** `plataforma/agentes/README.md`, `harness/test_harness.py`.
  - **Aceite:** pré-requisitos (conta com OIDC, `infra/conta` aplicado e tag ativa 48 h antes), ordem do dia (plataforma, produto, roteiro, evidências, destroy do produto, destroy da plataforma) e como o produto consome o contrato.
  - **Depende de:** T020, T038, T043.
- [ ] T073 [finops-demonstracao] Custo do PR contra o teto e custo fixo ocioso · Art. V, RNF-002 · ES (Infracost), TT-K02
  - **Teste vermelho:** o `gate_custo.py` roda sobre a saída do Infracost do branch; uma fixture com recurso de custo fixo (por exemplo, endpoint de interface) precisa reprovar.
  - **Arquivos:** nenhum de código; comentário de revisão no PR com o custo de 24 h por diretório e a comparação com a tabela "Custo do lab" do plano.
  - **Aceite:** custo de 24 h do root ≤ US$ 1,20; nenhum recurso fora do destroy; diferenças contra a estimativa do plano explicadas. A linha de `ApplyGuardrail` da fumaça é US$ 0 na plataforma, e a reserva da coleta de evidências (US$ 0,010) é conferida pelo Infracost (emenda 1, F1 e F4).
  - **Depende de:** T020.
- [ ] T074 [engenheiro-seguranca] Modelo de ameaças contra os testes e esteira limpa · Art. IV, RNF-001 · ES
  - **Teste vermelho:** para cada linha do STRIDE do plano, o teste citado precisa existir e estar verde; uma linha sem teste reprova a revisão.
  - **Arquivos:** comentário de revisão no PR; exceções só com justificativa versionada (`.checkov.yaml`, `.trivyignore`, `.semgrepignore`) e ADR em `plataforma/agentes/adr/`.
  - **Aceite:** gitleaks, Semgrep, CodeQL, zizmor, Trivy, checkov e tflint sem achado alto ou crítico; R4 resolvido com o recurso mais estreito ou exceção com ADR.
  - **Depende de:** T020, T038, T045, T067, T068.

## Fase 8 · Verificação
- [ ] T080 [testador-integracao] Integração no Floci e relatório · RF-001, RF-007, RNF-003, RNF-007, Art. III, Art. V · FL-01, FL-02, FL-03, FL-04
  - **Teste vermelho:** asserts escritos antes do apply: FL-01 cinco alarmes com os parâmetros do RNF-003; FL-02 alvo do produto sintético registrado no gateway; FL-03 produto sintético monta a chamada só pelo SSM do Floci; FL-04 nenhum recurso com `project=00-plataforma-agentes` e nada sob `/00-plataforma-agentes/` depois do destroy.
  - **Arquivos:** `plataforma/agentes/tests/floci/` (root que compõe `nucleo`, `gateway`, `observabilidade`, `contrato` e o produto sintético com a variável do T038), job do Floci como container de serviço no `00-plataforma-agentes-ci.yml` (disparo manual), relatório em `testing/reports/` e `testing/reports/latest.html`.
  - **Aceite:** só com as Fases 2 a 6 concluídas; imagem `${FLOCI_IMAGE:-floci/floci:latest}` (D-013); o relatório separa falha real de lacuna, cada lacuna com o link de evidência do ADR-0009; nenhum código correto alterado para agradar o emulador. O root do Floci passa id e ARN sintéticos fixos do motor ao `observabilidade` e ao `contrato`, e o relatório os marca como sintéticos com o link do ADR-0009 (emenda 1, F3).
  - **Depende de:** T020, T038, T047, T067.
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
- [ ] T084 [DONO] Ensaio da plataforma pelo menos 48 h antes da demonstração · RF-002, RF-003, RF-008, R2, R8 · DM-01 (fumaça), DM-03
  - Disparar o apply da plataforma; rodar `scripts/fumaca.py` (T066) com a role de fumaça e uma chamada com role sem `InvokeGateway` (DM-03); conferir o destroy automático. O ensaio é só da plataforma, sem produto sintético na AWS real (emenda 1, F2; cerca de US$ 0,09 no dia). Opcional, decidido pelo dono no dia: aplicar também a D03, se ela já estiver em `verificar`, para antecipar o R8; o custo vai no teto da D03.
  - **Depende de:** T080, T081, T082, T083.
- [ ] T085 [DONO] Caso de uso da Anthropic no Bedrock, só se o modelo da D03 for anterior ao Claude Opus 4.7 · D-034
  - Envio à mão no console; a orquestração só lembra no board.
  - **Aceite:** o modelo da D03 responde no console do Bedrock antes da demonstração, ou o plano da D03 registra que o modelo não exige o envio.
- [ ] T086 [DONO] Demonstração com a D03 · RF-002, RF-004, RF-006, RF-008, RF-010, Art. V · DM-01 a DM-06, DM-08
  - Ordem: apply da plataforma, apply da D03 (registra alvos e políticas pelo módulo), roteiro de quatro passos, DM-05 (injeção indireta sintética), workflow de evidências (`scripts/evidencias.py`, T068) antes de qualquer destroy, destroy da D03, destroy da plataforma, verificação de sobras (DM-06).
  - **Depende de:** T053 (tag ativa há 48 h), T068 (workflow de evidências), T084, T085 se aplicável, e a D03 em `verificar` (hoje em `especificar`).
- [ ] T087 [finops-demonstracao] Custo real do dia contra o teto · RF-005, critério de sucesso 2 · DM-07
  - **Teste vermelho:** a comparação reprova se o custo real da plataforma passa de US$ 1,20, se o da D03 passa do teto dela ou se um item cobrado não tem linha correspondente na tabela "Custo do lab" do plano.
  - **Arquivos:** comentário no PR de verificação; nenhum número estimado no lugar de medido (marcar `nao-medido` quando faltar).
  - **Aceite:** o dono lê o Cost Explorer agrupado por `project` pelo menos 48 h depois da demonstração e entrega os números (o especialista não chama a AWS); cada diferença contra o plano tem explicação.
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
F1 a F5 foram resolvidos pela emenda 1 do plano (2026-11-20, seção "Emenda 1" do `plan.md`), autorizada pelo dono, com nova aprovação pendente. O F6 já estava resolvido pela T002, sem mudar o plano.

| id | Furo | Onde | Efeito | Situação |
|---|---|---|---|---|
| F1 | O teste de fumaça da plataforma chama `ApplyGuardrail` (RNF-002 da spec; linha de US$ 0,025 no custo do lab), mas o stack da plataforma não tem guardrail (todo guardrail nasce no módulo, no state do produto) e a role de fumaça só tem `InvokeGateway` | plano, "Role de fumaça" e "Custo do lab" | T014, T066 e T073 não sabem contra qual guardrail testar nem se a linha de custo é da plataforma | resolvido (emenda 1): a fumaça ficou só com o gateway; o guardrail direto é o DM-05, no produto; a linha de custo saiu da plataforma (T014, T066, T073) |
| F2 | O ensaio de 48 h antes (R2, R8) prevê "um produto sintético" na AWS real, mas o plano só define o produto sintético do Floci: não há root, chave em `estado.json`, workflow nem custo para ele | plano, R2 e R8 | T084 cobre só a plataforma e a fumaça; a falha assíncrona `CREATE_FAILED` das políticas (R8) só aparece na demonstração com a D03 | resolvido (emenda 1): o ensaio é só da plataforma; o R8 é provado no primeiro apply da D03 (T084) |
| F3 | O root de integração compõe sem o motor de política (ADR-0009), mas o contrato `comum` publica `motor_politica_id` e `motor_politica_arn`, e dois alarmes usam a dimensão do motor | plano, "Contrato v1", "Estratégia de testes" e ADR-0009 | T017, T018 e T080 não sabem se esses campos são opcionais no schema ou se o root do Floci recebe valores sintéticos | resolvido (emenda 1): id e ARN do motor como entradas de composição, com valores sintéticos fixos no root do Floci; o schema segue exigindo os campos (T017, T018, T080; ADR-0009) |
| F4 | A avaliação sob demanda e a coleta de métricas antes do destroy (DM-04, DM-08) não têm executor nem role definidos: nenhuma role do plano tem permissão de Evaluations, `GetMetricData` ou leitura de `aws/spans` | plano, "Estratégia de testes" (DM) e RF-006 | T067 escreve o script, mas não a role nem o passo que o roda | resolvido (emenda 1): role de evidências e workflow manual no `aws-lab` (T067, T068) |
| F5 | O cabeçalho do plano ainda diz "rascunho; aguarda a aprovação do dono", embora esteja aprovado (D-035); depois do T000, os links `adr/...` do plano apontam para redirecionamentos | plano, cabeçalho e "Decisões técnicas" | cosmético; não bloqueia tarefa | resolvido (emenda 1): cabeçalho com o status real e nota sobre os links depois do T000 |
| F6 | A seção "Trabalho que o plano cria" não lista um workflow de CI que rode o `terraform test` da plataforma e os testes Python (TS, RG); hoje só o `infra-conta.yml` roda `terraform test`, e só para o `infra/conta` | plano, "Trabalho que o plano cria" e "Estratégia de testes" | resolvido sem mudar o plano pela T002, que só acrescenta execução; o id TH-12 é desta fase e não está na matriz do plano | resolvido pela T002, sem mudar o plano |

## Perguntas ao dono
Nenhuma aberta neste arquivo. A P00-P8 (teto diário depois da emenda 1) está no `plan.md`, seção "Perguntas ao dono".

## Perguntas respondidas
| id | pergunta | resposta |
|---|---|---|
| P00-P7 | A plataforma ganha página no site e post, como os projetos das disciplinas? | **Respondida, D-037 (dono, 2026-11-20):** (a) página e post próprios, na trilha Arquiteturas AWS. A recomendação era (b). Aplicada nas T089 e T090 |
