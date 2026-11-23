# Regras base do CLAUDE.md como testes de plano, com mock provider (sem credenciais, sem custo).
# Cada `run` aponta para um módulo reutilizável e verifica as regras que ele precisa cumprir.
# Ids das regras (matriz em docs/matriz-cobertura.md):
#   R1 nada público por padrão        R2 criptografia em repouso e em trânsito
#   R3 menor privilégio no IAM        R4 tags project, module e managed-by
#   R5 sem custo fixo ocioso sem ADR  R6 logs, métricas e alarmes
#   R7 destroy sem sobras             R8 state remoto com lock
#   R9 teto de custo no AWS Budgets

mock_provider "aws" {
  # Valores computados conhecidos já no plan, para as asserções sobre políticas e ARNs.
  override_during = plan

  mock_resource "aws_s3_bucket" {
    defaults = {
      arn = "arn:aws:s3:::01-recomendacao-lab-golden-123456789012"
    }
  }
  mock_resource "aws_sns_topic" {
    defaults = {
      arn = "arn:aws:sns:us-east-1:123456789012:01-recomendacao-lab-alerts"
    }
  }
  mock_resource "aws_cloudwatch_log_group" {
    defaults = {
      arn = "arn:aws:logs:us-east-1:123456789012:log-group:mock"
    }
  }
  mock_resource "aws_ecr_repository" {
    defaults = {
      arn            = "arn:aws:ecr:us-east-1:123456789012:repository/01-recomendacao-lab/recommendation-service"
      repository_url = "123456789012.dkr.ecr.us-east-1.amazonaws.com/01-recomendacao-lab/recommendation-service"
    }
  }
  mock_data "aws_availability_zones" {
    defaults = {
      names = ["us-east-1a", "us-east-1b", "us-east-1c"]
    }
  }
  mock_data "aws_region" {
    defaults = {
      region = "us-east-1"
      name   = "us-east-1"
    }
  }
  mock_data "aws_caller_identity" {
    defaults = {
      account_id = "123456789012"
      arn        = "arn:aws:iam::123456789012:user/terraform"
    }
  }
  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":\"sts:AssumeRole\",\"Principal\":{\"Service\":\"ecs-tasks.amazonaws.com\"}}]}"
    }
  }
  mock_data "aws_partition" {
    defaults = {
      partition = "aws"
    }
  }
}

variables {
  project_name  = "01-recomendacao"
  database_name = "p01_recomendacao_lab_golden"
  environment   = "lab"
  kms_key_arn   = "arn:aws:kms:us-east-1:123456789012:key/00000000-0000-0000-0000-000000000000"
}

# ---------------------------------------------------------------- R4 (R8 em tests/static_rules.py)
run "raiz_tags" {
  command = plan

  # O padrão completo (module de cada recurso, ADR-0014) está em tests/tags.tftest.hcl (TT-T01).
  assert {
    condition     = local.tags_padrao["project"] == "01-recomendacao"
    error_message = "R4: project é a chave do projeto em harness/estado.json (D-031)."
  }
  assert {
    condition     = local.tags_padrao["managed-by"] == "terraform"
    error_message = "R4: managed-by deve ser 'terraform'."
  }
  assert {
    condition     = !contains(keys(local.tags_padrao), "module") && !contains(keys(local.tags_padrao), "environment")
    error_message = "R4: module vem do local.tags de cada módulo e environment saiu do default_tags (ADR-0014)."
  }
}

# ---------------------------------------------------------------- KMS (R2)
run "kms_chave_da_plataforma" {
  command = plan
  module {
    source = "./modules/kms_key"
  }

  assert {
    condition     = aws_kms_key.platform.enable_key_rotation == true
    error_message = "R2: a chave KMS precisa de rotação automática."
  }
  assert {
    condition     = aws_kms_key.platform.deletion_window_in_days == 7
    error_message = "R7: janela mínima de exclusão (7 dias) para o destroy do lab."
  }
  assert {
    condition = contains(
      flatten([for s in jsondecode(aws_kms_key.platform.policy).Statement : try(s.Principal.Service, [])]),
      "logs.us-east-1.amazonaws.com"
    )
    error_message = "R2/R6: a política da chave precisa permitir o CloudWatch Logs para logs criptografados."
  }
}

