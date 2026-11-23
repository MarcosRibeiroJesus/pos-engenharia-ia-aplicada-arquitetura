# Análise SDD: `03-mcp-regras-cdb`

- **Data:** 2026-11-22 · **Rodada:** 1 de 2
- **Analista:** `analista-sdd` (instância independente com contexto limpo). Não escreveu a spec, o plano, os ADRs, o design doc comparativo nem as tarefas da D03 (tarefa 4.6 da prova CCAR-F).
- **Base:**
  - branch `modulo/03-mcp/mcp-regras-cdb`;
  - `specs/03-mcp-regras-cdb/spec.md`, `plan.md`, `tasks.md`, `matriz.md`, `azure.md` e `adr/0001-arquitetura-ancora-mcp-sem-estado.md` a `adr/0006-custo-diario-seguranca-e-cobertura-do-floci.md`;
  - `.specify/memory/constitution.md` (Artigos I a VIII);
  - `harness/estado.json`, `harness/estado.py`, `harness/infra.py`, `harness/especialistas.json` e `harness/modelos/{apply.yml,destroy.yml}`;
  - decisões do dono aplicáveis à D03, incluindo `D-065`, `D-071`, `D-072` e `D-073`.
- **Hash do plano:** o `sha256` normalizado (LF) de `specs/03-mcp-regras-cdb/plan.md` é `2495c5a2d474a2965ff46faca6561434922abcc2149d2689183ab6f8fa689f11`, idêntico ao registrado em `plano_aprovado.sha256` no `harness/estado.json` (D-033, D-073). Esta análise não alterou o `plan.md`.

## Resultado por critério

