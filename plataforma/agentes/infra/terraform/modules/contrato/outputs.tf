output "contrato_v1" {
  description = "Objeto do parâmetro comum do contrato v1 (RF-007), o mesmo valor do SSM; o TS-01 o valida contra o v1.schema.json."
  value       = local.comum
}

output "parametro_comum_nome" {
  description = "Nome do parâmetro comum: data source aws_ssm_parameter do produto (registro-produto, T030)."
  value       = aws_ssm_parameter.comum.name
}

output "parametro_comum_arn" {
  description = "ARN do parâmetro comum: recurso do ssm:GetParameter das roles dos agentes (T032)."
  value       = aws_ssm_parameter.comum.arn
}

output "tags" {
  description = "Tags do módulo (module); project e managed-by vêm do default_tags do root (D-031)."
  value       = local.tags
}
