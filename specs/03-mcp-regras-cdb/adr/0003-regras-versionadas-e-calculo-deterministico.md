# ADR-0003: Regras versionadas em dados, cálculo decimal determinístico e aplicações sintéticas de clientes

- **Status:** proposto (aguarda aprovação do plano da D03 pelo dono, D-033)
- **Data:** 2026-11-22 · **Autor:** arquiteto-aws (orquestração Antigravity)
- **Requisitos:** RF-005 a RF-009, RF-013, RF-014, RF-015, RNF-005; D-001, D-008, D-071

## Contexto
Em produtos financeiros regulados, alíquotas de IR, tabela regressiva de IOF, feriados nacionais e limites operacionais mudam por norma pública ou decisão de produto. Embutir números no prompt ou em constantes espalhadas no código impede saber qual regra e qual versão fundamentaram uma resposta. Além disso, LLMs cometem erros aritméticos e de arredondamento se calcularem juros compostos, IOF e IR diretamente. O dono decidiu (`D-071`):
- deixar a ingestão assistida por Claude fora desta entrega (`D03-P1 = B`), mantendo as regras como arquivos JSON versionados no repositório e revisados no PR;
- incluir dados sintéticos de aplicações de clientes e a tool `consultar_aplicacoes_cliente` (`D03-P2 = A`);
- fixar os parâmetros do CDB sintético na proposta da spec (`D03-P5 = A`).

## Decisão
1. **Fonte de verdade no git e leitura em DynamoDB cifrado (`RF-013`, `RNF-001`):**
   - As regras ficam em `modulos/03-mcp/arquitetura/dados/regras_cdb.json` (validadas por `schemas/regra.schema.json`) e as aplicações sintéticas em `modulos/03-mcp/arquitetura/dados/aplicacoes_clientes.json` (validadas por `schemas/aplicacoes.schema.json`).
   - Em execução na AWS e no Floci, os dois conjuntos são carregados pelo apply para duas tabelas **Amazon DynamoDB** sob demanda (`03-mcp-regras-cdb-regras` e `03-mcp-regras-cdb-aplicacoes`), cifradas com a chave KMS do cliente (`03-mcp-regras-cdb-kms`) e com Point-in-Time Recovery (PITR) habilitado. A role da Lambda do servidor MCP tem apenas `dynamodb:GetItem` e `dynamodb:Query` nessas duas tabelas (zero permissão de escrita, `RF-008`, `RNF-001`).
2. **Catálogo de regras públicas e do produto (`RF-014`, conferidas em 2026-11-22):**
   - **`regra-ir-renda-fixa@2004.1` (tema `imposto_renda`):** tabela regressiva da **Lei nº 11.033/2004, art. 1º** e **IN RFB nº 1.585/2015, art. 46**: `22.5%` até 180 dias corridos; `20.0%` de 181 a 360 dias; `17.5%` de 361 a 720 dias; `15.0%` acima de 720 dias (`≥ 721`). Declara explicitamente `base_calculo: "rendimento_bruto_menos_iof"` (`E6`). Nota de vigência confirmada: a MP 1.303/2025 perdeu eficácia em outubro de 2025 sem conversão em lei, mantendo a tabela regressiva vigente.
   - **`regra-iof-tvm@2007.1` (tema `iof`):** tabela regressiva de 1 a 29 dias corridos do **Decreto nº 6.306/2007, art. 32, § 2º e Anexo** (`96%` no 1º dia até `3%` no 29º dia, e `0%` a partir do 30º dia corrido), incidente sobre o rendimento bruto.
   - **`regra-cdi-acumulo@2026.1` (tema `rentabilidade`):** capitalização diária por dia útil na base de **252 dias úteis** (metodologia da Taxa DI da B3): fator diário $(1 + \text{CDI}_{\text{anual}})^{1/252}$, multiplicado pelo percentual do produto (`100%` do CDI), acumulado pelos dias úteis entre `data_aplicacao` (inclusive) e `data_resgate` (exclusive). A taxa DI anual de referência é dado versionado na regra, declarada em `premissas` do resultado (`E10`).
   - **`regra-calendario-anbima@2026.1` (tema `calendario`):** lista versionada de feriados nacionais (ANBIMA) para o intervalo coberto pelo lab (`2024-01-01` a `2029-12-31`, cobrindo aplicações de até 1.080 dias corridos). Datas fora desse intervalo retornam `fora_da_cobertura` (`RF-011`).
   - **`regra-fgc-garantia@2013.1` (tema `garantia`):** **Resolução CMN nº 4.222/2013 (Anexo II)** e Banco Central do Brasil — cobertura informativa de até R$ 250.000,00 por CPF por conglomerado financeiro (com teto global de R$ 1.000.000,00 a cada 4 anos), sem efeito no cálculo de resgate ou no limite operacional de aporte.
   - **Regras do produto CDB sintético (`D03-P5 = A`, D-071, fonte `"produto sintético"`, data `2026-11-22`):**
     - `regra-produto-rentabilidade@2026.1` (`tema: rentabilidade`): `100.00%` do CDI, arredondamento final para 2 casas decimais no modo `HALF_UP` (meio para cima, `E7`).
     - `regra-produto-aporte@2026.1` (`tema: aporte`): mínimo `R$ 100,00` (`"100.00"`), máximo `R$ 1.000.000,00` (`"1000000.00"`), apenas em dia útil até o horário de corte (`16:00` em `America/Sao_Paulo`, `E13`).
     - `regra-produto-prazo-vencimento@2026.1` (`tema: prazo`): vencimento em `1080` dias corridos a partir da aplicação.
     - `regra-produto-carencia-liquidez@2026.1` (`tema: carencia` e `resgate`): carência de `0` dias (liquidez diária a partir do 1º dia após a aplicação, em dia útil, crédito no mesmo dia útil se solicitado até as `16:00`).