| Critério | Resultado | Avaliação e achados |
|---|---|---|
| **Cobertura** | **passa** | Todos os 25 requisitos funcionais (`RF-001` a `RF-025`, incluindo o `RF-016` mantido estável como fora desta entrega por `D03-P1 = B`), os 7 requisitos não funcionais (`RNF-001` a `RNF-007`), os 8 artigos da constituição, os 4 critérios de sucesso e as decisões `D-071` a `D-073` possuem tarefa em `tasks.md` e linha correspondente em `matriz.md`. Todas as 27 tarefas (`T000` a `T072`) citam pelo menos um requisito (`RF`/`RNF`) ou artigo da constituição e os respectivos IDs de teste. |
| **Constituição** | **passa** | Nenhum artigo (I a VIII) foi violado sem justificativa. Cada decisão estrutural ou exceção de API tem ADR dedicado (`ADR-0001` a `ADR-0006`): ausência de código pré-SDD (Art. I), todas as perguntas `D03-P1` a `D03-P11` respondidas pelo dono (Art. II), TDD com respostas gravadas e Floci (Art. III, `ADR-0006`), `AWS_IAM` sem `Principal "*"` (`D-044`), KMS com rotação e IAM somente leitura sem escrita no DynamoDB (Art. IV, `ADR-0004`, `ADR-0006`), escala a zero com teto diário de US$ 0,50, cota de 300.000 tokens e workflows de apply/destroy (Art. V, `ADR-0001`, `ADR-0006`), tags `D-031`, prefixo `03-mcp-regras-cdb-` com exceções documentadas (`ADR-0006`), logs/EMF/alarmes e state remoto com lock (Art. VI), componente Claude com tarefas da prova CCAR-F (Art. VII, `ADR-0001` a `ADR-0006`), e fontes normativas datadas com dados 100% sintéticos (Art. VIII, `ADR-0003`). |
| **Ambiguidade** | **passa, com ressalvas** | Os requisitos têm critérios determinísticos e mensuráveis: strings decimais `^\d{1,9}(\.\d{1,2})?$`, arredondamento `HALF_UP` com diferença máxima de `R$ 0,00`, `^CLI-[0-9]{6}$`, fuso `America/Sao_Paulo` com corte às `16:00`, limite de 6 chamadas de tool por turno, `maxTokens = 1024`, backoff de `1, 2 e 4 s` (máx. 3 tentativas), retenção de 7 dias, alarmes com período de 300 s (`Sum`, `notBreaching`) e latência `p95 <= 500 ms` medida no servidor. Ressalvas absorvíveis na implementação: `A01` (dimensões exatas do EMF nos alarmes) e `A03` (unidade mensal do `infracost-usage.yml`). |
| **Pendências** | **passa** | Não há nenhum marcador `[PENDENTE]` ou `[BLOQUEADO]` em `spec.md`, `plan.md`, `tasks.md`, `matriz.md`, `azure.md` ou nos ADRs `0001` a `0006`. Todas as perguntas ao dono (`D03-P1`, `D03-P2`, `D03-P4`, `D03-P5`, `D03-P6`, `D03-P7`, `D03-P9`, `D03-P10` e `D03-P11`) foram respondidas e registradas em `D-071`, `D-072` e `D-073`. |
| **Consistência** | **passa, com ressalvas** | `spec.md`, `plan.md`, `tasks.md`, `matriz.md`, `azure.md`, ADRs e `harness/estado.json` concordam integralmente nos nomes das 5 tools (`buscar_regras`, `simular_resgate`, `verificar_aporte`, `consultar_aplicacoes_cliente` e `listar_versoes_regra`), nas classes (`leitura_publica` na emenda `1.1.0` e `dado_privado`), nas versões do protocolo MCP (`2026-07-28` sem estado e lane `2025-11-25`), nos números (`teto_diario_usd = 0.50` sobre estimativa de `US$ 0,39`, cota de `300.000` tokens, `p95 <= 500 ms`, limite de `6` chamadas de tool por turno, `4` alarmes do servidor + `1` alarme do guardrail no tópico do contrato `comum`) e no `sha256` do `plano_aprovado`. Ressalvas menores de numeração/texto histórico: `A04` e `A05`. |
| **Testabilidade** | **passa** | Toda tarefa de código, infraestrutura, harness ou documentação (`T000` a `T062`, `T064`, `T070`, `T071`) declara explicitamente o `Teste vermelho` antes da implementação (incluindo fixtures violadoras para regras transversais). As tarefas `[DONO]` (`T063`, `T065`, `T072`) são manuais por natureza e estão isoladas no fim das Fases 6 e 7. Ressalva menor de escopo incremental do `TH-COST-01`: `A06`. |
| **Operação e custo** | **passa, com ressalvas** | O projeto tem `infra_real: true`, `teto_diario_usd: 0.5` calculado no plano (`US$ 0,39` estimado, `US$ 0,58` no pior caso da cota de 300.000 tokens) e gravado no `harness/estado.json`, tarefa para o AWS Budgets diário (`T051`), e tarefa para os workflows de apply (com `prazo_horas` ≤ 23 e margem de 1 h antes da plataforma) e destroy (com `confirm_stack`, ambiente `aws-lab-destroy` sem aprovação, OIDC, verificação de sobras pela tag `project=03-mcp-regras-cdb` e `harness/infra.py remover`) em `T010` e `T002`. Ressalva sobre o sincronismo com os ajustes de harness da plataforma: `A02`. |

## Verificações específicas do briefing

1. **Cobertura `RF-001`..`RF-025` e `RNF-001`..`RNF-007`:** conferidos um a um entre `spec.md`, `tasks.md` e `matriz.md`. Nenhum requisito ficou órfão e nenhuma tarefa ficou sem requisito ou artigo.
2. **Nomes e classes das tools:** as 4 tools expostas ao agente (`buscar_regras`, `simular_resgate`, `verificar_aporte` como `leitura_publica`; `consultar_aplicacoes_cliente` como `dado_privado`) e a 5ª tool administrativa sem agente chamador (`listar_versoes_regra` como `leitura_publica` e `agentes = []`) são idênticas em todos os documentos.
3. **Protocolo MCP e lane:** versão `2026-07-28` sem handshake `initialize` e sem `Mcp-Session-Id` (validando `MCP-Protocol-Version`, `Mcp-Method` e `Mcp-Name`) e lane `2025-11-25` sem estado (`D-072`), alinhadas a `versoes_mcp = ["2025-11-25", "2026-07-28"]` do contrato `comum` da plataforma.
4. **Cálculos de custo e margem mensal:** a soma das 12 linhas da tabela de custo do `plan.md` fecha exatamente em **US$ 0,390/dia** (`0,033 + 0,009 + 0,002 + 0,001 + 0,095 + 0,101 + 0,016 + 0,118 + 0,010 + 0,005 + 0,000 + 0,000`). O teto aprovado de **US$ 0,50/dia** (`D03-P7 = A`, D-073) deixa ~28% de margem sobre a estimativa e, somado ao teto da plataforma (`US$ 1,20/dia`), representa `US$ 1,70/dia` (8,5% do limite mensal de US$ 20 da conta).

