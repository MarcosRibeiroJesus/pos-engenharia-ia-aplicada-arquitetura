# Análise SDD: `01-recomendacao`

**Veredito em vigor: APROVADO na rodada 2 de 2 (2026-11-20).** A rodada 1 (REPROVADO) fica abaixo como histórico; a rodada 2 vem no fim.

## Rodada 1 (2026-11-20)

- **Data:** 2026-11-20 · **Rodada:** 1 de 2
- **Analista:** analista-sdd (Claude Opus 5.5), em instância independente. Não escreveu a spec, o plano nem as tarefas (4.6).
- **Base:** worktree `/home/claude/wt-d01`, branch `modulo/01-fundamentos-ia-llms/03-recomendacao`, commit `f7d6548`. Artefatos lidos: `spec.md`, `plan.md`, ADRs 0007 a 0016, `tasks.md` (76 tarefas, com a seção "Furos") e `matriz.md`. Também li a constituição, o `DECISOES.md` da memória compartilhada (com a D-056 em vigor), o código da unidade e as tarefas da `00-plataforma-agentes` citadas como dependência.
- **Hash do plano:** o `sha256` do `plan.md` (`b7ef44d7…1c0a27`) é igual ao de `plano_aprovado` no `harness/estado.json`. Esta análise não mexeu no plano.
- **Linha de base dos testes (nesta sessão):**
  - harness: 88 testes, com as 2 falhas conhecidas do RNF-106 (workflows `recsys-01-03-*` fora das regras de cadeia de suprimentos), que a T010 corrige;
  - Vitest da unidade: 39 de 39;
  - unittest do lote: 14 de 14;
  - `estado.py validar` e `pode-delegar`: ok.

### Resultado por critério
| Critério | Resultado | Achados |
|---|---|---|
| Cobertura | passa | Os 44 requisitos (RF-001 a RF-017, RF-104 a RF-111, RNF-001 a RNF-008 e RNF-101 a RNF-111) têm tarefa e teste na `matriz.md`. Toda tarefa cita requisito, artigo, risco ou decisão do dono. Todo id de teste novo do plano tem tarefa |
| Constituição | passa, com ressalva | Cada desvio tem ADR: Serverless sem isolamento de rede (ADR-0009), exceções de nome (ADR-0014), MemoryDB `open-access` e HTTP entre o ALB e a task (ADR-0003), `InvokeGateway` sem alvo como risco (R9 e ADR-0010). Ressalva: a afirmação de menor privilégio do Bedrock (Art. IV) está escrita de três jeitos diferentes (A01) |
| Ambiguidade | falha | A03 (pré-condições do DM-07), A02 (canal do relatório do roteiro) |
| Pendências | passa | Nenhum `[PENDENTE]` nos artefatos. P01-P1 a P01-P5 foram respondidas (D-051 a D-054 e D-056). As pendências da conta (ambiente `aws-lab-destroy`, OIDC e tag de custo) só travam tarefas `[DONO]` (T033 e T104), e isso está marcado |
| Consistência | **falha** | A01 (bloqueante), A02, A06, A08 |
| Testabilidade | passa | Toda tarefa de agente começa por teste vermelho, ou por um critério de revisão que reprova (T096, T097, T101, T102, T105 e T108). As tarefas `[DONO]` são manuais por natureza |
| Operação e custo | passa, com ressalvas | Existem as tarefas dos workflows de destroy (T010, T056 e T064) e o teto diário calculado no plano. Ressalvas: A04 (destroy concorrente), A05 (unidade e peso no gate de custo), A07, A09 e A10 |

### Verificações pedidas no briefing
- **Teto diário e limite mensal.** A conta fecha:
  - **base:** US$ 4,564 em 24 h;
  - **janela do MWAA:** US$ 1,864 em 3 h (US$ 1,284 em 2 h);
  - **total:** US$ 6,428. Com cerca de 10% de margem, dá 7,07, arredondado para US$ 7,10, que é o valor aprovado pelo dono (D-056);
  - **preço do Fargate:** confere, com US$ 0,04048 por vCPU-hora e US$ 0,004446 por GB-hora;
  - **peso no mês:** nos tetos, US$ 7,10 mais US$ 1,20 da plataforma dão US$ 8,30, ou 41,5% do limite de US$ 20, que o plano arredonda para 42%. Na estimativa, US$ 7,60 dão 38%. Duas demonstrações da D01 no mês dão 83%, como o plano diz. Um dia de demonstração cabe no limite mensal.
  - **Ressalvas:** a A07 (premissa do guardrail sem a retentativa) e a A05 (gate). Mesmo com a correção da A07, o total vai a US$ 6,78 e continua abaixo de US$ 7,10.
- **Destroy em cascata (janela, depois base, depois plataforma).**
  - **Prazos:** o da janela fica no máximo 1 h antes do prazo da base (T022). O da base fica no máximo 1 h antes do prazo da plataforma (plataforma T041, limite do consumidor). Isso faz a cascata de prazos.
  - **Ordem do destroy:** o destroy da base roda antes o da janela (T056). O agendador derruba o componente antes da base (T023), e a plataforma espera os consumidores (plataforma T042).
  - **Verificação de sobras:**
    - na base, pela tag `project`, ignorando a chave KMS em `PendingDeletion` e o serviço ECS `INACTIVE`, e reprovando log group com o prefixo `airflow-p01-recomendacao`;
    - na janela, por `project` e `module` juntos;
    - provada no FL-04 (destroy em cascata no Floci) e no DM-09 (sobras no dia da demonstração).
  - **Ressalva:** falta fixar a concorrência entre os dois destroys (A04).
- **Dependências da plataforma (R9, módulo `registro-produto`).** Estão explícitas no campo "Depende de" das tarefas T020, T022, T023, T053, T055, T056, T100 e T104 e na tabela da `matriz.md`. Conferi que todas as tarefas citadas da plataforma existem (T030, T032 a T034, T036 a T038, T040 a T043, T048, T053, T080, T083 e T084). Nenhuma tarefa de agente que usa algo da plataforma fica sem a marcação; T054 e T024 dependem dela por transitividade (T053 e T021), o que basta.
- **Furos F1 e F7 do `tasks.md`.**
  - **F1** (permissões do Bedrock da task role): **bloqueante** (A01). A contradição também está na spec, e não só no plano.
  - **F7** (status do teto e dos ADRs): **menor** (A06).
- **Lacunas da spec retroativa.** Todo requisito marcado lacuna ou `[DIVERGÊNCIA]` tem tarefa:
  - RNF-101 (workflows dos modelos): T010, T055, T056 e T064;
  - RNF-102 (teto diário): T013;
  - RNF-103 (gate de custo único): T010 e T024;
  - RNF-104 (categoria sem injeção): T070 e T071;
  - RNF-105 (deploy com ABAC): T030 a T033;
  - RNF-106 (cadeia de suprimentos): T010;
  - RNF-107 (tags): T011 e T060;
  - RNF-108 (prefixo): T012 e T061;
  - RNF-109 (catálogo fictício): T077;
  - RNF-110 (fonte única): T092 a T094;
  - RNF-111 (posts com fonte): T094 e T108;
  - RF-104 (30 dias no serviço real): T074;
  - RF-105 (vetor da sessão): T072;
  - RF-106 (falha visível): T073;
  - RF-107 (lote coerente): T041, T046 e T050;
  - RF-108 (roteiro): T090 e T091;
  - RF-109 (re-ranker aceito): T042 e T051;
  - RF-110 (plataforma): T053 e T080 a T084;
  - RF-111 (proveniência das gravadas): T080 e T107.

  Os "comportamentos atuais a registrar" também têm tarefa: o health sempre `UP` (T076), o vetor de 128 zeros (T072), o `SORTBY` (T071) e o README com 14 módulos (T093). Conferi no código as lacunas principais, e todas existem como a spec descreve:
  - `new Float32Array(128)` em `get-recommendations.use-case.ts`;
  - `(@cat:{${category}})` e `SORTBY` em `memorydb-vector-candidate.repository.ts`;
  - `catch` que devolve lista vazia nos dois adaptadores;
  - `enable_network_isolation = true` no `sagemaker_endpoint`;
  - `project_name = "recsys"`;
  - Budgets `MONTHLY`;
  - os três `recsys-01-03-*.yml`.

