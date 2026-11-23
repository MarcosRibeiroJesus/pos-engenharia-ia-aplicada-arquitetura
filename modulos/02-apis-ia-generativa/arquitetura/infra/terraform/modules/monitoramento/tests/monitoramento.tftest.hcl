# Regras R8 (métricas e alarmes nos componentes críticos) e FinOps (orçamento).
mock_provider "aws" {
  mock_resource "aws_sns_topic" {
    defaults = { arn = "arn:aws:sns:us-east-1:123456789012:agenda-lab-alertas" }
  }
}

variables {
  nome                        = "agenda-lab"
  kms_key_arn                 = "arn:aws:kms:us-east-1:123456789012:key/11111111-2222-3333-4444-555555555555"
  account_id                  = "123456789012"
  funcoes_lambda              = ["agenda-lab-gateway", "agenda-lab-orquestrador", "agenda-lab-executor"]
  api_nome                    = "agenda-lab"
  api_stage                   = "lab"
  state_machine_arn           = "arn:aws:states:us-east-1:123456789012:stateMachine:agenda-lab-aprovacao"
  namespace_metricas          = "AssistenteAgendamento"
  teto_mensal_usd             = 10
  custo_diario_llm_alarme_usd = 1
  project                     = "assistente-agendamento"
  tags                        = { project = "assistente-agendamento", module = "02-apis-ia-generativa/arquitetura", "managed-by" = "terraform" }
}

run "alarmes_dos_componentes_criticos" {
  command = apply
  assert {
    condition     = length(aws_cloudwatch_metric_alarm.erros_lambda) == 3
    error_message = "R8: alarme de erro em cada Lambda."
  }
  assert {
    condition     = alltrue([for k in ["api_5xx", "aprovacao_falhou", "fallback_llm", "circuito_aberto", "custo_llm_diario", "injecao_bloqueada"] : contains(keys(aws_cloudwatch_metric_alarm.servico), k)])
    error_message = "R8: alarmes de API, fluxo de aprovação, fallback, circuito, custo e injeção."
  }
  assert {
    condition     = alltrue([for a in values(aws_cloudwatch_metric_alarm.servico) : a.treat_missing_data == "notBreaching" && length(a.alarm_actions) == 1])
    error_message = "R8: todo alarme notifica o tópico de alertas."
  }
}

run "topico_cifrado_e_orcamento" {
  command = apply
  assert {
    condition     = aws_sns_topic.alertas.kms_master_key_id == var.kms_key_arn
    error_message = "R2: tópico de alertas cifrado."
  }
  assert {
    condition     = aws_budgets_budget.this.limit_amount == "10" && aws_budgets_budget.this.time_unit == "MONTHLY"
    error_message = "FinOps: orçamento mensal com o teto informado."
  }
  assert {
    condition     = one(aws_budgets_budget.this.cost_filter).values[0] == "user:project$assistente-agendamento"
    error_message = "FinOps: orçamento filtra pela tag do projeto."
  }
}
