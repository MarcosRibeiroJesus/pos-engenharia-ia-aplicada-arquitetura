# Memória compartilhada: histórico de decisões

Registro completo, do mais novo para o mais antigo. Cada entrada traz data, id e fonte:
- "Marcos": ele decidiu.
- "delegada": decisão técnica ou de processo tomada pela orquestração com base nas boas práticas da prova, conforme a D-014.

Quando uma decisão substitui outra, a nova diz qual substitui. Nada é apagado.

### 2026-11-20 · D-041 · Perguntas ao dono só no chat, com a boa prática e os tradeoffs · fonte: Marcos
O Marcos não entendia se devia responder às perguntas da seção `## Perguntas ao dono` dos PRs. Ele pediu: "Me pergunte sempre por aqui com múltipla escolha e sempre com explicação do porque como isso é tratado no exame de certificação e os tradeoffs".
- **No chat:** toda pergunta usa o `AskUserQuestion`. O enunciado traz `Boa prática:` (o nome da prática, o que o arquiteto faz e o erro comum que ela evita, como na D-036), e cada opção traz o seu tradeoff.
- **No PR:** a seção vira só registro. As sessões sem o dono a usam; a orquestração coleta, leva ao Monday e pergunta no chat.

**Aplicado em:**
- hook `.claude/hooks/gate_pergunta.py` (PreToolUse em AskUserQuestion), que nega a pergunta fora do formato, registrado em `.claude/settings.json`;
- `CLAUDE.md` (Perguntas ao dono) e `AGENTS.md` (regras inegociáveis);
- skill `decisao-do-dono`;
- teste `TestPerguntaAoDono`;
- PR #22: a pergunta D00-P3, já respondida no chat, foi marcada como respondida.

### 2026-11-20 · D-040 · Emenda 2 do plano da plataforma aprovada · fonte: Marcos
O Marcos aprovou a emenda 2 com a condição de que ela fosse só o alinhamento de texto: "Se for só isso pode mudar e já aprovo o plano". O diff confirmou três trechos, o cabeçalho e a seção da emenda:
- a entrada do motor anulável no gateway (ADR-0011);
- a ativação única da tag no lugar de "48 h antes" (D-039);
- a mitigação do R2.

**Aplicado em:**
- `plan.md`, seção "Emenda 2";
- `harness/estado.json`, `plano_aprovado` com o novo hash;
- análise independente, rodada 2, disparada em seguida.

### 2026-11-20 · D-039 · Ativação única da tag de custo, assim que possível · fonte: Marcos
O Marcos respondeu à P00-P9 depois de entender que a ativação da chave `project` como tag de alocação de custo vale para a conta inteira: ela é feita uma única vez, assim que a chave aparecer no Billing.
- **Por que muda a D-034:** o "pelo menos 48 h antes" só vale na primeira vez. Depois disso, nenhuma demonstração espera.
- **Fonte:** AWS Billing, *Activating user-defined cost allocation tags*. A chave leva até 24 h para aparecer e mais até 24 h para ativar, e a ativação vale para todos os valores da chave.

**Aplicado em:**
- skill `ciclo-demonstracao`;
- aviso do passo "Pré-requisitos da conta" em `harness/modelos/apply.yml` e no apply da plataforma;
- teste `test_ativacao_da_tag_de_custo_e_unica_na_conta`;
- T053, T084 e T086 da plataforma, nas correções da análise 1;
- Monday: o card do envio manual foi atualizado.

### 2026-11-20 · D-038 · Emenda 1 do plano da plataforma aprovada; teto mantido · fonte: Marcos
O Marcos aprovou o plano com a emenda 1, que fecha as lacunas F1 a F5:
- o teste de fumaça só do gateway;
- o ensaio de um dia só da plataforma;
- valores sintéticos do motor de política no Floci;
- a role e o workflow de evidências.

Ele também manteve o teto diário em US$ 1,20 (P00-P8), sobre uma estimativa de US$ 1,08.

