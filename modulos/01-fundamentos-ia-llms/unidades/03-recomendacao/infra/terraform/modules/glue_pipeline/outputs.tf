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
