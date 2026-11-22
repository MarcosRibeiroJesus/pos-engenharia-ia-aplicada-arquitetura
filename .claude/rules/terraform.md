---
paths:
  - "**/*.tf"
  - "**/*.tftest.hcl"
---
# Regras para Terraform
- Toda regra de segurança e custo do CLAUDE.md vira `terraform test` antes da implementação.
- Tags `project`, `module` e `managed-by` em todos os recursos, via `default_tags` do provider.
- Sem `*` em ações ou recursos de IAM; sem 0.0.0.0/0 fora do ALB; criptografia em repouso e TLS em trânsito.
- Recursos com custo fixo ocioso só com ADR e variável para desligar no lab.
- State remoto com lock; nunca versione `*.tfstate` nem `*.tfvars` com valores reais.
