# Tarefas: Assistente de agendamento completo

Uma tarefa por sessão de trabalho. Cada tarefa começa por um teste que falha.
- `[P]` marca tarefas que podem rodar em paralelo.
- `[x]` só depois do teste verde e do commit.
- Cada tarefa cita os requisitos que cobre (RF e RNF) e o achado de origem.

## Escopo desta versão
- **Data:** 2026-11-24 · **Autor:** arquiteto-aws (Claude Opus 5.5) · **Plano aprovado:** 2026-11-22 (D-033, delegação dentro do plano aprovado).
- Esta versão cobre **só** a correção dos dois achados do revisor de segurança que estão no `main` desde o PR 43 (assistente de agendamento):
  - **A1 · Escalada de privilégio na role de deploy** (`infra/bootstrap/github_oidc.tf`, `aws_iam_role_policy.deploy_iam`, statement `ManageProjectRolesAndPolicies`). Com `iam:*Role*`, `iam:*Policy*` e `iam:PassRole` sobre `role/<projeto>-*`, e com as roles `agenda-gha-plan` e `agenda-gha-deploy` dentro desse prefixo, a role de deploy consegue anexar `AdministratorAccess` em si mesma.
  - **A2 · Caracteres bidirecionais e invisíveis literais** em `src/lib/defesa/normalizacao.ts`, linhas 5 e 6 (risco de *Trojan Source*: o revisor humano não vê o que a regex contém).
- A decomposição completa do plano aprovado (divergências DV-01 a DV-12, ADRs 0002 a 0007) **ainda não foi feita** e fica para a próxima rodada de `sdd-tarefas`. Por isso a `matriz.md` do projeto não existe ainda e a fase **não avança para `analisar`** com este arquivo; a cobertura desta entrega está na tabela do fim.
- Sem recurso novo na AWS e sem apply: custo zero. Nada aqui muda escopo, cloud ou orçamento do plano aprovado.
- Caminhos relativos a `modulos/02-apis-ia-generativa/arquitetura/`. Terraform local: `C:\Users\mrj84\AppData\Local\Programs\HashiCorp\terraform\1.17.2\terraform.exe` (o shim do chocolatey está quebrado).
- Branch: `modulo/02-apis-ia-generativa/assistente-agendamento-seguranca`, criado a partir do `main` (o branch original já foi mergeado, D-032).

### Relação com o plano aprovado
O ADR-0007 (custo, borda e conformidade da conta) já tira o `infra/bootstrap` do caminho de apply, e o deploy real passa a usar a role da conta quando a P00-P2 (conta com OIDC, decisão do dono) for resolvida. O bootstrap continua no `main` como referência e pode ser aplicado por quem seguir o código; por isso o endurecimento abaixo é defesa em profundidade até a remoção, e não muda o plano.

## Fase 1 · Regras como testes
- [ ] **T201 · Teste da role de deploy sem autoescalada** · A1 · RNF-001 (Art. IV), RNF-004
  - **Arquivo:** `infra/bootstrap/tests/oidc_deploy.tftest.hcl` (a pasta `tests/` ainda não existe).
  - **Montagem:** `mock_provider "aws" {}`; `override_data` em `data.aws_caller_identity.current` com `account_id = "123456789012"`; variáveis sintéticas `project_name = "agenda"` e `github_repository = "exemplo/repositorio"`; `command = apply` (no plan, os ARNs computados ficam desconhecidos). Para comparar ARNs das roles, use `aws_iam_role.deploy[0].arn` e `aws_iam_role.plan[0].arn` na asserção, ou `override_resource` com ARN fixo; nunca um ARN literal que dependa do valor aleatório do mock.
  - **Asserções** sobre `jsondecode(aws_iam_role_policy.deploy_iam[0].policy).Statement`:
    1. nenhum statement `Allow` tem ação `iam:` com `*`, exceto as ações de leitura `iam:Get*` e `iam:List*` do statement `ReadIam` (leitura não escala privilégio; ver risco residual R3);
    2. existe um statement `Deny` com `Action = "iam:*"` cujo `Resource` contém o ARN da role de deploy, o da role de plan e o da boundary reservada `arn:aws:iam::123456789012:policy/agenda-boundary`;
    3. `iam:PassRole` aparece só num statement próprio, com `Condition.StringEquals["iam:PassedToService"]` igual ao conjunto exato `lambda.amazonaws.com`, `states.amazonaws.com` e `apigateway.amazonaws.com`;
    4. nenhum `Allow` contém `iam:AttachRolePolicy`, `iam:DetachRolePolicy`, `iam:CreatePolicy`, `iam:CreatePolicyVersion`, `iam:SetDefaultPolicyVersion` nem recurso `policy/agenda-*` (o stack só cria `aws_iam_role` e `aws_iam_role_policy` inline: 3 de cada, inventário de 2026-11-24);
    5. regressão: com `github_repository = null`, nenhuma role, política nem provedor OIDC é criado (`count = 0`); a role de plan continua só com `ReadOnlyAccess` e `tfstate-read-and-lock`.
  - **Vermelho esperado:** as asserções 1 a 4 falham contra o `main` atual; a 5 passa.
  - **Aceite:** `terraform -chdir=infra/bootstrap init -backend=false` e `terraform -chdir=infra/bootstrap test` executam o arquivo e falham só nas asserções 1 a 4. Commit `test(02-assistente-agendamento): T201 ...` com o teste vermelho.

