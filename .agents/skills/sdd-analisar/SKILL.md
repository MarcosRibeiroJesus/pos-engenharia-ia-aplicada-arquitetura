---
name: sdd-analisar
description: Fase analisar do SDD, o gate antes do código. Use para validar a consistência entre constituição, spec, plano e tarefas e gerar specs/<chave>/analise.md; só com aprovação o projeto pode receber código.
---

# Analisar (gate de consistência)

Faça a análise com contexto limpo: rode-a num **subagente independente** que não escreveu a spec. Quem escreveu tende a não ver as próprias lacunas (tarefa 4.6).

O subagente devolve `specs/<chave>/analise.md`, com estes critérios explícitos (tarefa 4.1):

| Critério | Reprova quando |
|---|---|
| Cobertura | um RF ou RNF não tem tarefa, ou uma tarefa não tem requisito |
| Constituição | um artigo violado não tem ADR que justifique |
| Ambiguidade | há termo vago sem critério mensurável |
| Pendências | um `[PENDENTE]` bloqueia uma tarefa que vai ser implementada agora |
| Consistência | spec, plano e tarefas se contradizem (nomes, serviços, números) |
| Testabilidade | uma tarefa não começa por teste |
| Operação e custo | um projeto com infraestrutura real não tem tarefa de workflow de destroy, ou não tem teto diário calculado no plano |

O arquivo termina com **APROVADO** ou **REPROVADO** e a lista de achados (severidade, local, correção).

- **REPROVADO:** corrija a fase de origem e analise de novo, no máximo 2 rodadas. Se a correção mudar o `plan.md`, a aprovação do dono cai (D-033): mostre a mudança a ele e registre a nova aprovação com `estado.py aprovar-plano` antes de delegar de novo. Se persistir, leve ao dono em `## Perguntas ao dono` (tarefa 5.2).
- **APROVADO:** `python3 harness/estado.py avancar <chave> implementar` e commit `analise(<chave>): aprovado`.
