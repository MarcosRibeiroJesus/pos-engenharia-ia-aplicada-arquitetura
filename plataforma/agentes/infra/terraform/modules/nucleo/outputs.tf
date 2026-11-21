output "chave_arn" {
  description = "ARN da chave da plataforma: tópico SNS, log groups, gateway (kms_key_arn) e motor (encryption_key_arn)."
  value       = aws_kms_key.plataforma.arn
}

output "chave_id" {
  description = "Id da chave da plataforma."
  value       = aws_kms_key.plataforma.key_id
}

output "chave_alias" {
  description = "Alias da chave da plataforma."
  value       = aws_kms_alias.plataforma.name
}

output "tags" {
  description = "Tags do módulo (module); project e managed-by vêm do default_tags do root (D-031)."
  value       = local.tags
}