- [ ] **T202 [P] · Teste de fonte sem caracteres bidi ou invisíveis literais** · A2 · RF-021, RNF-001
  - **Arquivo:** `src/tests/unit/fonte-sem-bidi.test.ts` (vitest).
  - **Regra:** varre todo `src/lib/**/*.ts` e reprova qualquer ponto de código em U+00AD, U+200B a U+200F, U+202A a U+202E, U+2060 a U+2064, U+2066 a U+2069 e U+FEFF. A mensagem lista `arquivo:linha:U+XXXX`. O próprio teste escreve esses pontos só com escape `\uXXXX`.
  - **Vermelho esperado:** falha em `src/lib/defesa/normalizacao.ts` nas linhas 5 e 6, e só nelas (varredura de 2026-11-24).
  - **Aceite:** `npm test -- tests/unit/fonte-sem-bidi.test.ts` (em `src/`) falha apontando exatamente essas duas linhas.

- [ ] **T203 [P] · Teste de caracterização da normalização** · A2 · RF-021
  - **Arquivo:** `src/tests/unit/defesa.test.ts` (novo `describe`, sem alterar os 27 testes existentes).
  - **Regra:** para cada um dos 21 pontos de código acima (12 invisíveis e 9 bidi), escritos com escape, `normalizar("a" + c + "b").texto` não contém o ponto e `alteracoes` registra a remoção, no mesmo formato de hoje.
  - **Verde antes e depois:** este teste fixa o comportamento atual, então ele **passa** no `main` e precisa continuar passando depois da T205. É ele que prova "sem mudança de comportamento". Se algum ponto não for removido hoje, registre o achado no PR e não corrija nesta entrega.
  - **Aceite:** `npm test -- tests/unit/defesa.test.ts` com 27 + 21 testes verdes antes da T205.

