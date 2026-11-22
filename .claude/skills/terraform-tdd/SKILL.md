---
name: terraform-tdd
description: "Terraform com TDD neste repositório. Use para escrever ou mudar infraestrutura AWS: regras da constituição como terraform test com mock provider, módulos, tags, state remoto, checkov e tflint, apply e destroy pelos modelos do harness."
---

# Terraform com TDD

## Onde rodar (D-063, substitui a D-042)
- **O ciclo vermelho → verde do Terraform roda nas sessões de nuvem,** com um agente por projeto em paralelo. Não há mais ciclo local na máquina do dono.
- **A sessão precisa ter** `terraform`, os providers e o Docker com o Floci. Confira antes de começar: `terraform version` e `terraform init -backend=false` num stack.
- **Sessão sem `terraform` ou sem acesso ao registry:** não escreva Terraform "às cegas" para validar só no CI. Pare e devolva a tarefa à orquestração com o motivo (a rede do ambiente é configuração do dono).
- **Um escritor por branch:** a sessão do projeto é a única que faz commit no branch de implementação. A orquestração coordena (memória, Monday, revisões, perguntas), mas não comita no mesmo branch.

## Ciclo
1. **Regra antes do recurso:** escreva o `run` em `tests/*.tftest.hcl` com `mock_provider "aws" {}` e `command = plan`, e veja o teste falhar (`terraform test`).
2. **Implemente o mínimo** para o teste passar.
3. **Rode** `terraform fmt -check`, `terraform validate`, `tflint` e `checkov -d .`. Achado alto ou crítico bloqueia.

## Regras que todo stack testa (Artigos IV a VI)
| Regra | Como testar no plan |
|---|---|
| Nada público | bucket com `block_public_*` em true; sem `0.0.0.0/0` em ingress, exceto com ADR |
| Criptografia | KMS ou SSE em repouso; TLS obrigatório (policy `aws:SecureTransport`) |
| Menor privilégio | sem `"*"` em `Action` e `Resource` juntos; condições por recurso |
| Tags (D-031) | `project` = chave (regex `^[0-9]{2}-[a-z0-9]+(-[a-z0-9]+)*$`) e `managed-by` = `terraform` via `default_tags`; `module` em kebab via `local.tags` do módulo. Comece por `harness/modelos/tags.tftest.hcl`: são os mesmos padrões da política de tags do Infracost, que bloqueia o PR |
| Isolamento (D-029) | nome com o prefixo da chave; policy das roles do projeto com `aws:ResourceTag/project` ou `aws:RequestTag/project` igual à chave |
| Custo | nada fixo ocioso (NAT, endpoint de interface, cluster) sem ADR; AWS Budgets diário com `teto_diario_usd` |
| Operação | log group com retenção, alarme nos componentes críticos |
| Destroy sem sobras | `force_destroy` no lab, `deletion_protection` falso no lab, com ADR |

Use `expect_failures` para provar que validações rejeitam valores ruins.

## Estrutura
- `infra/terraform/` com `versions.tf` (backend `s3 {}` parcial, `use_lockfile`), `variables.tf`, `main.tf`, `outputs.tf`, `terraform.tfvars.example` e `modules/`.
- Apply e destroy: copie `harness/modelos/apply.yml` e `harness/modelos/destroy.yml` (skill `ciclo-demonstracao`).
- Integração no Floci só com o projeto completo (skill `integracao-floci`).

## Skill de mercado complementar
`terraform@hashicorp` (plugin oficial da HashiCorp): estilo, testes, módulos e import. Quando ela divergir deste arquivo, valem a constituição e este arquivo.
