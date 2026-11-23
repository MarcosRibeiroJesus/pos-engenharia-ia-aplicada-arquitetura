# ADR-0007: Custo ocioso zero, borda sem WAF no lab e conformidade com a conta única

- **Status:** proposto (vai com o plano). O valor do teto diário é decisão do dono
- **Data:** 2026-11-21 · **Autor:** arquiteto-aws (Claude Opus 5.5)

## Contexto
O uso é demonstração de um dia (D-021). O código já evita custo fixo (Lambdas fora de VPC, DynamoDB sob demanda, WAF desligado por variável), mas diverge da conta única e do teto diário: tag `project` e prefixo errados (DV-01, DV-03), `module` fora do padrão (DV-02), Budgets mensal de US$ 5 (DV-04), workflows de apply e destroy ausentes (DV-05), bootstrap próprio com role ampla (DV-06) e a configuração da role de logs do API Gateway, que é única por região na conta.

## Decisão
1. **Sem custo fixo ocioso:** Lambdas fora de VPC (sem NAT), sem endpoint de interface, DynamoDB sob demanda, WAF desligado no lab (`habilitar_waf = false`); ligar exige ADR de implementação com o custo.
2. **Conta única (D-029, D-031):** `project = 02-assistente-agendamento` pelo `default_tags`, `module` em kebab por componente pelo `local.tags`, nomes com o prefixo `02-assistente-agendamento-` (com as exceções de API, se houver, listadas na tarefa), teste de tags a partir de `harness/modelos/tags.tftest.hcl`.
3. **Teto diário:** o AWS Budgets do stack passa a `time_unit = "DAILY"`, com `limit_amount = var.teto_diario_usd`, cujo valor padrão é o `teto_diario_usd` do `harness/estado.json` depois da aprovação do dono. O plano propõe o valor; ele não é gravado antes da aprovação.
4. **Apply e destroy** a partir de `harness/modelos/` (`prazo_horas`, `confirm_stack`, OIDC, verificação de sobras pela tag, `infra.py registrar` e `remover`), usando o backend e a role de deploy da conta. O `infra/bootstrap` do D02 sai do caminho de apply; ele fica como referência até a fase verificar e é removido se a configuração da conta (P00-P2) o cobrir.
5. **Role de logs do API Gateway:** `configurar_conta_logs_apigw = false` no D02. Essa configuração é da conta, e o destroy do D02 deixaria a conta apontando para uma role apagada. Ela passa para o `infra/conta`, que o dono aplica (item de trabalho da conta, sem pergunta nova).
6. **Cota de tokens do gateway: [PROPOSTA, aprovação do dono na D02-P4 e na D02-P5].** Proposta: subir de 200.000 para 400.000 tokens por dia, para caber a rodada real (roteiro, avaliação e red team). Na prática a cota é global, porque o único cliente do gateway é o orquestrador. Ela é o limite duro do custo de tokens e define o pior caso da seção de custo do plano; por isso o valor vai junto do teto. O alarme de custo de tokens proposto (`custo_diario_llm_alarme_usd` = US$ 0,40) segue a mesma regra.

## Alternativas rejeitadas
- **WAF ligado no lab.** Rejeitado: custo por mês de web ACL e por regra, rateado, sem ganho numa demonstração com SigV4 e chave de API.
- **Manter o Budgets mensal por projeto.** Rejeitado: substituído pela D-021 e pela D-022 (teto de um dia e limite mensal da conta).
- **Manter o bootstrap próprio.** Rejeitado: duplica o OIDC da conta e dá `PowerUserAccess` à role de deploy do projeto.

## Trade-offs
Renomear tudo (tag e prefixo) muda todos os nomes do plan e exige ajustar os testes do Terraform e de integração.

## Custo
Ver plano. O Budgets é gratuito.

## Risco
O Budgets avisa com atraso de até um dia; o prazo de vida de 24 h do apply é a proteção principal (D-024).

## Tarefas da prova exercitadas
3.6 (CI e gates), 5.3 (falha segura do destroy automático).

## Curso Skilljar relacionado
*Claude Code in Action*.

## O que um arquiteto sênior faria em produção
Uma conta por produto e ambiente, com SCP e orçamento por conta, WAF ligado com regras gerenciadas e limite por IP, e alarmes de custo por perfil de inferência.
