# Tópico SNS dos alarmes e assinaturas (T011; Art. IV, Art. VIII, RNF-001, RNF-003; TT-S02 SNS e
# TT-S04; ADR-0001, ADR-0008 e ADR-0014). Os e-mails do parâmetro são sintéticos, do domínio
# reservado example.com (RFC 2606): nenhum endereço real entra no repositório.
mock_provider "aws" {
  override_during = plan

  mock_data "aws_caller_identity" {
    defaults = {
      account_id = "111111111111"
    }
  }
  mock_data "aws_region" {
    defaults = {
      region = "us-east-1"
    }
  }
  mock_data "aws_partition" {
    defaults = {
      partition = "aws"
    }
  }
  mock_data "aws_ssm_parameter" {
    defaults = {
      value = "alerta-a@example.com,alerta-b@example.com"
    }
  }
  mock_resource "aws_kms_key" {
    defaults = {
      arn    = "arn:aws:kms:us-east-1:111111111111:key/00000000-0000-0000-0000-000000000001"
      key_id = "00000000-0000-0000-0000-000000000001"
    }
  }
  mock_resource "aws_sns_topic" {
    defaults = {
      arn = "arn:aws:sns:us-east-1:111111111111:00-plataforma-agentes-alarmes"
    }
  }
}

variables {
  nomes_dos_alarmes = ["00-plataforma-agentes-sintetico-a", "00-plataforma-agentes-sintetico-b"]
}

run "topico_cifrado_com_a_chave_da_plataforma" {
  command = plan

  assert {
    condition     = aws_sns_topic.alarmes.name == "00-plataforma-agentes-alarmes"
    error_message = "O tópico se chama 00-plataforma-agentes-alarmes (ADR-0008), o nome que a política da chave usa (T010)."
  }
  assert {
    condition     = aws_sns_topic.alarmes.kms_master_key_id == aws_kms_key.plataforma.arn
    error_message = "O tópico é cifrado com a chave da plataforma do T010, sem chave nova nem a chave gerenciada da AWS (TT-S02, ADR-0001)."
  }
  assert {
    condition     = aws_sns_topic.alarmes.tags["module"] == "nucleo"
    error_message = "O tópico leva a tag module = nucleo (D-031); project e managed-by vêm do default_tags."
  }
  assert {
    condition     = output.topico_alarmes_arn == aws_sns_topic.alarmes.arn
    error_message = "O módulo expõe o ARN do tópico para os alarmes e para o contrato (topico_alarmes_arn, ADR-0008)."
  }
}

run "politica_do_topico" {
  command = plan

  assert {
    condition     = aws_sns_topic_policy.alarmes.arn == aws_sns_topic.alarmes.arn
    error_message = "A política é do tópico de alarmes."
  }
  assert {
    condition     = length(jsondecode(aws_sns_topic_policy.alarmes.policy).Statement) == 2
    error_message = "A política tem só duas declarações: a negação sem TLS e a publicação do CloudWatch da conta."
  }

  # TT-S04: nega qualquer ação de quem não usa TLS. Deny com Principal "*" é o caso que o ADR-0014
  # deixa fora da regra.
  assert {
    condition = one([for d in jsondecode(aws_sns_topic_policy.alarmes.policy).Statement : d
      if d.Effect == "Deny" && d.Principal == "*" && d.Action == "sns:*" &&
      d.Resource == "arn:aws:sns:us-east-1:111111111111:00-plataforma-agentes-alarmes" &&
    d.Condition.Bool["aws:SecureTransport"] == "false"]) != null
    error_message = "A política nega sns:* no tópico quando aws:SecureTransport = false (TT-S04, Art. IV)."
  }

  # Só o CloudWatch da conta publica, e só pelos alarmes da plataforma (ADR-0008, ADR-0014).
  assert {
    condition = alltrue([for d in jsondecode(aws_sns_topic_policy.alarmes.policy).Statement :
    d.Principal != "*" && !contains(keys(d), "NotPrincipal") if d.Effect == "Allow"])
    error_message = "Nenhuma declaração Allow com Principal \"*\" ou NotPrincipal (ADR-0014)."
  }
  assert {
    condition = one([for d in jsondecode(aws_sns_topic_policy.alarmes.policy).Statement : d
    if d.Effect == "Allow"]).Principal.Service == "cloudwatch.amazonaws.com"
    error_message = "Só o principal de serviço cloudwatch.amazonaws.com recebe Allow."
  }
  assert {
    condition = one([for d in jsondecode(aws_sns_topic_policy.alarmes.policy).Statement : d
    if d.Effect == "Allow"]).Action == "sns:Publish"
    error_message = "O CloudWatch só recebe sns:Publish."
  }
  assert {
    condition = one([for d in jsondecode(aws_sns_topic_policy.alarmes.policy).Statement : d
    if d.Effect == "Allow"]).Resource == "arn:aws:sns:us-east-1:111111111111:00-plataforma-agentes-alarmes"
    error_message = "A publicação vale só no ARN exato do tópico."
  }
  assert {
    condition = one([for d in jsondecode(aws_sns_topic_policy.alarmes.policy).Statement : d
    if d.Effect == "Allow"]).Condition.StringEquals["aws:SourceAccount"] == "111111111111"
    error_message = "A publicação exige aws:SourceAccount com a conta concreta (ADR-0014)."
  }
  assert {
    condition = toset(one([for d in jsondecode(aws_sns_topic_policy.alarmes.policy).Statement : d
      if d.Effect == "Allow"]).Condition.ArnEquals["aws:SourceArn"]) == toset([
      "arn:aws:cloudwatch:us-east-1:111111111111:alarm:00-plataforma-agentes-sintetico-a",
      "arn:aws:cloudwatch:us-east-1:111111111111:alarm:00-plataforma-agentes-sintetico-b",
    ])
    error_message = "A publicação exige aws:SourceArn com o ARN exato de cada alarme, sem curinga (ADR-0014)."
  }
}

run "uma_assinatura_email_por_endereco_do_parametro" {
  command = plan

  assert {
    condition     = data.aws_ssm_parameter.emails.name == "/00-conta/alertas/emails"
    error_message = "Os e-mails vêm do parâmetro /00-conta/alertas/emails do infra/conta, sem variável nova (D-034, ADR-0008)."
  }
  assert {
    condition     = length(aws_sns_topic_subscription.alarmes) == 2
    error_message = "Uma assinatura por endereço do parâmetro (o mock tem dois)."
  }
  assert {
    condition = alltrue([for s in aws_sns_topic_subscription.alarmes :
    s.protocol == "email" && s.topic_arn == aws_sns_topic.alarmes.arn])
    error_message = "Toda assinatura é email no tópico de alarmes."
  }
  assert {
    condition = (aws_sns_topic_subscription.alarmes[0].endpoint == "alerta-a@example.com" &&
    aws_sns_topic_subscription.alarmes[1].endpoint == "alerta-b@example.com")
    error_message = "Cada assinatura recebe um endereço do parâmetro, na ordem."
  }
  # Art. VIII e ADR-0008: o endereço continua sensível, para o plan e o apply do Actions (público)
  # não o imprimirem. O TT-S06 (test_dados_pessoais.py) prova o mesmo no plan em JSON.
  assert {
    condition     = alltrue([for s in aws_sns_topic_subscription.alarmes : issensitive(s.endpoint)])
    error_message = "O endpoint de cada assinatura é sensível: leia o value do parâmetro, nunca insecure_value nem nonsensitive() sobre a lista (ADR-0008)."
  }
}
