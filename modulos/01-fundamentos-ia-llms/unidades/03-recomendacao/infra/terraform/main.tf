locals {
  # Padrão da política de tags do Infracost (D-031, ADR-0014): project é a chave do projeto em
  # harness/estado.json e managed-by é sempre terraform. A tag module vem do local.tags de cada
  # módulo; environment não entra, porque não faz parte da política.
  tags_padrao = {
    project      = "01-recomendacao"
    "managed-by" = "terraform"
  }

  bedrock_model_id = var.bedrock_model_id

  # Banco do Glue Data Catalog: exceção p01_recomendacao_ do ADR-0014 (o Athena não aceita hífen no
  # nome do banco). Um só lugar para o lake_formation, o glue_pipeline e o athena_queries.
  nome_do_banco = "p${replace(var.project_name, "-", "_")}_${var.environment}_golden"
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = local.tags_padrao
  }
}

module "kms" {
  source       = "./modules/kms_key"
  project_name = var.project_name
  environment  = var.environment
}

module "networking" {
  source                      = "./modules/networking"
  project_name                = var.project_name
  environment                 = var.environment
  kms_key_arn                 = module.kms.key_arn
  expose_api_publicly         = var.expose_api_publicly
  enable_interface_endpoints  = var.enable_interface_endpoints
  interface_endpoint_az_count = var.interface_endpoint_az_count
  enable_mwaa                 = var.enable_mwaa
  log_retention_days          = var.log_retention_days
}

module "s3_golden_dataset" {
  source        = "./modules/s3_golden_dataset"
  project_name  = var.project_name
  environment   = var.environment
  force_destroy = var.force_destroy
  kms_key_arn   = module.kms.key_arn
}

module "lake_formation" {
  source        = "./modules/lake_formation"
  project_name  = var.project_name
  environment   = var.environment
  s3_bucket_arn = module.s3_golden_dataset.bucket_arn
  glue_role_arn = module.glue_pipeline.glue_role_arn
  database_name = local.nome_do_banco
}

module "dynamodb_table" {
  source       = "./modules/dynamodb_table"
  project_name = var.project_name
  environment  = var.environment
  kms_key_arn  = module.kms.key_arn
}

module "memorydb_cluster" {
  source             = "./modules/memorydb_cluster"
  project_name       = var.project_name
  environment        = var.environment
  subnet_ids         = module.networking.private_subnet_ids
  security_group_ids = [module.networking.internal_sg_id]
  kms_key_arn        = module.kms.key_arn
}

module "sagemaker_endpoint" {
  source                      = "./modules/sagemaker_endpoint"
  project_name                = var.project_name
  environment                 = var.environment
  enable_serverless_inference = var.enable_serverless_inference
  kms_key_arn                 = module.kms.key_arn
  log_retention_days          = var.log_retention_days
}

module "ecs_service" {
  source                    = "./modules/ecs_service"
  project_name              = var.project_name
  environment               = var.environment
  kms_key_arn               = module.kms.key_arn
  vpc_id                    = module.networking.vpc_id
  alb_subnet_ids            = module.networking.alb_subnet_ids
  private_subnet_ids        = module.networking.private_subnet_ids
  alb_security_group_id     = module.networking.alb_sg_id
  ecs_security_group_id     = module.networking.ecs_sg_id
  expose_api_publicly       = var.expose_api_publicly
  certificate_arn           = var.certificate_arn
  force_destroy             = var.force_destroy
  desired_count             = var.ecs_desired_count
  container_image_tag       = var.container_image_tag
  dynamodb_table_name       = module.dynamodb_table.table_name
  dynamodb_table_arn        = module.dynamodb_table.table_arn
  memorydb_cluster_endpoint = module.memorydb_cluster.cluster_endpoint
  sagemaker_endpoint_name   = module.sagemaker_endpoint.endpoint_name
  sagemaker_endpoint_arn    = module.sagemaker_endpoint.endpoint_arn
  bedrock_model_id          = local.bedrock_model_id
  explanations_enabled      = var.explanations_enabled
  log_retention_days        = var.log_retention_days
}

module "athena_queries" {
  source           = "./modules/athena_queries"
  project_name     = var.project_name
  environment      = var.environment
  s3_output_bucket = module.s3_golden_dataset.bucket_name
  database_name    = module.lake_formation.database_name
  kms_key_arn      = module.kms.key_arn
  force_destroy    = var.force_destroy
}

module "glue_pipeline" {
  source             = "./modules/glue_pipeline"
  project_name       = var.project_name
  environment        = var.environment
  s3_scripts_bucket  = module.s3_golden_dataset.bucket_name
  s3_bucket_arn      = module.s3_golden_dataset.bucket_arn
  dynamodb_table_arn = module.dynamodb_table.table_arn
  kms_key_arn        = module.kms.key_arn
  log_retention_days = var.log_retention_days
  database_name      = local.nome_do_banco
}

module "sagemaker_training" {
  source         = "./modules/sagemaker_training"
  project_name   = var.project_name
  environment    = var.environment
  s3_bucket_arn  = module.s3_golden_dataset.bucket_arn
  s3_bucket_name = module.s3_golden_dataset.bucket_name
  kms_key_arn    = module.kms.key_arn
}

module "mwaa_orchestration" {
  source             = "./modules/mwaa_orchestration"
  project_name       = var.project_name
  environment        = var.environment
  vpc_id             = module.networking.vpc_id
  vpc_cidr           = module.networking.vpc_cidr
  private_subnet_ids = module.networking.private_subnet_ids
  s3_bucket_arn      = module.s3_golden_dataset.bucket_arn
  s3_bucket_name     = module.s3_golden_dataset.bucket_name
  enable_mwaa        = var.enable_mwaa
  kms_key_arn        = module.kms.key_arn
}

module "cloudwatch_monitoring" {
  source                  = "./modules/cloudwatch_monitoring"
  project_name            = var.project_name
  environment             = var.environment
  kms_key_arn             = module.kms.key_arn
  ecs_service_name        = module.ecs_service.service_name
  ecs_cluster_name        = module.ecs_service.cluster_name
  alb_arn_suffix          = module.ecs_service.alb_arn_suffix
  target_group_arn_suffix = module.ecs_service.target_group_arn_suffix
  sagemaker_endpoint_name = module.sagemaker_endpoint.endpoint_name
  alert_emails            = var.alert_emails
  monthly_budget_usd      = var.monthly_budget_usd
}