### Achados
Cada achado traz severidade, local, problema, a boa prática (o que o arquiteto faz e o erro comum que ela evita, D-036) e a correção sugerida. Os ids das tarefas da prova vêm no fim.

#### A01 · bloqueante · Spec, plano e tarefas descrevem três conjuntos diferentes de permissões do Bedrock para a task role (furo F1)
- **Local:**
  - `spec.md`, RF-110: "IAM: a task role só invoca o próprio perfil", e o aceite "a task role só tem `bedrock:InvokeModel` no ARN do perfil vindo do contrato";
  - `plan.md`, STRIDE, linha "E: role do serviço amplia acesso ao Bedrock": "só `InvokeModel` no ARN do perfil, com condição de guardrail; só `ApplyGuardrail` no próprio guardrail";
  - `plan.md`, matriz, linha "Art. IV · menor privilégio": "Bedrock só no perfil";
  - `plan.md`, R9, e ADR-0010: o módulo dá `InvokeGateway` ao agente mesmo sem alvo;
  - `tasks.md`, T053 (TT-B01, o teste das ações do Bedrock na task role) e a linha F1 dos furos.
- **Problema:**
  - a task role nasce no módulo `registro-produto` da plataforma. Pelo plano da plataforma, esse módulo dá:
    - `bedrock:InvokeModel` e `Converse` no perfil e nos **modelos de origem** dele;
    - `bedrock-agentcore:InvokeGateway` no gateway;
    - `ssm:GetParameter` no `comum` e no parâmetro do produto;
  - além disso, o perfil `us.` roteia para várias regiões, então a política precisa cobrir os modelos de origem. "Só no ARN do perfil" não funciona na AWS;
  - o próprio plano se contradiz: o STRIDE e a matriz dizem "só `InvokeModel` no perfil", e o R9 diz que há `InvokeGateway`;
  - a T053 resolve com uma terceira leitura (toda ação `bedrock:*` no perfil, nos modelos de origem e no guardrail), que não é a da spec nem a do plano;
  - a T097 (modelo de ameaças contra os testes) vai conferir cada linha do STRIDE contra um teste verde. Com o texto de hoje, ela confere uma afirmação de segurança que a composição real não cumpre, ou reprova a composição correta;
  - o dono aprovou o plano (D-056) lendo "só `InvokeModel` no perfil". A permissão efetiva é mais ampla: `Converse`, `InvokeGateway`, `ssm:GetParameter` e os modelos de origem. Isso não é cosmético: é a afirmação de menor privilégio do Art. IV que entrou na aprovação.
- **Boa prática:** **a afirmação de segurança é igual nos três artefatos e testável como está escrita.** O arquiteto escreve no modelo de ameaças a permissão que a composição realmente concede, com o porquê de cada ação a mais (modelos de origem do perfil entre regiões; `InvokeGateway` negado pelo Cedar e sem rota na VPC, porque a base não tem endpoint do AgentCore), e o teste afirma exatamente esse texto. O erro comum é aprovar um plano com uma garantia mais forte que a real e deixar a tarefa "interpretar" o texto, de modo que o revisor do modelo de ameaças confere uma promessa que ninguém implementa (1.4, 4.1, 4.6).
- **Correção sugerida:**
  - **no plano (emenda só de texto, que exige nova aprovação do dono, D-033):** reescrever a linha E do STRIDE e a linha "Art. IV · menor privilégio" da matriz com a leitura da T053. O texto fica: ações do Bedrock só no ARN do perfil do contrato, nos modelos de origem dele (condição `bedrock:InferenceProfileArn`) e no próprio guardrail; invocação com a condição `bedrock:GuardrailIdentifier`; o ECS não acrescenta ação do Bedrock; `InvokeGateway` e `ssm:GetParameter` vêm do módulo, como risco residual do R9 (negado pelo Cedar e sem endpoint na VPC);
  - **na spec (sem hash, alinhamento como o do `d846805`):** o RF-110 passa a dizer o mesmo, tanto no item "IAM" quanto no aceite TT;
  - **junto,** aplicar a emenda do F7 (A06), para levar uma única emenda ao dono.

#### A02 · importante · O roteiro lê as métricas de dentro da tarefa ECS, sem rota de rede e sem permissão, e o canal do relatório não está definido
- **Local:** ADR-0016, item 3 ("A tarefa ... lê as métricas do namespace"); `tasks.md`, T091 (aceite "as métricas lidas do namespace") e T090 ("baixa o relatório dela"); ADR-0013 e T014 (TT-K02: exatamente 5 endpoints na base, sem `monitoring`); `plan.md`, "Ordem do dia" (o destroy da janela, a única raiz com endpoint `monitoring`, vem antes do roteiro `servico`); TT-R01 (a role do roteiro não tem permissão que a task role não tenha).
- **Problema:**
  - **sem rota:** a tarefa roda na subnet privada, sem NAT e sem endpoint `monitoring` na base. Quando o roteiro `servico` roda, a janela já foi destruída. Então a leitura de `GetMetricData` de dentro da tarefa não tem rota de rede;
  - **sem permissão:** a task role não tem `cloudwatch:GetMetricData`, e o TT-R01 proíbe acrescentar. O F3 deu essa permissão à role de deploy, que roda no runner, e não na tarefa;
  - **canal do relatório:** "baixa o relatório dela" não diz por onde. A task role não escreve no S3, então sobra o log (stdout pelo `awslogs`). Para isso, a role de deploy precisa de `logs:GetLogEvents` ou `FilterLogEvents` e de `ecs:DescribeTasks` para esperar a tarefa, e nada disso está na lista do ADR-0015 nem no F3;
  - **efeito:** a evidência do RF-108 (os números das métricas do RNF-003) falharia no dia da demonstração, com o relógio do teto correndo.
- **Boa prática:** **cada passo roda onde tem rede e permissão para rodar, e isso é decidido antes do dia caro.** O arquiteto separa o que precisa estar dentro da VPC (as chamadas ao ALB interno) do que lê APIs de controle (as métricas e os logs) e põe o segundo no runner, com a role que já tem a permissão. O erro comum é descobrir no apply real que a tarefa não alcança a API, que é exatamente o risco que o próprio plano cita na E13 (1.4, 1.6, 5.3).
- **Correção sugerida (sem mudar o plano):**
  - no ADR-0016, a tarefa grava o relatório dos passos (`requestId`, status e latências) em stdout, numa linha JSON marcada, e o job do workflow lê essa linha do log e as métricas por `GetMetricData` no runner;
  - na T091, o aceite deixa de ler métricas de dentro da tarefa;
  - na T090, entram esses dois passos no workflow;
  - na T031, entram `logs:GetLogEvents` (ou `FilterLogEvents`) no log group `01-recomendacao-*` e `ecs:DescribeTasks`, cada um com a fonte, como o F3 já fez.

#### A03 · importante · O DM-07 exige o candidato igual à semente dentro de 1e-6, mas não garante os mesmos dados nem a mesma versão do XGBoost
- **Local:** `plan.md`, matriz, RF-014 ("o candidato do DAG prediz igual à semente, dentro de 1e-6"); `tasks.md`, T042 (semente com `xgboost==1.7.6` e `nthread = 1`, no runner), T046 (treino do candidato no DAG) e T104 (DM-07).
- **Problema:**
  - **dados diferentes:** a semente é treinada no runner do apply. O candidato é treinado no SageMaker sobre o CSV que o Glue de features gera do dia, depois do Athena com poda de partição. Nada nas tarefas diz que os dois treinam sobre o mesmo CSV, byte a byte;
  - **versão diferente:** a versão do XGBoost dentro do container nativo 1.7-1 não está confirmada, e pode não ser a 1.7.6 da semente;
  - **parâmetros:** a T042 fixa `nthread = 1` no script, mas a T046 não diz que o mesmo valor vai nos hiperparâmetros do job de treino;
  - **efeito:** com dados ou versão diferentes, a igualdade em 1e-6 falha por um motivo que não é defeito, e o DM-07 reprova no dia da demonstração.
