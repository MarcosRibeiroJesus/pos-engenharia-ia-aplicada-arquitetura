# ADR-0005: pipeline de CI/CD com OIDC, apply protegido e destroy verificado

- Status: aceito
- Data: 2026-11-18
- Unidade: 01.03 (recomendação)
- Atualização (T010 e T012): os workflows passaram a `01-recomendacao-{ci,apply,destroy}.yml`, nascidos dos modelos do harness, com o grupo de concorrência `01-recomendacao-state`; o nome do stack digitado no destroy é `01-recomendacao-lab` (prefixo do ADR-0014). Os nomes `recsys-*` abaixo são o registro da decisão original.

## Contexto

Os workflows importados ficavam em `.github/workflows` dentro da unidade, onde o GitHub não os executa. O de criação aplicava sem plan revisado e não repassava `enable_mwaa`; o de destroy confirmava com a palavra fixa `DESTROY`, rodava contra state local vazio e não verificava sobras.

## Decisão

Três workflows na raiz do repositório, com prefixo `recsys-01-03-` e filtro de caminho para a unidade:

| Workflow | Disparo | O que faz |
|---|---|---|
| `recsys-01-03-ci.yml` | PR e push em `main` que tocam a unidade | lint, build e testes do serviço; `fmt`, `validate`, `tflint`, `checkov`, `terraform test` e regras estáticas; integração com o Floci como container de serviço; plan na AWS comentado no PR (se `AWS_PLAN_ROLE_ARN` existir); Infracost (se `INFRACOST_API_KEY` existir) |
| `recsys-01-03-apply.yml` | manual | ambiente protegido `aws-lab`; repassa `enable_mwaa`, `enable_serverless_inference` e `explanations_enabled`; aplica exatamente o plan gerado no job |
| `recsys-01-03-destroy.yml` | manual | ambiente protegido `aws-lab`; exige digitar o nome do stack (`recsys-lab`); destroy com state remoto; falha se sobrar algum recurso com a tag `project` (ignora chaves KMS em `PendingDeletion`) |

- **OIDC, sem chave estática**: o bootstrap cria o provedor OIDC do GitHub e duas roles. A de plan só aceita tokens de `pull_request` do repositório e tem `ReadOnlyAccess` mais leitura do state e escrita do lockfile. A de deploy só aceita tokens de jobs no ambiente `aws-lab`, que exige aprovação manual.
- `apply` e `destroy` compartilham o grupo de concorrência `recsys-01-03-state`: nunca rodam ao mesmo tempo. O lockfile do state é a segunda barreira.
- Os passos que dependem de configuração do dono (roles, bucket de state, chave do Infracost) viram `notice` ou são pulados quando a variável não existe, para o CI de um fork não quebrar.

## Configuração no GitHub (feita pelo dono do repositório)

1. Aplicar `infra/bootstrap` com `github_repository = "owner/repo"`.
2. Variáveis do repositório: `AWS_REGION`, `TF_STATE_BUCKET`, `AWS_PLAN_ROLE_ARN`; secret opcional `INFRACOST_API_KEY`.
3. Ambiente `aws-lab` com revisor obrigatório e a variável `AWS_DEPLOY_ROLE_ARN` (e `ALERT_EMAILS`, em JSON).

## Alternativas rejeitadas

- **Chaves de acesso em secrets**: credencial de longa duração, rotação manual, vaza em logs de forks.
- **Atlantis ou HCP Terraform para plan/apply**: mais uma peça para hospedar num lab de uma pessoa.
- **Apply automático no merge**: o lab tem custo por hora; subir o stack precisa ser uma decisão, não um efeito colateral do merge.

## Trade-offs

A role de deploy tem `PowerUserAccess` mais IAM restrito ao prefixo do projeto. É larga: um workflow comprometido no ambiente `aws-lab` consegue criar quase qualquer recurso. A barreira é o ambiente protegido com aprovação. Note também que `iam:*Policy*` em roles do prefixo permite anexar políticas a elas; uma permissions boundary nas roles do projeto fecharia esse caminho.

## Custo

GitHub Actions no plano gratuito para repositório público. O job de integração sobe o Floci (sem custo de nuvem). Plan e Infracost não criam recursos.

## Risco

- Plan com `ReadOnlyAccess` lê toda a conta (inclusive metadados de outros stacks). Aceitável numa conta de lab dedicada; em conta compartilhada, restrinja.
- Recursos que o Terraform não conhece (log groups criados por serviços) escapam do destroy; a verificação por tag pega os taggeados, e os log groups conhecidos são criados pelo próprio Terraform.

## Tarefas da prova CCAR-F exercitadas

3.6 (Claude Code em CI): o pipeline é o ponto onde um passo `claude -p --output-format json --json-schema` de revisão de plan pode entrar, com o resumo do plan como entrada e um schema de achados como saída. Fica como pendência para a disciplina 06 (DevOps), para não acoplar uma chave de API ao CI agora.

## O que um arquiteto sênior faria em produção

Permissions boundary nas roles criadas pelo pipeline; política de deploy gerada a partir do CloudTrail; plan assinado e guardado como artefato para o apply usar o mesmo binário; ambientes separados por conta (dev, prod) com o mesmo workflow; e detecção de drift agendada.
