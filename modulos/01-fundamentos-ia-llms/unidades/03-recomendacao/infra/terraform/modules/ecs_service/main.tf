# Tag module deste componente (ADR-0014, D-031); project e managed-by vêm do default_tags.
locals {
  tags = {
    module = "servico"
  }
}

data "aws_region" "current" {}
data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}

locals {
  name      = "${var.project_name}-${var.environment}"
  region    = data.aws_region.current.region
  account   = data.aws_caller_identity.current.account_id
  partition = data.aws_partition.current.partition

  # O modelo pode ser chamado direto (anthropic.<modelo>) ou por perfil de inferência entre regiões
  # (us.|eu.|apac.|global.anthropic.<modelo>). Com perfil, a role precisa do perfil e do foundation
  # model SEM o prefixo em todas as regiões de destino, só quando a chamada passa pelo perfil.
  bedrock_base_model_id = replace(var.bedrock_model_id, "/^(us|eu|apac|au|jp|ca|global)\\./", "")
  bedrock_uses_profile  = local.bedrock_base_model_id != var.bedrock_model_id
  bedrock_profile_arn   = "arn:${local.partition}:bedrock:${local.region}:${local.account}:inference-profile/${var.bedrock_model_id}"

  # jsonencode/jsondecode: os dois ramos têm formatos diferentes (2 statements com condição contra 1).
  bedrock_statements = jsondecode(local.bedrock_uses_profile ? jsonencode([
    {
      Sid      = "ExplainWithClaudeViaInferenceProfile"
      Effect   = "Allow"
      Action   = ["bedrock:InvokeModel"]
      Resource = [local.bedrock_profile_arn]
    },
    {
      Sid       = "ExplainWithClaudeDestinationModel"
      Effect    = "Allow"
      Action    = ["bedrock:InvokeModel"]
      Resource  = ["arn:${local.partition}:bedrock:*::foundation-model/${local.bedrock_base_model_id}"]
      Condition = { StringLike = { "bedrock:InferenceProfileArn" = local.bedrock_profile_arn } }
    },
    ]) : jsonencode([
    {
      Sid      = "ExplainWithClaude"
      Effect   = "Allow"
      Action   = ["bedrock:InvokeModel"]
      Resource = ["arn:${local.partition}:bedrock:${local.region}::foundation-model/${var.bedrock_model_id}"]
    },
  ]))

  public_https = var.expose_api_publicly
}

# ---------------------------------------------------------------- ECR (imagem privada)
# Com saída só por endpoints, a task não alcança o public.ecr.aws: a imagem vem do ECR do stack.
resource "aws_ecr_repository" "app" {
  name                 = "${local.name}/recommendation-service"
  image_tag_mutability = "IMMUTABLE"
  force_delete         = var.force_destroy

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "KMS"
    kms_key         = var.kms_key_arn
  }
  tags = local.tags
}

resource "aws_ecr_lifecycle_policy" "app" {
  repository = aws_ecr_repository.app.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Mantém as 5 imagens mais recentes"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 5
      }
      action = { type = "expire" }
    }]
  })
}

# ---------------------------------------------------------------- cluster
resource "aws_ecs_cluster" "main" {
  name = "${local.name}-cluster"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }
  tags = local.tags
}

resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name       = aws_ecs_cluster.main.name
  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  default_capacity_provider_strategy {
    capacity_provider = "FARGATE_SPOT"
    weight            = 80
  }

  default_capacity_provider_strategy {
    capacity_provider = "FARGATE"
    weight            = 20
    base              = 1
  }
}

resource "aws_cloudwatch_log_group" "ecs" {
  name              = "${local.name}-servico" # A19: no prefixo, casa com log-group:01-recomendacao-* da T031
  retention_in_days = var.log_retention_days
  kms_key_id        = var.kms_key_arn
  tags              = local.tags
}

# ---------------------------------------------------------------- IAM
data "aws_iam_policy_document" "ecs_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

# Execution role: puxar a imagem e escrever logs.
resource "aws_iam_role" "ecs_execution_role" {
  name               = "${local.name}-ecs-exec-role"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume_role.json
  tags               = local.tags
}

resource "aws_iam_role_policy" "ecs_execution" {
  name = "pull-image-and-write-logs"
  role = aws_iam_role.ecs_execution_role.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "EcrAuthTokenHasNoResourceLevel"
        Effect   = "Allow"
        Action   = ["ecr:GetAuthorizationToken"]
        Resource = "*"
        Condition = {
          StringEquals = { "aws:RequestedRegion" = local.region }
        }
      },
      {
        Sid      = "PullServiceImage"
        Effect   = "Allow"
        Action   = ["ecr:BatchCheckLayerAvailability", "ecr:GetDownloadUrlForLayer", "ecr:BatchGetImage"]
        Resource = aws_ecr_repository.app.arn
      },
      {
        Sid      = "WriteTaskLogs"
        Effect   = "Allow"
        Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "${aws_cloudwatch_log_group.ecs.arn}:*"
      },
      {
        Sid      = "DecryptImageLayers"
        Effect   = "Allow"
        Action   = ["kms:Decrypt"]
        Resource = var.kms_key_arn
      }
    ]
  })
}

# Task role: só o que o serviço chama em runtime (R3).
resource "aws_iam_role" "ecs_task_role" {
  name               = "${local.name}-ecs-task-role"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume_role.json
  tags               = local.tags
}

