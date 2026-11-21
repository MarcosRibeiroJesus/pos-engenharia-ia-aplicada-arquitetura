---
name: sdd-tarefas
description: Fase tarefas do SDD. Use quando o plano estiver pronto, para quebrar o trabalho em specs/<chave>/tasks.md com tarefas pequenas, ordenadas, testáveis e ligadas aos requisitos.
---

# Tarefas

1. Copie `.specify/templates/tasks-template.md` para `specs/<chave>/tasks.md`.
2. **Tamanho certo:** cada tarefa cabe numa sessão e entrega algo testável. Ela começa por um teste que falha e cita os requisitos que cobre (tarefa 1.6, decomposição).
3. **Ordem:**
   - regras da constituição como testes primeiro;
   - depois o núcleo;
   - depois o componente Claude;
   - por fim, verificação e publicação.

   Marque com `[P]` as tarefas independentes, que podem rodar em paralelo.
4. **Cobertura:** todo RF e RNF da spec aparece em pelo menos uma tarefa. Gere `specs/<chave>/matriz.md` (requisito → tarefa → teste).
5. **Retroativo:** marque como `[x]` o que já existe e está testado. Crie tarefas para as divergências apontadas na spec.
6. `python3 harness/estado.py avancar <chave> analisar` e commit `tasks(<chave>): ...`.
