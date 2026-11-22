---
name: modelo-de-ameacas
description: Modelagem de ameaças e revisão de segurança de um projeto (infra AWS, componente Claude, servidor MCP, workflows do GitHub). Use no plano e antes do merge para STRIDE, IAM de menor privilégio, prompt injection, segredos e supply chain.
---

# Modelo de ameaças

## No plano
1. **Diagrama de fluxo de dados:** atores, fronteiras de confiança e dados sensíveis (mesmo sintéticos, trate como reais).
2. **STRIDE por fronteira:** para cada ameaça, a mitigação e o teste que prova a mitigação. Sem teste, a mitigação não conta.
3. **Fronteiras específicas de LLM:**
   - prompt injection direta e indireta;
   - tool com efeito colateral sem aprovação humana (1.4);
   - dado sensível no prompt ou no log;
   - descrição de tool MCP maliciosa.

## Checklist de implementação
- IAM: uma role por função; sem `*` em ação e recurso juntos; condições (`aws:SourceArn`, `aws:SecureTransport`).
- Segredos no Secrets Manager ou SSM, nunca em variável de ambiente em texto nem no repositório.
- Workflows:
  - actions fixadas por SHA;
  - `permissions` mínimas;
  - OIDC;
  - nada de `pull_request_target` com checkout do código do PR.
- Dependências fixadas, com Dependabot.

## Antes do merge
A esteira `seguranca.yml` roda gitleaks, Semgrep, CodeQL, Trivy, checkov e ZAP. Achado alto ou crítico bloqueia. Exceção só com justificativa versionada e ADR.

## Skills de mercado complementares
- `security-guidance` e `claude-security` (plugins oficiais da Anthropic).
- Da Trail of Bits: `insecure-defaults`, `static-analysis`, `agentic-actions-auditor` (workflows com IA) e `supply-chain-risk-auditor`.
