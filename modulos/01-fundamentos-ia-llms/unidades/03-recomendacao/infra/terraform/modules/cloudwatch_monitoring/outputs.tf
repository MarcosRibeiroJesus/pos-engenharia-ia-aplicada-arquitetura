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
    { "aws_budgets_budget.monthly" = aws_budgets_budget.monthly.tags },
  )
}
