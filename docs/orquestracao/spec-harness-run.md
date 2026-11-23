# Spec: `harness/run.py`, entrada única do harness com limite de contexto

Estado: **proposta para aprovação do dono**. Nenhum código foi escrito. Mudança no harness segue a skill `evolucao-do-harness` (teste primeiro, só biblioteca padrão do Python 3, versão em `harness/VERSAO.md`).

## Problema (medido)
- O harness hoje é só guarda-corpo (hooks, gates, skills) dentro de sessões do Claude Code. Não existe executor que abra sessões: não há `claude -p` em `harness/`, scripts ou workflows.
- O orquestrador ficou numa conversa única. Contexto do fio principal: mediana ~496k tokens, máximo ~890k. O cache lido foi ~50% do custo equivalente.
- Cada subagente abre com ~30k tokens de instruções injetadas.
- `harness/progresso.md` tem só linhas de `claude-code`; o `agente.py` não é acionado por nada.

## Decisões do dono (respondidas no chat)
| Tema | Decisão |
|---|---|
| Limite de contexto por sessão | **Aviso em 100k, duro em 150k** tokens |
| Obrigatoriedade | **Aviso no início da sessão + bloqueio de commit e push fora do `run.py`** (selo) |
| Onde roda | **Local e nuvem, mesmo código** |

Boa prática aplicada: limite de contexto por gate programático lendo o `usage` real do transcript (não por pedido no prompt); padrão orquestrador-trabalhador com sessão de execução nova por tarefa. Erro evitado: orquestrador que acumula tudo no próprio contexto e relê meio milhão de tokens a cada resposta.

## Comportamento
1. **Preflight em código:** `init.sh`, leitura da memória, estado SDD, branch, PR aberto, próxima tarefa do `tasks.md` com dependências conferidas (`Depende de`).
2. **Uma sessão nova por tarefa** (`claude -p`), com briefing curto gerado do `tasks.md` (`Projeto:` em linha própria), modelo e especialista vindos de `harness/agentes.json` e `harness/especialistas.json`.
3. **Revisor independente em sessão nova**, com o diff como entrada, no máximo 2 rodadas de correção.
4. **Por código, não por lembrança:** commit só do aprovado, `harness/uso/` em todo commit, linha em `harness/progresso.md`, marcação `[x]` da tarefa.
5. **Limite de contexto (hook):** em 100k injeta aviso para fechar a tarefa; em 150k nega novas chamadas e o executor grava resumo estruturado (branch e último commit, pronto e testado, falta, decisões, perguntas abertas) e abre sessão nova. Teto de turnos e de tokens por tarefa.
6. **Selo:** o `run.py` grava um selo por sessão; `pre-commit` e `pre-push` recusam sem selo válido. Saída de emergência registrada e auditável.
7. **Aviso no `SessionStart`** quando a sessão não nasceu do `run.py`.
8. **Economias:** saídas de ferramenta enxutas (rtk, D-067), instruções injetadas reduzidas, janela de 200k em vez da variante de 1M se a conta usar 1M (a confirmar na documentação oficial antes de virar regra).
9. Nunca: push com força, push no `main`, merge, apply ou destroy fora do Floci.

## Tarefas (ordem, teste vermelho primeiro)
- H1 medidor de contexto: lê `usage` do transcript e devolve tokens da sessão. Teste com transcript sintético.
- H2 hook de limite 100k/150k (usa H1).
- H3 selo e gates de commit/push; aviso no `SessionStart`.
- H4 `run.py preflight` e escolha da próxima tarefa.
- H5 `run.py tarefa`: sessão de execução, revisor, commit, uso, progresso.
- H6 resumo estruturado e retomada em sessão nova.
- H7 modo nuvem (mesmo código; variáveis e caminhos).
- H8 `VERSAO.md`, `AGENTS.md`, `CLAUDE.md`, CI `harness.yml`.

## Critérios de aceite
- Sessão de uma tarefa nunca passa de 150k tokens de contexto; teste prova o corte.
- Commit e push sem selo falham; com selo passam.
- Teste de ponta a ponta com `claude` simulado (stub) percorre preflight, tarefa, revisão e commit.
- O consumo por tarefa aparece em `harness/uso/` com o id da tarefa.

## Pendências
- Confirmar na documentação oficial o suporte a limitar a janela de contexto por sessão (variante de 1M).
- Registrar as três decisões na memória compartilhada (só a orquestração grava; o id é o próximo livre, pois "D-074" já existe e colide com o citado no PR do registro de uso).
- Aprovação desta spec pelo dono antes de qualquer código.