# ---------------------------------------------------------------- Rede (R1, R5, R6)
run "rede_privada_por_padrao" {
  command = plan
  module {
    source = "./modules/networking"
  }

  assert {
    condition     = length(aws_internet_gateway.gw) == 0 && length(aws_subnet.public) == 0
    error_message = "R1: sem API pública, não há internet gateway nem subnet pública."
  }
  assert {
    condition     = alltrue([for s in aws_subnet.private : s.map_public_ip_on_launch == false])
    error_message = "R1: subnets privadas não atribuem IP público."
  }
  assert {
    condition     = length(aws_subnet.private) == 2
    error_message = "ALB e MemoryDB precisam de 2 AZs."
  }
  assert {
    condition     = alltrue([for r in aws_security_group.alb.ingress : !contains(coalesce(r.cidr_blocks, []), "0.0.0.0/0")])
    error_message = "R1: o ALB interno não aceita entrada de 0.0.0.0/0."
  }
  assert {
    condition     = alltrue([for r in aws_security_group.ecs.egress : !contains(coalesce(r.cidr_blocks, []), "0.0.0.0/0")])
    error_message = "R1: tasks ECS não têm saída para a internet."
  }
  assert {
    condition     = length(aws_default_security_group.default.ingress) == 0 && length(aws_default_security_group.default.egress) == 0
    error_message = "R1: o security group padrão da VPC fica sem regras."
  }
  assert {
    condition     = length(aws_flow_log.vpc) == 1 && aws_cloudwatch_log_group.flow_logs[0].kms_key_id == var.kms_key_arn
    error_message = "R6/R2: VPC Flow Logs ligados e criptografados com a chave da plataforma."
  }
}

run "rede_endpoints_de_interface_no_lab" {
  command = plan
  module {
    source = "./modules/networking"
  }

  assert {
    condition = toset(keys(aws_vpc_endpoint.interface)) == toset([
      "ecr.api", "ecr.dkr", "logs", "sagemaker.runtime", "bedrock-runtime"
    ])
    error_message = "Saída do ECS (ADR-0002, ADR-0013): endpoints para ECR, Logs, SageMaker Runtime e Bedrock Runtime; sem monitoring (EMF)."
  }
  assert {
    condition     = alltrue([for e in aws_vpc_endpoint.interface : length(e.subnet_ids) == 1 && e.private_dns_enabled])
    error_message = "R5 (ADR-0002): no lab, endpoints em 1 AZ, com DNS privado."
  }
  assert {
    condition     = toset([for e in aws_vpc_endpoint.gateway : e.vpc_endpoint_type]) == toset(["Gateway"]) && length(aws_vpc_endpoint.gateway) == 2
    error_message = "S3 e DynamoDB por endpoint de gateway (sem custo por hora)."
  }
}

run "rede_api_publica_exige_opt_in" {
  command = plan
  module {
    source = "./modules/networking"
  }
  variables {
    expose_api_publicly = true
  }

  assert {
    condition     = length(aws_internet_gateway.gw) == 1 && length(aws_subnet.public) == 2
    error_message = "Com opt-in explícito, ALB público em 2 subnets públicas."
  }
  assert {
    condition     = alltrue([for s in aws_subnet.public : s.map_public_ip_on_launch == false])
    error_message = "R1: mesmo as subnets públicas não dão IP público automático."
  }
}

