data "aws_region" "current" {}
data "aws_partition" "current" {}

locals {
  name          = "${var.project_name}-${var.environment}"
  endpoint_name = "${local.name}-reranker"
  region        = data.aws_region.current.region
  partition     = data.aws_partition.current.partition
  # Conta da AWS que publica as imagens oficiais do XGBoost em us-east-1.
  image_account = split(".", var.model_image)[0]
}

data "aws_iam_policy_document" "sagemaker_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["sagemaker.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "sagemaker_execution" {
  name               = "${local.name}-sagemaker-role"
  assume_role_policy = data.aws_iam_policy_document.sagemaker_assume_role.json
}

# R3: no lugar de AmazonSageMakerFullAccess, só o que o endpoint precisa para subir.
resource "aws_iam_role_policy" "sagemaker_execution" {
  name = "serve-reranker"
  role = aws_iam_role.sagemaker_execution.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "EcrAuthToken"
        Effect   = "Allow"
        Action   = ["ecr:GetAuthorizationToken"]
        Resource = "*"
      },
      {
        Sid      = "PullServingImage"
        Effect   = "Allow"
        Action   = ["ecr:BatchCheckLayerAvailability", "ecr:GetDownloadUrlForLayer", "ecr:BatchGetImage"]
        Resource = "arn:${local.partition}:ecr:${local.region}:${local.image_account}:repository/*"
      },
      {
        Sid      = "WriteEndpointLogs"
        Effect   = "Allow"
        Action   = ["logs:CreateLogStream", "logs:PutLogEvents", "logs:DescribeLogStreams"]
        Resource = "${aws_cloudwatch_log_group.endpoint.arn}:*"
      },
      {
        Sid      = "PublishEndpointMetrics"
        Effect   = "Allow"
        Action   = ["cloudwatch:PutMetricData"]
        Resource = "*"
        Condition = {
          StringLike = { "cloudwatch:namespace" = ["/aws/sagemaker/*", "AWS/SageMaker"] }
        }
      }
    ]
  })
}

# R7: o SageMaker criaria este log group sozinho e ele sobraria depois do destroy.
resource "aws_cloudwatch_log_group" "endpoint" {
  #checkov:skip=CKV_AWS_338:Lab retém 14 dias; retenção longa custa armazenamento sem uso (README, FinOps)
  name              = "/aws/sagemaker/Endpoints/${local.endpoint_name}"
  retention_in_days = var.log_retention_days
  kms_key_id        = var.kms_key_arn
}

resource "aws_sagemaker_model" "reranker" {
  name               = "${local.name}-reranker-model"
  execution_role_arn = aws_iam_role.sagemaker_execution.arn
  # O re-ranker só recebe o payload da requisição: não precisa de rede de saída.
  enable_network_isolation = true

  primary_container {
    image          = var.model_image
    model_data_url = var.model_data_url
  }
}

resource "aws_sagemaker_endpoint_configuration" "reranker" {
  name = "${local.name}-reranker-config"

  production_variants {
    variant_name           = "AllTraffic"
    model_name             = aws_sagemaker_model.reranker.name
    initial_instance_count = var.enable_serverless_inference ? null : 1
    instance_type          = var.enable_serverless_inference ? null : "ml.t3.medium"

    dynamic "serverless_config" {
      for_each = var.enable_serverless_inference ? [1] : []
      content {
        max_concurrency   = 5
        memory_size_in_mb = 2048
        # Sem provisioned_concurrency: custo zero com o endpoint ocioso (R5).
      }
    }
  }

  # KMS do volume não se aplica a Serverless Inference; vale só para instâncias.
  kms_key_arn = var.enable_serverless_inference ? null : var.kms_key_arn
}

resource "aws_sagemaker_endpoint" "reranker" {
  name                 = local.endpoint_name
  endpoint_config_name = aws_sagemaker_endpoint_configuration.reranker.name
  depends_on           = [aws_cloudwatch_log_group.endpoint, aws_iam_role_policy.sagemaker_execution]
}
