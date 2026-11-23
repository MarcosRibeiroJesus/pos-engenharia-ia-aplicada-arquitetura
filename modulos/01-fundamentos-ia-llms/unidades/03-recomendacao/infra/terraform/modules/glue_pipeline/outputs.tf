output "glue_job_name" {
  description = "Nome do job."
  value       = aws_glue_job.feature_engineering.name
}

output "glue_job_arn" {
  description = "ARN do job."
  value       = aws_glue_job.feature_engineering.arn
}

output "glue_role_arn" {
  description = "Role do job."
  value       = aws_iam_role.glue_service_role.arn
}

output "tags_dos_recursos" {
  description = "Atributo tags de cada recurso tagueável do módulo, para o teste de tags (TT-T01)."
  value = merge(
    { "aws_iam_role.glue_service_role" = aws_iam_role.glue_service_role.tags },
    { "aws_cloudwatch_log_group.glue" = aws_cloudwatch_log_group.glue.tags },
    { "aws_s3_object.script_feature_engineering" = aws_s3_object.script_feature_engineering.tags },
    { "aws_glue_job.feature_engineering" = aws_glue_job.feature_engineering.tags },
  )
}
