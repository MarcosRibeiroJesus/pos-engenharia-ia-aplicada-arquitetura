# ADR-0013: teto de um dia, Budgets diário, gate único e métricas por EMF

- Status: aceito (plano aprovado pelo dono em 2026-11-20, D-056)
- Data: 2026-11-20
- Projeto: `01-recomendacao` (D01, recomendação de e-commerce)
- Decisões aplicadas: D-021, D-022, D-023, D-024
- Substitui a parte de custo do ADR-0002 (Budgets mensal de US$ 10, total por hora e "20 h por mês"). A parte de rede do ADR-0002 continua valendo
- Curso Skilljar relacionado: Claude Code in Action (gates no CI)

## Contexto
O stack tem um AWS Budgets mensal de US$ 10, e o CI da unidade tem um job próprio de Infracost que compara o custo mensal sem teto. Desde a D-021, o teto de cada projeto é o custo de um dia de demonstração. Ele vai num Budgets diário, e o limite mensal fica só no `infra/conta` (D-022). O gate de FinOps único é o `gate_custo.py` da esteira (D-023).

O serviço publica métricas com `PutMetricData`, e isso exige o endpoint de interface `monitoring`, a US$ 0,24 por dia, só para isso.

## Decisão
1. **Teto diário proposto de US$ 7,10**, sobre uma estimativa de US$ 6,43 (tabela do plano, com fontes e data). Vai em três lugares:
   - `teto_diario_usd` no `harness/estado.json`;
   - o README;
   - `aws_budgets_budget` com `time_unit = "DAILY"`, `limit_amount = var.teto_diario_usd` e filtro `user:project = 01-recomendacao`.

   O TH-06 confere que os três são iguais. O Budgets mensal sai do stack.
2. **Gate único:** o job de Infracost da unidade sai (ST-01). O `gate_custo.py` passa a somar as raízes do projeto e a pesar a raiz da janela por `prazo_maximo_horas/24` (ADR-0007, TH-04).
3. **Métricas por EMF:**
   - o serviço escreve as contagens no formato Embedded Metric Format, no log que o driver `awslogs` já envia pelo endpoint `logs`;
   - o endpoint `monitoring` sai da lista base e só existe na janela, onde o MWAA o exige;
   - os nomes e o namespace (`Ecommerce/Recommendations`) não mudam, então os alarmes continuam iguais.

## Alternativas rejeitadas
| Alternativa | Por que não |
|---|---|
| Manter o Budgets mensal no stack | Duplica o limite da conta e avisa tarde (D-022) |
| Teto sem margem (US$ 6,50) | Volumes de premissa; aviso por ruído. É a opção (b) da P01-P5 |
| Manter `PutMetricData` e o endpoint | US$ 0,24 por dia e uma chamada de rede a mais por requisição |
| Infracost da unidade com teto próprio | Dois gates sobre o mesmo assunto divergem; a regra é um gate por assunto |

## Trade-offs
- A métrica por EMF aparece com o atraso do processamento de logs, de segundos a poucos minutos. Isso basta para alarmes de 5 minutos.
- O Infracost não vê o custo de uso (tokens, guardrail). A margem do teto e o Budgets cobrem essa parte.

## Custo
- **Por dia:** base US$ 4,56, janela US$ 1,86 (3 h) e total US$ 6,43. O teto proposto é US$ 7,10.
- **Economia do EMF:** US$ 0,24 por dia.
- **No mês:** um dia da D01 com a plataforma soma cerca de US$ 7,60 estimados e US$ 8,30 em tetos, ou 42% do limite de US$ 20.

## Risco
- **R6:** três preços não apareceram nas tabelas oficiais (MemoryDB `db.t4g.small`, `mw1.micro` e treino). O plano usa limites superiores, e o Infracost confirma no primeiro PR de implementação.
- **R7:** o custo do Claude vai pelo AWS Marketplace e pode não aparecer no filtro por tag.
- **R8:** várias demonstrações num mês.

## Boa prática e erro comum (D-036)
**Um gate por assunto, com o limite calculado e escrito num lugar só.** O arquiteto calcula o custo de um dia com fonte, guarda o número num lugar, confere por teste que os outros lugares batem e leva a mudança de valor ao dono. O erro comum é ter dois gates de custo com regras diferentes, ou mudar o teto sozinho para o PR passar (5.3, 5.5; Art. V).

## O que um arquiteto sênior faria em produção
- **Orçamento por ambiente e por time:** Budgets por conta e por tag de centro de custo, com ações automáticas (SCP de negação) em ambientes de teste.
- **Anomalias:** Cost Anomaly Detection.
- **Revisão no PR:** o Infracost em todo PR com política de custo por ambiente.
