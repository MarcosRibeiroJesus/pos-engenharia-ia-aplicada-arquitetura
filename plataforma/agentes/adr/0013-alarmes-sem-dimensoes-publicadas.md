# ADR 0013 · Alarmes por consulta do Metrics Insights onde as dimensões não estão publicadas

- **Status:** aceito. É decisão técnica delegada dentro do plano aprovado (D-033, D-038) e corrige o achado A05 da análise 1.
- **Data:** 2026-11-20
- **Requisitos:** RNF-003 (alarmes), RF-006; ADR-0008

## Contexto
- **Um alarme comum só casa com a série que tem exatamente o mesmo conjunto de dimensões.** Com `treat_missing_data = notBreaching`, um alarme com o conjunto errado fica em OK para sempre.
- **A página de métricas do Policy** ([Policy observability data](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/observability-policy-metrics.html), consultada em 2026-11-20) lista as dimensões disponíveis "para as métricas acima":
  - `OperationName`, `PolicyEngine`, `Policy`, `TargetResource`, `ToolName`, `Mode`, `Category` e `Filter`;
  - ela não publica o conjunto de cada métrica, a não ser o de `PolicyEnforcementMode`.
  - Então o conjunto de `DenyDecisions` e de `SystemErrors` do motor não está documentado.
- **O CloudWatch não aceita alarme sobre expressão `SEARCH`.** Só o alarme sobre consulta SQL do Metrics Insights opera sobre várias séries. Um alarme de metric math precisa devolver uma série e aceita até 10 métricas ([alarme sobre metric math](https://docs.aws.eu/AmazonCloudWatch/latest/monitoring/Create-alarm-on-metric-math-expression.html), consultado em 2026-11-20).
- **Preço** ([CloudWatch pricing](https://aws.amazon.com/cloudwatch/pricing/), consultado em 2026-11-20): o alarme por consulta do Metrics Insights cobra cada métrica analisada. No exemplo da página, são US$ 0,10 por métrica analisada por mês em us-east-1, e a página avisa que os valores são exemplos.

## Decisão
- **A métrica com conjunto de dimensões publicado** usa alarme comum. O assert do plan fixa o conjunto completo, com o link da página e a data da consulta. Hoje é o caso de `InvocationsIntervened`, com `GuardrailArn` e `GuardrailVersion` (T037). Se a página mostrar a métrica também com a dimensão `Operation`, o caso passa para a regra abaixo.
- **A métrica sem conjunto publicado** usa alarme sobre consulta do Metrics Insights, filtrada pelo recurso. A consulta soma todas as séries numa só, sem `GROUP BY`. Para as negações, por exemplo:

  `SELECT SUM(DenyDecisions) FROM "AWS/Bedrock-AgentCore" WHERE PolicyEngine = '<id>' AND Mode = 'ENFORCE'`

  - O mesmo vale para o `SystemErrors` do motor.
  - Vale também para as três métricas do gateway, se a página de métricas do Gateway não publicar o conjunto. Nesse caso, o filtro é pelo identificador do gateway (ARN, a confirmar no ensaio) (T017).
- **Os demais parâmetros do RNF-003 não mudam:** período de 300 s, 1 avaliação, `Sum`, `notBreaching`, limiares e ação no tópico (T017).
- **O alarme só conta depois de disparar uma vez.** No ensaio (T084, DM-09), 5 `tools/call` negados com a role de fumaça levam o alarme de negações a `ALARM`, e o e-mail chega. Isso prova também a política da chave e a do tópico para o CloudWatch publicar no SNS cifrado (ADR-0001, ADR-0008).
  - O job de fumaça (T069) grava no relatório do ensaio o estado do alarme e a saída de `list-metrics` do namespace. Assim, os conjuntos reais de dimensões ficam registrados com evidência.
  - Se `DenyDecisions` não subir e `NoDeterminingPolicies` subir, o achado vai ao relatório e vira ADR antes da demonstração. Isso pode acontecer porque a role de fumaça não tem `permit`, e não está documentado se a negação por falta de política determinante conta em `DenyDecisions`.

## Alternativas rejeitadas
- **Alarme com `SEARCH`:** o CloudWatch não aceita.
- **Metric math com `SUM` de séries explícitas:** exige conhecer cada conjunto de dimensões, que é justamente o que falta, e aceita no máximo 10 métricas. Fica como plano B, se o custo da consulta passar da reserva, usando os conjuntos registrados no ensaio.
- **Alarme comum com um conjunto adivinhado:** é o alarme "verde" que nunca fica vermelho.

## Trade-offs
- **Ganho:** o alarme enxerga a métrica qualquer que seja o conjunto de dimensões publicado, e o ensaio prova o disparo.
- **Custo:**
  - o preço passa de "por alarme" para "por métrica analisada";
  - o Floci pode não emular o alarme por consulta (ADR-0009: "só métrica única"). Nesse caso, o FL-01 afirma só a configuração.

## Custo
- **Estimativa (inferida):** as séries de `DenyDecisions` e de `SystemErrors` só existem quando há negação ou erro. No dia, o roteiro tem até 2 negações e o DM-09 tem 5, na mesma tool, então são poucas séries.
  - Com 5 séries analisadas nos dois alarmes do motor: 5 × 0,10 × 24/730 = **US$ 0,016 por dia**, contra US$ 0,007 dos dois alarmes na tabela do plano.
  - Se as três métricas do gateway também forem por consulta, com até 10 séries cada, o pior caso é 3 × 10 × 0,10 × 24/730 = **US$ 0,099 por dia**. Isso consumiria quase toda a margem de US$ 0,118 do teto.
- **Controle:**
  - o T073 confere o custo dos alarmes contra a linha do plano no PR, pelo arquivo de uso do Infracost (TH-15);
  - o T087 confere o custo real;
  - se o pior caso se confirmar, os alarmes do gateway passam para metric math com os conjuntos registrados no ensaio, sem mexer no teto, que é do dono.

## Risco
- **A consulta casar séries de outro gateway ou motor:** o filtro pelo id do recurso evita.
- **O custo subir com muitas tools:** é medido no ensaio e na demonstração, e o plano B está acima.

## Tarefas da prova
- 5.2: o escalonamento para humano só funciona se o alarme dispara; o ensaio prova.
- 5.6: dimensões e preço com fonte e data, e o ponto não documentado declarado como incerto.
- 4.1: critério explícito e mensurável (o alarme vai a `ALARM` no ensaio).

## Curso Skilljar relacionado
Claude with Amazon Bedrock: operação e monitoramento de aplicações na conta.

## Em produção, um arquiteto sênior faria
- Rodaria um teste sintético periódico (canário) que força cada alarme crítico e confere a notificação de ponta a ponta.
- Manteria os alarmes como código, com o conjunto de dimensões testado contra `list-metrics` de um ambiente real.
