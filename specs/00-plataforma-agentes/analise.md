# Análise SDD: `00-plataforma-agentes`

- **Data:** 2026-11-20 · **Rodada:** 1 de 2
- **Analista:** analista-sdd (Claude Opus 5.5), em instância independente. Não escreveu nenhum dos artefatos (4.6).
- **Base:** branch `plataforma/00-plataforma-agentes-plano`, commit `b28590e`; `spec.md`, `plan.md` com a emenda 1, os 10 ADRs, `tasks.md` e `matriz.md`; constituição; `DECISOES.md` da memória compartilhada em `b87a9dd` (D-038 em vigor).
- **Hash do plano:** o `sha256` do `plan.md` (`e109cef6…c2b5f0`) é igual ao de `plano_aprovado` no `harness/estado.json`. Esta análise não mexeu no plano.

## Resultado por critério
| Critério | Resultado | Achados |
|---|---|---|
| Cobertura | passa | Os 20 requisitos (RF-001 a RF-012 e RNF-001 a RNF-008) têm tarefa e teste na `matriz.md`. Toda tarefa cita requisito, artigo ou decisão do dono. Todos os ids de teste das tarefas estão na matriz do plano, menos o TH-12, que foi declarado como novo |
| Constituição | **falha** | A01 (Art. V: verificação de sobras), A06 (Art. VIII), A07 (Art. VI: prefixo sem ADR) |
| Ambiguidade | falha | A03, A04, A11 |
| Pendências | passa | Nenhum `[PENDENTE]` ou `[BLOQUEADO]` nos artefatos. P00-P1 a P00-P8 respondidas. Só sobram textos de status desatualizados (A13) |
| Consistência | **falha** | A02 (spec contra tarefas), A03 (plano contra ele mesmo), A04, A13 |
| Testabilidade | falha | A05, A09. Toda tarefa de agente começa por teste vermelho; as tarefas `[DONO]` são manuais por natureza |
| Operação e custo | **falha** | A01 (bloqueante), A08, A10, A12, A17. O workflow de destroy e o teto diário existem |

## Verificações pedidas no briefing
- **Matriz e tarefas.** Toda linha da `matriz.md` aponta para uma tarefa que existe, e toda tarefa tem requisito. Ressalva: o TH-10 (T047) olha só `src/` e o código da D03, e não o Terraform do produto que o critério de sucesso 1 também cita (correção na A12).
- **Tarefas `[DONO]` no caminho dos agentes.** São 7: T053, T083, T084, T085, T086 e T088, mais a parte manual da T087. Nenhuma tarefa de agente depende de uma delas sem que isso esteja escrito. As T087, T089 e T090 dependem de T086 e T088, e a dependência está marcada. O T053 não tem o campo `Depende de`: a dependência do T084 só aparece no texto (A11).
- **Teto.** Somei as linhas de novo e dá US$ 1,082. A conta do Evaluations também bate: entrada de 120 mil tokens × 0,0024 = 0,288; saída de 7 mil × 0,012 = 0,084; vezes 2 rodadas = 0,744. O teto de US$ 1,20 é igual ao `teto_diario_usd` (1.2) e deixa 11% de margem.
- **Limite mensal.** Um dia de demonstração (1,082) mais o ensaio (cerca de 0,09) dá US$ 1,17, ou 5,9% dos US$ 20. Cabem cerca de 16 dias de plataforma no mês, sem contar a D03, que ainda não tem teto (fase `especificar`). Isso cabe. Ressalva: a medição real do critério 2 está mal definida (A08).
- **Destroy.**
  - O workflow tem `confirm_stack`, o ambiente `aws-lab-destroy`, OIDC, a verificação pela tag e o `infra.py remover`.
  - A ordem entre produto e plataforma está coberta pelo ADR-0007 e pelas T040 a T043.
  - A verificação de sobras não funciona para este stack (A01), e a parte que olha o caminho no SSM não existe (A12).
- **`[PENDENTE]` e `[BLOQUEADO]`.** Não sobrou nenhum.

## Achados

### A01 · bloqueante · A verificação de sobras reprova todo destroy da plataforma por causa da chave KMS em exclusão
- **Local:**
  - `harness/modelos/destroy.yml`, passo "Verificar sobras pela tag do projeto", e `.github/workflows/00-plataforma-agentes-destroy.yml`;
  - ADR-0001, seção "Risco";
  - spec, critério de sucesso 3;
  - `tasks.md`, T043 e T070, onde nenhuma tarefa trata disso.
