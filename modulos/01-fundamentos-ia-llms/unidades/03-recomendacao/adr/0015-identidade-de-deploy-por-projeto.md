# ADR-0015: identidade de deploy por projeto no infra/conta, com ABAC

- Status: aceito (plano aprovado pelo dono em 2026-11-20, D-056). O apply do `infra/conta` e a criação das variáveis são ações do dono
- Data: 2026-11-20
- Projeto: `01-recomendacao` (D01, recomendação de e-commerce)
- Decisões aplicadas: D-029 (roles por projeto com condição na tag), D-024 (ambiente `aws-lab-destroy`)
- Curso Skilljar relacionado: Claude Code in Action (CI com OIDC)

## Contexto
O `U/infra/bootstrap/` cria três coisas:
- o provedor OIDC do GitHub;
- o bucket de state;
- uma role de deploy com `PowerUserAccess`, sem condição de tag, que só aceita o ambiente `aws-lab`.

O provedor OIDC com a URL do GitHub é único por conta, e o bucket de state serve a todos os projetos. Então os dois não pertencem à D01. A role não aceita o ambiente do destroy (D-024) e não tem ABAC (D-029). A configuração da conta continua pendente do dono, no item "Conta AWS com OIDC" (P00-P2, conta AWS da plataforma).

## Decisão
1. **O bootstrap sai do projeto.** O provedor OIDC e o bucket de state passam ao `infra/conta`, aplicado pelo dono. O bucket mantém versionamento, KMS, bloqueio público e lock nativo.
2. **Roles da D01 no `infra/conta`**, geradas por uma lista de projetos:
   - **`01-recomendacao-deploy`:**
     - **confiança:** `repo:<dono>/<repo>:environment:aws-lab` e `...:environment:aws-lab-destroy`;
     - **criar recurso:** permitido com `aws:RequestTag/project = 01-recomendacao`;
     - **alterar e apagar:** permitido com `aws:ResourceTag/project = 01-recomendacao`;
     - **ações sem condição de tag:** ficam numa lista nomeada e limitada por ARN com o prefixo da chave. A lista inicial vem da referência de autorização de cada serviço e é conferida na tarefa: `iam:PassRole` para roles `01-recomendacao-*`, as leituras `Describe*` e `List*` do plan, `ecr:GetAuthorizationToken`, `s3` no prefixo do state da chave, `ssm:GetParameter` no contrato da plataforma e `ce:ListCostAllocationTags`;
     - nada de `*` com `*`;
   - **`01-recomendacao-plan`:** só leitura e state, para o plan comentado no PR.
3. **Workflows:** usam `vars.AWS_DEPLOY_ROLE_ARN_01_RECOMENDACAO`, com fallback para `vars.AWS_DEPLOY_ROLE_ARN`. Criar a variável e dar o valor é com o dono.
4. **Teste:** TT-I01 no `infra/conta` (os dois subjects; nenhuma ação ampla sem condição, fora da lista).

## Alternativas rejeitadas
| Alternativa | Por que não |
|---|---|
| Manter o bootstrap na D01 | Cria um segundo provedor OIDC na conta (falha) e prende recurso da conta ao destroy de um projeto |
| Role de deploy única da conta | Contraria a D-029; é o risco R7 da plataforma, aceito lá só para a plataforma |
| Subject com `job_workflow_ref` (customização do OIDC no GitHub) | Muda a configuração do GitHub do dono e quebra as confianças atuais; fica como recomendação de produção |

## Trade-offs
- Os ambientes `aws-lab` e `aws-lab-destroy` são compartilhados. Um workflow de outro projeto nesses ambientes poderia assumir a role da D01. O risco residual é coberto pela revisão de workflows no PR, pela aprovação do apply e pelo ABAC, que impede alterar recurso sem a tag da D01.
- Nem toda ação aceita condição de tag. A lista nomeada é revisada e testada.

## Custo
Nenhum: IAM e OIDC não cobram.

> **Atualização de 2026-11-23 (T030, revisão 1):** a linha acima está incompleta. O bucket de state usa uma chave KMS do cliente, de **cerca de US$ 1 por mês**, mais centavos de requisições. Há uma única chave para a conta inteira, com rotação anual, e o bucket key reduz as chamadas ao KMS. É o único custo fixo do `infra/conta` e cabe no limite mensal de US$ 20 da conta (D-022), onde ele já é somado. **Alternativa rejeitada:** SSE-S3, que é grátis, mas não separa o acesso ao state do acesso ao bucket (ler o state com SSE-KMS exige também `kms:Decrypt`, dado só às roles de cada projeto), e foi o que o ADR-0001 usava antes desta decisão.

## Risco
- Uma lista de exceções incompleta faz o primeiro apply falhar com `AccessDenied`. Isso aparece cedo, antes da gravação, e a correção entra na lista com a fonte.
- O apply do `infra/conta` depende do dono.

## Boa prática e erro comum (D-036)
**Uma identidade por função, com o limite imposto fora do código do projeto.** O arquiteto dá a cada projeto uma role que só mexe no que tem a tag dele e deixa os recursos da conta num stack da conta. O erro comum é uma role ampla compartilhada, ou um projeto que cria recurso da conta e o leva junto no próprio destroy (1.4).

## O que um arquiteto sênior faria em produção
- **Contas:** uma conta por produto e ambiente no AWS Organizations, com SCPs e permission boundaries.
- **Confiança:** subjects de OIDC com `job_workflow_ref` e ambientes por produto.
- **Auditoria:** IAM Access Analyzer validando as políticas no PR.