- **Boa prática:** **um critério de igualdade numérica só vale com as entradas fixadas.** O arquiteto escreve as pré-condições (mesmo arquivo de entrada, mesma versão, mesmos hiperparâmetros) no próprio teste, ou troca a igualdade por um critério de qualidade com tolerância. O erro comum é um critério preciso sobre entradas que ninguém garante, e o teste reprova por ruído e perde a credibilidade (4.1, 5.6).
- **Correção sugerida (sem mudar o plano):**
  - na T042 e na T046, a semente e o candidato treinam sobre o mesmo CSV de treino. Por exemplo, o runner gera a semente a partir do CSV que o gerador sintético e a transformação do Glue produzem localmente com a mesma semente, e o DM-07 compara sobre esse mesmo arquivo;
  - os hiperparâmetros do job incluem `nthread = 1` e a semente;
  - a T102 confirma a versão do XGBoost no container 1.7-1, com fonte. Se ela não for a 1.7.6, a semente passa a fixar a mesma versão do container.

#### A04 · importante · Os destroys da janela e da base podem disputar o mesmo state, e o grupo de concorrência não está fixado
- **Local:** `tasks.md`, T023 (o agendador gera o destroy do componente e depois o da base), T056 (o destroy da base roda antes o destroy da janela) e T064 (workflows da janela); `harness/modelos/destroy.yml` (`concurrency.group: <CHAVE>-state` e `-lock-timeout=120s`).
- **Problema:**
  - **dois destroys da janela:** quando a base vence com a janela registrada, o agendador dispara o destroy da janela e o da base. O destroy da base também roda o destroy da janela. São dois `terraform destroy` sobre o state da janela;
  - **grupo de concorrência:** se os workflows da janela não ficarem no mesmo grupo dos da base (`01-recomendacao-state`), os dois rodam juntos. A remoção do MWAA leva dezenas de minutos (ADR-0007), e o lock espera só 120 s. O passo da janela no destroy da base falha, e a base fica no ar até o redisparo de 3 horas, passando do dia de demonstração;
  - **o que os testes conferem:** o TH-07 (workflows iguais ao modelo) compara jobs e passos, não o bloco `concurrency`. O TH-02 (destroy em cascata) confere a ordem do disparo, não a serialização.
- **Boa prática:** **o destroy em cascata é idempotente e serializado por construção.** O arquiteto põe todas as raízes do mesmo projeto num só grupo de concorrência e faz o agendador disparar só o nível de cima quando ele já desce em cascata. O erro comum é confiar na ordem do disparo de dois workflows assíncronos e deixar o lock decidir quem ganha (1.4, 5.3).
- **Correção sugerida (sem mudar o plano):**
  - na T064, um teste afirma que os quatro workflows de apply e destroy (base e janela) têm o mesmo `concurrency.group` (`01-recomendacao-state`) com `cancel-in-progress: false`;
  - na T023, com a base vencida, o agendador dispara só o destroy da base, que já derruba a janela antes (T056). O destroy da janela sozinho fica para quando só a janela venceu.

#### A05 · importante · O gate de custo pode encolher a janela duas vezes, e a unidade do arquivo de uso não está escrita
- **Local:** `tasks.md`, T024 (o gate pesa a raiz da janela por `prazo_maximo_horas/24`) e T096 (o `infracost-usage.yml` da unidade com "horas do MWAA", requisições, tokens e unidades de guardrail); `.github/ia/gate_custo.py` (`diario = mensal × 24/730`); análise da plataforma, N01 (a mesma armadilha de unidade).
- **Problema:**
  - **peso duplo:** se o arquivo de uso reduzir as horas do MWAA para 3 h e o gate também pesar a raiz por 3/24, a janela entra no gate com 3/24 × 3/24 do custo;
  - **unidade:** as quantidades do plano são de um dia (2.000 requisições, 200 explicações), e as chaves do Infracost são mensais. Escritas como estão, viram premissas de um mês e saem cerca de 30 vezes menores, que é o mesmo defeito que a análise da plataforma achou (N01);
  - **linhas não cobertas:** o gate continua comparando só o total do Infracost com o teto. O Claude e o guardrail (cerca de US$ 0,60) ficam só no comentário da T096, igual ao parcial da A09 da plataforma;
  - **efeito:** o gate fica verde mesmo quando o dia passa do teto.
- **Boa prática:** **uma conversão por lugar, com a unidade escrita e testada de ponta a ponta.** O arquiteto decide um ponto único para o peso da janela (o gate) e escreve as premissas na unidade que a ferramenta lê. O erro comum é aplicar a mesma redução em dois lugares e ver o gate passar com um número que ninguém calculou (4.1, 4.4).
- **Correção sugerida (sem mudar o plano):**
  - na T096, o arquivo de uso não leva horas do MWAA, porque o peso é só da T024. As quantidades vão em equivalente mensal (premissa diária × 730/24), com um comentário que liga cada valor à linha do plano;
  - um teste confere que o valor diário calculado pelo gate é igual ao da tabela "Custo do lab", dentro de 1 centavo;
  - a T024 adota a mesma regra que a plataforma usar para as linhas não cobertas (A09 dela), para os dois projetos terem um só gate.

#### A06 · menor · O plano e os ADRs ainda tratam o teto como proposta (furo F7)
- **Local:**
  - `plan.md`, "Resumo": "O valor de 7,10 é proposta e depende da resposta à P01-P5";
  - `plan.md`, "Custo do lab": "só vale com a aprovação do plano e a resposta à P01-P5";
  - cabeçalho dos ADRs 0007 a 0016: "proposto (plano da D01 aguardando a aprovação do dono)". No ADR-0013, também "o valor do teto depende da P01-P5".
- **Problema:**
  - o número é o mesmo nos três lugares (US$ 7,10) e a D-056 está na memória, que prevalece. Então nenhuma tarefa trava;
  - o risco é um especialista de custo ler "depende da resposta" e parar, ou levar ao dono uma pergunta que já foi respondida.
- **Boa prática:** **o estado do documento é igual ao registro.** O arquiteto mantém o status do plano igual ao do `estado.json` e da memória. O erro comum é o leitor tomar como pendente o que já foi decidido e reabrir a decisão (5.1).
- **Correção sugerida:**
  - nos ADRs, a T000 já corrige o status;
  - no plano, as duas frases entram na mesma emenda de texto da A01, para o dono aprovar uma vez só.

#### A07 · menor · O pior caso do guardrail não conta a retentativa
- **Local:** `plan.md`, "Custo do lab", premissas e linha "Guardrails: 200 × 9 unidades".
- **Problema:**
  - a premissa dobra os tokens do Claude no pior caso (retentativa), mas conta as unidades do guardrail uma vez só: 6 na entrada, 1 na saída e 2 no `ApplyGuardrail`;
  - com a retentativa, o guardrail do InvokeModel avalia a entrada e a saída duas vezes: 6 × 2 + 1 × 2 + 2 = 16 unidades;
  - a linha vai de US$ 0,45 para 0,80, e o total do dia vai de US$ 6,43 para 6,78. Ainda cabe no teto de US$ 7,10, com 4,7% de folga.
- **Boa prática:** **a mesma premissa de pior caso em todas as linhas que ela afeta.** O arquiteto aplica a retentativa a tudo o que ela repete. O erro comum é dobrar uma linha e esquecer a vizinha, e a margem real fica menor que a anunciada (4.4).
- **Correção sugerida:** na T096 e na T105, o arquivo de uso e a comparação usam 16 unidades no pior caso. O teto não muda: se a conta real passar dele, a T096 já leva a pergunta ao dono.

#### A08 · menor · Dois textos da spec ficaram atrás do plano e das tarefas
- **Local:**
  - `spec.md`, "Deu certo quando", item 2: diz que a única exceção da verificação de sobras é a chave KMS em `PendingDeletion`. O RNF-101 e a T056 também ignoram o serviço ECS `INACTIVE` (ADR-0006);
  - `spec.md`, RF-111: lista só `sintetica` e `documentacao`. A T080 acrescenta `captura` (furo F8).
- **Boa prática:** **a spec acompanha o que as tarefas testam.** O arquiteto alinha o texto da spec quando a fase seguinte resolve um furo, como já foi feito no `d846805`. O erro comum é a verificação final ler o critério da spec e reprovar uma exceção que as tarefas aceitam (5.1).
- **Correção sugerida:** alinhar os dois textos da spec, que não entra no hash do plano, no mesmo commit da A01.

