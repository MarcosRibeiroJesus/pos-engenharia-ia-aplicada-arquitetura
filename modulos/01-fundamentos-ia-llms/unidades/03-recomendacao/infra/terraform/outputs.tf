output "s3_golden_dataset_bucket" {
  description = "Bucket do golden dataset."
  value       = module.s3_golden_dataset.bucket_name
}

output "dynamodb_table_name" {
  description = "Tabela de recomendações em lote."
  value       = module.dynamodb_table.table_name
}

output "memorydb_cluster_endpoint" {
  description = "Endpoint TLS do MemoryDB."
  value       = module.memorydb_cluster.cluster_endpoint
}

output "sagemaker_endpoint_name" {
  description = "Endpoint Serverless do re-ranker."
  value       = module.sagemaker_endpoint.endpoint_name
}

output "ecr_repository_url" {
  description = "Repositório da imagem do serviço."
  value       = module.ecs_service.ecr_repository_url
}

output "ecs_service_alb_dns" {
  description = "DNS do ALB (interno por padrão)."
  value       = module.ecs_service.alb_dns_name
}

output "athena_workgroup_name" {
  description = "Workgroup do Athena."
  value       = module.athena_queries.workgroup_name
}

output "glue_job_name" {
  description = "Job de feature engineering."
  value       = module.glue_pipeline.glue_job_name
}

output "sagemaker_train_script_uri" {
  description = "Script de treino no S3."
  value       = module.sagemaker_training.train_script_s3_uri
}

output "cloudwatch_dashboard_name" {
  description = "Dashboard do CloudWatch."
  value       = module.cloudwatch_monitoring.dashboard_name
}

output "alerts_topic_arn" {
  description = "Tópico SNS de alarmes e orçamento."
  value       = module.cloudwatch_monitoring.alerts_topic_arn
}
