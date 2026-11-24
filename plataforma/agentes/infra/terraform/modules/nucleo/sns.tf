# Tópico SNS dos alarmes e assinaturas (T011; ADR-0008). Cifrado com a chave da plataforma (T010,
# ADR-0001); a política nega quem não usa TLS (TT-S04) e só deixa o CloudWatch da conta publicar,
# pelos alarmes da plataforma (ADR-0014: principal de serviço, conta e ARN exatos, sem curinga).

# E-mails do infra/conta (D-034): String com join(",", var.emails_alerta), sem variável nova aqui.
data "aws_ssm_parameter" "emails" {
  name = "/00-conta/alertas/emails"
}

locals {
  # Atributo sensível value, nunca insecure_value: o log do Actions é público (Art. VIII, ADR-0008).
  # A lista continua sensível; só a quantidade sai do sensível, para o count ser aceito.
  emails_alerta     = split(",", data.aws_ssm_parameter.emails.value)
  qtd_emails_alerta = nonsensitive(length(local.emails_alerta))
}

resource "aws_sns_topic" "alarmes" {
  name              = local.nome_topico_alarmes
  kms_master_key_id = aws_kms_key.plataforma.arn

  tags = local.tags
}

resource "aws_sns_topic_policy" "alarmes" {
  arn = aws_sns_topic.alarmes.arn

  # jsonencode, e não aws_iam_policy_document: com o mock, o data source devolve texto aleatório.
  # O ARN vem de local.arn_topico_alarmes (o mesmo da política da chave), conhecido no plan.
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        # Deny com Principal "*" fica fora do ADR-0014: é a negação de TLS (TT-S04).
        Sid       = "NegaSemTLS"
        Effect    = "Deny"
        Principal = "*"
        Action    = "sns:*"
        Resource  = local.arn_topico_alarmes
        Condition = {
          Bool = { "aws:SecureTransport" = "false" }
        }
      },
      {
        Sid       = "PublicacaoDosAlarmes"
        Effect    = "Allow"
        Principal = { Service = "cloudwatch.amazonaws.com" }
        Action    = "sns:Publish"
        Resource  = local.arn_topico_alarmes
        Condition = {
          StringEquals = { "aws:SourceAccount" = local.conta }
          ArnEquals    = { "aws:SourceArn" = local.arns_dos_alarmes }
        }
      },
    ]
  })
}

# Uma assinatura por endereço. for_each sobre valor sensível o Terraform não aceita; com count, o
# endpoint vem da lista sensível e continua sensível no plan (TT-S06).
resource "aws_sns_topic_subscription" "alarmes" {
  count = local.qtd_emails_alerta

  topic_arn = aws_sns_topic.alarmes.arn
  protocol  = "email"
  endpoint  = local.emails_alerta[count.index]
}