#### A09 · menor · O Budgets diário pode herdar uma notificação de previsão (incerto)
- **Local:** `modules/cloudwatch_monitoring/main.tf` (hoje com duas notificações, `ACTUAL` e `FORECASTED`); `tasks.md`, T013 (TT-K01 confere `time_unit` e `limit_amount`, mas não o tipo da notificação).
- **Problema:**
  - se a T013 só trocar `MONTHLY` por `DAILY`, a notificação de previsão continua;
  - pelo que sei da documentação do AWS Budgets, a previsão não vale para orçamento diário e exige histórico de uso. **Não confirmei nesta análise**, e por isso o achado é incerto (5.6);
  - se a AWS recusar, o apply falha no dia da demonstração, porque o mock provider do `terraform test` não pega isso.
- **Boa prática:** **afirmação de serviço só com fonte, e a dúvida vira item de conferência.** O arquiteto põe a dúvida na tarefa de pesquisa antes do apply real. O erro comum é carregar uma configuração do recurso antigo para o novo sem conferir se o novo aceita (5.6).
- **Correção sugerida:**
  - o TT-K01 afirma só notificações `ACTUAL` no Budgets diário;
  - a T102 confere o suporte à previsão no orçamento diário, com fonte e data.

#### A10 · menor · A janela pode nascer com prazo menor que o tempo de criação do MWAA
- **Local:** `tasks.md`, T022 (o prazo da janela é o menor entre o máximo, o pedido e o prazo da base menos 1 h); ADR-0007 (a criação e a remoção levam dezenas de minutos cada uma).
- **Problema:**
  - se a base tiver menos de cerca de 2 h, a janela pode ser registrada com 30 min ou menos;
  - o agendador roda de hora em hora, então o MWAA pode ser destruído antes de ficar pronto ou no meio do DAG;
  - a plataforma tratou o mesmo caso com um prazo útil mínimo (análise da plataforma, A10: pelo menos 2 h restantes).
- **Boa prática:** **recusar cedo o que não tem tempo de dar certo.** O arquiteto põe um prazo útil mínimo no registro do componente caro. O erro comum é pagar a criação de um recurso que vai ser destruído antes de servir (1.4).
- **Correção sugerida:** na T022, recusar a janela se o prazo resultante ficar abaixo de 1 h, com a mensagem de que a base pode ser estendida (`infra.py estender`).

#### A11 · menor · O TH-07 fica vermelho por um tempo quando a plataforma mudar os modelos de workflow
- **Local:** `tasks.md`, T010 (TH-07: os workflows da D01 contêm todos os passos do modelo preenchido) e plataforma T043 e T048, que mudam `harness/modelos/apply.yml` e `destroy.yml` em outro branch.
- **Problema:**
  - a T010 gera os workflows do modelo de hoje;
  - quando a T043 e a T048 da plataforma entrarem no `main`, o TH-07 da D01 reprova até a T055 e a T056 regenerarem os arquivos;
  - isso é esperado, mas não está escrito, e quem vir o vermelho pode achar que é defeito da D01.
- **Boa prática:** **dependência entre branches escrita onde o teste falha.** O arquiteto avisa, na tarefa, qual mudança de fora deixa o teste vermelho e qual tarefa o devolve ao verde. O erro comum é "corrigir" o teste para passar e perder a regra (5.3).
- **Correção sugerida:** uma nota na T010 dizendo que o TH-07 acompanha o modelo e que, depois da plataforma T043 e T048, o verde volta com a T055 e a T056.

### Perguntas ao dono
Nenhuma pergunta nova de escopo, produto ou orçamento. A correção da A01 muda o texto do `plan.md`, então a aprovação do plano cai (D-033). A orquestração mostra a emenda ao dono no chat e registra a nova aprovação com `estado.py aprovar-plano` antes de delegar de novo.

| id | pergunta | bloqueia | opções | recomendação |
|---|---|---|---|---|
| — | (registro) aprovar a emenda de texto do plano da recomendação, com A01 e A06 | a rodada 2 da análise e a fase implementar | aprovar; pedir ajuste | aprovar, porque a emenda só alinha o texto ao que a T053 já testa, sem mudar o desenho nem o custo |

### Próximos passos
1. A orquestração delega a emenda de texto do `plan.md` (A01 e A06) e o alinhamento da spec (A01 e A08) ao especialista do plano. Na mesma passada, as correções nas tarefas e nos ADRs que não mexem no plano: A02 (ADR-0016, T090, T091 e T031), A03 (T042, T046 e T102), A04 (T023 e T064), A05 (T024 e T096), A07, A09 (T013 e T102), A10 (T022) e A11 (T010).
2. O dono aprova a emenda no chat, e a orquestração registra com `estado.py aprovar-plano 01-recomendacao`.
3. A rodada 2 roda numa instância nova do analista-sdd.

**Veredito da rodada 1: REPROVADO**

Contagem: 1 bloqueante (A01), 4 importantes (A02 a A05) e 6 menores (A06 a A11).

## Rodada 2 (2026-11-20)

- **Data:** 2026-11-20 · **Rodada:** 2 de 2 (a última)
- **Analista:** analista-sdd (Claude Opus 5.5), em instância nova e independente. Não escreveu a spec, o plano, as tarefas, a emenda 1 nem a rodada 1 (4.6).
- **Base:** worktree `/home/claude/wt-d01`, branch `modulo/01-fundamentos-ia-llms/03-recomendacao`, commit `8dc6b22`. Li o diff `1d4f55a..8dc6b22` inteiro e de novo, por inteiro, `tasks.md`, as seções do `plan.md` que as correções tocam, a `matriz.md`, os ADRs 0010 e 0016, o `DECISOES.md` e o `HISTORICO.md` da memória compartilhada (D-057, emenda 1 aprovada, em vigor) e o plano e as tarefas da `00-plataforma-agentes` que viraram dependência. Conferi no código da unidade o DAG, o SQL do Athena e os módulos `athena_queries`, `lake_formation`, `mwaa_orchestration`, `ecs_service`, `glue_pipeline` e `sagemaker_endpoint`.
- **Hash do plano:** o `sha256` do `plan.md` (`3a69dacf…e90479`) é igual ao de `plano_aprovado` no `harness/estado.json`, registrado depois da D-057 (emenda 1 do plano aprovada). Esta análise não mexeu no plano.
- **Linha de base dos testes (nesta sessão):**
  - harness: 88 testes, com as 2 falhas conhecidas do RNF-106 (workflows `recsys-01-03-*` fora das regras de cadeia de suprimentos), que a T010 (workflows da D01 a partir dos modelos) corrige;
  - Vitest da unidade: 39 de 39;
  - unittest do lote: 14 de 14;
  - `estado.py validar` e `pode-delegar 01-recomendacao`: ok.
- **Limite desta rodada (5.6):** a página de concorrência do GitHub Actions (`docs.github.com`) e o repositório do container do XGBoost no GitHub foram recusados pelo proxy desta sessão. Por isso não confirmei a opção `queue: max` (A22) nem a versão do XGBoost no container 1.7-1, que continua com a T102 (disponibilidade e preços antes do primeiro apply real).

