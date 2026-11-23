# Saídas da base para a raiz da janela do MWAA (T052, ADR-0007, RF-107, TT-J02). A janela
# (U/infra/janela-mwaa, T060) lê só o parâmetro SSM, nunca o state da base. As chaves seguem a
# configuração do DAG (dags/config/01-recomendacao.json, T063), para a janela repassá-las sem tradução.
module "entradas_janela" {
  source       = "./modules/entradas_janela"
  project_name = var.project_name
  environment  = var.environment

  entradas = {
    vpc_id             = module.networking.vpc_id
    subnets_privadas   = module.networking.private_subnet_ids
    kms_key_arn        = module.kms.key_arn
    bucket_golden      = module.s3_golden_dataset.bucket_name
    prefixo_interacoes = local.prefixos_do_lote.interacoes
    banco              = module.lake_formation.database_name
    tabelas            = local.tabelas_do_lote
    workgroup_athena   = module.athena_queries.workgroup_name
    # Pendentes: publicar_dynamodb e publicar_memorydb entram com os jobs da T050.
    jobs_glue = {
      features = module.glue_pipeline.glue_job_name
    }
    # Pendente: imagem entra com a T051. O nome do training job casa com training-job/01-recomendacao-*
    # da role de execução do MWAA (T063); o DAG acrescenta a data.
    treino = {
      prefixo_do_job = "${var.project_name}-${var.environment}-reranker"
      role_arn       = module.sagemaker_training.training_role_arn
    }
  }
}
