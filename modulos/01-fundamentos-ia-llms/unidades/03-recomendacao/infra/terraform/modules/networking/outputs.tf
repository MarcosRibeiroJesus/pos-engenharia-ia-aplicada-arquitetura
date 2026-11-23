output "vpc_id" {
  description = "ID da VPC."
  value       = aws_vpc.main.id
}

output "vpc_cidr" {
  description = "CIDR da VPC."
  value       = aws_vpc.main.cidr_block
}

output "private_subnet_ids" {
  description = "Subnets privadas."
  value       = aws_subnet.private[*].id
}

output "public_subnet_ids" {
  description = "Subnets públicas (vazio sem expose_api_publicly)."
  value       = aws_subnet.public[*].id
}

output "alb_subnet_ids" {
  description = "Subnets do ALB: públicas com opt-in, privadas por padrão."
  value       = var.expose_api_publicly ? aws_subnet.public[*].id : aws_subnet.private[*].id
}

output "alb_sg_id" {
  description = "SG do ALB."
  value       = aws_security_group.alb.id
}

output "ecs_sg_id" {
  description = "SG das tasks."
  value       = aws_security_group.ecs.id
}

output "internal_sg_id" {
  description = "SG do MemoryDB."
  value       = aws_security_group.internal.id
}

output "interface_endpoint_services" {
  description = "Serviços com endpoint de interface."
  value       = keys(aws_vpc_endpoint.interface)
}

output "tags_dos_recursos" {
  description = "Atributo tags de cada recurso tagueável do módulo, para o teste de tags (TT-T01)."
  value = merge(
    { "aws_vpc.main" = aws_vpc.main.tags },
    { "aws_default_security_group.default" = aws_default_security_group.default.tags },
    { for i, r in aws_subnet.private : "aws_subnet.private[${i}]" => r.tags },
    { "aws_route_table.private" = aws_route_table.private.tags },
    { for i, r in aws_internet_gateway.gw : "aws_internet_gateway.gw[${i}]" => r.tags },
    { for i, r in aws_subnet.public : "aws_subnet.public[${i}]" => r.tags },
    { for i, r in aws_route_table.public : "aws_route_table.public[${i}]" => r.tags },
    { for k, r in aws_vpc_endpoint.gateway : "aws_vpc_endpoint.gateway[${k}]" => r.tags },
    { for k, r in aws_vpc_endpoint.interface : "aws_vpc_endpoint.interface[${k}]" => r.tags },
    { "aws_security_group.alb" = aws_security_group.alb.tags },
    { "aws_security_group.ecs" = aws_security_group.ecs.tags },
    { "aws_security_group.endpoints" = aws_security_group.endpoints.tags },
    { "aws_security_group.internal" = aws_security_group.internal.tags },
    { for i, r in aws_cloudwatch_log_group.flow_logs : "aws_cloudwatch_log_group.flow_logs[${i}]" => r.tags },
    { for i, r in aws_iam_role.flow_logs : "aws_iam_role.flow_logs[${i}]" => r.tags },
    { for i, r in aws_flow_log.vpc : "aws_flow_log.vpc[${i}]" => r.tags },
  )
}

# Nome de cada recurso nomeado do módulo, para o teste de prefixo (TT-T02, ADR-0014). Recursos sem
# atributo de nome entram pela tag Name; nomes de policy inline (escopo da role) não entram.
output "nomes_dos_recursos" {
  description = "Nome de cada recurso nomeado do módulo, para o teste de prefixo (TT-T02)."
  value = merge(
    { "aws_vpc.main" = aws_vpc.main.tags["Name"] },
    { for i, r in aws_subnet.private : "aws_subnet.private[${i}]" => r.tags["Name"] },
    { "aws_route_table.private" = aws_route_table.private.tags["Name"] },
    { for i, r in aws_internet_gateway.gw : "aws_internet_gateway.gw[${i}]" => r.tags["Name"] },
    { for i, r in aws_subnet.public : "aws_subnet.public[${i}]" => r.tags["Name"] },
    { for i, r in aws_route_table.public : "aws_route_table.public[${i}]" => r.tags["Name"] },
    { for k, r in aws_vpc_endpoint.gateway : "aws_vpc_endpoint.gateway[${k}]" => r.tags["Name"] },
    { for k, r in aws_vpc_endpoint.interface : "aws_vpc_endpoint.interface[${k}]" => r.tags["Name"] },
    { "aws_security_group.alb" = aws_security_group.alb.name },
    { "aws_security_group.ecs" = aws_security_group.ecs.name },
    { "aws_security_group.endpoints" = aws_security_group.endpoints.name },
    { "aws_security_group.internal" = aws_security_group.internal.name },
    { for i, r in aws_cloudwatch_log_group.flow_logs : "aws_cloudwatch_log_group.flow_logs[${i}]" => r.name },
    { for i, r in aws_iam_role.flow_logs : "aws_iam_role.flow_logs[${i}]" => r.name },
  )
}

# Custo fixo (TT-K02, ADR-0002): AZs de cada endpoint de interface (US$ 0,01/h por ENI) e os serviços
# com endpoint de gateway (sem custo por hora).
output "endpoints_de_interface" {
  description = "Quantidade de AZs (ENIs) de cada endpoint de interface, pelo serviço (TT-K02)."
  value       = { for s, e in aws_vpc_endpoint.interface : s => length(e.subnet_ids) }
}

output "endpoints_de_gateway" {
  description = "Serviços com endpoint de gateway (TT-K02)."
  value       = toset(keys(aws_vpc_endpoint.gateway))
}