- **Problema:**
  - **A chave fica visível depois do destroy.** A chave `00-plataforma-agentes-chave` leva a tag `project=00-plataforma-agentes` pelo `default_tags`. Depois do `terraform destroy`, ela fica 7 dias em `PendingDeletion` e continua com a tag. A Tagging API a devolve, e o próprio ADR-0001 admite isso ("a chave em `PendingDeletion` pode aparecer na busca por tag").
  - **O ADR promete um filtro que não existe.** Ele diz que "o passo do destroy já prevê ignorar chave em exclusão, com teste". No modelo, esse filtro é só um comentário ("Ajuste por projeto…"), e não há teste.
  - **O ajuste não pode ser feito só neste projeto.** O teste `test_workflows_da_plataforma_iguais_ao_modelo` exige que o workflow da plataforma seja idêntico ao modelo.
- **Efeito:**
  - todo destroy da plataforma termina com `exit 1`;
  - o job `prazo` (`needs: destroy`) não roda, e o registro de prazo não sai;
  - o `expirar-infra.yml` redispara o destroy a cada 3 horas, por 7 dias;
  - o critério 3 ("devolve zero") fica inalcançável;
  - a falha só aparece no ensaio (T084), depois de toda a implementação.
- **Boa prática:** **o gate de verificação precisa conseguir passar no caminho correto.** O arquiteto escreve a verificação de sobras sabendo o que o serviço deixa para trás de propósito (uma chave em exclusão não tem custo) e prova isso com um teste antes do primeiro destroy real. O erro comum é deixar a exceção num comentário: o gate reprova sempre, alguém acostuma a ignorar o vermelho, e uma sobra real passa despercebida (1.4, 5.3).
- **Correção sugerida:**
  - Uma tarefa nova na Fase 4, ou um item a mais na T043, que já mexe no `destroy.yml`. O teste vermelho no `harness/test_harness.py` usa uma saída sintética da Tagging API:
    - só com uma chave KMS em `PendingDeletion`: passa;
    - com essa chave e qualquer outro ARN: reprova;
    - com uma chave KMS `Enabled`: reprova.
  - O filtro fica no modelo e vale para todos os projetos: para ARNs `arn:aws:kms:`, consultar `aws kms describe-key` e ignorar `KeyState=PendingDeletion`.
  - Corrigir a frase do ADR-0001 (o ADR não entra no hash do plano).
  - Pedir ao especificador que acrescente ao critério 3 a ressalva "exceto chave KMS com exclusão agendada, sem custo".

### A02 · importante · A spec ainda diz que a fumaça chama o guardrail, e a T066 reprova se ela chamar
- **Local:** `spec.md`, RNF-002 ("o teste de fumaça da plataforma … chama o gateway e o guardrail direto"); `plan.md`, emenda 1, F1; `tasks.md`, T066 ("o teste também reprova essa chamada").
- **Problema:** a emenda 1, aprovada na D-038, tirou o guardrail da fumaça, mas o texto da spec não mudou. Quem ler a spec e quem ler as tarefas implementa coisas opostas.
- **Boa prática:** **uma fonte de verdade por nível.** Quando o plano muda um requisito com aprovação, o arquiteto atualiza a spec no mesmo ciclo. O erro comum é o revisor do T081 conferir contra a spec e reprovar uma entrega correta, ou aprovar uma errada (5.1, 4.1).
- **Correção sugerida:** reescrever o RNF-002 conforme a emenda 1 (a fumaça só chama o gateway; o guardrail direto é o DM-05, no produto) e citar a D-038 na linha.

### A03 · importante · O plano diz que o motor é obrigatório no gateway, e também que o Floci compõe o gateway sem ele
- **Local:**
  - `plan.md`, "Stack da plataforma": "entram nos módulos `gateway`, `observabilidade` e `contrato` como entradas de composição obrigatórias";
  - `plan.md`, "Estratégia de testes", emenda 1: "o gateway continua composto sem o motor";
  - ADR-0009: "o root do Floci compõe sem o motor";
  - `tasks.md`, T013, T020 e T080.
- **Problema:**
  - se a entrada for obrigatória, o root do Floci precisa passar um ARN, e o gateway do Floci aponta para um motor que não existe;
  - se for opcional, o TT-P01 é a única proteção.
  - A T013 diz só "variável de composição", sem dizer qual das duas. Essa escolha muda os testes do T013 e o root do T080.
