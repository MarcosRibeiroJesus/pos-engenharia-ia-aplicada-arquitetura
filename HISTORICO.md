# Memória compartilhada: histórico de decisões

Registro completo, do mais novo para o mais antigo. Cada entrada traz data, id e fonte:
- "Marcos": ele decidiu.
- "delegada": decisão técnica ou de processo tomada pela orquestração com base nas boas práticas da prova, conforme a D-014.

Quando uma decisão substitui outra, a nova diz qual substitui. Nada é apagado.

### 2026-11-22 · D-072 · D03: lane de compatibilidade MCP somente na versão 2025-11-25 · fonte: delegada
A lane de compatibilidade da D03 (D-011) atende somente a versão `2025-11-25` (a imediatamente anterior à `2026-07-28`, já presente em `versoes_mcp` do contrato `comum`, ADR-0010 da plataforma), sem estado de sessão nem cabeçalho de sessão. A versão `2025-06-18` só entra se um cliente real precisar, como versão menor do contrato (`1.1.0`). Boa prática: menor superfície de compatibilidade que atende os clientes reais, com política de versão explícita (2.4, 5.6); evita o erro comum de aceitar versões antigas sem demanda e aumentar a superfície de tradução e teste.

**Aplicado em:** `specs/03-mcp-regras-cdb/spec.md` (RF-002 e E16), `harness/estado.json` (branch `modulo/03-mcp/mcp-regras-cdb`).

### 2026-11-22 · D-071 · D03 (MCP de regras do CDB): respostas do dono às perguntas D03-P1 a D03-P10 · fonte: Marcos
O Marcos respondeu por múltipla escolha às perguntas abertas da spec da D03 (`specs/03-mcp-regras-cdb/spec.md`):
- **D03-P1 = B:** a etapa de ingestão assistida por Claude (extração de manual sintético para regras estruturadas) fica fora desta entrega; as regras entram como dados versionados revisados no pull request (`RF-016` fora desta entrega).
- **D03-P2 = A:** o servidor inclui dados sintéticos de aplicações de clientes em JSON versionado validado por schema (`sintetico: true`, sem PII, cobrindo fronteiras de IOF, IR, cliente sem aplicação e teste de isolamento) e a tool `consultar_aplicacoes_cliente` (classe `dado_privado`, `RF-009`), com o `cliente_id` injetado exclusivamente pelo contexto autenticado do atendente (`RF-021`).
- **D03-P4 = A:** sem distribuição local por `stdio`; exposição somente via HTTP sem estado pelo gateway da plataforma.
- **D03-P5 = A:** parâmetros do CDB sintético aprovados conforme a proposta da spec (`RF-014`): 100% do CDI; aporte mínimo de R$ 100,00 e máximo de R$ 1.000.000,00 por aporte (FGC informativo até R$ 250 mil por CPF por conglomerado); vencimento em 1.080 dias corridos; sem carência; crédito no mesmo dia útil; horário de corte às 16h (`America/Sao_Paulo`); arredondamento meio para cima (`HALF_UP`).
- **D03-P6 = A:** um tópico negado no guardrail do produto no Amazon Bedrock (`RF-024`): `"recomendação de investimento personalizada"`.
- **D03-P9 = A:** uma sessão na máquina do dono extrai e resume as legendas e PDFs das unidades 04 a 08 da D03 antes da fase `analisar` para conferir a fidelidade do desenho.
- **D03-P10 = A:** criar a classe `leitura_publica` numa versão menor do contrato da plataforma (`1.x`), fora das três pernas da tríade letal, para classificar tools que só leem dados públicos e fazem contas determinísticas (`RF-022`, `RF-023`, `E8`).
Resta apenas D03-P7 (`teto_diario_usd`), calculado no plano e aprovado junto com o `plan.md`.

