# Função Lambda com role própria de menor privilégio, log group cifrado, X-Ray e logs JSON.
# Fora de VPC de propósito: sem NAT Gateway (custo fixo) e sem recursos privados a alcançar
# (DynamoDB, S3, SFN e Bedrock são APIs regionais com IAM). Ver ADR-0007.
variable "nome" {
  type = string
}
variable "descricao" {
  type = string
}
variable "handler" {
  type = string
}
variable "runtime" {
  type    = string
  default = "nodejs22.x"
}
variable "pacote_zip" {
  type = string
}
variable "pacote_hash" {
  type = string
}
variable "memoria_mb" {
  type    = number
  default = 256
}
variable "timeout_s" {
  type    = number
  default = 30
}
variable "variaveis" {
  type    = map(string)
  default = {}
}
variable "kms_key_arn" {
  type = string
}
variable "retencao_logs_dias" {
  type    = number
  default = 30
}
variable "account_id" {
  type = string
}
variable "permissoes" {
  description = "Statements da política inline. Ação curinga é proibida (regra R3)."
  type = list(object({
    sid        = string
    actions    = list(string)
    resources  = list(string)
    conditions = optional(map(map(list(string))), {})
  }))
  default = []
  validation {
    condition     = alltrue(flatten([for p in var.permissoes : [for a in p.actions : a != "*" && !endswith(a, ":*")]]))
    error_message = "Ação curinga (\"*\" ou \"servico:*\") viola o menor privilégio (regra R3)."
  }
}

resource "aws_cloudwatch_log_group" "this" {
  #checkov:skip=CKV_AWS_338:Retenção de 30 dias no lab: custo e minimização de dados (LGPD); produção define por política (ADR-0007)
  name              = "/aws/lambda/${var.nome}"
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
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
      Condition = { StringEquals = { "aws:SourceAccount" = var.account_id } }
    }]
  })
}

locals {
  base = [
    {
      Sid      = "LogsProprios"
      Effect   = "Allow"
      Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
      Resource = "${aws_cloudwatch_log_group.this.arn}:*"
    },
    {
      # X-Ray não aceita recurso específico para estas ações.
      Sid      = "Traces"
      Effect   = "Allow"
      Action   = ["xray:PutTraceSegments", "xray:PutTelemetryRecords"]
      Resource = "*"
    },
    {
      Sid      = "DecifrarAmbiente"
      Effect   = "Allow"
      Action   = ["kms:Decrypt"]
      Resource = var.kms_key_arn
    },
  ]
  extras = [for p in var.permissoes : merge(
    { Sid = p.sid, Effect = "Allow", Action = p.actions, Resource = p.resources },
    length(p.conditions) == 0 ? {} : { Condition = p.conditions }
  )]
}

resource "aws_iam_role_policy" "this" {
  name = "${var.nome}-menor-privilegio"
  role = aws_iam_role.this.id
  policy = jsonencode({
    Version   = "2012-10-17"
    Statement = concat(local.base, local.extras)
  })
}

resource "aws_lambda_function" "this" {
  #checkov:skip=CKV_AWS_117:Fora de VPC para não exigir NAT Gateway (custo fixo); só fala com APIs regionais via IAM (ADR-0007)
  #checkov:skip=CKV_AWS_116:Invocação síncrona (API e Step Functions tratam o erro); DLQ não se aplica (ADR-0007)
  #checkov:skip=CKV_AWS_115:Concorrência reservada falha em contas com cota baixa; o limite está no throttling da API e na cota do gateway (ADR-0007)
  #checkov:skip=CKV_AWS_272:Assinatura de código fora do escopo do lab; o pacote vem do CI com SHA fixo (ADR-0007)
  function_name    = var.nome
  description      = var.descricao
  role             = aws_iam_role.this.arn
  handler          = var.handler
  runtime          = var.runtime
  architectures    = ["arm64"]
  filename         = var.pacote_zip
  source_code_hash = var.pacote_hash
  memory_size      = var.memoria_mb
  timeout          = var.timeout_s
  kms_key_arn      = var.kms_key_arn
  tags             = var.tags

  environment {
    variables = var.variaveis
  }

  tracing_config {
    mode = "Active"
  }

  logging_config {
    log_format = "JSON"
    log_group  = aws_cloudwatch_log_group.this.name
  }

  depends_on = [aws_iam_role_policy.this]
}

output "arn" {
  value = aws_lambda_function.this.arn
}
output "nome" {
  value = aws_lambda_function.this.function_name
}
output "invoke_arn" {
  value = aws_lambda_function.this.invoke_arn
}
output "role_arn" {
  value = aws_iam_role.this.arn
}
output "politica" {
  description = "Política efetiva, para os testes da raiz conferirem o menor privilégio entre funções."
  value       = jsondecode(aws_iam_role_policy.this.policy)
}
