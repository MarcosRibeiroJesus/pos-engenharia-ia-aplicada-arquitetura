---
name: retomar
description: Ritual de orientação no início de toda sessão ou ao retomar uma parada. Use antes de qualquer trabalho para saber o estado do projeto, as decisões do dono, a fase SDD e a próxima tarefa.
---

# Retomar (orientação da sessão)

Você começa sem memória das sessões anteriores. A continuidade está em arquivos; leia-os antes de agir (tarefas 1.7 e 5.1).

1. Rode `bash harness/init.sh`. Ele mostra o ambiente, o git, as pendências da memória compartilhada, o estado SDD e as últimas sessões.
2. Identifique o seu projeto em `harness/estado.json` pelo branch atual. Leia, nesta ordem:
   - `specs/<chave>/spec.md`, depois `plan.md` e `tasks.md`, quando existirem;
   - as decisões citadas em `decisoes`, via `git show origin/memoria-compartilhada:HISTORICO.md`.
3. **Avalie se o contexto ainda vale.** Se a sessão ficou parada mais de 4 horas, ou se a memória mudou com decisão que afeta o projeto, não continue sobre resultados de ferramenta antigos. Escreva um resumo estruturado e trabalhe a partir dele. O resumo tem:
   - branch e último commit;
   - o que está pronto e testado;
   - o que falta;
   - os ids das decisões aplicadas;
   - as perguntas abertas.
4. Rode os testes do projeto antes de mudar qualquer coisa: o estado precisa estar verde.
5. **Escolha o trabalho pela fase.**
   - Fase `especificar` a `analisar`: use a skill da fase.
   - Fase `implementar`: pegue a **primeira** tarefa não marcada de `tasks.md`, e só ela (skill `sdd-implementar`).
6. **Ao terminar a sessão:**
   - acrescente uma linha em `harness/progresso.md`: data, projeto, sessão, o que foi feito, testes e próxima tarefa;
   - faça commit com mensagem descritiva.

   O uso de tokens é registrado sozinho pelo hook `registrar_uso.py`, em `harness/uso/`; inclua esse arquivo no commit.

Pergunta para o dono vai em `## Perguntas ao dono` no PR. Nunca assuma a resposta (constituição, Artigo II).
