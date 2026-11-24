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

# Só o ARN: nenhum output expõe os e-mails das assinaturas (ADR-0008, Art. VIII).
output "topico_alarmes_arn" {
  description = "ARN do tópico de alarmes: destino dos alarmes da plataforma e do contrato (topico_alarmes_arn, ADR-0008)."
  value       = aws_sns_topic.alarmes.arn
}

output "tags" {
  description = "Tags do módulo (module); project e managed-by vêm do default_tags do root (D-031)."
  value       = local.tags
}
