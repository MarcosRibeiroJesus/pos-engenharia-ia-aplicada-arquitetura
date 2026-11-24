# AGENTS.md · Plataforma de agentes (`plataforma/agentes/`)

Manual deste projeto (`00-plataforma-agentes`, fase `implementar`). Vale para qualquer agente. As regras do repositório estão no `AGENTS.md` da raiz e se aplicam aqui também.

## O que é
Plataforma compartilhada na AWS: gateway MCP, política e identidade, guardrails, perfil de inferência por produto, observabilidade e evals. Os projetos de arquitetura consomem esta plataforma (D-074).

## Onde está o plano
- Spec, plano e tarefas: `specs/00-plataforma-agentes/` (`spec.md`, `plan.md`, `tasks.md`). A tarefa em andamento é a primeira `[ ]` do `tasks.md`.
- ADRs: `plataforma/agentes/adr/`.
- Contrato: `plataforma/agentes/contrato/v1.schema.json`. Mudança de contrato é mudança de versão.

## Como testar
- Suíte (é o mesmo comando do CI): `python3 -m unittest discover -s plataforma/agentes/tests -p "test_*.py"`.
- Terraform: `terraform test` por módulo em `infra/terraform/modules/*`, com mock provider; `checkov` e `tflint` antes do commit.
- Integração no Floci (`http://localhost:4566`) só depois do projeto completo.

## Regras deste projeto
- **Ciclo vermelho → verde** em toda tarefa: teste primeiro, depois a implementação.
- **Nada público por padrão**, criptografia em repouso e em trânsito, IAM de menor privilégio, sem `Principal "*"` (D-044).
- **Tags** `project`, `module` e `managed-by` em todo recurso. `project` = `00-plataforma-agentes`.
- **Segredo nunca no contrato** (TS-02). `test_segredos.py` reprova nome ou valor com cara de credencial.
- **Custo:** teto diário em `harness/estado.json` (`teto_diario_usd`). Nenhum custo fixo ocioso sem ADR.
- **Apply e destroy** só pelos workflows protegidos, com `confirm_stack` no destroy. Agente não dispara apply em conta real.
- **Locks do Terraform** (`.terraform.lock.hcl`) ficam versionados.

## Fora de escopo
Credenciais, ARNs de conta real em arquivo versionado, e dados de cliente.
