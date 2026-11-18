output "alb_dns_name" {
  description = "DNS do ALB."
  value       = aws_lb.alb.dns_name
}

output "alb_arn_suffix" {
  description = "Sufixo do ARN do ALB (dimensão de métricas)."
  value       = aws_lb.alb.arn_suffix
}

output "target_group_arn_suffix" {
  description = "Sufixo do ARN do target group."
  value       = aws_lb_target_group.app.arn_suffix
}

output "service_name" {
  description = "Serviço ECS."
  value       = aws_ecs_service.app.name
}

output "cluster_name" {
  description = "Cluster ECS."
  value       = aws_ecs_cluster.main.name
}

output "ecr_repository_url" {
  description = "Repositório da imagem."
  value       = aws_ecr_repository.app.repository_url
}