## Achados

### A01 · importante · Alinhamento explícito de `Namespace` e `Dimensions` entre o logger EMF (`T033`) e os 4 alarmes do servidor (`T054`)
- **Local:** `tasks.md`, `T033` (linha 91) e `T054` (linha 140); `spec.md`, `RF-025` (linhas 144–145); `plan.md`, linha 190 (`TT-OBS-01`).
- **Problema:** a `T033` especifica que o bloco `_aws` do CloudWatch EMF publica "contadores por tool e por categoria de erro", enquanto a `T054` cria 3 alarmes baseados nas métricas EMF (`erro-interno >= 1`, `dados-indisponiveis >= 3`, `erro-protocolo >= 5`) e 1 alarme de falha de execução da Lambda (`erro-execucao-lambda >= 1`), todos com `treat_missing_data = "notBreaching"`. No CloudWatch, um alarme só casa com a série temporal que possui **exatamente** o mesmo `Namespace`, `MetricName` e conjunto de `Dimensions`. Se a diretiva `CloudWatchMetrics.Dimensions` do EMF na `T033` emitir apenas `[["Tool", "Categoria"]]` e o alarme na `T054` filtrar apenas por `Categoria` (ou por `FunctionName`), o alarme ficará eternamente em `OK` (`notBreaching`) mesmo quando ocorrerem erros.
- **Boa prática:** **contrato explícito entre emissor de métrica e alarme.** O arquiteto fixa no teste o `Namespace` e o conjunto exato de `Dimensions` que ligam o payload EMF ao `aws_cloudwatch_metric_alarm`. O erro comum é o teste unitário do logger e o `terraform test` do alarme passarem isoladamente com dimensões diferentes, produzindo alarmes mudos em produção (tarefas 5.2 e 5.6 da prova).
- **Correção sugerida (absorvida na `T033` e na `T054`, sem alterar o `plan.md`):**
  - Na `T033`, a diretiva `CloudWatchMetrics` do EMF deve declarar duas listas de dimensões: `[["Projeto", "Categoria"], ["Projeto", "Tool", "Categoria"]]` sob um namespace único (por exemplo, `"03-mcp-regras-cdb/Servidor"`), e o `UT-LOG-01` deve afirmar essa estrutura.
  - Na `T054`, o `TT-OBS-01` deve afirmar que os 3 alarmes de aplicação usam `namespace = "03-mcp-regras-cdb/Servidor"` e `dimensions = { Projeto = "03-mcp-regras-cdb", Categoria = "<categoria>" }`, e que o 4º alarme (`erro-execucao-lambda`) usa `namespace = "AWS/Lambda"`, `metric_name = "Errors"` e `dimensions = { FunctionName = "03-mcp-regras-cdb-servidor" }`.

### A02 · importante · Sincronismo do branch da D03 com `consome` no `harness/infra.py` (`T002`) e com o filtro de KMS `PendingDeletion` no `destroy.yml` (`T010`)
- **Local:** `tasks.md`, `T002` (linhas 29–33) e `T010` (linhas 36–40); `harness/infra.py`; `harness/modelos/destroy.yml` (linhas 71–76); `plan.md`, linha 230 e risco `R1` (linha 240).
- **Problema:** o branch `modulo/03-mcp/mcp-regras-cdb` partiu do `main` antes do merge do branch de implementação da `00-plataforma-agentes`. Por isso, na árvore atual do branch da D03:
  1. `harness/infra.py` ainda não contém a validação do campo `consome: ["00-plataforma-agentes"]` (que impõe a margem de 1 h antes do prazo da plataforma, exigida no aceite da `T002`), mas a `T002` lista em `Arquivos:` apenas `harness/estado.json` e `harness/testes/test_d03_artefatos.py`;
  2. `harness/modelos/destroy.yml` ainda traz o filtro de chave KMS em `PendingDeletion` apenas como comentário (`# Ajuste por projeto: chaves KMS em PendingDeletion...`), enquanto o stack da D03 cria a chave `03-mcp-regras-cdb-kms` com `project=03-mcp-regras-cdb` (`T051`), que fica 7 dias em `PendingDeletion` após o `terraform destroy`.