# ---------------------------------------------------------------- S3 (R1, R2, R7)
run "s3_golden_dataset" {
  command = plan
  module {
    source = "./modules/s3_golden_dataset"
  }

  assert {
    condition = alltrue([
      aws_s3_bucket_public_access_block.golden_dataset.block_public_acls,
      aws_s3_bucket_public_access_block.golden_dataset.block_public_policy,
      aws_s3_bucket_public_access_block.golden_dataset.ignore_public_acls,
      aws_s3_bucket_public_access_block.golden_dataset.restrict_public_buckets,
    ])
    error_message = "R1: bloqueio de acesso público completo."
  }
  assert {
    condition     = one([for r in aws_s3_bucket_server_side_encryption_configuration.golden_dataset.rule : one(r.apply_server_side_encryption_by_default).kms_master_key_id]) == var.kms_key_arn
    error_message = "R2: SSE-KMS com a chave da plataforma."
  }
  assert {
    condition = anytrue([
      for s in jsondecode(aws_s3_bucket_policy.tls_only.policy).Statement :
      s.Effect == "Deny" && try(s.Condition.Bool["aws:SecureTransport"], "") == "false"
    ])
    error_message = "R2: a bucket policy nega requisições sem TLS."
  }
  assert {
    condition     = aws_s3_bucket.golden_dataset.force_destroy == true
    error_message = "R7: no lab, force_destroy para o destroy não deixar sobras."
  }
  assert {
    condition     = one(aws_s3_bucket_versioning.golden_dataset.versioning_configuration).status == "Enabled"
    error_message = "Golden dataset versionado (recuperação de sobrescrita)."
  }
}

# ---------------------------------------------------------------- DynamoDB (R2, R7)
run "dynamodb_criptografado" {
  command = plan
  module {
    source = "./modules/dynamodb_table"
  }

  assert {
    condition     = one(aws_dynamodb_table.user_recommendations.server_side_encryption).enabled && one(aws_dynamodb_table.user_recommendations.server_side_encryption).kms_key_arn == var.kms_key_arn
    error_message = "R2: DynamoDB com SSE-KMS da chave da plataforma."
  }
  assert {
    condition     = one(aws_dynamodb_table.user_recommendations.point_in_time_recovery).enabled
    error_message = "PITR ligado (custo proporcional a dados; tabela pequena no lab)."
  }
  assert {
    condition     = aws_dynamodb_table.user_recommendations.deletion_protection_enabled == false
    error_message = "R7: no lab, sem proteção contra exclusão para o destroy completar."
  }
}

# ---------------------------------------------------------------- MemoryDB (R2)
run "memorydb_tls" {
  command = plan
  module {
    source = "./modules/memorydb_cluster"
  }
  variables {
    subnet_ids         = ["subnet-a", "subnet-b"]
    security_group_ids = ["sg-123"]
  }

  assert {
    condition     = aws_memorydb_cluster.vector_cluster.tls_enabled == true
    error_message = "R2: MemoryDB com TLS em trânsito."
  }
  assert {
    condition     = aws_memorydb_cluster.vector_cluster.kms_key_arn == var.kms_key_arn
    error_message = "R2: MemoryDB criptografado em repouso com a chave da plataforma."
  }
  assert {
    condition     = aws_memorydb_cluster.vector_cluster.num_replicas_per_shard == 0 && aws_memorydb_cluster.vector_cluster.num_shards == 1
    error_message = "R5: menor escala que demonstra o padrão (1 shard, 0 réplicas)."
  }
}

