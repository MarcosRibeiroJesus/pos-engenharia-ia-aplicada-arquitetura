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

output "tags_dos_recursos" {
  description = "Atributo tags de cada recurso tagueável do módulo, para o teste de tags (TT-T01)."
  value = merge(
    { "aws_ecr_repository.app" = aws_ecr_repository.app.tags },
    { "aws_ecs_cluster.main" = aws_ecs_cluster.main.tags },
    { "aws_cloudwatch_log_group.ecs" = aws_cloudwatch_log_group.ecs.tags },
    { "aws_iam_role.ecs_execution_role" = aws_iam_role.ecs_execution_role.tags },
    { "aws_iam_role.ecs_task_role" = aws_iam_role.ecs_task_role.tags },
    { "aws_iam_policy.ecs_task_policy" = aws_iam_policy.ecs_task_policy.tags },
    { "aws_lb.alb" = aws_lb.alb.tags },
    { "aws_lb_target_group.app" = aws_lb_target_group.app.tags },
    { "aws_lb_listener.http" = aws_lb_listener.http.tags },
    { for i, r in aws_lb_listener.https : "aws_lb_listener.https[${i}]" => r.tags },
    { "aws_ecs_task_definition.app" = aws_ecs_task_definition.app.tags },
    { "aws_ecs_service.app" = aws_ecs_service.app.tags },
  )
}
