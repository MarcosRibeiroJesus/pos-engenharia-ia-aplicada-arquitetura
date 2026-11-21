# AWS Budgets diário com o teto da plataforma (T012; Art. V, RNF-002, D-021; TT-K01). O limite
# mensal da conta é outro orçamento, no infra/conta (D-022), fora deste módulo.
#
# O filtro user:project$00-plataforma-agentes só enxerga custo depois que a tag project estiver
# ativa como tag de alocação de custo (D-039, T053). Antes disso o orçamento diário não vê nada, e
# só o mensal da conta protege (análise 1, A17).
#
# Orçamento de monitoramento, sem ações: não cobra (plano, Custo do lab).

locals {
  # Só custo real. Que o orçamento diário não aceita alerta de previsão é afirmação da memória,
  # não verificada nesta tarefa: falta conferir no AWS Budgets User Guide. Os alertas de custo real
  # valem em qualquer período, então a escolha não depende dessa conferência.
  alertas_do_teto = {
    real_80  = 80
    real_100 = 100
  }
}

resource "aws_budgets_budget" "diario" {
  name         = "${local.prefixo}-teto-diario"
  budget_type  = "COST"
  limit_amount = tostring(var.teto_diario_usd)
  limit_unit   = "USD"
  time_unit    = "DAILY"

  cost_filter {
    name = "TagKeyValue"
    # join, e não interpolação: em HCL, "$${" escapa a interpolação e o nome sairia literal.
    values = [join("$", ["user:project", local.prefixo])]
  }

  # Os mesmos e-mails das assinaturas do tópico (sns.tf), lidos do value sensível do parâmetro
  # (D-034, ADR-0008): o plan e o apply do Actions, que é público, não imprimem os destinatários.
  dynamic "notification" {
    for_each = local.alertas_do_teto
    content {
      comparison_operator        = "GREATER_THAN"
      threshold                  = notification.value
      threshold_type             = "PERCENTAGE"
      notification_type          = "ACTUAL"
      subscriber_email_addresses = local.emails_alerta
    }
  }

  tags = local.tags
}