# ---------------------------------------------------------------- ECS (R1, R2, R3, R5, R6, R7)
run "ecs_menor_privilegio_e_privado" {
  command = plan
  module {
    source = "./modules/ecs_service"
  }
  variables {
    vpc_id                    = "vpc-123"
    alb_subnet_ids            = ["subnet-a", "subnet-b"]
    private_subnet_ids        = ["subnet-a", "subnet-b"]
    alb_security_group_id     = "sg-alb"
    ecs_security_group_id     = "sg-ecs"
    dynamodb_table_name       = "01-recomendacao-lab-user_recommendations"
    dynamodb_table_arn        = "arn:aws:dynamodb:us-east-1:123456789012:table/01-recomendacao-lab-user_recommendations"
    memorydb_cluster_endpoint = "clustercfg.p01-recomendacao-lab-vec.memorydb.us-east-1.amazonaws.com:6379"
    sagemaker_endpoint_name   = "01-recomendacao-lab-reranker"
    sagemaker_endpoint_arn    = "arn:aws:sagemaker:us-east-1:123456789012:endpoint/01-recomendacao-lab-reranker"
    bedrock_model_id          = "anthropic.claude-haiku-5-5"
  }

  assert {
    condition = alltrue([
      for s in jsondecode(aws_iam_policy.ecs_task_policy.policy).Statement :
      s.Resource != "*" || can(s.Condition)
    ])
    error_message = "R3: nenhuma permissão com Resource \"*\" sem condição na role das tasks."
  }
  assert {
    condition = anytrue([
      for s in jsondecode(aws_iam_policy.ecs_task_policy.policy).Statement :
      contains(flatten([s.Action]), "bedrock:InvokeModel") && alltrue([for r in flatten([s.Resource]) : strcontains(r, "claude-haiku-5-5")])
    ])
    error_message = "R3/ADR-0004: a task invoca só o modelo Claude configurado."
  }
  # TT-K02 (ADR-0013): as métricas vão por EMF no log, então a task role não publica métricas.
  assert {
    condition = !anytrue([
      for s in jsondecode(aws_iam_policy.ecs_task_policy.policy).Statement :
      contains(flatten([s.Action]), "cloudwatch:PutMetricData")
    ])
    error_message = "ADR-0013: sem cloudwatch:PutMetricData na task role; as métricas saem por EMF no endpoint logs."
  }
  assert {
    condition     = aws_lb.alb.internal == true
    error_message = "R1: ALB interno por padrão."
  }
  assert {
    condition     = aws_lb.alb.drop_invalid_header_fields == true
    error_message = "ALB descarta cabeçalhos HTTP inválidos."
  }
  assert {
    condition     = one(aws_ecs_service.app.network_configuration).assign_public_ip == false
    error_message = "R1: tasks sem IP público."
  }
  assert {
    condition     = aws_ecs_service.app.desired_count == 1
    error_message = "R5: lab com 1 task."
  }
  assert {
    condition     = aws_cloudwatch_log_group.ecs.kms_key_id == var.kms_key_arn && aws_cloudwatch_log_group.ecs.retention_in_days > 0
    error_message = "R6/R2: logs das tasks com retenção e KMS."
  }
  assert {
    condition     = aws_ecr_repository.app.image_tag_mutability == "IMMUTABLE" && one(aws_ecr_repository.app.image_scanning_configuration).scan_on_push
    error_message = "Imagem em ECR privado, tags imutáveis e scan no push."
  }
  assert {
    condition     = aws_ecr_repository.app.force_delete == true
    error_message = "R7: o destroy do lab remove o repositório com as imagens."
  }
  assert {
    condition     = jsondecode(aws_ecs_task_definition.app.container_definitions)[0].readonlyRootFilesystem == true
    error_message = "Container com sistema de arquivos somente leitura."
  }
  assert {
    condition = contains(
      [for e in jsondecode(aws_ecs_task_definition.app.container_definitions)[0].environment : e.name],
      "BEDROCK_MODEL_ID"
    )
    error_message = "ADR-0004: o serviço recebe o modelo do Bedrock por variável de ambiente."
  }
}

run "ecs_api_publica_exige_tls" {
  command = plan
  module {
    source = "./modules/ecs_service"
  }
  variables {
    vpc_id                    = "vpc-123"
    alb_subnet_ids            = ["subnet-a", "subnet-b"]
    private_subnet_ids        = ["subnet-a", "subnet-b"]
    alb_security_group_id     = "sg-alb"
    ecs_security_group_id     = "sg-ecs"
    dynamodb_table_name       = "t"
    dynamodb_table_arn        = "arn:aws:dynamodb:us-east-1:123456789012:table/t"
    memorydb_cluster_endpoint = "x:6379"
    sagemaker_endpoint_name   = "e"
    sagemaker_endpoint_arn    = "arn:aws:sagemaker:us-east-1:123456789012:endpoint/e"
    bedrock_model_id          = "anthropic.claude-haiku-5-5"
    expose_api_publicly       = true
    certificate_arn           = null
  }

  expect_failures = [var.certificate_arn]
}

