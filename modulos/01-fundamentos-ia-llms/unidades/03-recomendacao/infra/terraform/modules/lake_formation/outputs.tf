output "database_name" {
  value = aws_glue_catalog_database.ecommerce_golden_db.name
}

output "database_arn" {
  value = aws_glue_catalog_database.ecommerce_golden_db.arn
}

output "tags_dos_recursos" {
  description = "Atributo tags de cada recurso tagueável do módulo, para o teste de tags (TT-T01)."
  value = merge(
    { "aws_glue_catalog_database.ecommerce_golden_db" = aws_glue_catalog_database.ecommerce_golden_db.tags },
  )
}
