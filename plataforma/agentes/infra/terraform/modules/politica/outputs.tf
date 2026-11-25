output "policy_engine_arn" {
  description = "ARN do motor: policy_engine_configuration do gateway (ADR-0011, TT-P01) e contrato (T018)."
  value       = aws_bedrockagentcore_policy_engine.plataforma.policy_engine_arn
}

output "policy_engine_id" {
  description = "Id do motor: alarmes do motor (T017), contrato (T018) e políticas Cedar dos produtos."
  value       = aws_bedrockagentcore_policy_engine.plataforma.policy_engine_id
}

output "modo_politica" {
  description = "Modo validado pela trava do ADR-0005; o root o passa ao gateway (TT-P01, TT-P02)."
  value       = var.modo_politica
}

output "encryption_key_arn" {
  description = "Chave com que o motor é cifrado (TT-S02); o composicao.tftest.hcl confere que é a do nucleo."
  value       = aws_bedrockagentcore_policy_engine.plataforma.encryption_key_arn
}

output "tags" {
  description = "Tags do módulo (module); project e managed-by vêm do default_tags do root (D-031)."
  value       = local.tags
}