run "ecs_api_publica_com_https" {
  command = plan
  module {
    source = "./modules/ecs_service"
  }
  variables {
    vpc_id                    = "vpc-123"
    alb_subnet_ids            = ["subnet-a", "subnet-b"]
    private_subnet_ids        = ["subnet-a", "subnet-b"]
    alb_security_group_id     = "sg-alb"
    ecs_security_group_id     = "sg-ecs"
    dynamodb_table_name       = "t"
    dynamodb_table_arn        = "arn:aws:dynamodb:us-east-1:123456789012:table/t"
    memorydb_cluster_endpoint = "x:6379"
    sagemaker_endpoint_name   = "e"
    sagemaker_endpoint_arn    = "arn:aws:sagemaker:us-east-1:123456789012:endpoint/e"
    bedrock_model_id          = "anthropic.claude-haiku-5-5"
    expose_api_publicly       = true
    certificate_arn           = "arn:aws:acm:us-east-1:123456789012:certificate/abc"
  }

  assert {
    condition     = aws_lb.alb.internal == false && aws_lb_listener.https[0].protocol == "HTTPS"
    error_message = "R2: API pública só com listener HTTPS."
  }
  assert {
    condition     = startswith(aws_lb_listener.https[0].ssl_policy, "ELBSecurityPolicy-TLS13")
    error_message = "R2: política TLS 1.3."
  }
  assert {
    condition     = one(aws_lb_listener.http.default_action).type == "redirect"
    error_message = "R2: HTTP redireciona para HTTPS quando a API é pública."
  }
}

# ---------------------------------------------------------------- SageMaker (R3, R5, R6)
run "sagemaker_sem_full_access" {
  command = plan
  module {
    source = "./modules/sagemaker_endpoint"
  }

  assert {
    condition = alltrue([
      for s in jsondecode(aws_iam_role_policy.sagemaker_execution.policy).Statement :
      s.Resource != "*" || can(s.Condition) || contains(flatten([s.Action]), "ecr:GetAuthorizationToken")
    ])
    error_message = "R3: permissões escopadas (só ecr:GetAuthorizationToken exige \"*\")."
  }
  assert {
    condition     = one(one(aws_sagemaker_endpoint_configuration.reranker.production_variants).serverless_config).provisioned_concurrency == null || one(one(aws_sagemaker_endpoint_configuration.reranker.production_variants).serverless_config).provisioned_concurrency == 0
    error_message = "R5: Serverless Inference sem concorrência provisionada (custo zero ocioso)."
  }
  assert {
    condition     = aws_cloudwatch_log_group.endpoint.name == "/aws/sagemaker/Endpoints/01-recomendacao-lab-reranker"
    error_message = "R7: o log group do endpoint é criado pelo Terraform para o destroy removê-lo."
  }
}

# MWAA (R1, R3, R5): saiu da base na T014. Os TT mwaa_ligado_privado e mwaa_desligado_por_padrao são
# reescritos na raiz da janela (U/infra/janela-mwaa, T061, ADR-0007); o custo_fixo.tftest.hcl (TT-K02)
# reprova um MWAA na base.

# ---------------------------------------------------------------- Glue / Athena (R2, R3, R6)
run "glue_criptografado_e_com_logs" {
  command = plan
  module {
    source = "./modules/glue_pipeline"
  }
  variables {
    s3_scripts_bucket  = "01-recomendacao-lab-golden"
    s3_bucket_arn      = "arn:aws:s3:::01-recomendacao-lab-golden"
    dynamodb_table_arn = "arn:aws:dynamodb:us-east-1:123456789012:table/01-recomendacao-lab-user_recommendations"
    prefixos           = { interacoes = "interactions", catalogo = "catalog", features = "user_features" }
  }

  assert {
    condition     = aws_glue_job.feature_engineering.security_configuration == aws_glue_security_configuration.main.name
    error_message = "R2: job do Glue com security configuration (S3, logs e bookmarks criptografados)."
  }
  assert {
    condition     = aws_glue_job.feature_engineering.default_arguments["--continuous-log-logGroup"] == aws_cloudwatch_log_group.glue.name
    error_message = "R6/R7: logs do Glue em log group gerenciado pelo Terraform."
  }
  # PY-01 do lado do Terraform (RF-107, T041): o script lê os caminhos por getResolvedOptions.
  assert {
    condition = alltrue([
      aws_glue_job.feature_engineering.default_arguments["--caminho_interacoes"] == "s3://01-recomendacao-lab-golden/interactions/",
      aws_glue_job.feature_engineering.default_arguments["--caminho_catalogo"] == "s3://01-recomendacao-lab-golden/catalog/",
      aws_glue_job.feature_engineering.default_arguments["--caminho_features"] == "s3://01-recomendacao-lab-golden/user_features/",
    ])
    error_message = "RF-107: o job de features recebe por argumento os caminhos no bucket do stack."
  }
}

