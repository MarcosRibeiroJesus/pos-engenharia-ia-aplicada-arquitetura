# ADR 0005 · Motor de política em `ENFORCE`

- **Status:** aprovado com o plano (D-035; emenda 1 aprovada na D-038)
- **Data:** 2026-11-19
- **Requisitos:** RF-002, RF-010, RF-012, E6

## Contexto
O gateway associa o motor de política em dois modos ([doc do provider](https://github.com/hashicorp/terraform-provider-aws/blob/main/website/docs/r/bedrockagentcore_gateway.html.markdown)):
- `LOG_ONLY`: registra a decisão sem aplicar;
- `ENFORCE`: aplica.

As métricas `AllowDecisions` e `DenyDecisions` têm a dimensão `Mode` ([observabilidade do Policy](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/observability-policy-metrics.html)). A demonstração precisa provar que uma chamada fora da política é barrada, não só registrada.

## Decisão
- **Variável `modo_politica`:**
  - padrão `ENFORCE`;
  - aceita `LOG_ONLY` só com `calibracao = true`, por `validation` (TT-P01, TT-P02).
- **Workflow de apply da plataforma:**
  - recusa `LOG_ONLY` antes do Terraform (TH-05);
  - a calibração roda num apply separado, fora da demonstração gravada, e o resultado vai num ADR de calibração.
- **Alarme de negações:** usa `Mode=ENFORCE`, para que um apply de calibração não dispare o alarme.
- **Validação das políticas:** `validation_mode = FAIL_ON_ANY_FINDINGS`, o padrão. Um achado semântico, como uma política permissiva demais, derruba o apply do produto em vez de entrar calado.

## Alternativas rejeitadas
- **`LOG_ONLY` na demonstração:** a política vira observação. O DM-02 mostraria `DenyDecisions` sem o efeito de negação, e o gate deixa de ser gate.
- **Modo escolhido por input do workflow:** abre a chance de demonstrar sem bloqueio por engano.
- **`IGNORE_ALL_FINDINGS`:** esconde políticas permissivas demais.

## Trade-offs
- **Ganho:** a demonstração prova o controle de verdade e falha fechada.
- **Custo:**
  - um limiar mal calibrado bloqueia chamadas legítimas no dia;
  - a mitigação é o ensaio antes da gravação e a calibração com ADR.

## Custo
US$ 0 adicional. Autorizações custam US$ 0,000025 cada nos dois modos ([preços](https://aws.amazon.com/bedrock/agentcore/pricing/)).

## Risco
- **Bloqueio legítimo na gravação:** o ensaio com o roteiro antecipa.
- **Achado semântico inesperado (R8):** a política vai para `CREATE_FAILED`; o recurso do provider espera o estado final e o apply falha cedo.

## Tarefas da prova
- 1.4: workflow com gate programático que bloqueia de fato.
- 5.5: calibração com dados e revisão humana antes de mudar limiares.

## Curso Skilljar relacionado
Building with the Claude API: controle de tool use fora do modelo.

## Em produção, um arquiteto sênior faria
- Implantação canária de políticas novas:
  - primeiro em `LOG_ONLY` num motor espelho, comparando decisões com o motor em `ENFORCE`;
  - depois promoção por PR, com testes de política (casos de `permit` e `forbid`) no CI.
