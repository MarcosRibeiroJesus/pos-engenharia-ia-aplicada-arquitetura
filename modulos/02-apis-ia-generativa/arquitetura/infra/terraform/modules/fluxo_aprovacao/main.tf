# Aprovação humana do cancelamento (tarefa 1.4 da prova; ADR-0004).
# O grafo da conversa roda em código; só a espera durável (horas) fica no Step Functions,
# que cobra por transição de estado e não tem custo enquanto espera.
variable "nome" {
  type = string
}
variable "executor_lambda_arn" {
  type = string
}
variable "timeout_aprovacao_s" {
  type    = number
  default = 86400
}
variable "kms_key_arn" {
  type = string
}
variable "account_id" {
  type = string
}
variable "retencao_logs_dias" {
  type    = number
  default = 30
}

locals {
  retentavel = [{
    ErrorEquals     = ["Lambda.ServiceException", "Lambda.TooManyRequestsException", "Lambda.SdkClientException"]
    IntervalSeconds = 2
    MaxAttempts     = 3
    BackoffRate     = 2
  }]
  definicao = {
    Comment = "Cancelamento com gate determinístico e aprovação humana"
    StartAt = "AguardarAprovacao"
    States = {
      AguardarAprovacao = {
        Type     = "Task"
        Resource = "arn:aws:states:::lambda:invoke.waitForTaskToken"
        Parameters = {
          FunctionName = var.executor_lambda_arn
          Payload = {
            etapa        = "registrar_pendencia"
            "acao.$"     = "$.acao"
            "token.$"    = "$$.Task.Token"
            "execucao.$" = "$$.Execution.Id"
          }
        }
        TimeoutSeconds = var.timeout_aprovacao_s
        ResultPath     = "$.decisao"
        Retry          = local.retentavel
        Catch = [
          { ErrorEquals = ["States.Timeout"], ResultPath = "$.erro", Next = "Expirar" },
          { ErrorEquals = ["States.ALL"], ResultPath = "$.erro", Next = "Falhar" }
        ]
        Next = "Decidir"
      }
      Decidir = {
        Type = "Choice"
        Choices = [{
          And = [
            { Variable = "$.decisao.aprovado", IsPresent = true },
            { Variable = "$.decisao.aprovado", BooleanEquals = true }
          ]
          Next = "Executar"
        }]
        Default = "Rejeitar"
      }
      Executar = {
        Type     = "Task"
        Resource = "arn:aws:states:::lambda:invoke"
        Parameters = {
          FunctionName = var.executor_lambda_arn
          Payload      = { etapa = "cancelar", "acao.$" = "$.acao", "decisao.$" = "$.decisao" }
        }
        Retry = local.retentavel
        Catch = [{ ErrorEquals = ["States.ALL"], ResultPath = "$.erro", Next = "Falhar" }]
        End   = true
      }
      Rejeitar = {
        Type     = "Task"
        Resource = "arn:aws:states:::lambda:invoke"
        Parameters = {
          FunctionName = var.executor_lambda_arn
          Payload      = { etapa = "rejeitar", "acao.$" = "$.acao", "decisao.$" = "$.decisao" }
        }
        Retry = local.retentavel
        End   = true
      }
      Expirar = {
        Type     = "Task"
        Resource = "arn:aws:states:::lambda:invoke"
        Parameters = {
          FunctionName = var.executor_lambda_arn
          Payload      = { etapa = "expirar", "acao.$" = "$.acao" }
        }
        Retry = local.retentavel
        End   = true
      }
      Falhar = {
        Type  = "Fail"
        Error = "CancelamentoNaoConcluido"
        Cause = "Erro não recuperável; a ação continua pendente e o alarme avisa a operação."
      }
    }
  }
}

resource "aws_cloudwatch_log_group" "this" {
  #checkov:skip=CKV_AWS_338:Retenção de 30 dias no lab: custo e minimização de dados (LGPD); produção define por política (ADR-0007)
  name              = "/aws/vendedlogs/states/${var.nome}"
  retention_in_days = var.retencao_logs_dias
  kms_key_id        = var.kms_key_arn
  tags              = var.tags
}

resource "aws_iam_role" "this" {
  name = var.nome
  tags = var.tags
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "states.amazonaws.com" }
      Action    = "sts:AssumeRole"
      Condition = { StringEquals = { "aws:SourceAccount" = var.account_id } }
    }]
  })
}

resource "aws_iam_role_policy" "this" {
  name = "${var.nome}-menor-privilegio"
  role = aws_iam_role.this.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Sid = "InvocarExecutor", Effect = "Allow", Action = ["lambda:InvokeFunction"], Resource = var.executor_lambda_arn },
      { Sid = "CifrarEstado", Effect = "Allow", Action = ["kms:Decrypt", "kms:GenerateDataKey"], Resource = var.kms_key_arn },
      {
        # Entrega de logs do Step Functions: a AWS exige Resource "*" nestas ações.
        Sid    = "EntregaDeLogs"
        Effect = "Allow"
        Action = ["logs:CreateLogDelivery", "logs:GetLogDelivery", "logs:UpdateLogDelivery", "logs:DeleteLogDelivery",
        "logs:ListLogDeliveries", "logs:PutResourcePolicy", "logs:DescribeResourcePolicies", "logs:DescribeLogGroups"]
        Resource = "*"
      },
      { Sid = "Traces", Effect = "Allow", Action = ["xray:PutTraceSegments", "xray:PutTelemetryRecords", "xray:GetSamplingRules", "xray:GetSamplingTargets"], Resource = "*" }
    ]
  })
}

resource "aws_sfn_state_machine" "this" {
  #checkov:skip=CKV_AWS_285:Histórico com level ALL, mas sem dados da execução: a entrada tem texto e dados do paciente (PII)
  name       = var.nome
  role_arn   = aws_iam_role.this.arn
  type       = "STANDARD"
  definition = jsonencode(local.definicao)
  tags       = var.tags

  encryption_configuration {
    type                              = "CUSTOMER_MANAGED_KMS_KEY"
    kms_key_id                        = var.kms_key_arn
    kms_data_key_reuse_period_seconds = 300
  }

  logging_configuration {
    log_destination        = "${aws_cloudwatch_log_group.this.arn}:*"
    include_execution_data = false
    level                  = "ALL"
  }

  tracing_configuration {
    enabled = true
  }

  depends_on = [aws_iam_role_policy.this]
}

output "arn" {
  value = aws_sfn_state_machine.this.arn
}
