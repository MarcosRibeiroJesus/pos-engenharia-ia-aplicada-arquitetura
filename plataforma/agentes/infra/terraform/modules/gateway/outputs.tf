output "gateway_arn" {
  description = "ARN do gateway: role de fumaça (T014), alarmes (T017), contrato (T018) e aws:SourceArn das políticas de recurso dos produtos."
  value       = aws_bedrockagentcore_gateway.plataforma.gateway_arn
}

output "gateway_id" {
  description = "Id do gateway: grupo de logs entregue e dimensão dos alarmes (T016, T017)."
  value       = aws_bedrockagentcore_gateway.plataforma.gateway_id
}

output "gateway_url" {
  description = "URL MCP do gateway, publicada no contrato comum (T018)."
  value       = aws_bedrockagentcore_gateway.plataforma.gateway_url
}

output "role_execucao_arn" {
  description = "ARN da role de execução do gateway: principal das políticas de recurso dos alvos Lambda dos produtos (ADR-0003)."
  value       = aws_iam_role.execucao.arn
}

# Lidos do recurso, não da entrada: o TT-P01 (tests/composicao.tftest.hcl do root, T015) confere o
# bloco que o gateway vai ter de fato, porque um assert no root não alcança o recurso do módulo.
output "policy_engine_configuration" {
  description = "Bloco policy_engine_configuration do gateway (arn e mode); vazio sem o motor (ADR-0011)."
  value       = aws_bedrockagentcore_gateway.plataforma.policy_engine_configuration
}

output "kms_key_arn" {
  description = "Chave com que o gateway é cifrado (TT-S02), conferida no composicao.tftest.hcl do root."
  value       = aws_bedrockagentcore_gateway.plataforma.kms_key_arn
}

output "tags" {
  description = "Tags do módulo (module); project e managed-by vêm do default_tags do root (D-031)."
  value       = local.tags
}

output "role_fumaca_arn" {
  description = "ARN da role de fumaça (só InvokeGateway): script de fumaça (T066) e job fumaca do workflow de evidências (T069)."
  value       = aws_iam_role.fumaca.arn
}
