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

# Nome de cada recurso nomeado do módulo, para o teste de prefixo (TT-T02, ADR-0014). Recursos sem
# atributo de nome entram pela tag Name; nomes de policy inline (escopo da role) não entram.
output "nomes_dos_recursos" {
  description = "Nome de cada recurso nomeado do módulo, para o teste de prefixo (TT-T02)."
  value = merge(
    { "aws_athena_workgroup.analytics" = aws_athena_workgroup.analytics.name },
    { "aws_athena_named_query.extract_curated_features" = aws_athena_named_query.extract_curated_features.name },
  )
}
