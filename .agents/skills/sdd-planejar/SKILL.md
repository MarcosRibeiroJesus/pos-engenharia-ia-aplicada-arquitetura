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
6. **Estratégia de testes, cloud comparativa e custo do lab:** use as seções do template.
   - O teto é o custo estimado de **um dia** de execução (D-021). Calcule com o Infracost, se houver chave, ou pela página de preços oficial, citando a fonte.
   - Grave o valor em `teto_diario_usd` no `harness/estado.json`.
   - Calcular não é decidir: se a estimativa depender de uma escolha do dono (escala, região, serviço pago), marque `[PENDENTE]`.
7. `python3 harness/estado.py avancar <chave> tarefas` e commit `plan(<chave>): ...`.
8. **Aprovação do plano pelo dono** (D-033). Leve o `plan.md` ao Marcos, com um resumo e o teto diário, e pergunte se aprova (também em `## Perguntas ao dono` no PR).
   - Só depois do sim dele: `python3 harness/estado.py aprovar-plano <chave> --fonte "<palavras dele e quando>"`. Isso libera a delegação das fases seguintes sem aprovar cada disparo.
   - Silêncio não aprova. Sem aprovação, cada disparo de especialista continua pedindo o ok dele.
