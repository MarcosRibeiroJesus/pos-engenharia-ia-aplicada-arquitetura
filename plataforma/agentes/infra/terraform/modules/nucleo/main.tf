# Módulo nucleo: chave KMS do cliente (T010), tópico SNS dos alarmes (T011) e Budgets diário (T012).
# A chave segue o ADR-0001 e a política segue o ADR-0014: nenhum Principal "*" e nenhum curinga no
# valor de aws:SourceAccount ou aws:SourceArn.
terraform {
  required_version = ">= 1.10.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.50"
    }
  }
}

data "aws_caller_identity" "atual" {}
data "aws_region" "atual" {}
data "aws_partition" "atual" {}

locals {
  # project e managed-by vêm do default_tags do root (D-031).
  tags = { module = "nucleo" }

  prefixo = "00-plataforma-agentes"
  conta   = data.aws_caller_identity.atual.account_id
  regiao  = data.aws_region.atual.region
  part    = data.aws_partition.atual.partition

  # O tópico (T011) usa a chave, então a política não pode referenciar o recurso: o ARN é montado
  # com o mesmo nome que o T011 usa (local.nome_topico_alarmes).
  nome_topico_alarmes = "${local.prefixo}-alarmes"
  arn_topico_alarmes  = "arn:${local.part}:sns:${local.regiao}:${local.conta}:${local.nome_topico_alarmes}"

  arns_dos_alarmes = [for n in var.nomes_dos_alarmes :
  "arn:${local.part}:cloudwatch:${local.regiao}:${local.conta}:alarm:${n}"]

  # Prefixo dos grupos de logs de aplicação do gateway (plano, Observabilidade; T016). O id do
  # gateway só existe depois dele, e o gateway usa esta chave, por isso o prefixo e não o ARN exato.
  # A chave da condição é kms:EncryptionContext, não de conta: o ADR-0014 não se aplica a ela.
  arn_grupos_da_plataforma = "arn:${local.part}:logs:${local.regiao}:${local.conta}:log-group:/aws/vendedlogs/bedrock-agentcore/gateway/APPLICATION_LOGS/*"

  acoes_de_uso = ["kms:Decrypt", "kms:GenerateDataKey*", "kms:DescribeKey"]
}

resource "aws_kms_key" "plataforma" {
  description              = "${local.prefixo}-chave: logs, SNS, gateway e motor da plataforma (ADR-0001)"
  key_usage                = "ENCRYPT_DECRYPT"
  customer_master_key_spec = "SYMMETRIC_DEFAULT"
  enable_key_rotation      = true
  deletion_window_in_days  = 7
  # Explícito: a checagem impede uma política que tire da conta o controle da chave.
  bypass_policy_lockout_safety_check = false

  # jsonencode, e não aws_iam_policy_document: com o mock, o data source devolve texto aleatório e
  # a regra TT-S01 do plan não lê a política.
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        # Administração delegada ao IAM da conta; a role de deploy recebe o acesso pela política dela.
        Sid       = "AdministracaoPelaConta"
        Effect    = "Allow"
        Principal = { AWS = "arn:${local.part}:iam::${local.conta}:root" }
        Action    = "kms:*"
        Resource  = "*"
      },
      {
        Sid       = "LogsDosGruposDaPlataforma"
        Effect    = "Allow"
        Principal = { Service = "logs.${local.regiao}.amazonaws.com" }
        Action    = ["kms:Encrypt*", "kms:Decrypt*", "kms:ReEncrypt*", "kms:GenerateDataKey*", "kms:Describe*"]
        Resource  = "*"
        Condition = {
          ArnLike = { "kms:EncryptionContext:aws:logs:arn" = local.arn_grupos_da_plataforma }
        }
      },
      {
        Sid       = "AlarmesDaPlataforma"
        Effect    = "Allow"
        Principal = { Service = "cloudwatch.amazonaws.com" }
        Action    = ["kms:Decrypt", "kms:GenerateDataKey*"]
        Resource  = "*"
        Condition = {
          StringEquals = { "aws:SourceAccount" = local.conta }
          ArnEquals    = { "aws:SourceArn" = local.arns_dos_alarmes }
        }
      },
      {
        Sid       = "TopicoDeAlarmes"
        Effect    = "Allow"
        Principal = { Service = "sns.amazonaws.com" }
        Action    = ["kms:Decrypt", "kms:GenerateDataKey*"]
        Resource  = "*"
        Condition = {
          StringEquals = { "aws:SourceAccount" = local.conta }
          ArnEquals    = { "aws:SourceArn" = local.arn_topico_alarmes }
        }
      },
      {
        Sid       = "GatewayEMotor"
        Effect    = "Allow"
        Principal = { Service = "bedrock-agentcore.amazonaws.com" }
        Action    = local.acoes_de_uso
        Resource  = "*"
        Condition = {
          StringEquals = { "aws:SourceAccount" = local.conta }
        }
      },
    ]
  })

  tags = local.tags
}

resource "aws_kms_alias" "plataforma" {
  name          = "alias/${local.prefixo}-chave"
  target_key_id = aws_kms_key.plataforma.key_id
}
