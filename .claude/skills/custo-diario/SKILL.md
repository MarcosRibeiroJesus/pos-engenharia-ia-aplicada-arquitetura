---
name: custo-diario
description: Teto de custo de um dia de demonstração (D-021) e limite mensal da conta (D-022). Use no plano para estimar o custo de 24 horas, gravar teto_diario_usd, configurar o AWS Budgets diário e revisar custo de PR.
---

# Custo de um dia de demonstração

O uso é **subir, gravar um vídeo curto e destruir no mesmo dia**. O teto do projeto é o custo estimado de 24 horas no ar.

## Estimar no plano
1. **Liste cada recurso** com o custo por hora ou por requisição, citando a fonte: página oficial de preços da AWS com a data da consulta, ou o Infracost.
2. **Custo de 24 h** = soma por hora × 24 + uso da demonstração (requisições, GB, tokens). Pelo Infracost: mensal × 24/730.
3. **O que cobra depois do destroy:** state, KMS em exclusão, logs, snapshots. Liste com o valor.
4. **Grave o total** em `plan.md` (seção "Custo do lab"), em `teto_diario_usd` no `harness/estado.json`, no README e no `limit_amount` de um `aws_budgets_budget` com `time_unit = "DAILY"`.

## Limites
- **Limite mensal da conta: US$ 20** (`vars.CUSTO_MAX_MENSAL_USD`, stack `infra/conta`).
- **Projeto cujo dia custa mais que o mês da conta:** reduza a escala ou leve a pergunta ao dono. Nunca aumente o teto sozinho.

## Gate e revisão
- O `gate_custo.py` bloqueia quando o dia passa do teto ou do limite mensal.
- Na revisão, aponte custo fixo ocioso sem ADR e qualquer recurso fora do destroy.

Valor de teto, orçamento e custo real são **decisão do dono**: você calcula e propõe; o dono aprova o plano.
