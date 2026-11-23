output "mwaa_arn" {
  description = "ARN do ambiente (null se desligado)."
  value       = var.enable_mwaa ? aws_mwaa_environment.pipeline[0].arn : null
}

output "mwaa_webserver_url" {
  description = "URL privada da UI do Airflow (null se desligado)."
  value       = var.enable_mwaa ? aws_mwaa_environment.pipeline[0].webserver_url : null
}

output "tags_dos_recursos" {
  description = "Atributo tags de cada recurso tagueável do módulo, para o teste de tags (TT-T01)."
  value = merge(
    { for i, r in aws_iam_role.mwaa_execution_role : "aws_iam_role.mwaa_execution_role[${i}]" => r.tags },
    { for i, r in aws_security_group.mwaa : "aws_security_group.mwaa[${i}]" => r.tags },
    { "aws_s3_object.pipeline_dag" = aws_s3_object.pipeline_dag.tags },
    { for i, r in aws_mwaa_environment.pipeline : "aws_mwaa_environment.pipeline[${i}]" => r.tags },
  )
}