## Fase 2 · Correção
- [ ] **T204 · Política da role de deploy com ações explícitas, PassRole condicionado e Deny sobre as roles do pipeline** · A1 · RNF-001
  - **Arquivo:** `infra/bootstrap/github_oidc.tf` (só o `aws_iam_role_policy.deploy_iam` e o comentário acima dele).
  - **Depende de:** T201.
  - **Mudança:**
    - `ManageProjectRoles` (`Allow`, recurso `role/${var.project_name}-*`) com as ações de escrita listadas, sem curinga: `iam:CreateRole`, `iam:DeleteRole`, `iam:UpdateRole`, `iam:UpdateAssumeRolePolicy`, `iam:TagRole`, `iam:UntagRole`, `iam:PutRolePolicy`, `iam:DeleteRolePolicy`. A leitura que o Terraform faz no refresh e no destroy (`GetRole`, `GetRolePolicy`, `ListRolePolicies`, `ListAttachedRolePolicies`, `ListInstanceProfilesForRole`, `ListRoleTags`) já vem do `ReadIam`;
    - `PassProjectRoles` (`Allow`, `iam:PassRole`, mesmo recurso) com `StringEquals` em `iam:PassedToService` para Lambda, Step Functions e API Gateway (os três serviços que recebem role no stack: `lambda_function`, `fluxo_aprovacao` e a role de logs da conta no `api_assistente`);
    - `DenyPipelineRolesAndBoundary` (`Deny`, `iam:*`) sobre `aws_iam_role.deploy[0].arn`, `aws_iam_role.plan[0].arn` e `arn:aws:iam::<conta>:policy/${var.project_name}-boundary`. O Deny explícito vence qualquer Allow, inclusive o do `PowerUserAccess`;
    - sai o recurso `policy/${var.project_name}-*` e saem as ações de política gerenciada, porque o stack não cria nenhuma.
  - **Aceite:** T201 verde; `terraform fmt -check`, `terraform validate` e `tflint` sem erro em `infra/bootstrap`; `checkov -d infra/bootstrap` sem falha nova em relação ao `main`; os 35 blocos de `terraform test` do stack principal seguem verdes (não são tocados). Commit `fix(02-assistente-agendamento): T204 ...`.

- [ ] **T205 [P] · Escapes no lugar dos literais em `normalizacao.ts`** · A2 · RF-021
  - **Arquivo:** `src/lib/defesa/normalizacao.ts`, linhas 5 e 6.
  - **Depende de:** T202 e T203.
  - **Mudança:** mesmos pontos de código, na mesma ordem, só com escape:
    - linha 5: `const INVISIVEIS = /[\u200B-\u200F\u2060-\u2064\uFEFF\u00AD]/g;`
    - linha 6: `const BIDI = /[\u202A-\u202E\u2066-\u2069]/g;`
  - **Aceite:** T202 verde; T203 e os 27 testes de `defesa.test.ts` verdes sem alteração; `npm test` inteiro em `src/` verde; o diff toca só as duas linhas. Commit `fix(02-assistente-agendamento): T205 ...`.

- [ ] **T206 [P] · Escapes também nos testes e no corpus de red team (ampliação do A2)** · A2 · RF-024
  - **Arquivos:** `src/tests/unit/defesa.test.ts` (linhas 12 e 37), `src/fixtures/redteam/corpus.json` (linha 41). São entradas de ataque que hoje usam os caracteres literais.
  - **Teste primeiro:** amplia a varredura da T202 para `src/tests/**` e `src/fixtures/**` (fora `node_modules`); fica vermelha nessas três linhas.
  - **Mudança:** `\uXXXX` no `.ts` e escape JSON `\uXXXX` no corpus, que o `JSON.parse` decodifica para os mesmos pontos.
  - **Aceite:** varredura ampliada verde; `npm test` e `npm run test:redteam` com os mesmos números de antes (ataques com efeito, barrados por camada e falsos positivos idênticos ao `docs/evidencias/redteam.json`).

## Fase 3 · Fora desta entrega (pendentes do dono)
- [ ] **T210 · Permissions boundary obrigatória nas roles criadas pelo deploy** · A1 (risco residual R1) · RNF-001 · `[PENDENTE: D02-P6]`
  - **Cadeia completa:** policy `<projeto>-boundary` no bootstrap (ou na role de deploy da conta, conforme a P00-P2); condição `iam:PermissionsBoundary` em `CreateRole`, `PutRolePolicy` e `UpdateAssumeRolePolicy`; Deny de `iam:DeleteRolePermissionsBoundary` e `iam:PutRolePermissionsBoundary` com outro valor; variável `permissions_boundary_arn` nos módulos `lambda_function`, `fluxo_aprovacao` e `api_assistente`; workflow de deploy passando a variável.
  - **Teste primeiro:** `terraform test` nos três módulos exigindo `permissions_boundary` igual à variável; asserção na T201 para a condição.
  - **Por que está pendente:** muda a forma do deploy que o ADR-0007 deixou para a role da conta, e a configuração dessa role depende da P00-P2 (conta com OIDC, decisão do dono). Mudar o plano aprovado exige nova aprovação (D-033).

