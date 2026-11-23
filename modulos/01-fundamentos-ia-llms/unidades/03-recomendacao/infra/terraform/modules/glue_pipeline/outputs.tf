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

# Nome de cada recurso nomeado do módulo, para o teste de prefixo (TT-T02, ADR-0014). Recursos sem
# atributo de nome entram pela tag Name; nomes de policy inline (escopo da role) não entram.
output "nomes_dos_recursos" {
  description = "Nome de cada recurso nomeado do módulo, para o teste de prefixo (TT-T02)."
  value = merge(
    { "aws_iam_role.glue_service_role" = aws_iam_role.glue_service_role.name },
    { "aws_glue_security_configuration.main" = aws_glue_security_configuration.main.name },
    { "aws_cloudwatch_log_group.glue" = aws_cloudwatch_log_group.glue.name },
    { "aws_glue_job.feature_engineering" = aws_glue_job.feature_engineering.name },
  )
}
