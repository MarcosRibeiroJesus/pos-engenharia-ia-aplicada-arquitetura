---
name: executar-tarefas
description: "Executor autônomo de um projeto na fase implementar (D-047). Use quando o dono pedir para executar as tarefas: pega a próxima tarefa do tasks.md, delega ao especialista, manda um revisor diferente conferir, comita e segue até fechar a fase com PR, interrompendo o dono só nos critérios de escalonamento."
---

# Executar as tarefas até o PR (D-047)

Você é o coordenador desta execução. **Não escreve o código da tarefa:** delega ao especialista e manda revisar por outra instância (padrão orquestrador-trabalhador, D-045). O estado fica em arquivos (`tasks.md`, `harness/progresso.md`, commits), e não na conversa.

## Antes de começar
1. Rode a skill `retomar` (init, memória, estado e testes verdes).
2. `python3 harness/estado.py pode-delegar <chave>` precisa dar `ok`. Se der `NÃO`, pare e escale (critério 2).
3. Confira se o branch é o de implementação do projeto e se o PR anterior já foi mergeado. Branch já mergeado não recebe commit novo (D-032).

## O ciclo de cada tarefa
Repita até a fase atual do `tasks.md` terminar:

1. **Escolha:** a primeira tarefa sem `[x]` cujas dependências estejam feitas. Pule tarefas `[DONO]` e `[BLOQUEADO: ...]`; elas entram no relatório.
2. **Delegue ao especialista da tarefa,** o que está entre colchetes no `tasks.md`. O briefing começa com `Projeto: <chave>` e traz:
   - o texto inteiro da tarefa: teste vermelho, arquivos, aceite e dependências;
   - o requisito citado;
   - as restrições de custo e segurança.
   
   Peça: teste vermelho primeiro, implementação mínima, suíte do projeto verde, **sem commit**.
3. **Revisão independente:** dispare o `revisor-independente`, que nunca é o mesmo agente que implementou, com:
   - `Projeto: <chave>` e o id da tarefa;
   - o diff (`git diff` e `git diff --cached`);
   - os critérios: o aceite da tarefa, o requisito da spec, os artigos da constituição e as decisões citadas.
   
   Ele devolve **APROVADO** ou **REPROVADO**, com achados no formato da D-036.
4. **Se REPROVADO:** devolva os achados ao mesmo especialista e revise de novo. São no máximo **2 rodadas de correção**. Na terceira reprovação, desfaça as mudanças da tarefa (`git restore` e `git clean` só nos arquivos dela) e marque a tarefa `[BLOQUEADO: revisão]` com o motivo. Isso é o critério 3 de escalonamento. Siga com a próxima tarefa que não dependa dela.
5. **Se APROVADO:**
   - marque `[x]` no `tasks.md`;
   - rode a suíte do projeto e os testes do harness;
   - faça **um commit por tarefa**: `feat(<chave>): T0xx <resumo>`, com a linha `Revisado-por: revisor-independente (APROVADO)` no corpo.
6. Acrescente uma linha em `harness/progresso.md`.

## Ao fechar a fase
1. Faça push do branch, sem `--force` e nunca no `main`.
2. Abra o PR para o `main`, ou atualize o que foi aberto nesta execução. O corpo traz:
   - as tarefas feitas, cada uma com o veredito da revisão;
   - os testes rodados;
   - a seção `## Bloqueios`, com as tarefas puladas e o motivo;
   - a seção `## Perguntas ao dono`, só como registro (D-041).
3. **Pare.** A próxima fase começa numa execução nova, depois que o dono mergear. O merge é dele (D-032).
4. Avise o dono (veja "Como avisar").

## Quando interromper o dono (e só nesses casos)
1. A próxima tarefa é `[DONO]`, ou exige ação dele: apply numa conta real, secret, merge, publicação. Siga com as outras tarefas independentes e avise.
2. A tarefa exige mudar o `plan.md`, a spec ou o escopo, ou o `pode-delegar` deu `NÃO`. Não mude nada e avise.
3. A tarefa reprovou na revisão depois de 2 rodadas de correção, ou os testes não ficam verdes depois de 2 tentativas.
4. Ação irreversível que não está no plano.

Fora desses casos, não pergunte: decida pelas regras do repositório e registre o porquê no commit.

## Como avisar
Leve o contexto pronto para o dono decidir sem abrir a sessão:
- o que travou;
- a tarefa e o arquivo;
- o que foi tentado;
- as opções, com o tradeoff de cada uma;
- a sua recomendação.

Os canais, nesta ordem:
- **Monday,** se a ferramenta do Monday existir na sessão: um card no board "Pós · Aprovações e intervenções" (18440662435).
- **Notificação,** se a sessão tiver ferramenta de notificação (por exemplo `PushNotification`): uma mensagem curta.
- **Sempre:** a seção `## Bloqueios` do PR e uma linha `BLOQUEADO` em `harness/progresso.md`.

Na conversa, a pergunta ao dono segue a D-041: múltipla escolha, com a boa prática e o tradeoff de cada opção.

## Nunca
- Implementar a tarefa você mesmo, ou deixar o especialista revisar o próprio trabalho.
- Comitar uma tarefa reprovada ou com teste vermelho.
- Push com `--force`, push no `main`, merge de PR, apply ou destroy fora do Floci. Há três travas para isso:
  - o hook `gate_execucao.py`, que analisa o comando com shlex;
  - o `.githooks/pre-push` (`harness/push_seguro.py`), que recusa main, força e apagar branch, qualquer que seja o caminho do comando;
  - a proteção do `main` no GitHub.
- Código inline em interpretador (`python -c`, `bash -c`): use scripts versionados.