3. **Aritmética decimal exata sem ponto flutuante binário (`E7`, `RF-005`, `RF-007`):**
   - Valores monetários trafegam na entrada e na saída como strings decimais `^\d{1,9}(\.\d{1,2})?$`.
   - O motor determinístico calcula o fator acumulado com precisão decimal fixa (pelo menos 16 casas decimais internas) e aplica arredondamento `HALF_UP` para centavos (`0.01`) apenas na emissão de cada parcela (`rendimento_bruto_brl`, `iof_brl`, `ir_brl`, `valor_liquido_brl`), garantindo diferença de `R$ 0,00` contra a bateria calculada à mão (`critério de sucesso 2`).
4. **Aplicações sintéticas de clientes (`RF-009`, `D03-P2 = A`, D-071):**
   - 4 clientes sintéticos (`CLI-000101` a `CLI-000104`), todos com `sintetico: true` e zero PII:
     - `CLI-000101`: 1 aplicação de `R$ 10.000,00` com 15 dias corridos na data de referência da demonstração (exercita IOF de 15 dias = 50% + IR de 22,5%, história H1);
     - `CLI-000102`: 3 aplicações ativas com 250 dias (IR 20%), 500 dias (IR 17,5%) e 800 dias (IR 15%, `≥ 721` dias);
     - `CLI-000103`: cliente cadastrado sem aplicações (`[]`, `motivo: "cliente_sem_aplicacoes"`), retornando o mesmo payload de um ID inexistente (`CLI-999999`);
     - `CLI-000104`: 1 aplicação de `R$ 500.000,00` (acima do limite informativo de R$ 250 mil do FGC e usada no teste de isolamento contra troca de `cliente_id` por prompt injection, `RF-021`).

## Alternativas rejeitadas
- **Ler as regras apenas de arquivo local empacotado no zip da Lambda, sem DynamoDB:** funciona em memória, mas não demonstra o padrão da âncora de desacoplar o estado de negócio em banco gerenciado cifrado com KMS e menor privilégio IAM (`ADR-0001`). Mantemos o JSON versionado no git como fonte de verdade que abastece o DynamoDB no apply (e nos testes unitários `UT` o repositório em memória lê direto o mesmo JSON validado).
- **Números em `number` (IEEE 754 float) no JSON Schema das tools:** perde precisão em centavos e pode gerar divergência de `R$ 0,01` entre ambientes.

## Trade-offs
- **Ganho:** reprodutibilidade matemática de `R$ 0,00`, auditoria completa de vigência/fonte por `id@versao` e teste unitário instantâneo sem nuvem.
- **Perda:** mudança de regra exige atualizar o arquivo JSON versionado e rodar o apply (ou script de carga), o que é intencional para garantir revisão humana no PR (`D03-P1 = B`).

## Custo
Duas tabelas DynamoDB sob demanda com poucos KB de itens: menos de **US$ 0,01** no dia de demonstração, removidas no `terraform destroy`.

## Risco
- **R4 da spec:** alteração normativa de IR ou IOF. Mitigado por vigência explícita (`vigente_desde`, `vigente_ate`) e data de referência fixa nos testes determinísticos.

## Tarefas da prova exercitadas
- **2.1:** schemas de entrada estritos com unidades explícitas (`valor_brl`, `data_aplicacao`).
- **4.1 e 5.6:** critérios determinísticos verificáveis, proveniência com fonte e data, e propagação explícita de `incertezas` quando `certeza == "a_confirmar"`.

## Curso Skilljar relacionado
*Introduction to Model Context Protocol* e *Building with the Claude API*.

## O que um arquiteto sênior faria em produção
Armazenaria o histórico imutável de publicações de regras em S3 com Object Lock (WORM) e trilha de aprovação de compliance, alimentaria a tabela DynamoDB por pipeline CI/CD assinado após revisão dupla (jurídico + produto), e sincronizaria a série histórica diária da Taxa DI da B3 por job agendado auditável.
