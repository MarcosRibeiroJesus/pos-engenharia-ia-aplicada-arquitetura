# TT-K01 (T013; RNF-102, RNF-002, Art. V; D-021, D-022, D-024): AWS Budgets diário com o teto de um dia.
# - time_unit = "DAILY" e limit_amount = var.teto_diario_usd (o mesmo valor do harness/estado.json e
#   do README, conferidos pelo TH-06 em harness/testes/test_teto_01_recomendacao.py);
# - filtro pela tag user:project$01-recomendacao (só enxerga custo depois da ativação da tag, D-039);
# - nenhum Budgets mensal no stack: o limite mensal da conta fica só no infra/conta (D-022). O ST-K01
#   do static_rules.py confere isso em todos os .tf do stack;
# - no diário, só notificações ACTUAL (A09 da análise 1): a previsão precisa de semanas de histórico e
#   nunca dispararia num stack que vive um dia;
# - os destinatários (e-mails) ficam sensíveis no plan e fora dos outputs (mesma regra do TT-S06 da
#   plataforma; Art. VIII).

mock_provider "aws" {
  override_during = plan

  mock_resource "aws_sns_topic" {
    defaults = {
      arn = "arn:aws:sns:us-east-1:123456789012:01-recomendacao-lab-alerts"
    }
  }
  mock_resource "aws_s3_bucket" {
    defaults = {
      arn = "arn:aws:s3:::01-recomendacao-lab-golden-123456789012"
    }
  }
  mock_resource "aws_cloudwatch_log_group" {
    defaults = {
      arn = "arn:aws:logs:us-east-1:123456789012:log-group:mock"
    }
  }
  mock_resource "aws_ecr_repository" {
    defaults = {
      arn            = "arn:aws:ecr:us-east-1:123456789012:repository/01-recomendacao-lab/recommendation-service"
      repository_url = "123456789012.dkr.ecr.us-east-1.amazonaws.com/01-recomendacao-lab/recommendation-service"
    }
  }
  mock_data "aws_availability_zones" {
    defaults = {
      names = ["us-east-1a", "us-east-1b", "us-east-1c"]
    }
  }
  mock_data "aws_region" {
    defaults = {
      region = "us-east-1"
      name   = "us-east-1"
    }
  }
  mock_data "aws_caller_identity" {
    defaults = {
      account_id = "123456789012"
      arn        = "arn:aws:iam::123456789012:user/terraform"
    }
  }
  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":\"sts:AssumeRole\",\"Principal\":{\"Service\":\"ecs-tasks.amazonaws.com\"}}]}"
    }
  }
  mock_data "aws_partition" {
    defaults = {
      partition = "aws"
    }
  }
}

variables {
  ecs_service_name        = "01-recomendacao-lab-service"
  ecs_cluster_name        = "01-recomendacao-lab-cluster"
  alb_arn_suffix          = "app/01-recomendacao-lab-alb/123"
  target_group_arn_suffix = "targetgroup/01-recomendacao-lab-tg/456"
  sagemaker_endpoint_name = "01-recomendacao-lab-reranker"
}

