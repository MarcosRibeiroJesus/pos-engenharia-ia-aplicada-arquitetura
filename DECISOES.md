# Memória compartilhada: estado atual

Lido por toda sessão no início e sempre que muda. Ele prevalece sobre briefings e branches. O porquê de cada item está em `HISTORICO.md` (ids D-xxx). Só a conversa de orquestração escreve aqui.

## Projetos

| Disciplina | Arquitetura AWS | IA aplicada | Cloud comparativa | Teto (custo de 1 dia) |
|---|---|---|---|---|
| D01 Fundamentos | Recomendação de e-commerce (PR #1), em desenvolvimento (D-064) | Doom, opção 04-C (D-059): calibrador do limiar com gate humano sobre YOLO em TF.js num Web Worker; rótulos pelo motor do jogo; não é aprendizado por reforço | GCP | calcular no plano |
| D02 APIs de IA generativa | Assistente de agendamento completo: emendar plano para consumo completo da plataforma (D-074, opção B do ADR-0003) | pendente (100% alinhado às aulas, D-074) | GCP | US$ 0,85 por dia (D-070) |
| D03 MCP | MCP de regras do CDB com liquidez diária; consumo 100% da plataforma (D-074); plano e análise aprovados (D-073, PR #46), fase implementar | pendente (100% alinhado às aulas, D-074) | Azure | US$ 0,50 por dia (D-073) |
| D04 Agentes autônomos | adiada | adiada | — | — |

## Regras ativas
- **Consumo completo da `00-plataforma-agentes` em todas as arquiteturas AWS e IA aplicada 100% fiel às aulas** (D-074): todo projeto de arquitetura AWS (`01-recomendacao`, `02-assistente-agendamento`, `03-mcp-regras-cdb` e seguintes) utiliza completamente a plataforma de agentes (AgentCore Gateway MCP, AgentCore Policy Engine com Cedar em `ENFORCE`, Bedrock Guardrails, Perfil de Inferência de Aplicação, Contrato SSM v1, alarmes no SNS da plataforma e AgentCore Evaluations), com foco em praticar conceitos e ferramentas de produção coerentes com os exemplos oficiais da AWS (âncora D-065), enquanto o projeto de IA aplicada de cada disciplina é 100% alinhado às aulas. Substitui o consumo parcial na D02 (opção A da D-070 passa para opção B — consumo completo com o executor no Gateway MCP e Cedar), estende a D01 para registrar também alvo e política Cedar no gateway, e dispensa a D03-P9 na arquitetura AWS da D03.
- **D03 (MCP de regras do CDB): plano aprovado e teto diário de US$ 0,50** (D-073): teto diário `teto_diario_usd = 0.50` com cota dura de 300.000 tokens no agente (D03-P7 = A); `plan.md`, ADRs 0001 a 0006 e `azure.md` aprovados pelo Marcos (D03-P11 = A, D-033); fase avançada para `tarefas`, com delegação liberada.
- **D03 (MCP de regras do CDB): respostas da spec e lane de compatibilidade** (D-071, D-072):
  - sem ingestão assistida por Claude nesta entrega; regras entram como dados versionados revisados no PR (D03-P1 = B);
  - inclui dados sintéticos de aplicações em JSON versionado validado por schema (`sintetico: true`, sem PII, cobrindo fronteiras de IOF, IR, cliente sem aplicação e teste de isolamento) e a tool `consultar_aplicacoes_cliente` (`dado_privado`), com `cliente_id` injetado pelo contexto autenticado do atendente (D03-P2 = A);
  - exposição somente por HTTP sem estado pelo gateway da plataforma, sem distribuição local por `stdio` (D03-P4 = A);
  - parâmetros do CDB sintético: 100% do CDI, aporte de R$ 100 a R$ 1.000.000 (FGC informativo até R$ 250 mil), vencimento em 1.080 dias corridos, sem carência, crédito no mesmo dia útil, corte às 16h (`America/Sao_Paulo`) e arredondamento meio para cima (D03-P5 = A);
  - um tópico negado no guardrail do produto no Bedrock: `"recomendação de investimento personalizada"` (D03-P6 = A);
  - conferir a fidelidade às legendas e PDFs das unidades 04 a 08 da D03 antes da fase `analisar` (D03-P9 = A);
  - criar a classe `leitura_publica` numa versão menor do contrato da plataforma (`1.x`), fora das pernas da tríade letal, para classificar tools que só leem regras públicas e fazem contas determinísticas (D03-P10 = A);
  - lane de compatibilidade só em `2025-11-25`, sem estado de sessão e mantendo `versoes_mcp` do contrato `comum` (D-072, delegada).
- **Respostas da rodada anterior** (D-062): GCP como cloud comparativa da D04 à D07; uma rodada real paga por projeto, só com teto por execução aprovado pelo Marcos; sem teto por disciplina; ele revisa e mergeia, sem aprovação formal de PR.
- **Projeto pausado não recebe tarefa** (D-060): `pausado` no `harness/estado.json`, com data e fonte; o `estado.py pode-delegar` nega. Retomar é decisão do Marcos. Hoje nenhum projeto está pausado (D-064).
- **Links de sessão do Claude nunca no repositório** (D-069): repositório público; o rodapé `claude.com/claude-code` segue permitido. Teste `harness/testes/test_links_de_sessao.py`.
- **D02 (assistente de agendamento): plano aprovado** (D-070): teto diário US$ 0,85, cota de 400.000 tokens, Langfuse Cloud por produto (`https://cloud.langfuse.com`), consumo parcial da plataforma (opção A). Tarefas só com a sessão do D02.
- **Rodada real paga** (D-068): teto de US$ 20 por execução, valor do Marcos; o limite mensal da conta (US$ 20, D-022) continua por cima.
- **Economia de tokens** (D-067): rtk 1.2.1 em todas as sessões (wrapper só para leitura e teste simples, sem ampliar permissão); headroom 0.44.0 só na máquina do Marcos, com telemetria desligada. PR #40.
- **Âncoras e sessões** (D-065): âncora oficial da AWS de cada projeto no `harness/estado.json` (D01 Big Data Blog, D02 Natera, D03 MCP sem estado); o `estado.py validar` exige âncora depois do planejar. Sessões: uma por vez, abertas pelo Marcos no ambiente pos-arquitetura, na ordem D02, D03 e D01, com push ao fim de cada fase (D-066, substitui o paralelo).
- **Em desenvolvimento agora** (D-064): D01 recomendação, D02 assistente de agendamento e D03 MCP do CDB, com o Doom como IA aplicada da D01.
- **Branch sem o harness atual da base reprova no CI** (D-061, delegada): atualize com o `main` e rode `bash harness/init.sh` antes de trabalhar num branch antigo.
- **Orquestrador com subagentes e sessões paralelas por projeto** (D-045): a orquestração coordena e delega cada tarefa a um especialista, sem escrever código de projeto. Cada projeto pode ter sessão própria em worktree e branch, com PR para o `main`. As sessões não se mandam mensagem; o estado é o git. Terraform fica só na máquina do Marcos (D-042). O número de sessões ativas é limitado ao que a orquestração acompanha (cada sessão custa 4 a 15 vezes um chat).
- **Sem `Principal "*"` na policy da plataforma** (D-044): nem com condição; valores de condição de conta sem curinga (`*` ou `?`). ADR-0014.
- **SDD obrigatório** (D-016, D-017). Todo código nasce de spec → plano → tarefas → análise aprovada, em `specs/<chave>/`; o gate nega código antes da fase implementar. Projetos em andamento fazem primeiro a spec retroativa. Comece toda sessão pela skill `retomar`.
- **Qualquer agente (Claude Code, Antigravity, Copilot) segue o `AGENTS.md`** (D-018, D-019).
  - Comece com `bash harness/init.sh` e `python3 harness/memoria.py ler`.
  - Cota esgotada: `python3 harness/agente.py marcar <agente> --ate ...`.
  - Quem assume e com qual modelo: `python3 harness/agente.py proximo --tarefa <tipo>`.
  - Registre o agente em `harness/progresso.md`.
- **Decisão do Marcos vira regra ou skill no mesmo turno** (D-025). A entrada no histórico lista `**Aplicado em:**`, e o `harness/memoria.py auditar` confere no CI. Na orquestração, use a skill `decisao-do-dono`.
- **Agentes especialistas por tarefa fim** (D-026). Delegue a tarefa ao especialista dela (`harness/AGENTES.md`; `harness/agente.py proximo --tarefa <tipo>`). Especialista não cria subagente. Arquivos de agente são gerados: mude `harness/especialistas.json` e rode `harness/sincronizar_agentes.py`.
- **Harness:** versão 0.5.0, pré-estável. O pacote npx só sai depois dos critérios de `harness/VERSAO.md` e com a aprovação do Marcos (D-027).
- **Modelos (D-028):** agentes de código na assinatura Pro do Claude Code; na troca, Antigravity com Gemini e Copilot com OpenAI. Na AWS, só a plataforma e os agentes dos produtos, durante as demonstrações.
- **Conta AWS única com isolamento por tag e prefixo, com ABAC** (D-029).
- **Tags com valor validado** (D-031). A política do Infracost bloqueia o PR fora deste padrão:
  - `project` = chave do projeto (`NN-nome-em-kebab`);
  - `module` em kebab;
  - `managed-by` = `terraform`.

  Comece o teste do stack por `harness/modelos/tags.tftest.hcl`. **D01:** trocar `PROJECT_TAG`/`project` de `recsys` para `01-recomendacao` na spec retroativa (workflows de apply e destroy e Terraform).
- **Economia de tokens** (D-058):
  - ajuste de texto e alinhamento vão para Sonnet; plano, análise, segurança e código continuam em Opus;
  - a orquestração longa é fechada com resumo estruturado e reaberta numa sessão nova;
  - o uso é registrado com os subagentes e com o total medido.
- **D01 (recomendação): emenda 1 do plano aprovada** (D-057). É só texto: as permissões do Bedrock descritas como a plataforma concede e o teto sem "proposta".
- **Plataforma, a conferir na T032 (permissões do produto):** `bedrock:Converse` não é uma ação de IAM; o `bedrock:InvokeModel` já cobre o Converse. Achado do arquiteto-aws na D01.
- **D01 (recomendação): plano aprovado** (D-056), com teto diário de US$ 7,10. As partes são a base por 24 h, a janela do MWAA de 2 a 3 h e a plataforma de agentes, com destroy em cascata. Um dia de demonstração usa cerca de 42% do limite mensal.
- **Disparos antes do plano são livres** (D-055): especificar, esclarecer e planejar saem sem perguntar ao Marcos. O plano escrito continua indo para a aprovação dele, e a fase publicar continua dele.
- **D01 (recomendação), respostas da spec retroativa:**
  - lote como lab sintético fechado: os dois jobs do Glue que faltam e um XGBoost pequeno (D-051);
  - MWAA ligado só numa janela curta da demonstração, com `prazo_horas` curto (D-052);
  - guardrail sem tópicos extras, porque o código já barra preço, desconto e frete (D-053);
  - publicação só da página e do post AWS, com o relatório de teste (D-054).
- **D02 (assistente de agendamento): avaliação e traces** (D-048):
  - gate no CI com respostas gravadas;
  - traces no Langfuse Cloud, plano Hobby gratuito, só com dados sintéticos;
  - as chaves são criadas pelo Marcos; sem chave, o tracing fica desligado;
  - Langfuse na AWS fica fora, por custo.
- **Marketplaces de skills** (D-049): HashiCorp, Trail of Bits, promptfoo e Google confirmados, além da Anthropic. Marketplace novo só com confirmação do Marcos.
- **Códigos sempre com nome** (D-050): ao citar D01, P00-P3, T041 ou D-033 para o Marcos, escreva junto um nome curto do que é.
- **Execução autônoma** (D-047): a skill `executar-tarefas` toca o projeto até o PR da fase.
  - **Ciclo de cada tarefa:** especialista → revisor independente (nunca quem implementou, no máximo 2 rodadas) → commit só do que foi aprovado.
  - **Comandos:** os necessários ficam liberados; push com força, push no `main`, merge e apply ou destroy fora do Floci são negados pelo hook `gate_execucao.py`.
  - **Interrupções:** só pelos critérios (tarefa `[DONO]`, mudança de plano, falha repetida, ação irreversível), com o contexto pronto, pelo Monday, notificação e `## Bloqueios` do PR.
  - **Revisores da esteira:** usam o `CLAUDE_CODE_OAUTH_TOKEN` (D-028).
- **Quem grava a memória** (D-046, delegada): a decisão do Marcos é gravada pela sessão em que ele decidiu, seja a orquestração na nuvem ou a sessão local, sempre com o fluxo de escrita segura: `git fetch` → edição sobre o topo atual → commit → push sem `--force`. Se o push for recusado, a sessão busca de novo e refaz a edição sobre o novo topo, nunca reenvia o arquivo inteiro antigo. A orquestração na nuvem audita (`memoria.py auditar`) e mantém o Monday.
- **Testes do harness por assunto** (D-043): um arquivo `harness/testes/test_<assunto>.py` por assunto, com o que é comum em `comum.py`. O `harness/test_harness.py` só reúne os arquivos e não recebe testes; um teste reprova se receber.
- **Terraform nas sessões de nuvem** (D-063, substitui a D-042): agentes e sessões de nuvem em paralelo, um por projeto, sem ciclo local. Sem `terraform`, providers ou Floci na sessão, não escreva Terraform às cegas: pare e avise. Um escritor por branch; apply real só pelo workflow protegido.
- **Perguntas ao Marcos só no chat** (D-041): em múltipla escolha, com a boa prática no enunciado (como o exame trata e o erro comum que ela evita) e o tradeoff de cada opção. A seção `## Perguntas ao dono` dos PRs é só registro; ele não responde lá.
- **Emenda 2 do plano da plataforma aprovada** (D-040): só alinha o texto à D-039 e ao ADR-0011.
- **Tag de custo `project`** (D-039): a ativação é única na conta e vale para todos os projetos. O Marcos a faz assim que a chave aparecer no Billing, e nenhuma demonstração espera 48 h. Substitui o "48 h antes da demonstração" da D-034.
- **Plataforma no site** (D-037): página própria em Arquiteturas AWS e post próprio, com link para o produto que a consome (D03 primeiro).
- **Emenda 1 do plano da plataforma aprovada** (D-038), com o teto diário mantido em US$ 1,20 (P00-P8).
- **Como explicar decisões ao Marcos** (D-036): pelo nome da boa prática, o que o arquiteto faz e o erro comum que ela evita, sem citar só os códigos da prova. Os ids ficam nos ADRs e aqui, ao lado do nome.
- **Plano da `00-plataforma-agentes` aprovado** (D-035), com teto diário de US$ 1,20. Delegação livre nas fases seguintes (D-033).
- **Plataforma: consumidor, conta e alarmes** (D-034).
  - O primeiro consumidor da `00-plataforma-agentes` é a D03.
  - A tag `project` como tag de alocação de custo e o Transaction Search vão por Terraform no `infra/conta`, aplicado pelo Marcos. A tag precisa estar ativa pelo menos 48 h antes da demonstração.
  - O caso de uso da Anthropic é enviado à mão por ele, só se o modelo for anterior ao Opus 4.7.
  - Os alarmes da plataforma vão para os e-mails de `emails_alerta` do `infra/conta`.
  - Todo apply confere a tag e o Transaction Search, só com aviso.
- **Delegação dentro do plano aprovado** (D-033). Com o `plan.md` aprovado pelo Marcos e registrado (`estado.py aprovar-plano`), os disparos de especialistas nas fases tarefas, analisar, implementar e verificar saem sem aprovação a cada um. Fora disso, cada disparo pede o ok dele (`Aprovação do dono:` no briefing). Plano alterado exige nova aprovação. O gate `sdd-analisar`, o merge e a publicação continuam com ele.
- **Branch já mergeado não recebe commit novo** (D-032). Mudança depois de PR pronto vai em PR novo a partir do `main`; o `pre-push` bloqueia.
- **Projeto novo só pelo caminho padrão:** `python3 harness/novo_projeto.py` (D-030). A plataforma compartilhada é o projeto `00-plataforma-agentes`; o produto consome gateway, política, guardrail, perfil de inferência e observabilidade da plataforma (skill `plataforma-agentes`).
- **Nunca assumir escolhas do Marcos.** Silêncio ou pergunta pulada não são resposta (D-004). Exceção: decisões técnicas e de processo delegadas, que seguem as boas práticas da prova, na ordem recomendada, sempre com o porquê e os ids das tarefas (D-014).
- **Um projeto de IA aplicada e uma arquitetura AWS por disciplina** (D-009).
- **Testes do componente Claude só com respostas gravadas**, sem chamadas ao Claude real (D-006).
- **Floci por tag de versão:** `floci/floci:2.5.0` recomendada. Use `${{ vars.FLOCI_IMAGE || 'floci/floci:latest' }}` nos workflows e `${FLOCI_IMAGE:-floci/floci:latest}` nos scripts, nunca `latest` escrito direto (D-013).
- **Variável ou secret novo criado pelo Marcos:** troque em todo lugar que depende dele, com fallback seguro (D-012).
- **Push e PR:** só depois de receber a memória mais recente, porque o gate nega antes disso. Perguntas ao Marcos vão no PR, na seção `## Perguntas ao dono` (D-015).
- **Retomada:** se a sessão ficou parada mais de 8 horas, ou se a memória mudou com decisão que afeta o projeto, prefira uma sessão nova com resumo estruturado (D-015).
- **Infraestrutura real é demonstração de um dia: subir, gravar um vídeo curto, destruir** (D-021, D-022, D-023).
  - **Teto de cada projeto:** o custo estimado de um dia de execução, calculado no plano. Ele fica em `teto_diario_usd` no `harness/estado.json`, no README e num AWS Budgets **diário**. O gate do PR compara o custo de 24 horas com esse teto.
  - **Limite mensal da conta:** US$ 20 (`vars.CUSTO_MAX_MENSAL_USD`, padrão `'20'`), num AWS Budgets mensal em `infra/conta`, somando todas as demonstrações do mês.
  - **Workflow de destroy obrigatório em todo projeto com infraestrutura real:** disparo manual ou pelo agendador, ambiente `aws-lab-destroy` (sem aprovação), input `confirm_stack`, OIDC, verificação de sobras pela tag `project` e `harness/infra.py remover` no fim. O apply fica no `aws-lab`, com aprovação.
  - **O apply tem input `prazo_horas`** (padrão e máximo 24, D-024) e registra o prazo com `harness/infra.py registrar`. O `expirar-infra.yml` avisa uma hora antes e dispara o destroy quando o prazo vence, **sem aprovação**, no ambiente `aws-lab-destroy` restrito ao `main`. Para adiar: `harness/infra.py estender`, sem passar de 24 horas desde o apply.
  - **Ponto de partida:** os modelos em `harness/modelos/`. O `estado.py validar` reprova sem teto a partir de `tarefas` e sem apply ou destroy completos a partir de `verificar`.
  - **D02:** o AWS Budgets do módulo de monitoramento passa de mensal para diário, com o teto calculado.
- **Modelos:** Opus para arquitetura, código e segurança; Sonnet para pesquisa, posts e site; Haiku para tarefas mecânicas (D-002).
- **Privacidade:** nada do curso nem dados do aluno; nada das empresas em que o Marcos trabalha (D-001).

## Pendências (aguardando o Marcos; não trate como decidido)
- D02: a 2ª pergunta da sessão D02 não foi localizada; o dono a dispensou em 2026-11-21, sem decisão (ver D-070).
- Configuração da conta do Marcos para o destroy automático (D-024):
  - criar o ambiente `aws-lab-destroy` sem aprovação e restrito ao `main`;
  - incluir o subject `repo:<dono>/<repo>:environment:aws-lab-destroy` na confiança OIDC da role de deploy na AWS.
- Projetos de IA aplicada da D02 e da D03.
- Revisores de IA na esteira: o Marcos escolheu a assinatura (D-028). Falta ele criar o secret com o token da assinatura (`claude setup-token`). Conta AWS com OIDC: criar quando o primeiro produto estiver pronto (P00-P2).
- Configurações do GitHub ainda abertas: ruleset do `main`. Já feitas pelo Marcos: variável `FLOCI_IMAGE`, secret `INFRACOST_API_KEY`, Dependency graph e proteção do branch `memoria-compartilhada`. Use `vars.FLOCI_IMAGE` e não escreva `floci/floci:latest` nos workflows (D-012, D-013).
- Merges: até o #20, mais o #12 (painel) e o #19 (Dependabot), já mergeados. O #21 (actions dos modelos) também foi mergeado. Falta o PR da D-033 (delegação dentro do plano aprovado). O #1 (D01) voltou a andar (D-064); os PRs de opções #2 a #8 continuam rascunho. Abertos para revisão: #38 (gate de branch defasado, D-061) e #39 (pausa e Doom, D-059 e D-060).
