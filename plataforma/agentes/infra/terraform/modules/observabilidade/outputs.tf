output "grupo_log_gateway" {
  description = "Nome do grupo de logs de aplicação do gateway: campo grupo_log_gateway do contrato comum (T018) e consulta da role de evidências (T068)."
  value       = aws_cloudwatch_log_group.gateway.name
}

output "grupo_log_gateway_arn" {
  description = "ARN do grupo de logs de aplicação do gateway: recurso de logs:StartQuery da role de evidências (T068)."
  value       = aws_cloudwatch_log_group.gateway.arn
}

output "entrega_logs_arn" {
  description = "ARN da entrega dos logs de aplicação do gateway (RF-006, TT-O01)."
  value       = aws_cloudwatch_log_delivery.logs_gateway.arn
}

output "entrega_traces_arn" {
  description = "ARN da entrega dos traces do gateway para o X-Ray (RF-006, TT-O01)."
  value       = aws_cloudwatch_log_delivery.traces_gateway.arn
}

output "tags" {
  description = "Tags do módulo (module); project e managed-by vêm do default_tags do root (D-031)."
  value       = local.tags
}