### Placar dos 11 achados da rodada 1
| Achado | Situação | Onde está a correção | Observação |
|---|---|---|---|
| A01 · permissões do Bedrock na task role (bloqueante) | **resolvido** | `plan.md`, emenda 1 (STRIDE linha E, matriz Art. IV e RF-110); `spec.md`, RF-110 (item IAM e aceite TT); T053 (consumo da plataforma), TT-B01 (ações da role composta); ADR-0010, item 4 | Conferi contra o "Cria" do módulo `registro-produto` no plano da plataforma: `InvokeGateway`, `InvokeModel`/`Converse` no perfil e nos modelos de origem com as duas condições, `ApplyGuardrail` no guardrail e `ssm:GetParameter`. Os três artefatos dizem agora o mesmo, e o TT-B01 afirma exatamente esse texto. A falta de rota para `InvokeGateway` e `ssm` bate com os 5 endpoints do TT-K02 (custo fixo da base) |
| A02 · roteiro lendo métricas de dentro da tarefa | **resolvido** | ADR-0016, item 3 e trade-offs; T090 (workflow do roteiro) e TH-08 (passos do job `servico`); T091 (script do roteiro), VT-20 (relatório em stdout); T031 (roles de deploy e plan) | A leitura de log, tarefa e métricas foi para o runner, com `ecs:DescribeTasks` e `logs:GetLogEvents` e as fontes. Um resto pequeno de nome de log group está na A19 |
| A03 · DM-07 (candidato igual à semente) sem entradas fixadas | **parcial** | T042 (treino do re-ranker), T043 (job de features), T046 (DAG no Airflow 2.11), T102, T104 (dia da demonstração) | Função, hiperparâmetros, versão e o `sha256` do CSV estão fixados. Falta fixar as **linhas de entrada**: ninguém carrega os dados sintéticos no lago, o SQL do Athena agrega e usa outra data que o sensor, e o runner não passa pelo Athena (A12). A T042 também não depende da T043, de onde vem a função (A21) |
| A04 · destroys concorrentes no mesmo state | **resolvido** | T023 (`vencidos` e cascata): um disparo por nível; T064 (workflows da janela), TH-09 (mesmo grupo de concorrência nos quatro workflows) | O grupo `01-recomendacao-state` é o que os modelos já usam (`TROCAR-CHAVE-state`). Observação menor sobre `queue: max` na A22 |
| A05 · peso duplo e unidade do arquivo de uso | **parcial** | T024 (gate de custo soma as raízes), T096 (custo do PR contra o teto), TH-10 (arquivo de uso) | Peso só no gate e unidade mensal estão resolvidos. A regra das "linhas não cobertas" depende da plataforma T073, que não a entrega (A17), e a lista de linhas não cobertas e o valor do guardrail ficaram inconsistentes (A18) |
| A06 · teto como "proposta" | **resolvido** | `plan.md`, emenda 1 (Resumo e Custo do lab); T000 (mover os ADRs) para o status dos ADRs e a frase do ADR-0013 | Os ADRs ainda dizem "proposto" até a T000 rodar, como previsto; não trava tarefa |
| A07 · guardrail sem a retentativa | **resolvido** | T096 e T105 (custo real do dia): 16 unidades, US$ 0,80 na linha e US$ 6,78 no dia | A conta confere: 6,428 + 0,35 = 6,778, abaixo de 7,10 com 4,7% de folga. A correção criou uma contradição com o TH-10, na A18 |
| A08 · spec atrás das tarefas | **parcial** | `spec.md`, critério 2 de "Deu certo quando" e RF-111 | A spec foi alinhada, mas o texto do DM-09 (sobras) na T104 ainda cita só a chave KMS (A20) |
| A09 · previsão no Budgets diário | **resolvido** (o fato continua incerto) | T013 (Budgets diário), TT-K01 só com `ACTUAL`; T102 | A regra do teste vale com ou sem suporte à previsão, então a incerteza não trava nada |
| A10 · janela com prazo menor que a criação | **resolvido** | T022 (`registrar --componente`): `prazo_minimo_horas`, padrão 1 | O valor de 1 h precisa ser revisto à luz do tempo do DAG (A15) |
| A11 · TH-07 vermelho pela mudança do modelo | **resolvido** | T010, nota do TH-07 | — |

**Placar:** 8 resolvidos (A01, A02, A04, A06, A07, A09, A10 e A11), 3 parciais (A03, A05 e A08) e nenhum não resolvido. O que falta dos parciais virou achado novo: A12 e A21 (de A03), A17 e A18 (de A05) e A20 (de A08).

### Resultado por critério (reaplicado por inteiro)
| Critério | Resultado | Achados |
|---|---|---|
| Cobertura | passa, com ressalva | Todo RF e RNF tem tarefa e teste na `matriz.md`, e os ids novos (TH-09, TH-10 e TT-I01 no RF-108) têm tarefa. Ressalva: o passo "carregar os dados sintéticos e criar as tabelas" do RF-010 (pipeline diário) e do RF-107 (lote coerente) não tem tarefa (A12), e o mínimo do RF-107 ("nenhum nome fixo nos scripts") não tem teste para o SQL (A13) |
| Constituição | passa, com ressalva | Os desvios continuam com ADR. Ressalva no Art. V (destroy sem sobras): os recursos que o DAG cria fora do Terraform não estão na verificação de sobras (A16) |
| Ambiguidade | passa | As pré-condições do DM-07 e o canal do relatório do roteiro (A02, A03) agora são mensuráveis |
| Pendências | passa | Nenhum `[PENDENTE]` nos artefatos. As pendências da conta (`aws-lab-destroy` e o subject OIDC, D-024) só travam as tarefas `[DONO]` T033 e T104 |
| Consistência | passa, com ressalvas | Spec, plano e tarefas dizem o mesmo sobre o Bedrock (A01). Ressalvas: A15 (tempo do DAG contra a janela), A17 (dependência da plataforma T073), A18, A19, A20 e A21 |
| Testabilidade | passa | Toda tarefa de agente começa por teste vermelho ou por critério de revisão que reprova; as novas exigências (TH-09, TH-10, VT-20 com a linha marcada) também |
| Operação e custo | passa, com ressalvas | Workflows de destroy (T010, T056 e T064) e teto diário calculado no plano existem. O teto de US$ 7,10 continua cobrindo o dia com a correção da A07 (US$ 6,78), e um dia de demonstração com a plataforma continua em 41,5% do limite mensal de US$ 20 nos tetos. Ressalvas: A14, A15, A16, A17 e A18 |

Nenhum achado novo é bloqueante: nenhum pede decisão do dono, nenhum muda desenho, serviço, custo ou teto do plano aprovado, e todos cabem em tarefas que ainda não começaram (a primeira delas, a T040, é da Fase 4). Por isso a regra do veredito dá APROVADO, e cada achado vai para a lista "resolver na implementação" com a tarefa que o absorve.

### Achados novos
Cada achado traz severidade, local, problema, a boa prática (o que o arquiteto faz e o erro comum que ela evita, D-036) e a correção sugerida. Os ids das tarefas da prova vêm no fim. Todo código citado leva um nome curto ao lado (D-050).

#### A12 · importante · Ninguém carrega os dados sintéticos no lago nem cria as tabelas que o Athena lê, e a data da partição não está fixada
- **Local:**
  - `tasks.md`: T040 (gerador sintético, "recebe destino e volume por argumento", sem dizer quem o roda), T055 (workflow de apply da base: o build gera imagem, semente e wheel, mas nenhum dado), T090 (workflow do roteiro, parte `lote`: só liga e dispara o DAG), T050 (os três jobs do Glue: nenhuma tabela do catálogo);
  - código: `U/src/batch/airflow/dags/daily_hybrid_recommendation_pipeline.py` (sensor `S3KeySensor` em `interactions/year=…/month=…/day=…/_SUCCESS` do `ds`); `U/src/batch/athena/extract_curated_features.sql` (lê `interactions` e `catalog`, filtra a partição por `CURRENT_DATE - INTERVAL '1' DAY` e agrega com `SUM` e `GROUP BY`); `U/infra/terraform/modules/lake_formation/main.tf` (só o banco, nenhuma tabela).
- **Problema:**
  - **sem dados:** no dia da demonstração, o sensor do DAG espera um `_SUCCESS` que nenhuma tarefa grava. O DAG para no primeiro passo;
  - **sem tabelas:** mesmo com os arquivos no S3, `interactions` e `catalog` não existem no Glue Data Catalog, e o Athena falha;
  - **duas datas:** o sensor usa o `ds` da execução. Numa execução disparada pelo `InvokeRestApi`, ele é o dia do disparo. O SQL lê a partição de ontem pelo relógio do Athena. As duas nunca apontam para a mesma partição sem combinar;
  - **metade que falta da A03:** a T042 treina a semente com a função pura da T043 "a partir dos dados sintéticos do T040", mas, no DAG, a mesma função recebe a saída agregada do Athena. Sem dizer que as linhas de entrada são as mesmas, o `sha256` do CSV não fecha, e o DM-07 (candidato igual à semente) registra a pré-condição como falha em vez de provar o RF-014 (treino);
  - **o que os testes veem:** o FL-02 (janela no Floci) só confere o DAG carregado, e o PY-06 (validação do DAG) não roda nada. A falha só apareceria no dia caro.