resource "aws_iam_policy" "ecs_task_policy" {
  name        = "${local.name}-ecs-task-policy"
  description = "Leitura da tabela de recomendacoes, scoring no SageMaker, Claude no Bedrock e metricas"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = concat([
      {
        Sid      = "ReadBatchRecommendations"
        Effect   = "Allow"
        Action   = ["dynamodb:GetItem", "dynamodb:BatchGetItem", "dynamodb:Query"]
        Resource = var.dynamodb_table_arn
      },
      {
        Sid      = "DecryptTableData"
        Effect   = "Allow"
        Action   = ["kms:Decrypt"]
        Resource = var.kms_key_arn
        Condition = {
          StringEquals = { "kms:ViaService" = "dynamodb.${local.region}.amazonaws.com" }
        }
      },
      {
        Sid      = "ScoreCandidates"
        Effect   = "Allow"
        Action   = ["sagemaker:InvokeEndpoint"]
        Resource = var.sagemaker_endpoint_arn
      }
      # Sem cloudwatch:PutMetricData: as métricas saem por EMF no log do awslogs (ADR-0013).
    ], local.bedrock_statements)
  })
  tags = local.tags
}

resource "aws_iam_role_policy_attachment" "ecs_task_policy_attach" {
  role       = aws_iam_role.ecs_task_role.name
  policy_arn = aws_iam_policy.ecs_task_policy.arn
}

# ---------------------------------------------------------------- ALB
resource "aws_lb" "alb" {
  #checkov:skip=CKV_AWS_150:Lab efêmero: o destroy não pode depender de passo manual (R7)
  #checkov:skip=CKV_AWS_91:Access logs exigem bucket com política do ELB; ligar em produção (ADR-0003)
  #checkov:skip=CKV2_AWS_28:ALB interno por padrão; WAF entra junto com expose_api_publicly em produção (ADR-0003)
  name                       = "${local.name}-alb"
  internal                   = !var.expose_api_publicly
  load_balancer_type         = "application"
  security_groups            = [var.alb_security_group_id]
  subnets                    = var.alb_subnet_ids
  drop_invalid_header_fields = true
  enable_deletion_protection = false # R7: destroy do lab sem passo manual
  tags                       = local.tags
}

resource "aws_lb_target_group" "app" {
  #checkov:skip=CKV_AWS_378:TLS termina no ALB; ALB -> task é tráfego privado na VPC (ADR-0003)
  name                 = "${local.name}-tg"
  port                 = 8080
  protocol             = "HTTP"
  vpc_id               = var.vpc_id
  target_type          = "ip"
  deregistration_delay = 10

  health_check {
    enabled             = true
    path                = "/health/live"
    protocol            = "HTTP"
    matcher             = "200"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }
  tags = local.tags
}

# API interna: HTTP dentro da VPC (ADR-0003). API pública: HTTP só redireciona para HTTPS.
resource "aws_lb_listener" "http" {
  #checkov:skip=CKV_AWS_2:Interno: HTTP só dentro da VPC; público: este listener só redireciona para HTTPS (ADR-0003)
  load_balancer_arn = aws_lb.alb.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = local.public_https ? "redirect" : "forward"
    target_group_arn = local.public_https ? null : aws_lb_target_group.app.arn

    dynamic "redirect" {
      for_each = local.public_https ? [1] : []
      content {
        port        = "443"
        protocol    = "HTTPS"
        status_code = "HTTP_301"
      }
    }
  }
  tags = local.tags
}

resource "aws_lb_listener" "https" {
  count             = local.public_https ? 1 : 0
  load_balancer_arn = aws_lb.alb.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.app.arn
  }
  tags = local.tags
}

# ---------------------------------------------------------------- task e serviço
resource "aws_ecs_task_definition" "app" {
  family                   = "${local.name}-task"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "512"
  memory                   = "1024"
  execution_role_arn       = aws_iam_role.ecs_execution_role.arn
  task_role_arn            = aws_iam_role.ecs_task_role.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }

  container_definitions = jsonencode([
    {
      name                   = "recommendation-service"
      image                  = "${aws_ecr_repository.app.repository_url}:${var.container_image_tag}"
      essential              = true
      readonlyRootFilesystem = true
      portMappings = [{
        containerPort = 8080
        hostPort      = 8080
        protocol      = "tcp"
      }]
      environment = [
        { name = "NODE_ENV", value = "production" },
        { name = "PORT", value = "8080" },
        { name = "AWS_REGION", value = local.region },
        { name = "DYNAMODB_TABLE_NAME", value = var.dynamodb_table_name },
        { name = "MEMORYDB_CLUSTER_ENDPOINT", value = var.memorydb_cluster_endpoint },
        { name = "MEMORYDB_TLS", value = "true" },
        { name = "SAGEMAKER_ENDPOINT_NAME", value = var.sagemaker_endpoint_name },
        { name = "BEDROCK_MODEL_ID", value = var.bedrock_model_id },
        { name = "EXPLANATIONS_ENABLED", value = tostring(var.explanations_enabled) },
        { name = "METRICS_NAMESPACE", value = var.metrics_namespace },
        { name = "LOG_LEVEL", value = "info" }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.ecs.name
          "awslogs-region"        = local.region
          "awslogs-stream-prefix" = "ecs"
        }
      }
    }
  ])
  tags = local.tags
}

resource "aws_ecs_service" "app" {
  name            = "${local.name}-service"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.app.arn
  desired_count   = var.desired_count

  capacity_provider_strategy {
    capacity_provider = "FARGATE_SPOT"
    weight            = 80
  }

  capacity_provider_strategy {
    capacity_provider = "FARGATE"
    weight            = 20
    base              = 1
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [var.ecs_security_group_id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.app.arn
    container_name   = "recommendation-service"
    container_port   = 8080
  }

  depends_on = [aws_lb_listener.http]
  tags       = local.tags
}