run "athena_resultados_kms" {
  command = plan
  module {
    source = "./modules/athena_queries"
  }
  variables {
    s3_output_bucket = "01-recomendacao-lab-golden"
    tabelas          = { interacoes = "interactions", catalogo = "catalog" }
  }

  assert {
    condition     = one(one(one(aws_athena_workgroup.analytics.configuration).result_configuration).encryption_configuration).encryption_option == "SSE_KMS"
    error_message = "R2: resultados do Athena com SSE-KMS."
  }
}

# RF-107 (T041): prefixos e tabelas do lote num só lugar do root, que alimenta o glue_pipeline e o
# athena_queries (e, na T063, a configuração do DAG).
run "raiz_prefixos_do_lote" {
  command = plan

  assert {
    condition     = local.prefixos_do_lote == { interacoes = "interactions", catalogo = "catalog", features = "user_features" }
    error_message = "RF-107: local.prefixos_do_lote no root com os prefixos do golden dataset."
  }
  assert {
    condition     = local.tabelas_do_lote == { interacoes = "interactions", catalogo = "catalog" }
    error_message = "RF-107: local.tabelas_do_lote no root com as tabelas do banco do stack."
  }
}

# PY-01 do lado do Terraform (RF-107, T041, A13): a named query recebe banco e tabelas do stack pelos
# marcadores do SQL (templatefile), sem nome fixo e sem marcador sobrando.
run "athena_sql_com_banco_e_tabelas_do_stack" {
  command = plan
  module {
    source = "./modules/athena_queries"
  }
  variables {
    s3_output_bucket = "01-recomendacao-lab-golden"
    tabelas          = { interacoes = "interactions", catalogo = "catalog" }
  }

  assert {
    condition     = strcontains(aws_athena_named_query.extract_curated_features.query, "p01_recomendacao_lab_golden.interactions i")
    error_message = "RF-107: o SQL cita a tabela de interações no banco do stack."
  }
  assert {
    condition     = strcontains(aws_athena_named_query.extract_curated_features.query, "p01_recomendacao_lab_golden.catalog c")
    error_message = "RF-107: o SQL cita a tabela do catálogo no banco do stack."
  }
  assert {
    condition     = !strcontains(aws_athena_named_query.extract_curated_features.query, "$") && !strcontains(aws_athena_named_query.extract_curated_features.query, "_golden_db")
    error_message = "RF-107: nenhum marcador sem valor e nenhum banco fixo no SQL da named query."
  }
}

# ---------------------------------------------------------------- Observabilidade e custo (R6, R9)
run "monitoramento_e_orcamento" {
  command = plan
  module {
    source = "./modules/cloudwatch_monitoring"
  }
  variables {
    ecs_service_name        = "01-recomendacao-lab-service"
    ecs_cluster_name        = "01-recomendacao-lab-cluster"
    alb_arn_suffix          = "app/01-recomendacao-lab-alb/123"
    target_group_arn_suffix = "targetgroup/01-recomendacao-lab-tg/456"
    sagemaker_endpoint_name = "01-recomendacao-lab-reranker"
    teto_diario_usd         = 7.1
  }

  assert {
    condition     = length(aws_cloudwatch_metric_alarm.this) >= 7
    error_message = "R6: alarmes para latência, 5xx, tasks, degradação, fallback da explicação e SageMaker."
  }
  assert {
    condition     = alltrue([for a in aws_cloudwatch_metric_alarm.this : contains(a.alarm_actions, aws_sns_topic.alerts.arn)])
    error_message = "R6: todo alarme notifica o tópico SNS."
  }
  assert {
    condition     = aws_sns_topic.alerts.kms_master_key_id == var.kms_key_arn
    error_message = "R2: tópico de alertas criptografado."
  }
  # R9: o Budgets diário com o teto de um dia é conferido no tests/budgets.tftest.hcl (TT-K01, T013).
  assert {
    condition     = aws_budgets_budget.daily.time_unit == "DAILY" && aws_budgets_budget.daily.limit_amount == "7.1"
    error_message = "R9: Budgets diário com o teto de US$ 7,10 (D-056)."
  }
  assert {
    condition     = aws_cloudwatch_metric_alarm.this["api_p95_latency"].extended_statistic == "p95"
    error_message = "R6: o alarme de latência mede p95 de verdade."
  }
}