- **Boa prática:** **contrato de módulo explícito.** O arquiteto diz, para cada entrada, se ela é obrigatória ou opcional e quem garante o valor. O erro comum é cada implementador decidir de um jeito, e o teste de composição não ver o caso que importa (2.1, 3.6).
- **Correção sugerida:** deixar claro na T013, sem editar o plano e seguindo o ADR-0009 e a Estratégia de testes:
  - no `gateway`, a entrada é anulável, com bloco `dynamic` para o `policy_engine_configuration`;
  - no `observabilidade` e no `contrato`, a entrada é obrigatória;
  - o TT-P01 (T015 e T020) reprova o root real com o valor nulo.
  - Registrar a escolha num ADR de implementação e acertar a frase do plano na próxima emenda.

### A04 · importante · Ninguém consegue executar a fumaça e o DM-03 como estão escritos
- **Local:** `tasks.md`, T014, T066 e T084; `plan.md`, "Role de fumaça".
- **Problema:**
  - **A fumaça não lê o contrato.** A role de fumaça tem uma única declaração (`InvokeGateway`), e o TT-R09 reprova uma segunda. Mesmo assim, a T066 exige que "o script lê o contrato do SSM". Com a role de fumaça, essa leitura recebe `AccessDenied`.
  - **O dono não tem como assumir a role.** Ela é "confiada só pela role de deploy", e, pelos workflows e pela pendência do OIDC, a role de deploy é assumida por OIDC do GitHub (inferido: o dono não tem uma credencial local documentada para encadear as roles). Mesmo assim, a T084 manda o dono "rodar `scripts/fumaca.py`".
  - **O DM-03 não tem artefato.** Ele precisa de uma "role sem `InvokeGateway`". A T066 cita o DM-03 no título, mas nenhum teste ou script o descreve.
- **Boa prática:** **não planejar trabalho sem dono, artefato e credencial** (a mesma lição do F2 e do F4). O erro comum é descobrir no dia do ensaio que o passo não roda, como aconteceria aqui (1.4, 1.6).
- **Correção sugerida:**
  - Na T066:
    - o script lê o contrato com a credencial de quem o chama e só depois assume a role de fumaça para a chamada ao gateway;
    - o DM-03 usa a role de evidências, que não tem `InvokeGateway`, ou uma chamada sem assinatura, com caso de teste gravado.
  - Na T068, ou numa tarefa irmã, a fumaça roda como um job manual do workflow de evidências, no `aws-lab`. Assim o dono só dispara.

### A05 · importante · Os alarmes podem ficar mudos, e nenhuma prova mostra que disparam
- **Local:** `tasks.md`, T017, T037 e T084; spec, RNF-003.
- **Problema:**
  - um alarme do CloudWatch só casa com a série que tem **exatamente** o mesmo conjunto de dimensões;
  - a spec registra que `AllowDecisions` e `DenyDecisions` saem com as dimensões `Mode` e `Category` (e o recurso);
  - a T017 fixa só `Mode = ENFORCE` mais o id do motor, e não fixa as dimensões dos alarmes do gateway;
  - com `treat_missing_data = notBreaching`, um alarme com dimensão errada fica em OK para sempre;
  - nenhum DM confere a mudança de estado de um alarme nem a chegada do e-mail.
- **Boa prática:** **alarme só conta se já disparou uma vez.** O arquiteto fixa as dimensões a partir da documentação (ou usa métrica com `SEARCH` ou soma) e força um disparo no ensaio. O erro comum é ter alarmes "verdes" que nunca poderiam ficar vermelhos (5.2, 5.6).
- **Correção sugerida:**
  - Na T017 e na T037, o assert do plan fixa o conjunto completo de dimensões, com a fonte. Onde a documentação não fechar, usar métrica matemática que some as séries.
  - Na T084, um passo do DM: 5 `tools/call` negados com a role de fumaça levam o alarme de negações a `ALARM` e mandam o e-mail. É o mesmo roteiro da fumaça, sem custo relevante.

### A06 · importante · Os e-mails do dono podem sair no log público do apply
- **Local:** `tasks.md`, T011 e T012; ADR-0008, "Risco" ("O parâmetro não entra no repositório nem em log").
- **Problema:**
  - o repositório é **público** (`gh api`: `visibility = public`), então os logs do Actions também são;
  - as assinaturas `email`, e os destinatários do Budgets, têm o endereço no `endpoint`;
  - se o valor vier de `insecure_value` ou de `nonsensitive()`, o `terraform apply` imprime os e-mails no log;
  - se vier do `value` (sensível), um `for_each` sobre ele falha no Terraform.
  - Nenhum teste protege a promessa do ADR-0008.
