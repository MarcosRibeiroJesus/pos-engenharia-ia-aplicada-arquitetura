# Tag module deste componente (ADR-0014, D-031); project e managed-by vêm do default_tags.
locals {
  tags = {
    module = "pipeline-glue"
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
}

data "aws_iam_policy_document" "glue_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["glue.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "glue_service_role" {
  name               = "${local.name}-glue-role"
  assume_role_policy = data.aws_iam_policy_document.glue_assume_role.json
  tags               = local.tags
}

# R3: sem a managed policy AWSGlueServiceRole (que abre s3 em aws-glue-* e ec2 inteiro);
# só o bucket do golden dataset, a tabela de saída, o catálogo do banco e os logs do job.
resource "aws_iam_role_policy" "glue" {
  name = "feature-engineering"
  role = aws_iam_role.glue_service_role.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "GoldenDataset"
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket"]
        Resource = [var.s3_bucket_arn, "${var.s3_bucket_arn}/*"]
      },
      {
        Sid      = "PublishBatchRecommendations"
        Effect   = "Allow"
        Action   = ["dynamodb:BatchWriteItem", "dynamodb:PutItem", "dynamodb:DescribeTable"]
        Resource = var.dynamodb_table_arn
      },
      {
        Sid    = "GlueCatalog"
        Effect = "Allow"
        Action = ["glue:GetDatabase", "glue:GetTable", "glue:GetTables", "glue:GetPartitions", "glue:CreateTable", "glue:UpdateTable", "glue:BatchCreatePartition"]
        Resource = [
          "arn:${local.partition}:glue:${local.region}:${local.account}:catalog",
          "arn:${local.partition}:glue:${local.region}:${local.account}:database/${var.database_name}",
          "arn:${local.partition}:glue:${local.region}:${local.account}:table/${var.database_name}/*",
        ]
      },
      {
        # Credenciais temporárias do Lake Formation para ler o golden dataset; não aceita ARN de recurso.
        Sid      = "LakeFormationDataAccess"
        Effect   = "Allow"
        Action   = ["lakeformation:GetDataAccess"]
        Resource = "*"
      },
      {
        Sid      = "JobLogs"
        Effect   = "Allow"
        Action   = ["logs:CreateLogStream", "logs:PutLogEvents", "logs:AssociateKmsKey"]
        Resource = "${aws_cloudwatch_log_group.glue.arn}:*"
      },
      {
        Sid      = "JobMetrics"
        Effect   = "Allow"
        Action   = ["cloudwatch:PutMetricData"]
        Resource = "*"
        Condition = {
          StringEquals = { "cloudwatch:namespace" = "Glue" }
        }
      },
      {
        Sid      = "PlatformKey"
        Effect   = "Allow"
        Action   = ["kms:Decrypt", "kms:Encrypt", "kms:GenerateDataKey*"]
        Resource = var.kms_key_arn
      }
    ]
  })
}

resource "aws_glue_security_configuration" "main" {
  name = "${local.name}-glue-security"

  encryption_configuration {
    cloudwatch_encryption {
      cloudwatch_encryption_mode = "SSE-KMS"
      kms_key_arn                = var.kms_key_arn
    }
    job_bookmarks_encryption {
      job_bookmarks_encryption_mode = "CSE-KMS"
      kms_key_arn                   = var.kms_key_arn
    }
    s3_encryption {
      s3_encryption_mode = "SSE-KMS"
      kms_key_arn        = var.kms_key_arn
    }
  }
}

# R7: log group do job criado aqui, para o destroy não deixar /aws-glue/* para trás.
resource "aws_cloudwatch_log_group" "glue" {
  #checkov:skip=CKV_AWS_338:Lab retém 14 dias; retenção longa custa armazenamento sem uso (README, FinOps)
  name              = "${local.name}-glue-feature-engineering" # A19: no prefixo; o job aponta para ele no --continuous-log-logGroup
  retention_in_days = var.log_retention_days
  kms_key_id        = var.kms_key_arn
  tags              = local.tags
}

resource "aws_s3_object" "script_feature_engineering" {
  bucket = var.s3_scripts_bucket
  key    = "scripts/feature_engineering.py"
  source = "${path.module}/../../../../src/batch/glue/feature_engineering.py"
  etag   = filemd5("${path.module}/../../../../src/batch/glue/feature_engineering.py")
  tags   = local.tags
}

resource "aws_glue_job" "feature_engineering" {
  name                   = "${local.name}-feature-engineering"
  role_arn               = aws_iam_role.glue_service_role.arn
  glue_version           = "4.0"
  worker_type            = "G.1X"
  number_of_workers      = 2
  timeout                = 30
  security_configuration = aws_glue_security_configuration.main.name

  command {
    script_location = "s3://${var.s3_scripts_bucket}/${aws_s3_object.script_feature_engineering.key}"
    python_version  = "3"
  }

  default_arguments = {
    "--job-bookmark-option"              = "job-bookmark-enable"
    "--enable-metrics"                   = "true"
    "--enable-continuous-cloudwatch-log" = "true"
    "--continuous-log-logGroup"          = aws_cloudwatch_log_group.glue.name
    # RF-107 (T041): o script lê os caminhos por getResolvedOptions; nenhum nome fica no script.
    "--caminho_interacoes" = "s3://${var.s3_scripts_bucket}/${var.prefixos.interacoes}/"
    "--caminho_catalogo"   = "s3://${var.s3_scripts_bucket}/${var.prefixos.catalogo}/"
    "--caminho_features"   = "s3://${var.s3_scripts_bucket}/${var.prefixos.features}/"
  }

  tags = merge(local.tags, {
    Name = "${local.name}-glue-job"
  })
}