# ---------------------------------------------------------------- Lake Formation (R3)
# Achado do teste de integração: o ARN do chamador (root ou assumed-role) não é principal válido.
run "lake_formation_concede_a_role_do_glue" {
  command = plan
  module {
    source = "./modules/lake_formation"
  }
  variables {
    s3_bucket_arn = "arn:aws:s3:::01-recomendacao-lab-golden"
    glue_role_arn = "arn:aws:iam::123456789012:role/01-recomendacao-lab-glue-role"
  }

  assert {
    condition     = aws_lakeformation_permissions.database_permissions.principal == var.glue_role_arn
    error_message = "R3: permissões do catálogo para a role do Glue, não para quem roda o Terraform."
  }
  assert {
    condition     = !contains(aws_lakeformation_permissions.database_permissions.permissions, "ALL")
    error_message = "R3: sem ALL no Lake Formation."
  }
  assert {
    condition     = aws_lakeformation_permissions.data_location.principal == var.glue_role_arn
    error_message = "R3: a role do Glue precisa de acesso à localização do golden dataset."
  }
}

# ---------------------------------------------------------------- Bedrock com perfil de inferência (R3, ADR-0004)
# Com perfil (us.anthropic...), a role precisa do perfil e do foundation model SEM o prefixo,
# nas regiões de destino, e só quando a chamada passa pelo perfil.
run "ecs_bedrock_via_perfil_de_inferencia" {
  command = plan
  module {
    source = "./modules/ecs_service"
  }
  variables {
    vpc_id                    = "vpc-123"
    alb_subnet_ids            = ["subnet-a", "subnet-b"]
    private_subnet_ids        = ["subnet-a", "subnet-b"]
    alb_security_group_id     = "sg-alb"
    ecs_security_group_id     = "sg-ecs"
    dynamodb_table_name       = "t"
    dynamodb_table_arn        = "arn:aws:dynamodb:us-east-1:123456789012:table/t"
    memorydb_cluster_endpoint = "x:6379"
    sagemaker_endpoint_name   = "e"
    sagemaker_endpoint_arn    = "arn:aws:sagemaker:us-east-1:123456789012:endpoint/e"
    bedrock_model_id          = "us.anthropic.claude-haiku-5-5"
  }

  assert {
    condition = anytrue([
      for s in jsondecode(aws_iam_policy.ecs_task_policy.policy).Statement :
      contains(flatten([s.Resource]), "arn:aws:bedrock:us-east-1:123456789012:inference-profile/us.anthropic.claude-haiku-5-5")
    ])
    error_message = "R3: permissão no perfil de inferência exato, na região do stack."
  }
  assert {
    condition = anytrue([
      for s in jsondecode(aws_iam_policy.ecs_task_policy.policy).Statement :
      contains(flatten([s.Resource]), "arn:aws:bedrock:*::foundation-model/anthropic.claude-haiku-5-5")
      && try(s.Condition.StringLike["bedrock:InferenceProfileArn"], "") == "arn:aws:bedrock:us-east-1:123456789012:inference-profile/us.anthropic.claude-haiku-5-5"
    ])
    error_message = "R3: foundation model sem o prefixo do perfil, só via o perfil (condição bedrock:InferenceProfileArn)."
  }
  assert {
    condition     = !strcontains(aws_iam_policy.ecs_task_policy.policy, "foundation-model/us.")
    error_message = "ARN de foundation model não leva o prefixo do perfil (us., eu., global.)."
  }
}