- **Boa prática:** **o caminho dos dados tem dono em cada salto, de ponta a ponta.** O arquiteto lista quem produz cada entrada de cada passo (arquivo, partição, tabela, data) e põe uma tarefa e um teste em cada salto. O erro comum é testar cada etapa sozinha e descobrir na execução real que nenhuma delas põe o dado de entrada no lugar (1.6, 4.1, 5.3).
- **Correção sugerida (sem mudar o plano):**
  - na T055, o build roda o gerador da T040 para uma data de partição fixa, e o Terraform sobe os arquivos e o `_SUCCESS` com `source_hash`. Os mesmos bytes alimentam a semente;
  - na T050, um `aws_glue_catalog_table` para `interactions` e outro para `catalog`, com projeção de partição (ou a partição registrada), no banco com a exceção `p01_recomendacao_` do ADR-0014 (nomes, tags e exceções). Um caso do TT-G01 (jobs do DAG no stack) reprova o SQL que cita tabela fora do stack;
  - na T043, o SQL recebe a data como parâmetro vindo do `ds`, sem `CURRENT_DATE`; e a semente, no runner, usa as mesmas linhas que o Athena devolve. O jeito mais simples: a agregação do SQL passa para a função pura e o Athena só filtra e projeta; ou o runner aplica a mesma agregação, com um teste de equivalência;
  - na T090, a parte `lote` dispara o DAG com `logical_date` igual à data da partição gerada;
  - um PY novo, na T046, afirma que a chave do sensor e a data do SQL saem do mesmo `ds`.

#### A13 · importante · Os nomes fixos do SQL do Athena escapam do PY-01
- **Local:** `tasks.md`, T041 (PY-01, nomes fixos nos scripts do lote: varre só `U/src/batch/**/*.py` e o DAG, com os padrões `s3://`, `ecommerce-`, `recsys-` e `01-recomendacao-`); `U/src/batch/athena/extract_curated_features.sql` (`ecommerce_golden_db.interactions` e `ecommerce_golden_db.catalog`); ADR-0014 (banco do Glue Data Catalog com o prefixo `p01_recomendacao_`).
- **Problema:**
  - o SQL é `.sql`, fora da varredura, e `ecommerce_golden_db` tem sublinhado, então não casa com `ecommerce-`;
  - a T041 lista `U/src/batch/athena/` entre os arquivos, mas o teste não prova a correção ali;
  - depois da T012 (prefixo), o banco passa a `p01_recomendacao_…`, e o SQL com o nome antigo falha no Athena. O mínimo do RF-107 (lote coerente com o stack: nenhum nome fixo) fica sem teste para o SQL, o que o Art. III conta como falha.
- **Boa prática:** **o verificador cobre todo o lugar onde a regra vale, e não só a linguagem principal.** O arquiteto escreve o escopo do teste pelo que a regra protege (todo artefato do lote que cita um recurso), com uma fixture em cada tipo de arquivo. O erro comum é uma regra verde porque não olhou o arquivo que a viola (4.1).
- **Correção sugerida:** na T041, o PY-01 varre também `U/src/batch/**/*.sql` e acrescenta os padrões `ecommerce_` e `_golden_db`, com uma fixture SQL vermelha; o SQL recebe banco e tabelas pelo mesmo arquivo de configuração do DAG (T046), por exemplo por template do operador do Athena.

#### A14 · importante · A role de execução do MWAA, como o TT-J01 a descreve, não deixa o passo do Athena rodar
- **Local:** `tasks.md`, T063 (role de execução do MWAA e configuração do DAG), TT-J01: "`athena:StartQueryExecution` só no workgroup", "S3 com leitura de `dags/` e escrita só em `reranker/candidatos/`"; `U/infra/terraform/modules/athena_queries/main.tf` (`enforce_workgroup_configuration = true` e `output_location = s3://<bucket>/athena_results/`); `U/infra/terraform/modules/lake_formation/main.tf` (o bucket registrado no Lake Formation); `plan.md`, "Stack da janela", role de execução.
- **Problema:**
  - **resultados do Athena:** o Athena grava o resultado em `athena_results/` com as credenciais de quem chamou, que é a role do MWAA. O TT-J01 proíbe escrita fora de `reranker/candidatos/`, então a consulta falha com `AccessDenied`;
  - **acompanhamento:** o operador do Athena no Airflow consulta o estado com `athena:GetQueryExecution`, que não está na lista;
  - **catálogo e Lake Formation:** a consulta lê o Glue Data Catalog (`glue:GetDatabase`, `GetTable` e `GetPartitions`) com a role de quem chama, e, com o local registrado no Lake Formation, precisa de `lakeformation:GetDataAccess` e da permissão `SELECT` nas tabelas para a role do MWAA. Nada disso está no TT-J01 nem no módulo `lake_formation`, que só dá permissão à role do Glue;
  - **tags do treino:** se o DAG cria o training job com a tag `project` (Art. VI), a role precisa de `sagemaker:AddTags` no `training-job/01-recomendacao-*`;
  - **o que o plano diz:** a lista do plano não usa "só" no S3, e todas as ações acima ficam no workgroup, no banco, nas tabelas e no prefixo do projeto. Então a correção cabe na tarefa, como foi feito com o furo F3 na T031, sem emenda.
- **Boa prática:** **menor privilégio é o menor conjunto que funciona, conferido na referência de autorização.** O arquiteto lista cada chamada que o passo faz (inclusive as implícitas, como o resultado do Athena e o catálogo) e limita cada ação ao recurso do projeto. O erro comum é uma role tão curta que o primeiro uso real dá `AccessDenied`, e o conserto feito com pressa no dia vira `*` (4.1, 5.3).
- **Correção sugerida:** na T063, o TT-J01 passa a afirmar o conjunto completo, cada item com fonte e data: `athena:StartQueryExecution`, `GetQueryExecution` e `GetQueryResults` no workgroup; escrita e leitura em `athena_results/` e leitura dos prefixos de dados; `glue:GetDatabase`, `GetTable` e `GetPartitions` no banco e nas tabelas do projeto; `lakeformation:GetDataAccess` e a permissão `SELECT` do Lake Formation às tabelas (no módulo `lake_formation`, pela T050); `kms:GenerateDataKey` e `Decrypt` na chave da base com `kms:ViaService` do S3; `sagemaker:AddTags` no training job. A fixture vermelha continua: `glue:StartJobRun` em `*`, e escrita fora de `athena_results/` e `reranker/candidatos/`.

#### A15 · importante · O tempo do DAG no pior caso não cabe na janela do MWAA
- **Local:** `spec.md`, RF-010 (pipeline diário: Spot com `MaxWaitTimeInSeconds` 7200 e checkpoint); `tasks.md`, T046 (DAG: Spot, `MaxWaitTimeInSeconds` 7200) e T022 (prazo útil mínimo de 1 h); código do DAG (`MaxRuntimeInSeconds` 3600); ADR-0007 (janela do MWAA como componente: "a janela padrão de 2 h cobre criação, execução do DAG e remoção"); `plan.md`, "Custo do lab" (treino de 6 min "sem o desconto do Spot").
- **Problema:**
  - o treino pode esperar capacidade Spot por até 2 h e rodar por até 1 h. A janela tem 2 h por padrão e 3 h no máximo, e a criação do MWAA já leva dezenas de minutos;
  - com espera de Spot, o agendador derruba a janela no meio do DAG, e o DM-07 (candidato igual à semente) não acontece no dia da demonstração;
  - o training job é do SageMaker, fora do Terraform: ele continua rodando depois que o MWAA sai (ver A16);
  - o prazo útil mínimo de 1 h da T022 não cobre criação do MWAA mais o DAG no pior caso;
  - o custo do plano já usa o preço sem desconto do Spot, então o Spot só traz o risco de espera, sem economia que o teto conte.
