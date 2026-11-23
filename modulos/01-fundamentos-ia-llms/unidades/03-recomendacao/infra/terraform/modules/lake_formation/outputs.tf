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

# Nome de cada recurso nomeado do módulo, para o teste de prefixo (TT-T02, ADR-0014). Recursos sem
# atributo de nome entram pela tag Name; nomes de policy inline (escopo da role) não entram.
output "nomes_dos_recursos" {
  description = "Nome de cada recurso nomeado do módulo, para o teste de prefixo (TT-T02)."
  value = merge(
    { "aws_glue_catalog_database.ecommerce_golden_db" = aws_glue_catalog_database.ecommerce_golden_db.name },
  )
}
