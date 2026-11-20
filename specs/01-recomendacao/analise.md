# Análise SDD: `01-recomendacao`

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
