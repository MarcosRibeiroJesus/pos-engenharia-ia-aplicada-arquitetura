# AWS Budgets diário com o teto da plataforma (T012; Art. V, Art. VIII, RNF-002; TT-K01, TT-S06;
# D-021, D-034, D-039; ADR-0008). Os e-mails do parâmetro são sintéticos, do domínio reservado
# example.com (RFC 2606): nenhum endereço real entra no repositório.
#
# O filtro user:project$00-plataforma-agentes só enxerga custo depois que a tag project estiver
# ativa como tag de alocação de custo (D-039, T053). Antes disso, só o Budgets mensal da conta
# protege (análise 1, A17). O teste prova a configuração, não a ativação da tag.
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
  teto_diario_usd   = 1.2
}

run "orcamento_diario_com_o_teto" {
  command = plan

  assert {
    condition     = aws_budgets_budget.diario.time_unit == "DAILY"
    error_message = "O orçamento da plataforma é diário (time_unit = DAILY): o teto é o custo de um dia de demonstração (Art. V, D-021)."
  }
  assert {
    condition     = tonumber(aws_budgets_budget.diario.limit_amount) == var.teto_diario_usd
    error_message = "limit_amount é var.teto_diario_usd, sem número fixo no módulo (TT-K01)."
  }
  assert {
    condition     = aws_budgets_budget.diario.limit_unit == "USD" && aws_budgets_budget.diario.budget_type == "COST"
    error_message = "Orçamento de custo em USD, a moeda do teto."
  }
  assert {
    condition     = aws_budgets_budget.diario.name == "00-plataforma-agentes-teto-diario"
    error_message = "O nome leva o prefixo da chave do projeto (D-029)."
  }
  assert {
    condition     = aws_budgets_budget.diario.tags["module"] == "nucleo"
    error_message = "O orçamento leva a tag module = nucleo (D-031); project e managed-by vêm do default_tags."
  }
}

run "filtro_pela_tag_project" {
  command = plan

  assert {
    condition     = length(aws_budgets_budget.diario.cost_filter) == 1
    error_message = "Um só filtro: a tag project da plataforma. Outro filtro estreitaria o orçamento sem motivo."
  }
  assert {
    condition = alltrue([for f in aws_budgets_budget.diario.cost_filter :
    f.name == "TagKeyValue" && toset(f.values) == toset(["user:project$00-plataforma-agentes"])])
    error_message = "O filtro é TagKeyValue = user:project$00-plataforma-agentes: só o custo da plataforma conta no teto (D-029, D-039)."
  }
}

run "alertas_para_os_emails_do_parametro" {
  command = plan

  assert {
    condition     = length(aws_budgets_budget.diario.notification) >= 1
    error_message = "O orçamento avisa por e-mail; sem notificação ele não protege ninguém."
  }
  assert {
    condition = alltrue([for n in aws_budgets_budget.diario.notification :
    n.notification_type == "ACTUAL" && n.threshold_type == "PERCENTAGE" && n.comparison_operator == "GREATER_THAN"])
    error_message = "Alertas de custo real em porcentagem do teto."
  }
  assert {
    condition     = toset([for n in aws_budgets_budget.diario.notification : n.threshold]) == toset([80, 100])
    error_message = "Dois alertas de custo real: a 80% (aviso antes do teto) e a 100% do teto."
  }
  assert {
    condition = alltrue([for n in aws_budgets_budget.diario.notification :
    toset(n.subscriber_email_addresses) == toset(["alerta-a@example.com", "alerta-b@example.com"])])
    error_message = "Os alertas vão para os mesmos e-mails do parâmetro /00-conta/alertas/emails, sem variável nova (D-034)."
  }
  assert {
    condition = alltrue([for n in aws_budgets_budget.diario.notification :
    length(coalesce(n.subscriber_sns_topic_arns, [])) == 0])
    error_message = "Os alertas do orçamento vão por e-mail; o tópico cifrado exigiria abrir a chave para o Budgets."
  }
  # Art. VIII e ADR-0008: o destinatário continua sensível no plan; o log do Actions é público.
  # notification é um conjunto de blocos, então o Terraform marca o conjunto inteiro, e não o
  # atributo de cada elemento. O TT-S06 (test_dados_pessoais.py) prova o mesmo no plan em JSON.
  assert {
    condition     = issensitive(aws_budgets_budget.diario.notification)
    error_message = "subscriber_email_addresses é sensível: leia o value do parâmetro, nunca insecure_value nem nonsensitive() sobre a lista (ADR-0008)."
  }
}

# O teto muda só pela variável: outro valor muda o limit_amount junto (TT-K01).
run "teto_vem_da_variavel" {
  command = plan

  variables {
    teto_diario_usd = 2.5
  }

  assert {
    condition     = tonumber(aws_budgets_budget.diario.limit_amount) == 2.5
    error_message = "limit_amount acompanha var.teto_diario_usd."
  }
}

run "teto_zero_reprova" {
  command = plan

  variables {
    teto_diario_usd = 0
  }

  expect_failures = [var.teto_diario_usd]
}
