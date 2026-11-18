output "mwaa_arn" {
  description = "ARN do ambiente (null se desligado)."
  value       = var.enable_mwaa ? aws_mwaa_environment.pipeline[0].arn : null
}

output "mwaa_webserver_url" {
  description = "URL privada da UI do Airflow (null se desligado)."
  value       = var.enable_mwaa ? aws_mwaa_environment.pipeline[0].webserver_url : null
}