- **Boa prática:** **dado pessoal fora dos canais públicos, provado por teste.** O arquiteto mantém o endereço sensível de ponta a ponta e torna público só o que não identifica ninguém, como a quantidade ou um índice. O erro comum é cumprir "fora do repositório" e esquecer o log do CI (Art. VIII; 5.6).
- **Correção sugerida:**
  - Na T011, a assinatura usa `count = length(nonsensitive(split(...)))` e um `endpoint` que continua sensível.
  - Um assert do `terraform test` confere que o `endpoint` é sensível no plan.
  - O mesmo vale para os destinatários do Budgets na T012.

### A07 · importante · Dois nomes fogem do prefixo da D-029 sem ADR, e o teste da T020 vai reprovar
- **Local:** `tasks.md`, T020 (TT-T02) e T037; ADR-0006, "Nomes"; constituição, Art. VI.
- **Problema:**
  - **Grupo de log entregue.** O grupo `/aws/vendedlogs/bedrock-agentcore/gateway/APPLICATION_LOGS/{gateway_id}` é obrigatório pela spec (RF-006) e não começa por `00-plataforma-agentes`.
  - **Parâmetro do produto.** O parâmetro `/00-plataforma-agentes/contrato/v1/produtos/<chave>` fica no state do produto, com a tag do produto, mas leva o prefixo da plataforma.
  - O ADR-0006 só lista a exceção de regex (`p00_`, `pNN_`). Do jeito que está escrito, o teste da T020 reprova o grupo de log, e o implementador teria de violar a spec ou criar uma exceção sem registro.
- **Boa prática:** **exceção à regra fica versionada, com o porquê.** O erro comum é afrouxar o teste de prefixo em silêncio, e, com isso, o isolamento por nome da D-029 perde o valor como controle (Art. VI; 1.4).
- **Correção sugerida:** a T020 e a T037 listam as duas exceções no teste e num ADR de implementação em `plataforma/agentes/adr/`. O parâmetro do produto continua isolado pela tag e pelo ARN por produto na política IAM.

### A08 · importante · O custo real lido pela tag não pega a maior parte do custo estimado
- **Local:** spec, critério de sucesso 2; `tasks.md`, T087; `plan.md`, "Custo do lab".
- **Problema:**
  - o critério lê o custo real "pela tag `project=00-plataforma-agentes`";
  - o Evaluations sob demanda (US$ 0,744, 69% da estimativa) é chamado pela role de evidências, sem nenhum recurso com tag;
  - as `InvokeGuardrailChecks` (US$ 0,18) provavelmente também não caem na tag (inferência, porque não achei documentação de alocação por tag para essas cobranças);
  - o teste "custo real ≤ teto" pode passar só porque não mede a maior parte do custo.
- **Boa prática:** **a métrica de aceite precisa enxergar o que promete medir.** O arquiteto define, para cada linha de custo, onde ela aparece (tag, serviço ou tipo de uso). O erro comum é aprovar o orçamento com uma leitura que deixa de fora a maior despesa (5.6).
- **Correção sugerida:**
  - Na T087, uma coluna "como se mede" por linha da tabela de custo: pela tag, ou pelo serviço e tipo de uso no dia da demonstração, filtrado pela região.
  - O que não puder ser atribuído aparece como "sem tag" na soma, e não fica de fora.
  - Se a definição do critério 2 precisar mudar, a pergunta vai ao especificador.

### A09 · importante · O Infracost não consegue confirmar o que o plano diz que ele confirma
- **Local:** `tasks.md`, T073; `plan.md`, linhas de SNS e de coleta de evidências ("o Infracost confirma no PR").
- **Problema:**
  - sem um arquivo de uso (`infracost-usage.yml`) com as premissas do plano (1.000 chamadas, 10 MB de logs e as demais), o Infracost estima zero para as cobranças por uso;
  - é provável que ele nem cubra os recursos do AgentCore;
  - assim, o gate "24 h ≤ US$ 1,20" passa sempre, com cerca de US$ 0,05 (chave e alarmes), e a T073 não tem como "conferir" a reserva do SNS e da coleta.