- **Boa prática:** **todo limite de tempo dentro de um recurso com prazo cabe no prazo.** O arquiteto soma o pior caso de cada passo (criação, espera, execução, remoção) e o compara com o prazo do componente, e o limite de cada passo sai dessa conta. O erro comum é herdar um limite de produção (2 h de espera de Spot) num lab que vive 2 h (1.4, 5.3).
- **Correção sugerida (sem mudar o plano):**
  - na T046, `MaxRuntimeInSeconds` e `MaxWaitTimeInSeconds` pequenos (por exemplo, 900 e 1800 s; a API exige espera maior ou igual à execução), e o PY-06 (validação do DAG) afirma que a soma dos tempos máximos dos passos mais a criação do MWAA cabe no prazo padrão da janela;
  - na T022, o `prazo_minimo_horas` da janela sai dessa soma, e não de 1 h fixa;
  - na T090, a parte `lote` confere o tempo que resta à janela antes de disparar e recusa (com a sugestão de `infra.py estender --componente`) se ele não cobrir o pior caso;
  - na spec, o RF-010 troca o 7200 pelo novo valor, com uma entrada em "Alinhamento com o plano aprovado", como no `d846805` (RNF-101 alinhado à janela). O plano não cita o número.

#### A16 · importante · A verificação de sobras não prevê o que o DAG cria fora do Terraform (em parte incerto)
- **Local:** `tasks.md`, T056 (destroy da base: sobras pela tag, ignorando só a chave KMS em `PendingDeletion` e o serviço ECS `INACTIVE`), T064 (destroy da janela: sobras por `project` e `module`), T046 (o DAG cria o training job), T104 (DM-09, sobras); `spec.md`, critério 2 de "Deu certo quando"; ADR-0006 (lacunas do emulador e regra de sobras).
- **Problema:**
  - **training jobs:** o DAG cria até 2 training jobs por dia. Eles não têm API de exclusão e ficam na conta depois de terminar. Se levarem a tag `project` (Art. VI), a minha leitura é que aparecem no índice de tags e o DM-09 (zero recurso com a tag) reprova. **Não confirmei nesta análise** que o índice de tags lista training jobs terminados, por isso essa parte é incerta (5.6). Se o DAG não puser a tag, o recurso fica sem a tag que o Art. VI exige;
  - **log group automático do treino:** o SageMaker grava os logs do treino em `/aws/sagemaker/TrainingJobs`, criado por ele, sem tag, sem retenção e fora de qualquer destroy. Os módulos já pré-criam os log groups do endpoint e do Glue pelo mesmo motivo (R5 e R7 do código), mas o do treino ficou de fora;
  - **treino ainda rodando:** com a A15, um job pode continuar em `InProgress` depois do destroy da janela, cobrando e escrevendo no bucket da base.
- **Boa prática:** **o destroy conhece tudo o que o sistema cria, inclusive o que nasce fora do Terraform.** O arquiteto lista os recursos criados em tempo de execução, decide para cada um se é apagado, se é ignorado sem custo (com fonte) ou se reprova, e põe isso na verificação de sobras. O erro comum é a verificação por tag só cobrir o que o Terraform conhece e deixar para trás o que o pipeline criou (1.4, 5.6).
- **Correção sugerida:**
  - na T046, o DAG põe as tags `project` e `module` no training job (com `sagemaker:AddTags` da A14);
  - na T056, a verificação de sobras trata training job em `Completed`, `Failed` ou `Stopped` como exceção sem custo, como o ECS `INACTIVE`, e reprova training job em `InProgress`; a exceção entra no ADR-0006 com a fonte, e o critério 2 da spec ganha a mesma frase;
  - o log group `/aws/sagemaker/TrainingJobs` é compartilhado pela conta, então não cabe no stack da base: ou o `infra/conta` o cria com retenção curta, ou a T056 apaga os streams com o prefixo do projeto, e a verificação de sobras confere os streams pelo prefixo, como faz com `airflow-p01-recomendacao`;
  - na T102, uma linha confirma, com fonte e data, se o índice de tags lista training jobs terminados.

#### A17 · importante · A T024 espera da plataforma T073 uma regra de gate que a T073 não entrega
- **Local:** `tasks.md`, T024 (gate de custo soma as raízes e pesa o componente): "o gate adota a mesma regra da plataforma T073 … um arquivo versionado com as linhas que o Infracost não estima … somado ao total antes da comparação com o teto … se a plataforma T073 ainda não tiver entrado, esta tarefa espera por ela"; `matriz.md`, tabela da plataforma (T024 → plataforma T073, "regra única do gate para as linhas que o Infracost não cobre"); `specs/00-plataforma-agentes/tasks.md`, T073 (custo do PR contra o teto), igual no `main` e no branch `plataforma/00-plataforma-agentes-impl`; `.github/ia/gate_custo.py`.
- **Problema:**
  - a T073 da plataforma cria o `infracost-usage.yml` e o `usage_file` no `seguranca.yml`, e manda **o comentário de revisão** somar as linhas não cobertas. Ela não cria arquivo versionado de linhas não cobertas nem muda o `gate_custo.py` para somá-las;
  - a T024 da D01 diz "espera por ela em vez de criar uma segunda regra". Como a T073 nunca vai trazer essa regra, a T024 espera para sempre, e com ela a T096 e a T100, que dependem dela; ou o especialista cria a regra contra o texto da tarefa;
  - na D01, as linhas não cobertas somam cerca de US$ 0,98 (Claude a 0,154, guardrail no pior caso a 0,80 e o treino a 0,023, A18), quase 14% do teto. Sem a soma no gate, o PR fica verde abaixo do custo real.
- **Boa prática:** **dependência entre projetos aponta para uma entrega que existe, escrita na tarefa de quem entrega.** O arquiteto confere que a tarefa da qual depende realmente produz o que ele espera, e, se não produz, põe a entrega num lugar só e avisa o outro projeto. O erro comum é esperar de outro time uma entrega que nunca foi combinada, e o trabalho trava, ou é duplicado em silêncio (1.6, 5.3).
- **Correção sugerida:**
  - na T024, a própria tarefa cria a regra genérica no `gate_custo.py`: um arquivo versionado por raiz (por exemplo, `infracost-nao-coberto.yml`, com linha, valor diário e linha da tabela do plano), somado ao total antes da comparação com o teto, sem nada da D01 no código (skill `evolucao-do-harness`, regra 4), com o registro em `harness/VERSAO.md`;
  - sai a dependência da plataforma T073 na T024 e na `matriz.md`; a dependência real é só a do `usage_file` no `seguranca.yml`, que fica na T096;
  - a orquestração registra no `progresso.md` que a plataforma pode adotar o mesmo arquivo na T073, sem mudar o plano dela.

#### A18 · menor · O TH-10 e o arquivo de linhas não cobertas ficaram inconsistentes com a correção da A07
- **Local:** `tasks.md`, T096: o TH-10 (arquivo de uso) reprova "se o arquivo de linhas não cobertas não tiver o Claude e o guardrail **com o valor do plano**", e o aceite manda usar 16 unidades no guardrail (US$ 0,80), não as 9 do plano (US$ 0,45); `plan.md`, "Custo do lab", linha "Treino do XGBoost"; T096, "o `infracost-usage.yml` da unidade".
- **Problema:**
  - o teste e o aceite da mesma tarefa pedem dois valores diferentes para a linha do guardrail;
  - a lista de linhas não cobertas tem só Claude e guardrail, mas o training job é criado pelo DAG, fora do Terraform, e o Infracost não o vê (US$ 0,023 no plano). A conferência "dentro de 1 centavo" da T096 falha por esse motivo;
  - "o `infracost-usage.yml` da unidade" não diz em que raiz ele fica. O `usage_file` da plataforma T073 é por diretório, então o arquivo precisa estar em `U/infra/terraform/`, onde estão os recursos cobrados por uso (Glue, DynamoDB, logs).
- **Boa prática:** **um número de referência por linha, com o mesmo valor no teste e no aceite.** O arquiteto escreve a premissa corrigida uma vez e faz o teste e o aceite lerem a mesma fonte. O erro comum é corrigir o aceite e esquecer o teste, que passa a reprovar a correção (4.1, 4.4).
- **Correção sugerida:** na T096, o TH-10 compara com "o valor do plano com a correção da A07" (US$ 0,80 no guardrail) e exige também a linha do treino; o caminho do arquivo de uso fica `U/infra/terraform/infracost-usage.yml`, e a raiz da janela não tem arquivo de uso (o peso é só do gate, T024).

