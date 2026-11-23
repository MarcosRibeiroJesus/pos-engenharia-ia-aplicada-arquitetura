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

output "tags_padrao" {
  description = "Tags que o provider aplica a todo recurso (default_tags)."
  value       = local.tags_padrao
}

# Tags efetivas de cada recurso tagueável do root: o default_tags do provider somado ao atributo
# tags do recurso (que leva o local.tags do módulo). O tests/tags.tftest.hcl itera sobre este mapa;
# cada módulo novo entra aqui com o output tags_dos_recursos dele (TT-T01).
output "tags_dos_recursos" {
  description = "Tags efetivas por recurso tagueável do root, para o teste de tags (TT-T01)."
  value       = local.tags_dos_recursos
}

locals {
  tags_dos_recursos = merge([for m, recursos in {
    networking            = module.networking.tags_dos_recursos
    kms                   = module.kms.tags_dos_recursos
    s3_golden_dataset     = module.s3_golden_dataset.tags_dos_recursos
    lake_formation        = module.lake_formation.tags_dos_recursos
    dynamodb_table        = module.dynamodb_table.tags_dos_recursos
    memorydb_cluster      = module.memorydb_cluster.tags_dos_recursos
    sagemaker_endpoint    = module.sagemaker_endpoint.tags_dos_recursos
    sagemaker_training    = module.sagemaker_training.tags_dos_recursos
    ecs_service           = module.ecs_service.tags_dos_recursos
    athena_queries        = module.athena_queries.tags_dos_recursos
    glue_pipeline         = module.glue_pipeline.tags_dos_recursos
    cloudwatch_monitoring = module.cloudwatch_monitoring.tags_dos_recursos
    } : { for endereco, tags in recursos : "${m}.${endereco}" => merge(local.tags_padrao, tags) }
  ]...)
}

output "prefixo_dos_nomes" {
  description = "Prefixo dos nomes dos recursos, lido pelo harness de integração no Floci."
  value       = "${var.project_name}-${var.environment}"
}

output "memorydb_cluster_name" {
  description = "Nome do cluster do MemoryDB (exceção p01-recomendacao- do ADR-0014), lido pelo harness de integração."
  value       = module.memorydb_cluster.cluster_name
}

# Nome de cada recurso nomeado do root, pelo endereço <modulo>.<tipo>.<recurso>. O
# tests/prefixo.tftest.hcl (TT-T02) aplica a regra de prefixo com as exceções de
# tests/excecoes_de_nome.json; cada módulo novo entra aqui com o output nomes_dos_recursos dele.
output "nomes_dos_recursos" {
  description = "Nome de cada recurso nomeado do root, para o teste de prefixo (TT-T02)."
  value       = local.nomes_dos_recursos
}

locals {
  nomes_dos_recursos = merge([for m, recursos in {
    networking            = module.networking.nomes_dos_recursos
    kms                   = module.kms.nomes_dos_recursos
    s3_golden_dataset     = module.s3_golden_dataset.nomes_dos_recursos
    lake_formation        = module.lake_formation.nomes_dos_recursos
    dynamodb_table        = module.dynamodb_table.nomes_dos_recursos
    memorydb_cluster      = module.memorydb_cluster.nomes_dos_recursos
    sagemaker_endpoint    = module.sagemaker_endpoint.nomes_dos_recursos
    sagemaker_training    = module.sagemaker_training.nomes_dos_recursos
    ecs_service           = module.ecs_service.nomes_dos_recursos
    athena_queries        = module.athena_queries.nomes_dos_recursos
    glue_pipeline         = module.glue_pipeline.nomes_dos_recursos
    cloudwatch_monitoring = module.cloudwatch_monitoring.nomes_dos_recursos
    } : { for endereco, nome in recursos : "${m}.${endereco}" => nome }
  ]...)
}

# Recursos cobrados por hora da base (TT-K02, RNF-002, Art. V). A contagem por tipo vem das chaves de
# tags_dos_recursos e nomes_dos_recursos (<modulo>.<tipo>.<recurso>), que o ST-T01 e o ST-T02 mantêm
# completas; assim um NAT Gateway ou um MWAA novo aparece aqui sem lista à mão.
locals {
  enderecos_do_root = toset(concat(keys(local.tags_dos_recursos), keys(local.nomes_dos_recursos)))
}

output "custo_fixo_da_base" {
  description = "Recursos cobrados por hora da base, para o teste de custo fixo (TT-K02)."
  value = {
    contagem_por_tipo = { for tipo in distinct([for e in local.enderecos_do_root : split(".", e)[1]]) :
    tipo => length([for e in local.enderecos_do_root : e if split(".", e)[1] == tipo]) }
    endpoints_de_interface            = module.networking.endpoints_de_interface
    endpoints_de_gateway              = module.networking.endpoints_de_gateway
    memorydb_nos                      = module.memorydb_cluster.custo_fixo.nos
    memorydb_snapshot_retention_limit = module.memorydb_cluster.custo_fixo.snapshot_retention_limit
    ecs_tarefas                       = module.ecs_service.desired_count
  }
}
