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
