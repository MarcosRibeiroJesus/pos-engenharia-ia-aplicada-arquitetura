output "dashboard_name" {
  description = "Dashboard."
  value       = aws_cloudwatch_dashboard.platform.dashboard_name
}

output "alerts_topic_arn" {
  description = "Tópico de alertas."
  value       = aws_sns_topic.alerts.arn
}
