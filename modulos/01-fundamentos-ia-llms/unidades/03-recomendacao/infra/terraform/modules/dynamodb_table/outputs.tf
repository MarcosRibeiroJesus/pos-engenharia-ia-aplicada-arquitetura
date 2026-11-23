output "table_name" {
  value = aws_dynamodb_table.user_recommendations.name
}

output "table_arn" {
  value = aws_dynamodb_table.user_recommendations.arn
}

output "tags_dos_recursos" {
  description = "Atributo tags de cada recurso tagueável do módulo, para o teste de tags (TT-T01)."
  value = merge(
    { "aws_dynamodb_table.user_recommendations" = aws_dynamodb_table.user_recommendations.tags },
  )
}
