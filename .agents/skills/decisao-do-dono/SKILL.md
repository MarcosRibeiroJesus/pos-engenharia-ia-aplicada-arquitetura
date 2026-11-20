---
name: decisao-do-dono
description: Registrar uma decisão que só o Marcos pode tomar e aplicá-la como regra ou skill no mesmo turno (D-025). Use na orquestração sempre que o dono responder uma pergunta, escolher uma opção ou definir uma regra.
---

# Decisão do dono vira regra ou skill

Quando o Marcos decide algo que só ele pode decidir (escopo, produto, orçamento, cloud, IA aplicada, publicação, merge, regra do projeto), a decisão não fica só na conversa.

## Como perguntar (D-041)
- O dono responde só no chat: use o `AskUserQuestion`, com múltipla escolha.
- No enunciado:
  - o contexto em uma frase;
  - `Boa prática:` com o nome da prática, o que o arquiteto faz e o erro comum que ela evita (D-036).
- Em cada opção, o tradeoff.
- O hook `gate_pergunta.py` nega a pergunta fora desse formato.
- A seção `## Perguntas ao dono` do PR é só registro. Quando o dono responder, marque a linha como "Respondida (D-xxx)".

## No mesmo turno
1. **Memória compartilhada:** entrada `D-xxx · fonte: Marcos` no `HISTORICO.md` e a regra ativa no `DECISOES.md`. Saia das pendências o que foi resolvido.
2. **Aplicação com relação direta.** Escolha o lugar mais forte que couber, nesta ordem:
   - **gate programático:** hook, `estado.py validar`, CI ou teste. É o que impede o erro (1.4);
   - **constituição, `CLAUDE.md` ou `AGENTS.md`:** regra que todo agente lê;
   - **skill nova ou atualizada:** o como-fazer da decisão;
   - **template de spec, plano ou tarefas:** a decisão aparecendo em todo projeto novo.
3. **Na entrada do histórico,** a linha `**Aplicado em:**` lista os arquivos tocados. O `python3 harness/memoria.py auditar` reprova decisão do dono sem essa linha.
4. **Monday:** atualize o card, ou feche se a decisão resolveu a pendência.
5. **Sessões em andamento** recebem a mudança pela memória. Se a decisão contradiz um branch, o PR registra o ajuste.

## Não é decisão do dono
O que está delegado (D-014) é decidido pela orquestração e registrado com `fonte: delegada`. Isso não dispensa a explicação nem os ids da prova.

## Nunca
- Registrar como decidido o que ainda está pendente.
- Generalizar uma decisão além do que o dono disse. Na dúvida sobre o alcance, pergunte.