**Aplicado em:** `specs/03-mcp-regras-cdb/spec.md` (RF-004, RF-009, RF-014, RF-016, RF-021 a RF-024, Fora de escopo e Perguntas ao dono), `harness/estado.json` (fase `planejar` da `03-mcp-regras-cdb`, branch `modulo/03-mcp/mcp-regras-cdb`).

### 2026-11-22 · D-070 · D02 (assistente de agendamento): plano aprovado com as decisões de DV-01 a DV-12 · fonte: Marcos
O dono revisou por múltipla escolha as divergências do PR #44 e aceitou as opções recomendadas. Aprovou o plano (D-033) e decidiu: teto diário de US$ 0,85 com cota de 400.000 tokens e alarme de custo de tokens em US$ 0,40; consumo parcial da plataforma (opção A); Langfuse Cloud na demonstração, um projeto por produto, host `https://cloud.langfuse.com`. DV-04 foi respondido com texto livre ("definir conforme o tipo de projeto e gasto estimado por dia") e convertido em orçamento diário pelo gasto estimado.
A 2ª pergunta da sessão D02 (D02-P1) não foi localizada e foi dispensada pelo dono, sem decisão.

**Aplicado em:** `specs/02-assistente-agendamento/plan.md` (seção "Decisões do dono"), `specs/02-assistente-agendamento/adr/0006-avaliacao-e-observabilidade.md`, `harness/estado.json` (`plano_aprovado` e `teto_diario_usd`, branch do PR #44).

### 2026-11-22 · D-069 · Nunca incluir links de sessão do Claude no repositório · fonte: Marcos
O repositório é público, e um link de sessão dá acesso à conversa inteira. Os links já publicados nos corpos de 18 PRs foram removidos.

**Aplicado em:** `AGENTS.md` (seção 2), `CLAUDE.md` (Privacidade), `harness/testes/test_links_de_sessao.py` (PR #45).

### 2026-11-21 · D-068 · Teto da rodada real paga: US$ 20 por execução · fonte: Marcos
O Marcos respondeu "$20" à pendência da D-062 (valor do teto por execução da rodada real paga do componente Claude). O valor é o máximo por execução: o plano propõe o custo estimado abaixo dele e o relatório informa o medido; passou do teto, a rodada para. É o mesmo número do limite mensal da conta (US$ 20, D-022), que continua valendo por cima de tudo.

**Aplicado em:** `.claude/skills/avaliacao-llm/SKILL.md`, `.agents/skills/avaliacao-llm/SKILL.md`, `harness/testes/test_regras_do_dono.py`, `docs/orquestracao/prompts-sessoes-2026-11-21.md`.

### 2026-11-21 · D-067 · rtk em todas as sessões e headroom só na máquina do dono · fonte: Marcos (pedido); desenho delegado
O Marcos pediu a instalação do rtk e do headroom para economizar tokens no harness e em todas as sessões. O desenho é delegado (boa prática: não ampliar permissões por conveniência). O hook do rtk devolve `allow` e reescreve até `git push`, então o wrapper `rtk_rewrite.py` só repassa a reescrita de comandos simples de leitura e de teste; o resto segue as permissões e os gates normais. O rtk 1.2.1 entra pelo `setup-ambiente.sh` (tag fixa do repositório oficial; o crates.io tem outro pacote) e pelo plugin do Antigravity. O headroom 0.44.0 só vale na máquina do dono (`scripts/headroom-local.sh`, telemetria desligada, modo cache, sem `headroom learn`), porque nas sessões de nuvem o tráfego do modelo não passa por um processo local. PR #40.

**Aplicado em:** `.claude/hooks/rtk_rewrite.py`, `.claude/settings.json`, `scripts/setup-ambiente.sh`, `scripts/headroom-local.sh`, `.agents/plugins/rtk`, `harness/init.sh`, `docs/adr/0004-rtk-e-headroom.md`, `CLAUDE.md`, `AGENTS.md`, `harness/testes/test_economia_tokens.py`.

### 2026-11-21 · D-066 · Uma sessão por vez, aberta pelo dono no ambiente pos-arquitetura · fonte: Marcos
As sessões agendadas pela orquestração em 21/11 cedo falharam: a D02 e a D03 por limite de uso (três em paralelo esgotaram o limite de 5 horas em 25 minutos, sem push), e a D01 porque herdou a rede da conversa de orquestração, que bloqueia o Terraform e o Floci. O Marcos escolheu: ele abre cada sessão no ambiente pos-arquitetura com o prompt da orquestração, uma por vez, na ordem D02, D03 e D01, com push ao fim de cada fase. Substitui a parte "em paralelo" da D-065.

**Aplicado em:**
- `CLAUDE.md` (Sessões), PR #39;
- teste `harness/testes/test_regras_do_dono.py` (TestUmaSessaoPorVez);
- prompts das sessões em `docs/orquestracao/prompts-sessoes-2026-11-21.md`, entregues ao Marcos.

### 2026-11-21 · D-065 · Âncoras dos três projetos AWS e uma sessão por projeto · fonte: Marcos
O Marcos aceitou as três arquiteturas âncora ("Aceito as três"), abertas e conferidas em 2026-11-21:
- D01 (recomendação): https://aws.amazon.com/blogs/big-data/building-a-scalable-personalized-recommendation-system-on-aws-from-batch-to-real-time/ (27/07/2026);
- D02 (agendamento): https://aws.amazon.com/blogs/machine-learning/nateras-intelligent-appointment-scheduling-with-amazon-bedrock-agentcore/ (26/08/2026). Diferença: a Natera é agente de voz sem aprovação humana; o nosso é de texto, com cancelamento aprovado por humano, como extensão;
- D03 (MCP do CDB): https://aws.amazon.com/blogs/architecture/mcp-went-stateless-is-your-aws-mcp-server-deployment-well-architected (01/09/2026).
E escolheu uma sessão de agente por projeto, em paralelo.

**Aplicado em:**
- `harness/estado.py` (gate: arquitetura depois do planejar sem `ancora` oficial reprova) e `harness/estado.json` (as três âncoras), PR #39;
- teste `harness/testes/test_ancora.py`.

### 2026-11-21 · D-064 · Desenvolver os três primeiros projetos AWS: D01, D02 e D03 · fonte: Marcos
O Marcos pediu para desenvolver os três primeiros projetos de arquitetura AWS e, perguntado sobre a pausa, escolheu "D01, D02 e D03": recomendação de e-commerce, assistente de agendamento e MCP de regras do CDB. Substitui a D-060 na parte da pausa: a recomendação volta a andar. O Doom continua como IA aplicada da D01 (D-059).

**Aplicado em:**
- `harness/estado.json` (sem `pausado` no `01-recomendacao`) e `docs/curso/PROGRESSO.md`, PR #39.

### 2026-11-21 · D-063 · Terraform nas sessões de nuvem, sem ciclo local · fonte: Marcos
"Vamos pular testes de Terraform localmente para que você possa andar mais rápido gerando diversos agentes com suas sessões na cloud." Substitui a D-042: a implementação e os testes de Terraform rodam em agentes e sessões de nuvem, em paralelo, um por projeto. Continua: um escritor por branch, sem Terraform às cegas (a sessão sem `terraform`, providers ou Floci para e avisa) e apply em conta real só pelo workflow protegido, disparado pelo Marcos.

**Aplicado em:**
- `CLAUDE.md` (Sessões) e skill `terraform-tdd` (Onde rodar), PR #39;
- teste `harness/testes/test_regras_do_dono.py` (TestOndeRodaOTerraform).

### 2026-11-21 · D-062 · Respostas da rodada anterior: cloud da D04 à D07, rodada real com teto e merge do dono · fonte: Marcos
- Cloud comparativa da D04 à D07: GCP.
- Uma rodada real paga por projeto, para medir acerto e custo, com teto por execução. O valor do teto é dele: vai proposto no plano e só roda depois da aprovação.
- Escolha das opções por disciplina, lendo cada tabela; sem teto por disciplina (vale o teto diário de cada projeto, D-021, e o limite mensal de US$ 20, D-022).
- O Marcos não aprova PR formalmente: revisa quando estiver pronto e mergeia.

**Aplicado em:**
- skill `cloud-comparativa` e especialista `arquiteto-cloud-comparativa` (`harness/especialistas.json`), PR #39;
- skill `avaliacao-llm` (rodada real só com teto aprovado), PR #39;
- `CLAUDE.md` (merge do dono sem aprovação formal), PR #39;
- teste `harness/testes/test_regras_do_dono.py` (TestRespostasDoDonoD062).

### 2026-11-21 · D-061 · Gate no CI para branch sem o harness atual da base · fonte: delegada
O PR #8 (opções da D01) saiu de um `main` anterior ao harness. A sessão que trabalhou nele ficou sem `pre-push`, sem skills e sem especialistas, e quatro commits saíram por fora dos gates. Boa prática: controle que não depende de o agente lembrar de ativá-lo (gate programático no CI, 1.4 e 3.6). Erro que evita: confiar só no hook local, que um clone novo ou um branch velho ignora. Trade-off: toda mudança no harness pede aos PRs abertos que se atualizem com o `main`.

**Aplicado em:**
- `harness/branch_defasado.py` e passo novo no `.github/workflows/harness.yml` (PR #38);
- teste `harness/testes/test_branch_defasado.py`;
- `harness/VERSAO.md` (0.6.1).

### 2026-11-21 · D-060 · D01: por ora só o Doom; recomendação pausada · fonte: Marcos
Sobre o catálogo de opções da D01, o Marcos disse "só vamos fazer o Doom na disciplina 1". Perguntado sobre o alcance, escolheu "Pausar a recomendação": a recomendação (PR #1, plano aprovado na D-056) fica parada, sem cancelar, e retoma só com nova decisão dele.
- As opções por unidade do `OPCOES.md` ficam como catálogo de referência (já era a D-009).
- Escolhas dele registradas no catálogo, só como referência e sem implementação: unidade 05 com pesos próprios no S3 (não o Gemini Nano da aula); unidade 08 com CloudWatch e X-Ray; unidade 09 com modelo de 20B ou 30B como exceção à regra de lab, com ADR e teto diário; unidade 10 com S3 Vectors.

**Aplicado em:**
- `harness/estado.py` (campo `pausado`: `pode-delegar` nega, `validar` exige data e fonte, `status` mostra) e `harness/estado.json` (`01-recomendacao` pausado), PR #39;
- teste `harness/testes/test_pausa.py`;
- `docs/curso/PROGRESSO.md` (recomendação pausada), PR #39;
- `modulos/01-fundamentos-ia-llms/OPCOES.md` (status de catálogo e escolhas de referência), PR #8.

### 2026-11-21 · D-059 · D01 Doom: opção 04-C e rótulos pelo motor do jogo · fonte: Marcos
As aulas da unidade 04 ensinam um detector YOLO pronto em TensorFlow.js, num Web Worker, com filtro de confiança fixo; não ensinam treino nem aprendizado por reforço. O Marcos escolheu:
- a opção 04-C: calibrador do limiar de confiança com gate humano, sobre a versão fiel à aula (04-A);
- Doom (assets Freedoom) em vez do Duck Hunt da aula, com rótulos gerados pelo motor do jogo. O ajuste do YOLO com esses rótulos fica fora do que a aula ensina e entra no plano.

**Aplicado em:**
- `harness/estado.json` (`01-doom`: nota com a 04-C, `infra_real`, workflows a criar, teto a calcular, GCP) e `docs/curso/PROGRESSO.md`, PR #39;
- `modulos/01-fundamentos-ia-llms/OPCOES.md` (unidade 04), PR #8.

### 2026-11-20 · D-058 · Economia de tokens: sessão nova e Sonnet no mecânico · fonte: Marcos
O Marcos achou alto o gasto de tokens.
- **O que a orquestração encontrou:**
  - os 13 disparos de especialistas do dia foram todos Opus, somando cerca de 2,8 milhões de tokens;
  - a conversa de orquestração estava muito longa;
  - o registro de uso não pegava os subagentes, não comitava o uso da sessão local e não tinha medição da orquestração na nuvem.
- **A escolha dele:** sessão nova com resumo estruturado, e Sonnet no trabalho mecânico. Plano e análise continuam em Opus.

**Aplicado em:**
- `CLAUDE.md` (Modelo por tarefa);
- skill `executar-tarefas` (Sonnet no mecânico e comitar `harness/uso/`);
- `.claude/hooks/registrar_uso.py` e `scripts/uso/uso.py` (soma dos subagentes, coluna `total` com `medido-total`);
- `docs/uso/uso-tokens.csv` (os 13 disparos lançados e a orquestração de 19 e 20/11 como `nao-medido`);
- teste `harness/testes/test_uso_de_tokens.py`.

### 2026-11-20 · D-057 · D01 (recomendação): emenda 1 do plano aprovada · fonte: Marcos
O Marcos autorizou e aprovou de antemão ("Pode emendar e já aprovo", D01-P6) a emenda de texto que fecha os achados A01 e A06 da análise 1:
- **A01:** as permissões do Bedrock da task role passam a ser descritas como o módulo `registro-produto` concede, presas ao perfil, aos modelos de origem e ao guardrail. O ECS não acrescenta nenhuma ação do Bedrock.
- **A06:** o teto de US$ 7,10 deixa de aparecer como "proposta".

A orquestração conferiu que o diff do `plan.md` se limita a esses trechos e à seção da emenda antes de registrar.

**Aplicado em:**
- `specs/01-recomendacao/plan.md` (Emenda 1);
- `harness/estado.json` (`plano_aprovado` com o novo hash, D-057 no projeto).

### 2026-11-20 · D-056 · D01 (recomendação): plano aprovado e teto de US$ 7,10 · fonte: Marcos
O Marcos aprovou o plano da recomendação (D01) e escolheu o teto diário de US$ 7,10 (P01-P5), sobre uma estimativa de US$ 6,43 com cerca de 10% de margem.
- As partes são a base por 24 h, a janela do MWAA de 2 a 3 h e a plataforma de agentes, com destroy em cascata.
- O lote sintético fica fechado, com um XGBoost semente que nunca é promovido sozinho.
- O Claude passa pelo perfil e pelo guardrail da plataforma.

**Aplicado em:**
- `specs/01-recomendacao/plan.md` (status e perguntas respondidas);
- `harness/estado.json` (`plano_aprovado` com hash, `teto_diario_usd` igual a 7.1 e D-056 no projeto);
- fase tarefas disparada pela delegação livre (D-033).

### 2026-11-20 · D-055 · Não perguntar mais sobre disparos de especificação e planejamento · fonte: Marcos
Ao ser perguntado se o arquiteto-aws podia escrever o plano da D01 (recomendação), o Marcos respondeu "pode disparar e não me pergunte mais sobre isso".
- **Alcance aplicado:** os disparos de especialistas nas fases especificar, esclarecer e planejar não pedem mais aprovação.
- **Continuam com ele:** a aprovação do plano escrito, que libera as fases seguintes (D-033), a fase publicar, o merge e as decisões de escopo, produto e custo.

**Aplicado em:**
- `harness/estado.py` (`pode_delegar` com `FASES_ANTES_DO_PLANO`), que o hook `gate_delegacao.py` usa;
- `CLAUDE.md` e `AGENTS.md`;
- teste `test_especificar_e_planejar_saem_sem_aprovacao_por_disparo`.

### 2026-11-20 · D-051 a D-054 · D01 (recomendação): respostas da spec retroativa · fonte: Marcos
Respostas às perguntas P01-P1 a P01-P4 da spec retroativa:
- **D-051, escopo do lote:** lab sintético fechado. Entram os dois jobs do Glue que faltam e um XGBoost pequeno sobre dados sintéticos (recomendação aceita).
- **D-052, MWAA na demonstração:** ligado numa janela curta, com `prazo_horas` curto. A recomendação era desligado. O teto soma 24 h do resto do stack e só a janela do MWAA.
- **D-053, guardrail:** nenhum tópico extra, porque o código já barra preço, desconto e frete (recomendação aceita).
- **D-054, publicação:** só a página do projeto e o post AWS, com o relatório de teste. O post GCP não é publicado, e o design doc da GCP fica no repositório. A recomendação era publicar tudo.

**Aplicado em:**
- `specs/01-recomendacao/spec.md` (RF-107, RF-109, RF-110, RNF-102, publicação e perguntas respondidas);
- `harness/estado.json` (decisões do projeto, fase `planejar`).

### 2026-11-20 · D-050 · Códigos sempre com nome · fonte: Marcos
O Marcos pediu: "quando for falar desses códigos, coloque um nome resumido do que é para ficar claro para mim". Exemplo: D01 (recomendação), P00-P3 (primeiro consumidor da plataforma).

**Aplicado em:**
- `CLAUDE.md`;
- skills `decisao-do-dono` e `regras-do-especialista`;
- teste `test_respostas_do_dono_d048_d050.py`.

### 2026-11-20 · D-049 · Marketplaces de skills de terceiros confirmados · fonte: Marcos
Resposta à H-P2 (confirmar os marketplaces de terceiros): o Marcos confia nos quatro publicadores oficiais já declarados, HashiCorp, Trail of Bits, promptfoo e Google, além da Anthropic. Não entram skills novas.

**Aplicado em:**
- `CLAUDE.md` (Skills de mercado);
- teste que reprova marketplace fora da lista confirmada.

### 2026-11-20 · D-048 · D02 (assistente de agendamento): gate no CI e Langfuse Cloud gratuito · fonte: Marcos
Entre as opções gate no CI com Langfuse local, gate no CI com Langfuse Cloud gratuito, Langfuse na AWS e só o gate no CI, o Marcos escolheu **gate no CI com Langfuse Cloud, plano Hobby**. O motivo do corte do Langfuse na AWS foi a estimativa de cerca de US$ 0,50 por hora, ou US$ 12 por dia de demonstração, para os mínimos de web, worker, Postgres, Redis e ClickHouse. Isso é mais da metade do limite mensal.

**Aplicado em:**
- skill `avaliacao-llm`, com só dados sintéticos e chaves com fallback;
- `harness/estado.json`, com a D-048 no `02-assistente-agendamento`;
- teste;
- Monday: o card da D02 foi fechado, e entrou um card para o dono criar a conta e as chaves do Langfuse.

### 2026-11-20 · D-047 · Execução autônoma das tarefas com revisão por outro agente · fonte: Marcos
O Marcos quer que o harness execute as tarefas sozinho e que outros agentes revisem pelas regras, sem ele vigiar cada passo. As palavras dele:
1. "Crie um executor que pegue as próximas tarefas, delegue ao especialista, mande revisar, comite e siga até o PR."
2. "Crie o revisor diferente de quem criou, por tarefa, para confirmar que está condizente com a task."
3. "Libere os comandos necessários, todos eles."
4. "Já coloquei o token do Claude."
5. "Avise quando travar: escalonar só com critério explícito, ou seja, decisão que é sua, ação irreversível ou falha que se repete, levando o contexto pronto."

Leitura aplicada:
- o executor é um loop numa sessão que roda até o PR da fase e para. Não houve escolha por tarefa agendada;
- "todos os necessários" não inclui o que é irreversível, pelo próprio critério 5.

**Aplicado em:**
- skill `executar-tarefas`, nova, com o ciclo, os critérios de interrupção e os canais de aviso;
- skill `sdd-implementar`, que aponta para o executor;
- `.claude/settings.json`: `permissions.allow` com os comandos do projeto e `deny` para força e merge;
- hook `.claude/hooks/gate_execucao.py`, que nega push com força, push no `main`, merge e apply ou destroy fora do Floci;
- `.github/ia/provedor.sh` e `seguranca.yml`: o token da assinatura primeiro, com a chave da API vazia quando há token;
- `CLAUDE.md` e `AGENTS.md`;
- teste `harness/testes/test_execucao_autonoma.py`;
- correções da revisão automática do próprio PR #34, a primeira com o token da assinatura:
  - a lista de comandos ficou mais estreita: sem interpretador genérico, sem `gh api` livre, sem Docker livre e sem WebFetch;
  - o `gate_execucao.py` passou a analisar o comando com shlex;
  - entrou a trava no git, `harness/push_seguro.py` no `pre-push`;
  - na esteira, o token só no passo, os scripts e agentes vindos da base, `--setting-sources user` e `git add -u`;
  - o Dependabot ganhou cooldown de 7 dias.

### 2026-11-20 · D-046 · Quem grava a memória compartilhada e como · fonte: delegada
- **Contexto:** a sessão local gravou a D-044 e a D-045, mas a regra dizia que só a conversa de orquestração escrevia no branch. No meio disso houve um incidente de nomes corrompidos, já restaurado e com o teste `test_git_utf8.py`.
- **Decisão:** a decisão do Marcos é gravada pela sessão em que ele decidiu, porque repassar a decisão para outra sessão perde contexto. A escrita é otimista e segura:
  - buscar o topo;
  - editar sobre ele;
  - fazer push sem força;
  - se o push for recusado, buscar e refazer a edição.
  
  A orquestração na nuvem continua auditando e cuidando do Monday.
- **Boa prática:** estado compartilhado com controle de concorrência otimista, ou seja, compare-and-swap pelo push sem força. O erro comum é o "último que grava vence": reenviar o arquivo inteiro calculado sobre uma versão velha apaga a decisão que outra sessão gravou no meio do caminho (5.1, 5.3).
- **Achado na verificação do PR #31:** o `harness/ramo.py gravar` tem exatamente esse defeito. Ele reenvia o mesmo conteúdo na nova tentativa, e por isso o `infra.py` e o `agente.py` podem perder um registro numa corrida. A correção vai na T041, que já mexe no `infra.py`.

**Aplicado em:**
- `CLAUDE.md` (Memória compartilhada), no PR da D-046;
- prompt de correção para a sessão local (T041).

### 2026-11-20 · D-045 · Orquestrador com subagentes e sessões paralelas por projeto · fonte: Marcos
O Marcos pediu que o harness siga o padrão orquestrador-trabalhador da Anthropic e permita trabalhar nos projetos em paralelo.
- **Como fica:**
  - a orquestração coordena, grava a memória e delega cada tarefa a um especialista (subagente); não escreve código de projeto;
  - cada projeto pode ter sessão própria em paralelo, em worktree (`git worktree add`) e branch próprios, com PR para o `main`;
  - as sessões não se mandam mensagem para coordenar: o estado compartilhado é o git (memória, `harness/progresso.md`, PR);
  - Terraform continua só na máquina do Marcos (D-042); projeto sem Terraform pode rodar em sessão de nuvem;
  - o número de sessões ativas é limitado ao que a orquestração consegue acompanhar, porque cada sessão custa de 4 a 15 vezes um chat (medição da Anthropic).
- **Aplicado em:** `CLAUDE.md` (seção Sessões e a linha de orquestração), no PR #32 (mergeado em `main` no commit bada6a9).
- **Por que:** o padrão é o recomendado pela Anthropic (post do sistema multiagente e documentação de subagents e worktrees), e o git já é o canal que o harness usa.
- **Limite:** a documentação não traz comando para criar sessão de nuvem a partir de outra sessão local.

### 2026-11-20 · D-044 · Sem Principal curinga na policy da plataforma · fonte: Marcos
O Marcos respondeu "2 aprovo" à proposta de endurecer a regra TT-S01 (nenhum `Principal "*"`, nem com condição, e valores de condição de conta sem curinga). A regra anterior aceitava `*` com qualquer condição de conta e só conferia a presença da chave, não o valor; um `StringLike` com `aws:SourceAccount` igual a `*` passava.
- **Como ficou:**
  - `Principal "*"` (ou `NotPrincipal`) em `Allow` reprova sempre; valor de chave de conta com `*` ou `?` reprova sob qualquer operador;
  - `aws_lambda_permission` com principal `*` reprova, mesmo com `source_account` ou `source_arn`;
  - `Deny` continua fora da regra, porque o TLS obrigatório (TT-S04) usa `*` num `Deny`;
  - o plano aprovado foi registrado de novo com o hash novo (`estado.py aprovar-plano`).
- **Aplicado em:** `plataforma/agentes/tests/plan/plano.py`, `plataforma/agentes/tests/plan/test_regras_plan.py` e fixtures, `plataforma/agentes/adr/0014-sem-principal-curinga.md`, `specs/00-plataforma-agentes/plan.md` (linha Art. IV), `specs/00-plataforma-agentes/spec.md` (Nada público), `specs/00-plataforma-agentes/tasks.md` (T003).
- **Por que:** o risco de um `*` com condição mal escrita é acesso público sem aviso. O erro comum que a regra evita é confiar na presença de uma chave sem ler o valor (1.4, 4.1).
- **Limite:** o teste roda com mock; a conta real só é provada no ensaio contra a AWS (T084).

### 2026-11-20 · D-043 · Testes do harness em um arquivo por assunto · fonte: Marcos
Os PRs #22 a #29 entraram em conflito porque todos acrescentavam uma classe no mesmo ponto do `harness/test_harness.py`. O Marcos pediu a regra de testes do harness por assunto.
- **Como ficou:**
  - os 84 testes foram para 8 arquivos em `harness/testes/`: agentes, memória, SDD, infra, caminho padrão, git, workflows e regras do dono;
  - o que mais de um assunto usa fica em `comum.py`;
  - o `test_harness.py` só reúne os arquivos (`load_tests`), então os comandos de antes continuam funcionando.
- **Por que:** PRs paralelos mexem em arquivos diferentes e não disputam o mesmo trecho. O conflito deixa de depender de alguém lembrar a regra.

**Aplicado em:**
- teste `test_organizacao_dos_testes.py`, que reprova teste no `test_harness.py`, arquivo fora do padrão ou sem docstring de assunto;
- skill `evolucao-do-harness`;
- referências do `tasks.md` e do ADR-0007 da plataforma;
- o `plan.md` não foi tocado, então a aprovação continua valendo.

### 2026-11-20 · D-042 · Terraform roda na máquina do dono · fonte: Marcos
A sessão de nuvem não baixa o Terraform nem os providers. O Marcos escolheu rodar as tarefas de Terraform numa sessão do Claude Code no computador dele, com ciclo de teste em segundos e o Floci local.
- **Recusadas:**
  - o híbrido, com o Terraform validado só pelo CI;
  - tudo pelo CI.
- **Decisão delegada que vem junto: um escritor por branch.** A sessão local implementa a plataforma inteira, na ordem do `tasks.md`, porque as tarefas têm dependências entre si. A orquestração na nuvem não comita no mesmo branch. Isso evita conflitos e trabalho perdido, a mesma lição da D-032.

**Aplicado em:**
- skill `terraform-tdd` (onde rodar e um escritor por branch);
- `CLAUDE.md` (Sessões);
- teste `TestOndeRodaOTerraform`;
- Monday: card com o prompt da sessão local.

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
