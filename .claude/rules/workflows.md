---
paths:
  - ".github/workflows/**"
---
# Regras para workflows do GitHub Actions
- Actions de terceiros fixadas por SHA completo, com a versão em comentário.
- `permissions: contents: read` no topo; amplie só no job que precisa.
- Nunca use `pull_request_target` com checkout do código do PR. Nunca interpole `github.event.*` direto em `run:`; passe por `env`.
- Credenciais da AWS só via OIDC (`aws-actions/configure-aws-credentials` com `role-to-assume`).
- Qualquer agente pode alterar workflows, sempre por PR. A aprovação do dono antes do merge depende de duas configurações do dono, não de arquivo: `.github/CODEOWNERS` (já existe) e o ruleset do `main` com *Require review from Code Owners* e *Dismiss stale pull request approvals*. Até o dono confirmar essas configurações, a aprovação não está garantida.
- Nenhum agente faz merge, nem altera ambientes, rulesets, proteção de branch ou secrets. Essas configurações são do dono.
