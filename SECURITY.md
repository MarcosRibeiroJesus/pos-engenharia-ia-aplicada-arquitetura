# Segurança

## Reportar uma vulnerabilidade
Use o recurso **Report a vulnerability** (Security Advisories privados) deste repositório. Não abra issue pública.

## Como o repositório se protege
- Todo PR passa pela esteira `Segurança e FinOps`: segredos (gitleaks), SAST (Semgrep, CodeQL e zizmor para workflows), SCA e licenças (dependency review e Trivy), SBOM (SPDX), IaC (checkov e tflint), imagens de contêiner (Trivy), DAST (OWASP ZAP baseline) quando a unidade declara um alvo e FinOps (Infracost com teto mensal).
- Achado alto ou crítico bloqueia o merge. Exceções só com justificativa versionada e ADR.
- Agentes de IA revisam cada PR de forma independente (segurança e FinOps) e, com o rótulo `auto-fix`, um agente corretor propõe correções em commits. O merge é sempre humano.
- Actions fixadas por SHA, Dependabot semanal e permissões mínimas do `GITHUB_TOKEN`.
- Os projetos são laboratórios: nada roda em produção e não há dados reais.
