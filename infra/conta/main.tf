# Limite mensal da conta (D-022). Segunda camada de custo, acima do teto diário de cada projeto (D-021).
# O alerta do Budgets chega com atraso; a proteção principal é o prazo de vida com destroy automático
# (harness/infra.py e .github/workflows/expirar-infra.yml).
locals {
  tags = {
    project      = "conta"
    module       = "finops"
    "managed-by" = "terraform"
  }
  alertas = {
    real_80      = { tipo = "ACTUAL", limiar = 80 }
    real_100     = { tipo = "ACTUAL", limiar = 100 }
    previsto_100 = { tipo = "FORECASTED", limiar = 100 }
  }
}

resource "aws_budgets_budget" "mensal" {
  name         = "conta-limite-mensal"
  budget_type  = "COST"
  limit_amount = tostring(var.limite_mensal_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"
  tags         = local.tags

  dynamic "notification" {
    for_each = local.alertas
    content {
      comparison_operator        = "GREATER_THAN"
      threshold                  = notification.value.limiar
      threshold_type             = "PERCENTAGE"
      notification_type          = notification.value.tipo
      subscriber_email_addresses = var.emails_alerta
    }
  }
}