#### A19 · menor · Os nomes de log group fixados pela AWS não estão na lista de exceções, e o padrão da T031 depende de um nome que ninguém fixou
- **Local:** `tasks.md`, T012 (prefixo `01-recomendacao-` com exceções versionadas, TT-T02) e T031 (`logs:GetLogEvents` em `log-group:01-recomendacao-*:log-stream:*`); código: `modules/ecs_service/main.tf` (`/ecs/<nome>`), `modules/glue_pipeline/main.tf` (`/aws-glue/jobs/<nome>`), `modules/sagemaker_endpoint/main.tf` (`/aws/sagemaker/Endpoints/<endpoint>`); ADR-0014 (exceções só do MemoryDB, do Glue Data Catalog e do MWAA).
- **Problema:**
  - o nome do log group do endpoint é imposto pelo SageMaker, então ele precisa de exceção no `excecoes_de_nome.json`, com fonte e ADR (ST-04, exceção sem motivo reprova). O ADR-0014 não a lista;
  - o do ECS e o do Glue podem ser renomeados para o prefixo, mas a tarefa não diz qual caminho seguir. Se o especialista escolher a exceção para o ECS (`/ecs/01-recomendacao-…`), o padrão `log-group:01-recomendacao-*` da T031 não casa, e o roteiro falha ao ler o relatório (A02).
- **Boa prática:** **o nome que uma permissão cita é decidido no mesmo lugar que o recurso.** O arquiteto fixa o nome do log group do serviço e faz a permissão e o teste lerem esse nome. O erro comum é a role ser escrita para um nome e o recurso nascer com outro (4.1).
- **Correção sugerida:** na T012, o log group do serviço e o do Glue passam ao prefixo (`01-recomendacao-servico` e `01-recomendacao-glue-…`, com o `--continuous-log-logGroup` apontando para ele), e o do endpoint entra no `excecoes_de_nome.json` e no ADR-0014 com a fonte; o TT-I01 (roles de deploy e plan) da T031 afirma que o padrão de `logs:GetLogEvents` casa com o nome do log group do serviço.

#### A20 · menor · O DM-09 da T104 ainda cita só a chave KMS como exceção (resto da A08)
- **Local:** `tasks.md`, T104 (dia da demonstração), item da ordem: "DM-09: zero recurso com a tag, fora a chave KMS em `PendingDeletion`".
- **Problema:** a spec (critério 2), o plano (workflow de destroy), o ADR-0006 e a T056 também ignoram o serviço ECS `INACTIVE`. O dono, que executa a T104, lê o texto mais curto e pode marcar como falha uma exceção aceita.
- **Boa prática:** **o texto que guia o humano diz o mesmo que o teste.** O arquiteto alinha o roteiro manual com o critério automático. O erro comum é o roteiro de quem opera ficar atrás do teste e gerar alarme falso no dia (5.1).
- **Correção sugerida:** na T104, o DM-09 cita as mesmas exceções do critério 2 da spec, mais a do training job terminado se a A16 entrar.

#### A21 · menor · A T042 usa a função da T043 sem depender dela, e a versão do XGBoost é decidida depois
- **Local:** `tasks.md`, T042 (treino do re-ranker: "Depende de: T040"; "a semente treina sobre o CSV … que a função pura da T043 monta"; "se a T102 achar outra versão … esta fixação muda"); T043 (job de features: "Depende de: T040, T041"); T102 (sem "Depende de", na Fase 10).
- **Problema:**
  - a T042 pode ser executada antes da T043 e não ter a função de que precisa;
  - a T042 fica `[x]` com `xgboost==1.7.6`, e a T102, bem depois, pode reabrir uma tarefa fechada para trocar a versão, o que foge de "um commit por tarefa".
- **Boa prática:** **a ordem das tarefas segue o que cada uma consome.** O arquiteto põe a dependência de quem produz a peça e antecipa a pesquisa que decide um número que outra tarefa fixa. O erro comum é fechar uma tarefa sobre uma premissa que outra, mais tarde, vai mudar (1.6).
- **Correção sugerida:** a T042 passa a depender da T043; a linha da versão do XGBoost da T102 vira um passo de pesquisa antes da T042 (ou a T042 depende dessa linha), e o PY-03 fixa a versão confirmada desde o início.

#### A22 · menor · A opção `queue: max` da T064 não foi confirmada, e o plano B dela para a tarefa sem necessidade
- **Local:** `tasks.md`, T064 (workflows da janela), item "execução pendente substituída".
- **Problema:**
  - não consegui abrir a página de concorrência do GitHub Actions nesta sessão (proxy), então não confirmei a chave `queue` (5.6);
  - se o `actionlint` ou o `zizmor` recusarem a chave, a tarefa para e volta ao `operador-harness`;
  - o caso que a chave protege (um apply da janela substituir um destroy da base pendente) já é barrado pela T022: a janela só é registrada se a base tiver mais de 1 h mais o prazo mínimo pela frente, então não há apply da janela perto do vencimento da base. E o `expirar-infra.yml` redispara o destroy a cada hora.
- **Boa prática:** **um plano B não para o trabalho se outra regra já cobre o risco.** O arquiteto escreve qual controle cobre o caso e só escala quando nenhum cobre. O erro comum é parar uma tarefa por uma opção que não é necessária (5.6).
- **Correção sugerida:** na T064, sem a chave `queue`, a tarefa segue e registra no aceite que o risco é coberto pela recusa da T022 e pelo redisparo do agendador; com a chave confirmada por fonte, ela entra.

### Resolver na implementação
Nenhum destes muda o `plan.md` nem pede decisão do dono. A orquestração acrescenta ao `tasks.md` uma seção "Correções da análise 2" antes de delegar cada tarefa que absorve um achado, para o especialista receber a correção no briefing (o `tasks.md` não entra no hash do plano).

| Achado | Severidade | Tarefa que absorve | Antes de qual tarefa precisa estar no `tasks.md` |
|---|---|---|---|
| A12 · dados sintéticos, tabelas e data da partição | importante | T043 (job de features), T046 (DAG), T050 (jobs do Glue e tabelas), T055 (apply da base), T090 (roteiro, parte `lote`) | T043 |
| A13 · nomes fixos no SQL | importante | T041 (nomes fixos no lote) | T041 |
| A14 · role do MWAA para o Athena | importante | T063 (role de execução do MWAA), com a permissão do Lake Formation na T050 | T050 |
| A15 · tempo do DAG contra a janela | importante | T046 (DAG), T022 (`registrar --componente`), T090 (roteiro), e o alinhamento do RF-010 na spec | T022 |
| A16 · sobras criadas fora do Terraform | importante | T046 (tags do treino), T056 (destroy da base), T102 (pesquisa) | T046 |
| A17 · T024 esperando a plataforma T073 | importante | T024 (gate de custo) e `matriz.md` | T024 |
| A18 · TH-10 com o valor antigo e sem o treino | menor | T096 (custo do PR) | T096 |
| A19 · nomes de log group e padrão da T031 | menor | T012 (prefixo) e T031 (roles de deploy e plan) | T012 |
| A20 · DM-09 com a exceção antiga | menor | T104 (dia da demonstração) | T104 |
| A21 · ordem da T042, T043 e T102 | menor | T042 (treino do re-ranker) e T102 (pesquisa) | T042 |
| A22 · `queue: max` sem confirmação | menor | T064 (workflows da janela) | T064 |

### Perguntas ao dono
Nenhuma. Todos os achados desta rodada são técnicos e cabem em tarefas que ainda não começaram, dentro das decisões delegadas (boas práticas da certificação). O teto de US$ 7,10 (D-056, plano aprovado e teto) continua cobrindo o dia, agora com US$ 6,78 de estimativa no pior caso.

| id | pergunta | bloqueia | opções | recomendação |
|---|---|---|---|---|
| — | nenhuma | — | — | — |

### Próximos passos
1. A fase avança para `implementar` (`estado.py avancar 01-recomendacao implementar`), e a T000 (mover os ADRs) pode começar.
2. A orquestração escreve a seção "Correções da análise 2" no `tasks.md` antes da T012, a primeira tarefa que absorve um achado (A19).
3. A T101 (revisão independente da entrega) e a T097 (modelo de ameaças contra os testes) conferem, no fim, que cada achado desta lista virou teste verde.

**Veredito da rodada 2: APROVADO**

Contagem: nenhum bloqueante, 6 importantes (A12 a A17) e 5 menores (A18 a A22). Dos 11 achados da rodada 1, 8 resolvidos, 3 parciais e nenhum não resolvido.
