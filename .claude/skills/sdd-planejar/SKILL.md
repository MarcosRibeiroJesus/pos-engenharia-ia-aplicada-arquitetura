---
name: sdd-planejar
description: Fase planejar do SDD. Use quando a spec estiver esclarecida, para escrever specs/<chave>/plan.md com arquitetura AWS, ADRs, estratégia de testes, cloud comparativa e custo.
---

# Planejar

Trabalhe em **plan mode** (tarefa 3.4): leia e pesquise, sem editar código.

1. Copie `.specify/templates/plan-template.md` para `specs/<chave>/plan.md`.
2. **Verificação da constituição:** para cada artigo, diga como o plano o cumpre. Um artigo violado sem ADR reprova o plano.
3. **Arquitetura.** Para cada serviço, registre:
   - por que este serviço;
   - a alternativa rejeitada;
   - o link da fonte oficial da AWS;
   - se existe no Floci (confirme com `floci aws services` ou a documentação). Se faltar, proponha um equivalente ou um mock, com ADR.
4. **Pesquisa:** use um subagente Sonnet com a pergunta exata e peça de volta um resumo curto com fontes. A exploração longa fica no contexto dele, não no seu (tarefa 1.3 e técnica de subagentes do *context engineering*).
5. **ADRs** em `adr/` do projeto: contexto, decisão, alternativas, trade-offs, custo, risco, tarefas da prova e curso Skilljar relacionado.
6. **Estratégia de testes, cloud comparativa e custo do lab:** use as seções do template. Se o teto ainda estiver pendente, mantenha `[PENDENTE]`.
7. `python3 harness/estado.py avancar <chave> tarefas` e commit `plan(<chave>): ...`.
