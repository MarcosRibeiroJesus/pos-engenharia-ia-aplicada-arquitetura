output "workgroup_name" {
  description = "workgroup_name"
  value       = aws_athena_workgroup.analytics.name
}

output "workgroup_arn" {
  description = "workgroup_arn"
  value       = aws_athena_workgroup.analytics.arn
}

output "named_query_id" {
  description = "named_query_id"
  value       = aws_athena_named_query.extract_curated_features.id
}

output "tags_dos_recursos" {
  description = "Atributo tags de cada recurso tagueável do módulo, para o teste de tags (TT-T01)."
  value = merge(
    { "aws_athena_workgroup.analytics" = aws_athena_workgroup.analytics.tags },
  )
}
