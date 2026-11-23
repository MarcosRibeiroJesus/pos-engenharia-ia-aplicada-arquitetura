output "dashboard_name" {
  description = "Dashboard."
  value       = aws_cloudwatch_dashboard.platform.dashboard_name
}

output "alerts_topic_arn" {
  description = "Tópico de alertas."
  value       = aws_sns_topic.alerts.arn
}

output "tags_dos_recursos" {
  description = "Atributo tags de cada recurso tagueável do módulo, para o teste de tags (TT-T01)."
  value = merge(
    { "aws_sns_topic.alerts" = aws_sns_topic.alerts.tags },
    { for k, r in aws_cloudwatch_metric_alarm.this : "aws_cloudwatch_metric_alarm.this[${k}]" => r.tags },
    { "aws_budgets_budget.daily" = aws_budgets_budget.daily.tags },
  )
}

# Nome de cada recurso nomeado do módulo, para o teste de prefixo (TT-T02, ADR-0014). Recursos sem
# atributo de nome entram pela tag Name; nomes de policy inline (escopo da role) não entram.
output "nomes_dos_recursos" {
  description = "Nome de cada recurso nomeado do módulo, para o teste de prefixo (TT-T02)."
  value = merge(
    { "aws_sns_topic.alerts" = aws_sns_topic.alerts.name },
    { for k, r in aws_cloudwatch_metric_alarm.this : "aws_cloudwatch_metric_alarm.this[${k}]" => r.alarm_name },
    { "aws_budgets_budget.daily" = aws_budgets_budget.daily.name },
    { "aws_cloudwatch_dashboard.platform" = aws_cloudwatch_dashboard.platform.dashboard_name },
  )
}

# Só o que não identifica ninguém: nome, período e limite. Os destinatários ficam fora (Art. VIII).
output "orcamento_diario" {
  description = "Budgets diário do stack (TT-K01)."
  value = {
    nome         = aws_budgets_budget.daily.name
    time_unit    = aws_budgets_budget.daily.time_unit
    limit_amount = aws_budgets_budget.daily.limit_amount
  }
}