- **Boa prática:** **gates de ciclo de vida testados contra os recursos reais do próprio stack.** O arquiteto garante que o workflow de destroy do produto ignore chaves KMS em `PendingDeletion` (sem custo) e que o script de prazo valide a dependência da plataforma antes do primeiro apply real. O erro comum é assumir uma funcionalidade que ainda está em outro branch não mergeado e encontrar falha na `T002` ou no destroy da `T063` (tarefas 1.4 e 5.3 da prova).
- **Correção sugerida (absorvida na `T002` e na `T010`, sem alterar o `plan.md`):**
  - Na `T002`, caso a `00-plataforma-agentes` ainda não tenha sido mergeada no `main`, incluir `harness/infra.py` nos arquivos da tarefa para validar `consome` (recusando registrar prazo do consumidor se a plataforma não estiver ativa ou tiver menos de `horas + 1` restantes), provado por teste em `test_d03_artefatos.py`.
  - Na `T010`, garantir que `.github/workflows/03-mcp-regras-cdb-destroy.yml` (e o modelo `harness/modelos/destroy.yml`, se atualizado junto) filtre ARNs `arn:aws:kms:` cujo `aws kms describe-key` retorne `KeyState == "PendingDeletion"`, com teste unitário em `test_workflows_03_mcp.py` (`TH-WF-01`).

### A03 · importante · Conversão mensal do `infracost-usage.yml` não está detalhada no `Teste vermelho` da `T055`
- **Local:** `tasks.md`, `T055` (linhas 144–148); `plan.md`, seção "Custo do lab" (linhas 200–224).
- **Problema:** a `T055` inclui `M/infra/terraform/infracost-usage.yml` na lista de `Arquivos:`, mas o texto do `Teste vermelho` da `T055` menciona apenas as verificações sobre `M/README.md` (existência, máximo de 5 passos, citação a `US$ 0,50` e links). Além disso, as premissas do `plan.md` são **diárias** (1.000 invocações de Lambda, 5.000 leituras no DynamoDB, 20 MB de logs, 1.000 traces), enquanto o arquivo `infracost-usage.yml` do Infracost exige quantidades **mensais** (que o gate de FinOps da esteira converte de volta para diário multiplicando por `24/730`). Se o implementador gravar os números de 1 dia diretamente no `infracost-usage.yml`, o Infracost estimará o custo variável 30 vezes menor.
- **Boa prática:** **a unidade da ferramenta faz parte do teste.** O arquiteto explicita o fator de escala mensal (`× 730/24`) no arquivo de uso e testa a presença e os valores dele no teste do harness. O erro comum é deixar o arquivo de uso sem assert no teste vermelho ou preenchê-lo com grandezas diárias numa ferramenta mensal (tarefa 4.1 da prova).
- **Correção sugerida (absorvida na `T055`, sem alterar o `plan.md`):**
  - Na execução da `T055`, o `TH-COST-01` em `harness/testes/test_d03_artefatos.py` deve reprovar também quando `M/infra/terraform/infracost-usage.yml` não existir ou não contiver as premissas do `plan.md` convertidas para a base mensal (`× 730/24`, documentadas com comentário ligando cada chave ao valor diário do plano).

### A04 · menor · Divergência de identificador (`T000` vs. `T001`) para a movimentação dos ADRs e do `azure.md`
- **Local:** `plan.md`, linhas 6 e 248; `azure.md`, linha 5; `tasks.md`, `T000` (linhas 19–23) e `T001` (linhas 24–28).
- **Problema:** `plan.md` e `azure.md` citam `T000` como a primeira tarefa da fase `implementar` que move `adr/*.md` e `azure.md` para `modulos/03-mcp/arquitetura/`. Em `tasks.md`, porém, `T000` foi atribuída à conferência de fidelidade das unidades 04 a 08 (`D03-P9 = A`), e a movimentação dos ADRs e do `azure.md` ficou na `T001`.
- **Correção sugerida (absorvida na `T001`):** não editar o `plan.md` para preservar o `sha256` de `plano_aprovado` (D-033). Na `T001`, ao mover `azure.md` para `M/docs/azure.md`, atualizar a referência na linha 5 de `M/docs/azure.md` para `T001` e registrar nos arquivos de redirecionamento que a `T001` cumpre o item `T000` descrito no plano.

