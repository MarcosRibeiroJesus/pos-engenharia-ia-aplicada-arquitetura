data "aws_region" "current" {}
data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}

locals {
  name      = "${var.project_name}-${var.environment}-mwaa"
  region    = data.aws_region.current.region
  account   = data.aws_caller_identity.current.account_id
  partition = data.aws_partition.current.partition
}

data "aws_iam_policy_document" "mwaa_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["airflow.amazonaws.com", "airflow-env.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "mwaa_execution_role" {
  count              = var.enable_mwaa ? 1 : 0
  name               = "${local.name}-role"
  assume_role_policy = data.aws_iam_policy_document.mwaa_assume_role.json
}

# R3: política de execução do MWAA restrita ao bucket, aos logs e à fila do próprio ambiente.
resource "aws_iam_role_policy" "mwaa_execution" {
  count = var.enable_mwaa ? 1 : 0
  name  = "mwaa-execution"
  role  = aws_iam_role.mwaa_execution_role[0].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "PublishMetrics"
        Effect   = "Allow"
        Action   = ["airflow:PublishMetrics"]
        Resource = "arn:${local.partition}:airflow:${local.region}:${local.account}:environment/${local.name}"
      },
      {
        Sid      = "ReadDagsBucket"
        Effect   = "Allow"
        Action   = ["s3:GetObject*", "s3:GetBucket*", "s3:List*"]
        Resource = [var.s3_bucket_arn, "${var.s3_bucket_arn}/*"]
      },
      {
        Sid      = "WriteLogs"
        Effect   = "Allow"
        Action   = ["logs:CreateLogStream", "logs:CreateLogGroup", "logs:PutLogEvents", "logs:GetLogEvents", "logs:GetLogRecord", "logs:GetLogGroupFields", "logs:GetQueryResults", "logs:DescribeLogGroups"]
        Resource = "arn:${local.partition}:logs:${local.region}:${local.account}:log-group:airflow-${local.name}-*"
      },
      {
        Sid      = "PublishAirflowMetrics"
        Effect   = "Allow"
        Action   = ["cloudwatch:PutMetricData"]
        Resource = "*"
        Condition = {
          StringEquals = { "cloudwatch:namespace" = "AmazonMWAA" }
        }
      },
      {
        Sid      = "CeleryQueue"
        Effect   = "Allow"
        Action   = ["sqs:ChangeMessageVisibility", "sqs:DeleteMessage", "sqs:GetQueueAttributes", "sqs:GetQueueUrl", "sqs:ReceiveMessage", "sqs:SendMessage"]
        Resource = "arn:${local.partition}:sqs:${local.region}:*:airflow-celery-*"
      },
      {
        Sid      = "UsePlatformKey"
        Effect   = "Allow"
        Action   = ["kms:Decrypt", "kms:DescribeKey", "kms:GenerateDataKey*", "kms:Encrypt"]
        Resource = var.kms_key_arn
        Condition = {
          StringLike = { "kms:ViaService" = ["sqs.${local.region}.amazonaws.com", "s3.${local.region}.amazonaws.com"] }
        }
      }
    ]
  })
}

resource "aws_security_group" "mwaa" {
  count       = var.enable_mwaa ? 1 : 0
  name        = "${local.name}-sg"
  description = "MWAA: trafego entre os proprios nos e saida so para a VPC"
  vpc_id      = var.vpc_id

  ingress {
    description = "Entre os nos do ambiente"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    self        = true
  }

  egress {
    description = "Endpoints e servicos dentro da VPC"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = [var.vpc_cidr]
  }
}

resource "aws_s3_object" "pipeline_dag" {
  bucket = var.s3_bucket_name
  key    = "dags/daily_hybrid_recommendation_pipeline.py"
  source = "${path.module}/../../../../src/batch/airflow/dags/daily_hybrid_recommendation_pipeline.py"
  etag   = filemd5("${path.module}/../../../../src/batch/airflow/dags/daily_hybrid_recommendation_pipeline.py")
}

resource "aws_mwaa_environment" "pipeline" {
  count                 = var.enable_mwaa ? 1 : 0
  name                  = local.name
  airflow_version       = "2.8.1"
  environment_class     = "mw1.small"
  execution_role_arn    = aws_iam_role.mwaa_execution_role[0].arn
  source_bucket_arn     = var.s3_bucket_arn
  dag_s3_path           = "dags"
  min_workers           = 1
  max_workers           = 2
  webserver_access_mode = "PRIVATE_ONLY"
  kms_key               = var.kms_key_arn

  network_configuration {
    security_group_ids = [aws_security_group.mwaa[0].id]
    subnet_ids         = slice(var.private_subnet_ids, 0, 2)
  }

  logging_configuration {
    dag_processing_logs {
      enabled   = true
      log_level = "INFO"
    }
    scheduler_logs {
      enabled   = true
      log_level = "WARNING"
    }
    task_logs {
      enabled   = true
      log_level = "INFO"
    }
    webserver_logs {
      enabled   = true
      log_level = "WARNING"
    }
    worker_logs {
      enabled   = true
      log_level = "WARNING"
    }
  }

  tags = {
    Name = local.name
  }
}