run "orcamento_diario_com_o_teto" {
  command = plan
  module {
    source = "./modules/cloudwatch_monitoring"
  }
  variables {
    project_name    = "01-recomendacao"
    environment     = "lab"
    kms_key_arn     = "arn:aws:kms:us-east-1:123456789012:key/mock"
    teto_diario_usd = 7.1
    # Endereços sintéticos (domínio reservado), só para o plan ter assinaturas.
    alert_emails = ["alerta-a@example.com", "alerta-b@example.com"]
  }

  assert {
    condition     = aws_budgets_budget.daily.time_unit == "DAILY"
    error_message = "TT-K01: o Budgets do stack é diário (D-021: o teto é o custo de um dia)."
  }
  assert {
    condition     = aws_budgets_budget.daily.limit_amount == tostring(var.teto_diario_usd) && aws_budgets_budget.daily.limit_unit == "USD"
    error_message = "TT-K01: limit_amount do Budgets diário = var.teto_diario_usd, em USD."
  }
  assert {
    condition     = aws_budgets_budget.daily.budget_type == "COST"
    error_message = "TT-K01: o orçamento é de custo."
  }
  assert {
    condition = length(aws_budgets_budget.daily.cost_filter) == 1 && alltrue([for f in aws_budgets_budget.daily.cost_filter :
    f.name == "TagKeyValue" && tolist(f.values) == tolist(["user:project$01-recomendacao"])])
    error_message = "TT-K01: o Budgets diário filtra só pela tag user:project$01-recomendacao."
  }
  assert {
    condition     = length(aws_budgets_budget.daily.notification) > 0 && alltrue([for n in aws_budgets_budget.daily.notification : n.notification_type == "ACTUAL"])
    error_message = "TT-K01 (A09): o Budgets diário só tem notificações ACTUAL."
  }
  assert {
    condition     = toset([for n in aws_budgets_budget.daily.notification : n.threshold]) == toset([80, 100])
    error_message = "TT-K01: alertas do custo real em 80% e 100% do teto diário."
  }
  assert {
    condition = alltrue([for n in aws_budgets_budget.daily.notification :
    toset(n.subscriber_sns_topic_arns) == toset([aws_sns_topic.alerts.arn]) && length(coalesce(n.subscriber_email_addresses, [])) == 0])
    error_message = "TT-K01: o Budgets notifica só o tópico criptografado; nenhum e-mail no recurso do orçamento."
  }
  assert {
    condition     = length(aws_sns_topic_subscription.email) == 2 && alltrue([for s in aws_sns_topic_subscription.email : issensitive(s.endpoint)])
    error_message = "TT-S06 (D01): o endereço de cada assinatura continua sensível no plan (fora do log público)."
  }
  assert {
    condition     = output.orcamento_diario == { nome = "01-recomendacao-lab-daily", time_unit = "DAILY", limit_amount = "7.1" }
    error_message = "O output orcamento_diario expõe só nome, período e limite, sem destinatários."
  }
}

# Fixture vermelha (A09): o alerta FORECASTED que o módulo tinha antes da T013 precisa ser rejeitado.
run "orcamento_diario_rejeita_previsao" {
  command = plan
  module {
    source = "./modules/cloudwatch_monitoring"
  }
  variables {
    project_name    = "01-recomendacao"
    environment     = "lab"
    kms_key_arn     = "arn:aws:kms:us-east-1:123456789012:key/mock"
    teto_diario_usd = 7.1
    alertas_do_orcamento = [
      { threshold = 80, notification_type = "ACTUAL" },
      { threshold = 100, notification_type = "FORECASTED" },
    ]
  }
  expect_failures = [var.alertas_do_orcamento]
}

run "teto_precisa_caber_no_limite_mensal" {
  command = plan
  module {
    source = "./modules/cloudwatch_monitoring"
  }
  variables {
    project_name    = "01-recomendacao"
    environment     = "lab"
    kms_key_arn     = "arn:aws:kms:us-east-1:123456789012:key/mock"
    teto_diario_usd = 25
  }
  expect_failures = [var.teto_diario_usd]
}

# O root passa o próprio teto ao módulo: o valor do variables.tf é o que chega ao Budgets.
run "root_leva_o_teto_ao_orcamento" {
  command = plan

  assert {
    condition     = var.teto_diario_usd == 7.1
    error_message = "TT-K01: o padrão do teto no root é o aprovado pelo dono (D-056), igual ao estado.json."
  }
  assert {
    condition     = module.cloudwatch_monitoring.orcamento_diario.limit_amount == tostring(var.teto_diario_usd)
    error_message = "TT-K01: o root passa var.teto_diario_usd ao Budgets diário."
  }
  assert {
    condition     = module.cloudwatch_monitoring.orcamento_diario.time_unit == "DAILY"
    error_message = "TT-K01: o orçamento do root é diário."
  }
}
