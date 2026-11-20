# AGENTS.md: manual de operação para qualquer agente de código

Vale igualmente para Claude Code, Google Antigravity e GitHub Copilot. Os agentes se revezam quando a cota de um acaba; a continuidade está nos arquivos deste repositório, não na memória de nenhum deles. O `CLAUDE.md` complementa este arquivo com detalhes do projeto e vale para todos.

@.specify/memory/constitution.md

## 1. Ritual de início (obrigatório, antes de qualquer edição)
1. `bash harness/init.sh`: ambiente, git, estado SDD dos projetos e últimas sessões. Ele também ativa os hooks do git em `.githooks/`.
2. `python3 harness/memoria.py ler`: decisões do dono em vigor. Elas prevalecem sobre qualquer briefing.
3. Identifique o seu projeto em `harness/estado.json` pelo branch e leia `specs/<chave>/` (spec, plano, tarefas).
4. Rode os testes do projeto. Só comece com o estado verde.
5. Se a sua conversa já tem contexto antigo (sessão retomada depois de horas, ou memória alterada), recomece a partir de um resumo estruturado: branch e último commit; o que está pronto e testado; o que falta; ids das decisões aplicadas; perguntas abertas.

## 2. Regras inegociáveis
- **Constituição** (`.specify/memory/constitution.md`): SDD, testes primeiro, segurança por padrão, custo consciente, privacidade.
- **Decisões do dono:** escopo, produto, orçamento, cloud comparativa, projeto de IA aplicada, merge, publicação e valores de variáveis ou secrets são dele. Nunca assuma. Silêncio não é resposta.
  - **Onde perguntar:** registre a pergunta no PR, na seção `## Perguntas ao dono`, com a tabela `| id | pergunta | bloqueia | opções | recomendação |`. A orquestração leva a pergunta ao dono no chat, onde ele responde por múltipla escolha, com a boa prática e o tradeoff de cada opção (D-041). O dono não responde no PR.
- **Decisões técnicas e de processo** são delegadas: siga as boas práticas da prova Claude Certified Architect – Foundations. Ao explicar uma decisão ao dono, diga o nome da boa prática, o que o arquiteto faz e o erro comum que ela evita, sem citar só códigos da prova (D-036). Os ids ficam nos ADRs, ao lado do nome.
- **Privacidade:** nada do curso, do aluno ou das empresas em que o dono trabalha. Só fontes públicas e dados sintéticos. Segredos nunca entram no repositório.

## 3. SDD: como todo projeto é construído
especificar → esclarecer → planejar → tarefas → analisar → implementar → verificar → publicar

- Os artefatos ficam em `specs/<chave>/`, a partir dos templates em `.specify/templates/`.
- **Como seguir cada fase:**
  - Claude Code: skills em `.claude/skills/`.
  - Antigravity: as mesmas skills em `.agents/skills/`.
  - Copilot: leia o `SKILL.md` da fase em `.claude/skills/<fase>/`.
- **Mudança de fase:** só com `python3 harness/estado.py avancar <chave> <fase>`. A fase só avança se os artefatos existirem.
- **Código antes da fase `implementar` é bloqueado em todo agente:** pelo hook do Claude Code, pelo `pre-commit` do git e pelo CI.
- **Na implementação:** uma tarefa de `tasks.md` por vez, teste vermelho antes do código, um commit por tarefa e a tarefa marcada `[x]`.

## 4. Ao terminar ou antes de parar
- Faça commit do que estiver verde. Nunca deixe trabalho só na memória da conversa.
- Acrescente uma linha em `harness/progresso.md`: `- data · projeto · agente (modelo) · feito · testes · próxima tarefa`.
- O push só sai se a memória compartilhada lida for a mais recente (`pre-push`). Se for bloqueado, leia a novidade, ajuste e repita.
- **Branch já mergeado não recebe commit novo** (D-032). O `pre-push` bloqueia o envio. Crie um branch novo a partir do `main`, traga os commits com cherry-pick e abra um PR novo.

## 5. Troca de agente quando a cota acaba
- **Quem perceber o esgotamento** (você mesmo, se ainda puder agir, o dono ou a orquestração) registra:
  `python3 harness/agente.py marcar <claude-code|antigravity|copilot> --ate AAAA-MM-DDTHH:MM --motivo "..."`
