output "key_arn" {
  description = "ARN da chave da plataforma."
  value       = aws_kms_key.platform.arn
}

output "tags_dos_recursos" {
  description = "Atributo tags de cada recurso tagueável do módulo, para o teste de tags (TT-T01)."
  value = merge(
    { "aws_kms_key.platform" = aws_kms_key.platform.tags },
  )
}