### A05 · menor · Texto residual de "teto proposto / sujeito à aprovação" no `ADR-0006`
- **Local:** `specs/03-mcp-regras-cdb/adr/0006-custo-diario-seguranca-e-cobertura-do-floci.md`, linhas 29 e 33.
- **Problema:** o cabeçalho do `ADR-0006` (linha 3) já registra que o plano e o teto diário de US$ 0,50 foram aprovados pelo dono em 2026-11-22 (`D-073`), mas as linhas 29 e 33 ainda dizem `"teto proposto: US$ 0,50/dia (D03-P7, sujeito à aprovação do dono)"`.
- **Correção sugerida (absorvida na `T001`):** ao mover o `ADR-0006` para `M/adr/0006-custo-diario-seguranca-e-cobertura-do-floci.md` na `T001`, trocar `"teto proposto ... sujeito à aprovação do dono"` por `"teto aprovado: US$ 0,50/dia (D03-P7 = A, D-073)"`.

### A06 · menor · Escopo incremental do teste `TH-COST-01` entre `T011`, `T051` e `T055`, e escopo do contador de 300.000 tokens na `T042`
- **Local:** `tasks.md`, `T011` (linha 44), `T042` (linha 108), `T051` (linha 124) e `T055` (linha 144).
- **Problema:**
  1. O ID `TH-COST-01` aparece no aceite de `T011`, `T051` e `T055`. Se `TH-COST-01` exigir `M/README.md` e `infracost-usage.yml` já na `T011`, a `T011` falhará por arquivos que só nascem na `T055`.
  2. Na `T042`, o item `(6)` testa a cota dura de 300.000 tokens diários no agente (`D-073`), mas como a role do agente não tem permissão de DynamoDB (`TT-IAM-02` na `T053`), convém explicitar onde o contador reside.
- **Correção sugerida (absorvida em `T011`, `T042`, `T051` e `T055`):**
  - Evoluir `TH-COST-01` incrementalmente: na `T011` ele valida `var.teto_diario_usd == 0.50` em `variables.tf` contra `harness/estado.json`; na `T051` o `TT-COST-01` valida o `aws_budgets_budget` no módulo `nucleo`; e na `T055` o `TH-COST-01` passa a validar também `M/README.md` e `M/infra/terraform/infracost-usage.yml`.
  - Na `T042`, manter o acumulador da cota de 300.000 tokens em memória no ambiente da Lambda do agente com store/relógio injetável nos testes `RG` (sem criar acesso ao DynamoDB na role do agente).

## Resolver na implementação

Nenhum achado é bloqueante e nenhum exige alterar `specs/03-mcp-regras-cdb/plan.md`, mantendo intacto o hash de `plano_aprovado` (`D-073`). Os achados são absorvidos diretamente pelas tarefas abaixo na fase `implementar`:

| Achado | Severidade | Tarefa(s) que absorve(m) | O que fazer na tarefa |
|---|---|---|---|
| **A01** | importante | `T033`, `T054` | Fixar `Namespace = "03-mcp-regras-cdb/Servidor"` e a dimensão agregada `["Projeto", "Categoria"]` no EMF (`T033`) e nos 3 alarmes de aplicação (`T054`), e `AWS/Lambda` + `FunctionName` no 4º alarme (`T054`). |
| **A02** | importante | `T002`, `T010` | Garantir a validação de `consome` em `harness/infra.py` na `T002` e o filtro de `KeyState == "PendingDeletion"` para ARNs KMS no passo de sobras de `03-mcp-regras-cdb-destroy.yml` na `T010`. |
| **A03** | importante | `T055` | Incluir no `TH-COST-01` a validação de `M/infra/terraform/infracost-usage.yml` com as premissas diárias do plano convertidas para a base mensal (`× 730/24`). |
| **A04** | menor | `T001` | Ajustar a referência `T000` → `T001` em `M/docs/azure.md` e nos redirecionamentos ao mover os arquivos, sem tocar no `plan.md`. |
| **A05** | menor | `T001` | Atualizar o texto residual de "sujeito à aprovação" para "aprovado (D-073)" em `M/adr/0006-*.md`. |
| **A06** | menor | `T011`, `T042`, `T055` | Construir os asserts de `TH-COST-01` de forma incremental (`T011` → `T055`) e manter o contador da cota de 300.000 tokens injetável em memória na `T042`. |

**Contagem:** 0 bloqueantes, 3 importantes e 3 menores.

**Veredito: APROVADO**