- [ ] **T211 · Trocar `PowerUserAccess` por política gerada pelo IAM Access Analyzer** · A1 (risco residual R2) · RNF-001 · `[PENDENTE: D02-P7]`
  - **Cadeia:** um deploy real com CloudTrail ligado, geração da política pelo Access Analyzer, revisão e teste da política gerada.
  - **Por que está pendente:** exige apply na conta real, que é sempre disparado pelo dono, e o deploy real do D02 depende da P00-P2.

## Riscos residuais depois de T204 e T205
| id | risco | por que sobra | mitigação |
|---|---|---|---|
| R1 | A role de deploy ainda cria `agenda-x`, põe política inline com `*:*` e a passa a uma Lambda que ela mesma cria (`PowerUserAccess`); o código da Lambda roda com poder de admin | só a boundary obrigatória fecha esse caminho | T210 (pendente). Exposição baixa enquanto o bootstrap estiver fora do caminho de apply (ADR-0007) |
| R2 | `PowerUserAccess` dá acesso a quase todos os serviços da conta, inclusive recursos de outros projetos (contra o isolamento por tag da D-029) | trocar exige política medida em deploy real | T211 (pendente) |
| R3 | `ReadIam` mantém `iam:Get*` e `iam:List*` na conta inteira | leitura não escala privilégio, mas expõe o inventário de IAM da conta | aceito nesta entrega; some junto com o bootstrap (ADR-0007) |
| R4 | `iam:CreateServiceLinkedRole` sobre `aws-service-role/*` sem `iam:AWSServiceName` | fora do achado; não dá escalada direta | pode entrar na T210, restrito aos serviços do stack |

## Lacunas registradas (sem editar a spec)
- **L1 · Requisito de IAM do pipeline.** O RNF-001 cobre menor privilégio das roles do stack, mas não tem aceite para a role de deploy. Texto proposto para a próxima revisão da spec: "a role de deploy NÃO PODE alterar a si mesma, a role de plan nem a boundary; ações de IAM de escrita são listadas sem curinga; `iam:PassRole` só com `iam:PassedToService` para os serviços do stack". Hoje a DV-06 trata do bootstrap só no nível de "sair do caminho de apply".
- **L2 · CI do D02.** Não há workflow que rode o `terraform test` do D02 (nem do `infra/bootstrap`); o `seguranca.yml` roda só checkov e tflint. A T201 é verificada localmente até o CI do D02 previsto no plano (ADR-0006) existir.
- **L3 · Prefixo.** As roles usam o prefixo `agenda-`, não a chave do projeto (DV-03). Os testes da T201 seguem o `project_name` da variável, então continuam válidos quando a DV-03 for corrigida.

## Perguntas ao dono
| id | pergunta | bloqueia | opções | recomendação |
|---|---|---|---|---|
| D02-P6 | A permissions boundary obrigatória (T210) entra agora no bootstrap do D02, ou espera a role de deploy da conta (P00-P2)? | T210 | A) esperar a P00-P2 e aplicar a boundary na role da conta, que serve todos os projetos; B) aplicar agora no bootstrap do D02, que o ADR-0007 vai aposentar (exige nova aprovação do plano) | A: evita trabalho num artefato que sai do caminho de apply e resolve o problema uma vez para toda a conta |
| D02-P7 | Quando gerar a política do Access Analyzer para substituir o `PowerUserAccess` (T211)? | T211 | A) no primeiro deploy real da demonstração, com CloudTrail, dentro do teto diário; B) adiar até a role de deploy da conta existir | A: a política medida no deploy real é a única que reflete o que o Terraform usa de fato |

## Cobertura desta entrega
| achado | requisito | tarefa | teste |
|---|---|---|---|
| A1 | RNF-001 | T201, T204 | `infra/bootstrap/tests/oidc_deploy.tftest.hcl` |
| A1 (residual) | RNF-001 | T210, T211 | pendentes do dono |
| A2 | RF-021, RNF-001 | T202, T203, T205 | `src/tests/unit/fonte-sem-bidi.test.ts`, `src/tests/unit/defesa.test.ts` |
| A2 (ampliação) | RF-024 | T206 | varredura ampliada e `npm run test:redteam` |
