---
paths:
  - ".github/workflows/**"
---
# Regras para workflows do GitHub Actions
- Actions de terceiros fixadas por SHA completo, com a versão em comentário.
- `permissions: contents: read` no topo; amplie só no job que precisa.
- Nunca use `pull_request_target` com checkout do código do PR. Nunca interpole `github.event.*` direto em `run:`; passe por `env`.
- Credenciais da AWS só via OIDC (`aws-actions/configure-aws-credentials` com `role-to-assume`).
- Qualquer agente pode alterar workflows, sempre por PR. A aprovação do dono é obrigatória antes do merge (`.github/CODEOWNERS`). Nenhum agente faz merge, nem altera ambientes, rulesets ou secrets.