- **Para saber quem assume e com qual modelo:**
  `python3 harness/agente.py proximo --tarefa <arquitetura|codigo|seguranca|analise-sdd|especificacao|pesquisa|post|teste|mecanica> --projeto <chave>`
  Ele imprime o agente, o modelo de qualidade equivalente para o nível da tarefa, como iniciar e o prompt de passagem.
- **Equivalência de modelos** (`harness/agentes.json`, D-028): por nível (máximo, equilibrado, rápido) e por família. O principal é o Claude Code, com a assinatura Pro do dono; na troca, o Antigravity usa Gemini e o Copilot usa modelos da OpenAI.
- **Escreva skills e prompts sem depender de recurso exclusivo do Claude,** para funcionarem igual nas três famílias.
- O agente que assume começa pelo ritual da seção 1. Nada do agente anterior é necessário além do que está commitado.

## 6. Modelos por tipo de trabalho
- **Nível máximo:** arquitetura, código de produção, segurança e análise SDD.
- **Equilibrado:** pesquisa, posts, testes a partir de regras escritas e site.
- **Rápido:** tarefas mecânicas.
- Revisão independente roda em outra instância (ou outro agente), nunca na que escreveu.

## 7. Infraestrutura real: subir, demonstrar, destruir
- O uso é demonstração de um dia. O teto do projeto é `teto_diario_usd` no `harness/estado.json`, e o limite mensal da conta é US$ 20.
- Todo projeto com `infra_real: true` tem workflow de apply com `prazo_horas` e workflow de destroy com `confirm_stack`. O ponto de partida está em `harness/modelos/`.
- `python3 harness/infra.py status` mostra o que está no ar e quando expira.
- `python3 harness/infra.py estender <chave> --horas N` adia o destroy automático, sem passar de 24 horas desde o apply. O destroy roda sem aprovação no ambiente `aws-lab-destroy`.
- Nunca rode apply numa conta real por conta própria: o apply é disparado pelo dono, no ambiente protegido.

## 8. Especialistas por tarefa fim
- Cada tipo de tarefa tem um especialista em `harness/especialistas.json`; o catálogo legível está em `harness/AGENTES.md`.
  - **Claude Code:** subagentes em `.claude/agents/`.
  - **Copilot:** agentes customizados em `.github/agents/`.
  - **Antigravity:** assuma o papel do arquivo do especialista e use as skills listadas em `.agents/skills/`.
- `python3 harness/agente.py proximo --tarefa <tipo>` diz o agente de código, o modelo e o especialista.
- O especialista faz uma tarefa e devolve o relatório da skill `regras-do-especialista`. Ele não cria subagentes.
- **Execução autônoma** (D-047): siga `.claude/skills/executar-tarefas/SKILL.md`.
  - **Antigravity:** a cópia está em `.agents/skills/`.
  - **Ciclo de cada tarefa:** especialista → revisor diferente → commit só do que foi aprovado.
  - **Interrupção:** só pelos critérios da skill.
  - **Nunca:** push com força, push no `main`, merge, nem apply ou destroy fora do Floci.
- **Delegação dentro do plano aprovado** (D-033): com o `plan.md` aprovado pelo dono, a orquestração delega as tarefas das fases tarefas, analisar, implementar e verificar sem aprovar cada disparo.
  - Antes de delegar ou de assumir o papel de um especialista, rode `python3 harness/estado.py pode-delegar <chave>`. Se der `NÃO`, peça a aprovação do dono para aquele disparo.
  - O briefing começa com `Projeto: <chave>`. Um disparo avulso aprovado pelo dono leva `Aprovação do dono: <palavras dele e quando>`.
  - A aprovação do plano só é registrada depois que o dono aprova: `python3 harness/estado.py aprovar-plano <chave> --fonte "..."`. Plano alterado depois disso exige nova aprovação.
  - No Claude Code, o hook `gate_delegacao.py` aplica a regra.
- **Decisão do dono vira regra ou skill no mesmo turno** (D-025). Use a skill `decisao-do-dono`.
