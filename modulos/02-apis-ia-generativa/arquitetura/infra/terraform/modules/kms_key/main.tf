# CMK única do stack (ADR-0007): cifra tabelas, logs, tópicos, variáveis de ambiente,
# fila de estados e anexos. Uma chave custa US$ 1/mês: é o único piso fixo aceito no lab.
variable "nome" {
  type = string
}
variable "account_id" {
  type = string
}
variable "region" {
  type = string
}
variable "partition" {
  type = string
}

locals {
  root = "arn:${var.partition}:iam::${var.account_id}:root"
}

resource "aws_kms_key" "this" {
  description             = "CMK do ${var.nome}"
  enable_key_rotation     = true
  deletion_window_in_days = 7
  tags                    = var.tags

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AdministracaoPelaConta"
        Effect    = "Allow"
        Principal = { AWS = local.root }
        Action    = "kms:*"
        Resource  = "*"
      },
      {
        Sid       = "CloudWatchLogs"
        Effect    = "Allow"
        Principal = { Service = "logs.${var.region}.amazonaws.com" }
        Action    = ["kms:Encrypt", "kms:Decrypt", "kms:ReEncrypt*", "kms:GenerateDataKey*", "kms:DescribeKey"]
        Resource  = "*"
        Condition = {
          ArnLike = { "kms:EncryptionContext:aws:logs:arn" = "arn:${var.partition}:logs:${var.region}:${var.account_id}:log-group:*" }
        }
      },
      {
        # Alarmes e orçamento publicam em tópicos SNS cifrados.
        Sid       = "PublicadoresDeAlertas"
        Effect    = "Allow"
        Principal = { Service = ["cloudwatch.amazonaws.com", "budgets.amazonaws.com"] }
        Action    = ["kms:Decrypt", "kms:GenerateDataKey*"]
        Resource  = "*"
        Condition = {
          StringEquals = { "aws:SourceAccount" = var.account_id }
        }
      }
    ]
  })
}

resource "aws_kms_alias" "this" {
  name          = "alias/${var.nome}"
  target_key_id = aws_kms_key.this.key_id
}

output "arn" {
  value = aws_kms_key.this.arn
}