**Aplicado em:**
- `harness/estado.json`: `plano_aprovado` com o novo hash, `teto_diario_usd` igual a 1.2 e as decisões D-036 a D-038 no projeto;
- `plan.md`: status no cabeçalho e P00-P8 respondida, a única edição depois da aprovação, registrada na fonte;
- análise independente (`sdd-analisar`) disparada em seguida.

### 2026-11-20 · D-037 · Plataforma com página e post próprios · fonte: Marcos
O Marcos respondeu à P00-P7: a `00-plataforma-agentes` ganha página e post próprios, como os projetos das disciplinas. A recomendação era só uma seção na página da D03.
Na mesma rodada, ele autorizou a emenda 1 do plano ("Corrigir agora"). A nova aprovação do plano continua pendente.

**Aplicado em:**
- skill `site-projeto` (página em Arquiteturas AWS, post em `plataforma/agentes/posts/aws.md`, links cruzados com os produtos);
- `CLAUDE.md` (seção Site);
- teste `TestPublicacaoDaPlataforma`;
- `tasks.md` da plataforma, pela emenda 1 (T089 é o post e T090 é a página);
- Monday: o card P00-P7 foi fechado.

### 2026-11-19 · D-036 · Explicar decisões pelo nome da boa prática e pelo erro comum · fonte: Marcos
O Marcos pediu que, em vez de falar os códigos dos pontos da prova, a explicação diga o nome da boa prática, o que o arquiteto decide seguindo-a e os erros comuns que as pessoas cometem.
- **Alcance:** as explicações ao dono (conversa, PRs e relatórios dos especialistas).
- **O que fica:** os ids continuam nos ADRs (constituição, Art. VII) e na memória, ao lado do nome, para rastreio.

**Aplicado em:**
- `CLAUDE.md` (decisões delegadas) e `AGENTS.md` (regras inegociáveis);
- skill `regras-do-especialista`, que define o formato do relatório de todo especialista;
- teste `TestComoExplicarDecisoes` em `harness/test_harness.py`.