- **Boa prática:** **um gate que sempre passa não é gate.** O arquiteto alimenta a ferramenta com as premissas do plano e declara o que ela não cobre. O erro comum é ler o "verde" do Infracost como confirmação do teto (4.1, 1.4).
- **Correção sugerida:**
  - Na T073, versionar o `infracost-usage.yml` com as premissas da tabela "Custo do lab".
  - O teste vermelho reprova quando o arquivo falta.
  - O comentário do PR lista, linha a linha, o que o Infracost cobriu e o que ficou como "não coberto", com o valor do plano.

### A10 · importante · Um stack pode ficar no ar sem prazo e sem destroy automático
- **Local:** `harness/modelos/apply.yml` (o job `prazo` tem `needs: apply`); `tasks.md`, T041 e T043; ADR-0007.
- **Problema:**
  - **Apply parcial.** Se o apply falhar no meio (por exemplo, um erro na política da chave ou o R8 no produto), os recursos já criados ficam sem registro de prazo, e o agendador nunca os destrói.
  - **Consumidor sem tempo.** Com o limite novo, um `registrar` de consumidor pode ser recusado depois do apply (por exemplo, quando faltam menos de 1 hora para a plataforma vencer). O `requisitos` (T043) só confere se a plataforma "está no ar", e não quanto tempo ela ainda tem.
- **Boa prática:** **registrar a obrigação antes de criar o custo.** O arquiteto registra o prazo antes do apply, ou com `if: always()`, e recusa o apply cedo quando não há tempo. O erro comum é o caminho de erro deixar a infraestrutura cobrando sem dono, que é justamente o que o prazo de 24 horas devia impedir (5.3; Art. V).
- **Correção sugerida:**
  - Na T041 e na T043:
    - o `requisitos` do consumidor também reprova quando a plataforma tem menos de 1 hora mais o prazo mínimo;
    - o modelo de apply registra o prazo antes do `terraform apply`, ou num job com `if: always()` depois de qualquer tentativa.
  - Testes TH para os dois casos.

### A11 · importante · O cronograma da tag de custo não fecha (pergunta ao dono P00-P9)
- **Local:** `tasks.md`, T053 ("depois do ensaio (T084)"), T084 ("pelo menos 48 h antes da demonstração") e T086 ("T053 (tag ativa há 48 h)"); `plan.md`, R2; spec, H3.
- **Problema:**
  - a conta é: ensaio, depois até 24 horas para a chave aparecer, depois o T053, depois até 24 horas para ativar, e então a tag ainda precisa estar ativa 48 horas antes da demonstração;
  - isso dá cerca de 96 horas entre o ensaio e a demonstração, e não 48;
  - lido ao pé da letra, a T084 com 48 horas deixa a tag ativa em cima da demonstração ou depois dela;
  - a frase da D-034 ("ativa pelo menos 48 h antes") é do dono, então a leitura não pode ser assumida aqui.
- **Boa prática:** **critério de tempo mensurável, com o relógio explícito.** O erro comum é cada tarefa contar as 48 horas a partir de um evento diferente (4.1).
- **Correção sugerida:** depois da resposta à P00-P9, ajustar os prazos da T084 e da T086 e pôr o `Depende de: T084` formal no T053.

### A12 · importante · A verificação pelo caminho do SSM e a busca por ARN não cobrem tudo o que o critério pede
- **Local:**
  - spec, critério 3 ("não sobra parâmetro SSM sob `/00-plataforma-agentes/`") e critério 1 ("o código **e o Terraform** do produto");
  - `tasks.md`, T043 (destroy), T047 (TH-10) e T086 (DM-06).
- **Problema:**
  - **Caminho do SSM.** O workflow de destroy só confere a tag. O parâmetro de produto sob o caminho da plataforma tem a tag do produto, então só uma checagem por caminho prova o critério 3 na AWS real. Hoje, essa checagem existe só no FL-04.
  - **Busca por ARN.** O TH-10 olha `plataforma/agentes/src/` e `modulos/03-mcp/`, mas não exige o Terraform do produto (`modulos/03-mcp/arquitetura/` e os `.tf`) de forma explícita.
- **Boa prática:** **o teste cobre o texto inteiro do critério.** O erro comum é provar metade do critério e marcá-lo como cumprido (4.1).
- **Correção sugerida:**
  - No modelo de destroy, um passo `aws ssm get-parameters-by-path --path "/$CHAVE/" --recursive` que reprova quando há parâmetro. Para produtos, o caminho fica vazio. Teste TH.
  - No TH-10, os `.tf` do produto entram na busca de forma explícita.

