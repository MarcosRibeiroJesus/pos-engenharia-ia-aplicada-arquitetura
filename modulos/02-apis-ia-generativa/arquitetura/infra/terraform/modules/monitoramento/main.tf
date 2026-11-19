# Alarmes dos componentes críticos (regra R8) e orçamento do lab (FinOps).
# As métricas de negócio do LLM chegam por EMF nos logs do gateway e do orquestrador.
variable "nome" {
  type = string
}
variable "kms_key_arn" {
  type = string
}
variable "account_id" {
  type = string
}
variable "funcoes_lambda" {
  type = list(string)
}
variable "api_nome" {
  type = string
}
variable "api_stage" {
  type = string
}
variable "state_machine_arn" {
  type = string
}
variable "namespace_metricas" {
  type = string
}
variable "teto_mensal_usd" {
  description = "Teto do orçamento mensal. Decisão do dono do repositório: sem valor padrão."
  type        = number
  validation {
    condition     = var.teto_mensal_usd > 0
    error_message = "O teto mensal precisa ser positivo."
  }
}
variable "custo_diario_llm_alarme_usd" {
  type = number
}
variable "project" {
  type = string
}
variable "emails_alerta" {
  description = "Assinantes do tópico de alertas (opcional; confirmação por e-mail)."
  type        = list(string)
  default     = []
}

resource "aws_sns_topic" "alertas" {
  name              = "${var.nome}-alertas"
  kms_master_key_id = var.kms_key_arn
  tags              = var.tags
}

resource "aws_sns_topic_policy" "alertas" {
  arn = aws_sns_topic.alertas.arn
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "PublicadoresDaConta"
      Effect    = "Allow"
      Principal = { Service = ["cloudwatch.amazonaws.com", "budgets.amazonaws.com"] }
      Action    = "sns:Publish"
      Resource  = aws_sns_topic.alertas.arn
      Condition = { StringEquals = { "aws:SourceAccount" = var.account_id } }
    }]
  })
}

resource "aws_sns_topic_subscription" "email" {
  for_each  = toset(var.emails_alerta)
  topic_arn = aws_sns_topic.alertas.arn
  protocol  = "email"
  endpoint  = each.value
}

resource "aws_cloudwatch_metric_alarm" "erros_lambda" {
  for_each            = toset(var.funcoes_lambda)
  alarm_name          = "${each.value}-erros"
  alarm_description   = "Erros não tratados em ${each.value}."
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  dimensions          = { FunctionName = each.value }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alertas.arn]
  tags                = var.tags
}

locals {
  alarmes = {
    api_5xx = {
      descricao = "API devolvendo 5xx.", namespace = "AWS/ApiGateway", metrica = "5XXError", estatistica = "Sum", limite = 1, periodo = 300
      dimensoes = { ApiName = var.api_nome, Stage = var.api_stage }
    }
    aprovacao_falhou = {
      descricao = "Fluxo de aprovação falhou sem tratamento.", namespace = "AWS/States", metrica = "ExecutionsFailed", estatistica = "Sum", limite = 1, periodo = 300
      dimensoes = { StateMachineArn = var.state_machine_arn }
    }
    fallback_llm = {
      descricao = "Muitas chamadas caindo no modelo de fallback (primário degradado).", namespace = var.namespace_metricas, metrica = "FallbackAcionado", estatistica = "Sum", limite = 10, periodo = 300
      dimensoes = { Servico = "gateway" }
    }
    circuito_aberto = {
      descricao = "Circuit breaker de algum modelo abriu.", namespace = var.namespace_metricas, metrica = "CircuitoAberto", estatistica = "Maximum", limite = 1, periodo = 300
      dimensoes = { Servico = "gateway" }
    }
    custo_llm_diario = {
      descricao = "Custo estimado de tokens acima do limite diário.", namespace = var.namespace_metricas, metrica = "CustoUSD", estatistica = "Sum", limite = var.custo_diario_llm_alarme_usd, periodo = 86400
      dimensoes = { Servico = "gateway" }
    }
    injecao_bloqueada = {
      descricao = "Pico de tentativas de injeção bloqueadas (possível ataque em curso).", namespace = var.namespace_metricas, metrica = "InjecaoBloqueada", estatistica = "Sum", limite = 20, periodo = 300
      dimensoes = { Servico = "orquestrador" }
    }
  }
}

resource "aws_cloudwatch_metric_alarm" "servico" {
  for_each            = local.alarmes
  alarm_name          = "${var.nome}-${replace(each.key, "_", "-")}"
  alarm_description   = each.value.descricao
  namespace           = each.value.namespace
  metric_name         = each.value.metrica
  dimensions          = each.value.dimensoes
  statistic           = each.value.estatistica
  period              = each.value.periodo
  evaluation_periods  = 1
  threshold           = each.value.limite
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alertas.arn]
  tags                = var.tags
}

resource "aws_budgets_budget" "this" {
  name         = "${var.nome}-mensal"
  budget_type  = "COST"
  limit_amount = tostring(var.teto_mensal_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"
  tags         = var.tags

  cost_filter {
    name   = "TagKeyValue"
    values = [format("user:project$%s", var.project)]
  }

  notification {
    comparison_operator       = "GREATER_THAN"
    threshold                 = 80
    threshold_type            = "PERCENTAGE"
    notification_type         = "FORECASTED"
    subscriber_sns_topic_arns = [aws_sns_topic.alertas.arn]
  }

  notification {
    comparison_operator       = "GREATER_THAN"
    threshold                 = 100
    threshold_type            = "PERCENTAGE"
    notification_type         = "ACTUAL"
    subscriber_sns_topic_arns = [aws_sns_topic.alertas.arn]
  }
}

output "topico_alertas_arn" {
  value = aws_sns_topic.alertas.arn
}
