# Módulo gateway: gateway MCP único da plataforma com IAM na entrada (T013; RF-001, RF-003, Art. IV).
# ADR-0003 (AWS_IAM), ADR-0010 (versões MCP), ADR-0011 (motor anulável) e ADR-0014 (sem Principal
# curinga). A role de fumaça (T014) entra neste módulo em fumaca.tf.
#
# KMS: a política da chave (módulo nucleo, declaração GatewayEMotor) dá ao principal de serviço
# bedrock-agentcore.amazonaws.com kms:Decrypt, kms:GenerateDataKey* e kms:DescribeKey, com
# aws:SourceAccount da conta. NÃO VERIFICADO na documentação oficial: quais ações o AgentCore usa
# na chave do gateway, se ele usa o principal de serviço ou a role de execução, e se exige
# kms:CreateGrant. A consulta à documentação não foi possível nesta sessão (T013); a conferência
# fica para o ensaio contra a AWS (T084). Por isso esta role não recebe nenhuma ação KMS.
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
  tags = { module = "gateway" }

  prefixo = "00-plataforma-agentes"
  conta   = data.aws_caller_identity.atual.account_id
  regiao  = data.aws_region.atual.region
  part    = data.aws_partition.atual.partition

  # Risco R4 do plano. NÃO VERIFICADO: o tipo de recurso que bedrock:InvokeGuardrailChecks aceita
  # na referência de autorização (a consulta não foi possível nesta sessão). Até a conferência,
  # o recurso fica no mais estreito plausível: guardrails da própria região e conta. Os guardrails
  # são de cada produto (RF-004) e nascem no state dele, por isso não há ARN exato aqui. Se a
  # documentação ou o ensaio (T084) mostrarem que a ação só aceita "*", a troca segue o R4:
  # aws:SourceAccount (ou aws:ResourceAccount) com a conta concreta, exceção do checkov e ADR.
  recurso_checagens_de_guardrail = "arn:${local.part}:bedrock:${local.regiao}:${local.conta}:guardrail/*"
}

resource "aws_iam_role" "execucao" {
  name        = "${local.prefixo}-gateway-execucao"
  description = "Role de execucao do gateway MCP da plataforma: sem invocar alvos (cada produto concede pela politica de recurso)."

  # jsonencode, e não aws_iam_policy_document: com o mock, o data source devolve texto aleatório e
  # a regra TT-S01 do plan não lê a política. Sem aws:SourceArn: o ARN do gateway leva o id, que só
  # existe depois dele, e o ADR-0014 proíbe curinga no valor (gateway/*).
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AgentCoreDaConta"
        Effect    = "Allow"
        Principal = { Service = "bedrock-agentcore.amazonaws.com" }
        Action    = "sts:AssumeRole"
        Condition = {
          StringEquals = { "aws:SourceAccount" = local.conta }
        }
      },
    ]
  })

  tags = local.tags
}

# Uma única declaração. Nenhuma permissão de invocar alvos (lambda:InvokeFunction,
# bedrock-agentcore:InvokeAgentRuntime): cada produto libera o gateway na política de recurso da
# própria função ou runtime (plano, Role de execução do gateway), e o gateway não ganha acesso a
# todos os produtos.
resource "aws_iam_role_policy" "execucao" {
  name = "${local.prefixo}-gateway-checagens-de-guardrail"
  role = aws_iam_role.execucao.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "ChecagensDeGuardrailDoPolicy"
        Effect   = "Allow"
        Action   = ["bedrock:InvokeGuardrailChecks"]
        Resource = [local.recurso_checagens_de_guardrail]
      },
    ]
  })
}

resource "aws_bedrockagentcore_gateway" "plataforma" {
  name        = "${local.prefixo}-gateway"
  description = "Gateway MCP unico da plataforma de agentes (RF-001)."
  role_arn    = aws_iam_role.execucao.arn

  protocol_type   = "MCP"
  authorizer_type = var.authorizer_type
  kms_key_arn     = var.kms_key_arn
  # exception_level fica sem valor: DEBUG levaria o detalhe do erro ao cliente (plano, Gateway).

  protocol_configuration {
    mcp {
      supported_versions = var.versoes_mcp
      # search_type fica sem valor: SEMANTIC é cobrada à parte, e cada produto tem poucas tools.
    }
  }

  # ADR-0011: o bloco só existe com o ARN do motor. O root real sempre passa (TT-P01).
  dynamic "policy_engine_configuration" {
    for_each = var.motor_politica_arn == null ? [] : [var.motor_politica_arn]
    content {
      arn  = policy_engine_configuration.value
      mode = var.modo_politica
    }
  }

  tags = local.tags
}