### A13 · menor · Os status estão desatualizados depois da D-038
- **Local:**
  - `tasks.md`, linha 3 ("nova aprovação está pendente") e linha 313;
  - `matriz.md`, linha 3;
  - ADR-0009, status ("emenda 1 com nova aprovação pendente");
  - ADR-0004, "Custo" (ainda cita "US$ 0,025 no teste de fumaça", linha que a emenda 1 tirou).
- **Boa prática:** **o estado do documento é igual ao do registro** (a mesma lição do F5). O erro comum é o leitor tomar a versão errada como a vigente (5.1).
- **Correção sugerida:** trocar por "aprovado (D-038)" e tirar a linha de custo da fumaça do ADR-0004.

### A14 · menor · A T003 promete testar um módulo que ainda não existe
- **Local:** `tasks.md`, T003 ("o root e o módulo `registro-produto` passam"), que depende só de T001 e T002. O módulo nasce na T030.
- **Boa prática:** **o aceite cabe no que já existe.** O erro comum é a tarefa ficar meio verde e ser marcada `[x]` assim mesmo.
- **Correção sugerida:** a T003 aceita só o root, e a T030 ou a T032 passam a rodar o T003 sobre o módulo, como a T032 já sugere.

### A15 · menor · As dependências da T080 não refletem "Fases 2 a 6 concluídas"
- **Local:** `tasks.md`, T080. O aceite pede as Fases 2 a 6, mas o `Depende de` lista só T020, T038, T047 e T067, sem T061 a T066 e T068.
- **Boa prática:** **a dependência declarada é a que a ferramenta lê.** O erro comum é o `estado.py` sugerir a próxima tarefa fora de ordem.
- **Correção sugerida:** completar o `Depende de`.

### A16 · menor · A T041 a T044 estão com o especialista errado
- **Local:** `tasks.md`, T041 a T044. São mudanças em Python e YAML do harness (`infra.py`, `estado.py` e modelos), entregues ao `engenheiro-terraform`. O `operador-harness` existe e já cuida da T040 e da T046.
- **Boa prática:** **poucas ferramentas e skills por agente, cada uma na sua função.** O erro comum é dar ao especialista uma tarefa sem as skills dela (2.3).
- **Correção sugerida:** atribuir as quatro ao `operador-harness`.

### A17 · menor · O Budgets diário fica cego no dia do ensaio
- **Local:** `tasks.md`, T012, T053 e T084. O filtro `user:project$00-plataforma-agentes` só casa quando a tag está ativa como tag de alocação de custo. O T053 roda depois do ensaio, então no ensaio o orçamento diário não vê nada, e sobra só o mensal.
- **Boa prática:** **saber quando cada camada de proteção está ligada.** O erro comum é contar com um alarme que ainda não enxerga nada.
- **Correção sugerida:** a T084 registra esse limite no roteiro do ensaio, e o README da T072 diz que o Budgets diário só vale a partir da tag ativa.

## Perguntas ao dono
| id | pergunta | bloqueia | opções | recomendação |
|---|---|---|---|---|
| P00-P9 | Na D-034, "tag `project` ativa pelo menos 48 h antes da demonstração" quer dizer que a tag já está com status `Active` 48 horas antes, ou que as 48 horas entre o ensaio e a demonstração cobrem o tempo de aparecer e ativar? | só o calendário das T053, T084 e T086 (tarefas do dono); nenhuma tarefa de implementação | (a) já `Active` 48 h antes: o ensaio fica pelo menos cerca de 96 h antes da demonstração; (b) as 48 h contam a partir do ensaio: a tag pode ficar ativa em cima da demonstração, com risco de o H3 não aparecer; (c) aplicar o T053 antes do ensaio, se a chave `project` já aparecer no faturamento por causa de outro projeto | (a), por ser a leitura literal da D-034 e a única que garante o H3. A (c) é um atalho, a conferir no console no dia |

## Próximos passos
- **Correção:** a fase de origem dos achados é **tarefas**, então as correções vão em `tasks.md` e `matriz.md`, mais o texto da spec (A02, e o critério 3 na A01) e os ADRs (A01, A13).
- **Plano intacto:** nenhuma correção sugerida exige mudar o `plan.md`, então a aprovação da D-038 continua valendo. A A03 pede só esclarecer a T013 e acertar a frase do plano numa emenda futura.
- **Segunda rodada:** depois das correções, uma nova análise independente (rodada 2 de 2). Se algo persistir, vai ao dono em `## Perguntas ao dono`.

**Contagem:** 1 bloqueante, 11 importantes e 5 menores.

**REPROVADO**
