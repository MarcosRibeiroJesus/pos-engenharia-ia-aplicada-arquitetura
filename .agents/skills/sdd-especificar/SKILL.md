---
name: sdd-especificar
description: Fases especificar e esclarecer do SDD. Use para escrever ou completar specs/<chave>/spec.md (inclusive spec retroativa de código que já existe) e resolver ambiguidades antes do plano.
---

# Especificar e esclarecer

A spec diz **o quê e o porquê**, nunca o como (constituição, Artigo I).

1. Copie `.specify/templates/spec-template.md` para `specs/<chave>/spec.md`, se ainda não existir. Preencha a partir de:
   - as decisões do dono (`git show origin/memoria-compartilhada:DECISOES.md`);
   - o briefing;
   - as notas e opções da disciplina;
   - **spec retroativa:** o código, os testes e os ADRs que já existem. Descreva o comportamento atual como requisitos e marque com `[DIVERGÊNCIA]` o que o código faz e a constituição proíbe.
2. **Requisitos testáveis.** Cada requisito tem id (RF-xxx, RNF-xxx) e um critério de aceite verificável. Escreva critérios explícitos e mensuráveis, nada de "rápido" ou "seguro" sem número ou regra (tarefa 4.1).
3. **Esclarecer:** liste as ambiguidades e classifique cada uma.
   - **Técnica** (delegada): decida pela boa prática da prova e registre o porquê na spec.
   - **Do dono** (escopo, produto, custo, cloud, publicação): marque `[PENDENTE: ...]` e copie para `## Perguntas ao dono` com opções e recomendação. **Nunca assuma.**
4. Mapeie o componente Claude para as tarefas da prova (ids) e diga como ele é testado com respostas gravadas.
5. **Avance de fase.**
   - Sem pendência que bloqueie a spec: `python3 harness/estado.py avancar <chave> planejar`.
   - Com pendências: `python3 harness/estado.py avancar <chave> esclarecer`, e pare nesta fase até haver resposta.
6. Commit: `spec(<chave>): ...`.