### 2026-11-19 · D-035 · Plano da plataforma de agentes aprovado · fonte: Marcos
O Marcos aprovou o plano da `00-plataforma-agentes` (P00-P6, PR #24): dois states por ciclo de vida, módulo `registro-produto`, 10 ADRs e teto diário de US$ 1,20.

**Aplicado em:**
- `harness/estado.json`, campo `plano_aprovado` com o hash do `plan.md`. Esse registro libera a delegação nas fases tarefas, analisar, implementar e verificar (D-033), e um plano alterado depois exige nova aprovação;
- Monday: o card P00-P6 foi fechado.

### 2026-11-19 · D-034 · Plataforma: primeiro consumidor, configurações da conta e alarmes · fonte: Marcos
O Marcos respondeu às P00-P3, P00-P4 e P00-P5 com as recomendações ("responda tudo com o recomendado").
- **P00-P3:** o primeiro consumidor é a D03 (MCP de regras do CDB). Ela exercita o gateway e a política Cedar de ponta a ponta (2.1, 2.4, 1.4). O risco é a versão de MCP aceita pelo gateway diante da lane de compatibilidade da D03.
- **P00-P4:** caminho misto.
  - A tag `project` como tag de alocação de custo e o Transaction Search do CloudWatch vão por Terraform no `infra/conta`, aplicado por ele. A tag fica ativa pelo menos 48 h antes da demonstração.
  - O caso de uso da Anthropic vai à mão, por ele, porque é um termo aceito em seu nome, e só se o modelo for anterior ao Claude Opus 4.7.
- **P00-P5:** os alarmes da plataforma vão para os mesmos e-mails de `emails_alerta` do `infra/conta`, sem variável nova.

**Aplicado em:**
- gate em `harness/estado.py` (`checar_apply` exige a conferência da tag de custo em todo apply) e o passo "Pré-requisitos da conta" em `harness/modelos/apply.yml` e no apply da plataforma, que só avisa;
- skills `ciclo-demonstracao` (o que fazer antes da primeira demonstração com Claude) e `plataforma-agentes` (primeiro consumidor e alarmes);
- testes em `harness/test_harness.py` (`TestPreRequisitosDaConta`);
- spec e plano da `00-plataforma-agentes`, pelo arquiteto-aws, no branch `plataforma/00-plataforma-agentes-plano`;
- Monday: P00-P3 a P00-P5 fechados e um card para o envio manual do caso de uso.

### 2026-11-19 · D-033 · Delegação aos especialistas dentro do plano aprovado · fonte: Marcos
O Marcos respondeu a P00-P1: dentro de um plano SDD aprovado por ele, os especialistas podem ser disparados sem aprovar cada disparo.
- **Alcance:** vale para as fases tarefas, analisar, implementar e verificar de um projeto cujo `plan.md` ele aprovou. Ficam de fora:
  - plano não aprovado ou alterado depois da aprovação;
  - fases especificar, planejar e publicar;
  - tarefa fora de projeto.
  
  Nesses casos, cada disparo continua pedindo a aprovação dele. O gate `sdd-analisar`, o merge e a publicação seguem com ele.
- **Por que assim:** a aprovação fica no artefato, não no disparo. O registro guarda o hash do `plan.md`, então um plano que mudou não herda a aprovação antiga. É um gate programático, não uma instrução que se esquece (1.4). Cada especialista continua com uma tarefa e um briefing completo, que declara o projeto (1.2, 1.3).

**Aplicado em:**
- `harness/estado.py`: `aprovar-plano`, `pode-delegar` e a validação do campo `plano_aprovado`;
- hook `.claude/hooks/gate_delegacao.py` (PreToolUse em Agent e Task), registrado em `.claude/settings.json`;
- `CLAUDE.md` (orquestração de subagentes) e `AGENTS.md` (seção 8, para Antigravity e Copilot);
- skills `sdd-planejar` (passo 8, aprovação do plano), `sdd-analisar` (correção que muda o plano derruba a aprovação) e `decisao-do-dono`;
- testes em `harness/test_harness.py` (`TestDelegacaoNoPlanoAprovado`);
- spec `00-plataforma-agentes` (P00-P1 respondida).

### 2026-11-19 · D-032 · PR mergeado não recebe commit novo · fonte: delegada
- **O que aconteceu:** os commits do D-031 ficaram fora do `main` porque o #17 e o #9 foram mergeados enquanto a orquestração ainda empurrava nos mesmos branches. Antes disso, o #16 já tinha sido mergeado sem os últimos commits.
- **A regra:** mudança depois de um PR anunciado como pronto vai em PR novo, a partir do `main`, e só se empilham PRs com dependência real.
- **A trava:** `harness/branch_mergeado.py` no `pre-push`, para qualquer agente. Ela bloqueia quando o topo anterior do branch remoto já está no `origin/main` e mostra como seguir. É uma trava no git, não uma instrução, que pode ser esquecida (1.4, 5.3).

### 2026-11-19 · D-031 · Padrão de tags na política do Infracost · fonte: Marcos
O Marcos adotou a recomendação de trocar a política de tags de exemplo do Infracost Cloud (`Service` e `Environment`) pelo padrão do repositório, com regras bloqueantes no PR:
- `project`: regex `^[0-9]{2}-[a-z0-9]+(-[a-z0-9]+)*$`, a chave do projeto;
- `module`: regex `^[a-z0-9]+(-[a-z0-9]+)*$`;
- `managed-by`: lista com `terraform`.

Recursos fora do padrão são corrigidos: o `infra/conta` passa a `00-conta`, e a D01 troca `recsys` por `01-recomendacao` na spec retroativa.
**Aplicado em:**
- constituição (Art. VI) e `CLAUDE.md` (isolamento por tag);
- skill `terraform-tdd`;
- `harness/modelos/tags.tftest.hcl` e template de tarefas (T001);
- teste de consistência do regex com o caminho padrão (`test_harness.py`);
- `infra/conta` no PR #9: tags, nome com prefixo e testes dos valores.

### 2026-11-19 · D-030 · Plataforma de agentes compartilhada e caminho padrão · fonte: delegada (o Marcos delegou a escolha dos componentes)
- **Na plataforma** (projeto `00-plataforma-agentes`), escolhidos por caberem no modelo de uso e no limite de US$ 20:
  - gateway MCP (AgentCore Gateway) com política Cedar e Identity: um ponto de controle de tools, nega por padrão (1.4, 2.1, 2.4);
  - guardrails do Bedrock e perfil de inferência de aplicação por produto, para defesa contra injeção e custo atribuído por tag (5.2);
  - observabilidade e evals por uso (AgentCore Observability e Evaluations), com o gate de CI seguindo nas respostas gravadas (4.6, 5.5).
  - A plataforma sobe e desce com as demonstrações.
- **Fora:**
  - memória de longo prazo (fica no produto que precisar);
  - gateway de inferência sempre ligado e Langfuse hospedado (custo fixo; Langfuse segue pendente na D02);
  - multi-conta.
- **Caminho padrão:** `harness/novo_projeto.py` coloca todo projeto novo na mesma esteira (estado, spec, workflows de apply e destroy) sem criar código antes da fase implementar. É a prática central de plataforma interna de desenvolvimento do AWS Prescriptive Guidance.

### 2026-11-19 · D-029 · Conta AWS única, isolamento por tag · fonte: Marcos
Plataforma e produtos na mesma conta, separados por prefixo, tag `project` e políticas IAM.
**Aplicado em:** constituição (Art. VI), `CLAUDE.md` (Segurança e FinOps), skill `terraform-tdd` (regra de isolamento com ABAC), skill `novo-projeto`, spec `00-plataforma-agentes` (RNF-004).

### 2026-11-19 · D-028 · Acesso híbrido aos modelos · fonte: Marcos
O harness roda agora com a assinatura Pro do Claude Code, trocando para Antigravity (Gemini) ou Copilot (OpenAI) quando a cota acaba. Na AWS rodam só a plataforma e os agentes dos produtos, durante as demonstrações, com o Claude via Bedrock.
**Aplicado em:**
- `harness/agentes.json`: modelos Gemini e OpenAI e a nota;
- `AGENTS.md` (seção 5) e `CLAUDE.md` (Acesso aos modelos);
- skills `componente-claude` e `plataforma-agentes`;
- spec `00-plataforma-agentes` (RNF-005).

### 2026-11-19 · D-027 · Pacote npx depois da versão estável · fonte: Marcos
Não criar o pacote npx agora: primeiro criar e testar o harness até uma versão estável e testada.
**Aplicado em:** `harness/VERSAO.md` (versão 0.5.0 e critérios da 1.0), skill `evolucao-do-harness`, especialista `operador-harness`.

### 2026-11-19 · D-026 · Agentes especialistas e skills de mercado · fonte: delegada
- **Um especialista por tarefa fim** (18), definidos em `harness/especialistas.json` e gerados para o Claude Code (`.claude/agents/`) e o Copilot (`.github/agents/`).
  - Cada um recebe só as skills da tarefa, pré-carregadas pelo campo `skills`. Isso mantém poucas ferramentas e pouco contexto por agente (2.3, 5.1).
  - O modelo é o do nível da tarefa, e o relatório tem formato fixo (`regras-do-especialista`), com erros e pendências explícitos (5.3).
- **Subagente não cria subagente:** `disallowedTools: Agent` em todo especialista, mais `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH=1`. A regra do `CLAUDE.md` vira gate (1.2, 1.4).
- **Skills de mercado por plugin do próprio publicador,** sem copiar para o repositório:
  - Anthropic, HashiCorp, Trail of Bits, promptfoo, Google; AWS e Microsoft vêm pelo marketplace oficial da Anthropic.
  - Assim seguem a licença e as atualizações de cada um; as document-skills da Anthropic têm licença restrita.
  - Só 5 ficam ligados no projeto (terraform, mcp-server-dev, security-guidance, pr-review-toolkit, promptfoo); os demais se instalam sob demanda, para não encher o contexto de toda sessão (5.1).
- **Fora do padrão:** superpowers e feature-dev, porque impõem um fluxo próprio que compete com o SDD.
- **Revisão independente:** `analista-sdd`, `revisor-independente` e `avaliador-llm` não corrigem o que revisam (4.6).

### 2026-11-19 · D-025 · Decisão do dono vira regra ou skill · fonte: Marcos
Toda decisão que só o Marcos pode tomar gera, no mesmo turno, regras ou skills novas com relação direta.
**Aplicado em:** `CLAUDE.md` (Decisões do dono), `AGENTS.md` (seção 8), skill `decisao-do-dono`, `harness/memoria.py auditar` no workflow `harness.yml`.

### 2026-11-19 · D-024 · Destroy automático em até 24 h, sem aprovação · fonte: Marcos
O destroy roda sozinho em até 24 horas do apply, sem esperar aprovação. Isso responde à pergunta H-P1 com a opção recomendada: um ambiente próprio do destroy, sem aprovação e restrito ao `main`.
**Aplicado em:** constituição (Art. V), `CLAUDE.md`, `AGENTS.md` (seção 7), `harness/infra.py` (prazo máximo de 24 h, também ao estender), `harness/modelos/destroy.yml` (ambiente `aws-lab-destroy`), skill `ciclo-demonstracao`.

### 2026-11-19 · D-023 · Mecânica do teto diário e do prazo de vida · fonte: delegada
- **Gate de FinOps:** compara o custo de 24 horas com o teto do projeto. Custo de um dia = custo mensal do Infracost × 24/730.
  - Com o custo mensal, a D01 com MWAA seria barrada mesmo custando poucos dólares no dia da demonstração.
  - Sem teto calculado, o gate só avisa. Bloqueia mesmo sem teto quando um dia sozinho passa do limite mensal da conta (1.4).
- **Prazo no branch `infra-no-ar`,** gravado por plumbing do git, com o mesmo padrão da memória e da disponibilidade dos agentes. É visível a qualquer agente e máquina, sem credencial AWS para ler (5.1).
- **O destroy automático reusa o workflow de destroy do projeto** (com `confirm_stack` e verificação de sobras), em vez de um caminho paralelo. Assim um caminho só é testado e auditado.
- **Redisparo e estado de erro:** se o registro continuar 3 horas depois do disparo, o agendador dispara de novo. Um destroy que falha deixa o registro, e esse é o estado de erro visível (5.3).
- **Validação no `estado.py`:** reprova o projeto sem teto a partir de `tarefas` e sem apply ou destroy completos a partir de `verificar`. É um gate programático, não uma instrução (1.4).

### 2026-11-19 · D-022 · Limite mensal da conta e destroy automático · fonte: Marcos
- **Limite mensal:** o US$ 20 da D-020 passa a ser o limite mensal da conta, num AWS Budgets mensal que soma todas as demonstrações. O gate do PR usa o teto diário de cada projeto.
- **Destroy automático:** destroy automático com prazo. O apply informa o prazo (padrão 24 horas, dá para estender); um workflow agendado avisa uma hora antes e roda o mesmo destroy, com verificação de sobras.
**Aplicado em:** constituição (Art. V), `CLAUDE.md`, `infra/conta` (Budgets mensal, PR #9), `seguranca.yml` (`CUSTO_MAX_MENSAL_USD`), `harness/infra.py`, `expirar-infra.yml`, `harness/modelos/`, skills `custo-diario` e `ciclo-demonstracao`.

### 2026-11-19 · D-021 · Teto de um dia e destroy obrigatório · fonte: Marcos
- **Uso da infraestrutura real:** subir a arquitetura, ver em ação, gravar um vídeo curto e destruir tudo.
- **Teto de cada projeto:** o valor estimado de cobrança de um dia de execução. Substitui os tetos mensais por disciplina (D03 tinha US$ 10/mês).
- **Workflow de destroy:** obrigatório em todo projeto de infraestrutura real.
**Aplicado em:** constituição (Art. V), `CLAUDE.md` (Engenharia), `harness/estado.json` (`infra_real`, `teto_diario_usd`, `destroy_workflow`), `harness/estado.py validar`, templates de spec, plano e tarefas, skills `sdd-planejar`, `sdd-analisar`, `custo-diario` e `ciclo-demonstracao`, `gate_custo.py` (PR #9).

### 2026-11-19 · D-020 · Teto do gate de FinOps · fonte: Marcos
O teto padrão do gate de custo por PR cai de US$ 50 para US$ 20 por mês. O significado mudou na D-022: o valor passou a ser o limite mensal da conta. O pedido veio em comentário no card do Monday: remover o teto de US$ 50 imediatamente e definir US$ 20. Os tetos de lab por disciplina são outra decisão e continuam como estavam: a D03 em US$ 10, e a D01 e a D02 pendentes.

### 2026-11-19 · D-019 · Harness agnóstico de agente · fonte: delegada
- **`AGENTS.md` canônico na raiz**, importado pelo `CLAUDE.md`. O Antigravity e o Copilot leem esse arquivo, e as skills ficam espelhadas em `.agents/skills/` (3.1, 3.2).
- **Gates no git e no CI, não só em hooks do Claude Code.** Os hooks só valem dentro do Claude Code; o `pre-commit`, o `pre-push` e o workflow `harness.yml` valem para qualquer agente (1.4, 3.6).
- **Disponibilidade compartilhada no branch `agentes-status`**, gravada por plumbing do git, com o mesmo padrão da memória. Qualquer máquina e qualquer agente leem o mesmo estado (5.1).
- **Roteamento por nível da tarefa:** cada agente tem um modelo equivalente para cada nível. A paridade usa modelos Claude também no Antigravity e no Copilot quando disponíveis, para as skills se comportarem igual.
- **Ordem por nível:**
  - Nível máximo: Claude Code primeiro.
  - Tarefas mecânicas: Copilot primeiro, para poupar a janela do Claude.
- **A marcação de cota esgotada é explícita.** Um agente sem cota não consegue se reportar, então quem percebe marca: o próprio agente, o Marcos ou a orquestração. O failover assíncrono pelo Copilot cloud agent fica para a fase 4, junto com a fila de issues (5.2, 5.3).

### 2026-11-19 · D-018 · Troca de agente quando a cota acaba · fonte: Marcos
O harness controla a troca entre Claude Code, Antigravity e Copilot quando a cota de um acaba. O agente que assume usa o modelo de qualidade equivalente mais indicado para a tarefa, e a memória é compartilhada entre os agentes.

### 2026-11-19 · D-017 · Harness fase 1 · fonte: delegada
- **Continuidade em arquivos** (estado.json, progresso.md, init.sh e ritual `retomar`), não em chat. É o padrão de harness para agentes de longa duração da Anthropic (1.7, 5.1).
- **Gate de SDD por hook:** uma instrução pode ser ignorada; o gate garante o Artigo I (1.4, 1.5).
- **Análise feita por subagente independente,** porque quem escreveu a spec não enxerga as próprias lacunas (4.6).
- **Uma tarefa por sessão,** para o trabalho caber no contexto e cada passo ser verificável (1.6).
- **Uso de tokens num arquivo por sessão,** para que sessões em paralelo não gerem conflito.
- **Spec Kit:** a mesma estrutura de arquivos, implementada no próprio harness; o CLI pode ser adotado depois sem migração.

### 2026-11-19 · D-016 · SDD obrigatório em todos os projetos · fonte: Marcos
Todo projeto passa por especificar → esclarecer → planejar → tarefas → analisar → implementar → verificar → publicar. Os projetos em andamento (D01, D02, D03) fazem a spec retroativa antes de novas mudanças. O harness com SDD deve ser reutilizável em outros projetos.

### 2026-11-19 · D-015 · Gate de entrega, retomada e perguntas no PR · fonte: delegada
- **Gate de entrega:** um hook `PreToolUse` nega push e PR enquanto a sessão não recebeu a memória mais recente. Uma instrução no prompt pode ser ignorada; o hook garante que nenhuma entrega sai com decisão velha (tarefas 1.4 e 1.5).
- **Proteção da fonte:** só a orquestração escreve no branch de memória (1.2).
- **Retomada:** sessão parada mais de 8 horas, ou com memória alterada, recomeça com resumo estruturado. Retomar sobre resultados de ferramenta antigos leva a decisões com dados velhos (1.7, 5.1).
- **Perguntas:** vão em tabela no corpo do PR e são coletadas pela orquestração para o Monday. É um canal estruturado de escalonamento, para nenhuma pergunta ficar presa na interface de uma sessão (5.2).
- **Memória em dois arquivos:** estado curto mais histórico. O contexto é orçamento, e o bloco de fatos que sempre entra precisa ser pequeno (5.1).
- **Proveniência:** cada entrada passa a ter fonte (5.6).

### 2026-11-19 · D-014 · Decisões técnicas e de processo delegadas · fonte: Marcos
A orquestração toma, sem pedir aprovação, as decisões técnicas e de processo sobre como construir com Claude, segundo as boas práticas da prova CCAR-F e na ordem recomendada. Sempre explica o porquê, com os ids das tarefas.

Continuam com o Marcos:
- escopo e produto;
- orçamento e custos reais;
- cloud comparativa;
- projetos de IA aplicada;
- merge e publicação;
- variáveis, secrets e configurações da conta dele.

### 2026-11-19 · D-013 · Floci fixado por tag de versão · fonte: Marcos
Tag em vez de `latest` ou digest. Recomendada `floci/floci:2.5.0`, a versão que o ambiente de nuvem roda. Workflows e scripts leem `FLOCI_IMAGE`, com fallback.

### 2026-11-19 · D-012 · Variáveis e secrets novos · fonte: Marcos
Quando o Marcos criar uma variável ou um secret, troque sem pedir confirmação em todo lugar que depende dele, com fallback seguro. Criar a variável e escolher o valor são dele.

### 2026-11-19 · D-011 · D03: versão do MCP e teto · fonte: Marcos (respondido na sessão D03)
MCP 2026-07-28, sem estado, com lane de compatibilidade para clientes antigos. Teto do lab: US$ 10/mês.

### 2026-11-19 · D-010 · Plano de orquestração aprovado · fonte: Marcos
Onda 1: D01 recomendação (o Marcos retoma a sessão), D02 assistente de agendamento e D03 MCP do CDB. Onda 2: D01 Doom. Sessões em Opus, com subagentes Sonnet e Haiku.

### 2026-11-19 · D-009 · Uma arquitetura e um projeto de IA aplicada por disciplina · fonte: Marcos
Substitui o formato "por unidade". As opções por unidade dos `OPCOES.md` ficam só como referência.

### 2026-11-19 · D-008 · Escolhas das arquiteturas D01 a D03 · fonte: Marcos
- D01: recomendação de e-commerce.
- D02: assistente de agendamento completo, que junta gateway com fallback, grafo de etapas, intenção em JSON, cancelamento com aprovação humana, memória, defesa contra prompt injection e avaliações.
- D03: MCP de regras do produto sintético CDB com liquidez diária.

### 2026-11-19 · D-007 · Cloud comparativa · fonte: Marcos
GCP na D01 e na D02, Azure na D03.

### 2026-11-19 · D-006 · Sem Claude real nos testes · fonte: Marcos
Os testes do componente Claude usam só respostas gravadas. Cada projeto registra em ADR que o comportamento real do modelo fica sem validação.

### 2026-11-19 · D-005 · Escopo · fonte: Marcos
Foco nas disciplinas 01, 02 e 03; a D04 fica para depois.

### 2026-11-19 · D-004 · Nunca assumir escolhas do Marcos · fonte: Marcos
Silêncio, pergunta pulada ou "sem objeção" não são resposta. Está no `CLAUDE.md` e no hook `sem_suposicoes.py`.

### 2026-11-19 · D-003 · Histórico do git não será reescrito · fonte: Marcos
Sem force push no `main`.

### 2026-11-18 · D-002 · Modelo por tarefa e registro de uso · fonte: Marcos
Opus, Sonnet e Haiku conforme o tipo de trabalho; Fable só com aprovação. Uso de tokens registrado em `docs/uso/uso-tokens.csv` e no app `apps/painel-ia`.

### 2026-11-18 · D-001 · Privacidade e material do curso · fonte: Marcos
Nada do curso nem dados do aluno no repositório. Nenhum detalhe das empresas em que o Marcos trabalha. Só fontes públicas e dados sintéticos.
