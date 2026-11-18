# Uma chave gerenciada pelo cliente para toda a plataforma do lab (S3, DynamoDB, MemoryDB,
# Logs, SNS, ECR, MWAA, Glue). Uma chave só porque cada CMK custa US$ 1/mês: em produção,
# separe por domínio de dados para limitar o raio de impacto de uma política errada.
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}
data "aws_partition" "current" {}

locals {
  account_id = data.aws_caller_identity.current.account_id
  region     = data.aws_region.current.region
  partition  = data.aws_partition.current.partition
}

resource "aws_kms_key" "platform" {
  description             = "${var.project_name}-${var.environment} platform key"
  deletion_window_in_days = 7
  enable_key_rotation     = true

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AccountAdministration"
        Effect    = "Allow"
        Principal = { AWS = "arn:${local.partition}:iam::${local.account_id}:root" }
        Action    = "kms:*"
        Resource  = "*"
      },
      {
        Sid       = "CloudWatchLogs"
        Effect    = "Allow"
        Principal = { Service = ["logs.${local.region}.amazonaws.com"] }
        Action    = ["kms:Encrypt*", "kms:Decrypt*", "kms:ReEncrypt*", "kms:GenerateDataKey*", "kms:Describe*"]
        Resource  = "*"
        Condition = {
          ArnLike = { "kms:EncryptionContext:aws:logs:arn" = "arn:${local.partition}:logs:${local.region}:${local.account_id}:*" }
        }
      },
      {
        Sid       = "AlarmsAndBudgetsToEncryptedSns"
        Effect    = "Allow"
        Principal = { Service = ["cloudwatch.amazonaws.com", "budgets.amazonaws.com"] }
        Action    = ["kms:Decrypt", "kms:GenerateDataKey*"]
        Resource  = "*"
        Condition = { StringEquals = { "aws:SourceAccount" = local.account_id } }
      }
    ]
  })
}

resource "aws_kms_alias" "platform" {
  name          = "alias/${var.project_name}-${var.environment}-platform"
  target_key_id = aws_kms_key.platform.key_id
}
