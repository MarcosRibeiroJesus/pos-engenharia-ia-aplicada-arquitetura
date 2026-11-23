# API REST do assistente. Nenhuma rota anônima: SigV4 (AWS_IAM) + chave de API do canal
# (usage plan com cota diária) + política de recurso que nega principais de fora da conta.
# Quem chama é o backend do canal (web, WhatsApp), que autentica o paciente (ADR-0003).
variable "nome" {
  type = string
}
variable "stage" {
  type    = string
  default = "lab"
}
variable "orquestrador_invoke_arn" {
  type = string
}
variable "orquestrador_nome" {
  type = string
}
variable "kms_key_arn" {
  type = string
}
variable "account_id" {
  type = string
}
variable "region" {
  type = string
}
variable "partition" {
  type = string
}
variable "max_caracteres_mensagem" {
  type    = number
  default = 2000
}
variable "cota_diaria_requisicoes" {
  type    = number
  default = 500
}
variable "throttling_rps" {
  type    = number
  default = 5
}
variable "throttling_burst" {
  type    = number
  default = 10
}
variable "retencao_logs_dias" {
  type    = number
  default = 30
}
variable "configurar_conta_logs" {
  description = "Cria a role de logs do API Gateway na conta (configuração única por região; ADR-0007)."
  type        = bool
  default     = true
}

resource "aws_api_gateway_rest_api" "this" {
  name        = var.nome
  description = "Assistente de agendamento (dados sintéticos)"
  tags        = var.tags
  endpoint_configuration {
    types = ["REGIONAL"]
  }
  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_api_gateway_rest_api_policy" "this" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "SoPrincipaisDaConta"
        Effect    = "Allow"
        Principal = { AWS = "arn:${var.partition}:iam::${var.account_id}:root" }
        Action    = "execute-api:Invoke"
        Resource  = "${aws_api_gateway_rest_api.this.execution_arn}/*"
      },
      {
        Sid       = "NegarForaDaConta"
        Effect    = "Deny"
        Principal = "*"
        Action    = "execute-api:Invoke"
        Resource  = "${aws_api_gateway_rest_api.this.execution_arn}/*"
        Condition = { StringNotEquals = { "aws:PrincipalAccount" = var.account_id } }
      }
    ]
  })
}

# ---------- recursos: /v1/mensagens, /v1/aprovacoes/{acaoId}, /v1/usuarios/{usuarioId}/memoria
resource "aws_api_gateway_resource" "v1" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  parent_id   = aws_api_gateway_rest_api.this.root_resource_id
  path_part   = "v1"
}
resource "aws_api_gateway_resource" "mensagens" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  parent_id   = aws_api_gateway_resource.v1.id
  path_part   = "mensagens"
}
resource "aws_api_gateway_resource" "aprovacoes" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  parent_id   = aws_api_gateway_resource.v1.id
  path_part   = "aprovacoes"
}
resource "aws_api_gateway_resource" "aprovacao" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  parent_id   = aws_api_gateway_resource.aprovacoes.id
  path_part   = "{acaoId}"
}
resource "aws_api_gateway_resource" "usuarios" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  parent_id   = aws_api_gateway_resource.v1.id
  path_part   = "usuarios"
}
resource "aws_api_gateway_resource" "usuario" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  parent_id   = aws_api_gateway_resource.usuarios.id
  path_part   = "{usuarioId}"
}
resource "aws_api_gateway_resource" "memoria" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  parent_id   = aws_api_gateway_resource.usuario.id
  path_part   = "memoria"
}

resource "aws_api_gateway_request_validator" "corpo" {
  name                        = "corpo-e-parametros"
  rest_api_id                 = aws_api_gateway_rest_api.this.id
  validate_request_body       = true
  validate_request_parameters = true
}

resource "aws_api_gateway_model" "mensagem" {
  rest_api_id  = aws_api_gateway_rest_api.this.id
  name         = "Mensagem"
  content_type = "application/json"
  schema = jsonencode({
    "$schema"            = "http://json-schema.org/draft-04/schema#"
    type                 = "object"
    additionalProperties = false
    required             = ["usuarioId", "sessaoId", "texto"]
    properties = {
      usuarioId = { type = "string", pattern = "^[a-z0-9-]{3,64}$" }
      sessaoId  = { type = "string", pattern = "^[a-z0-9-]{3,64}$" }
      texto     = { type = "string", minLength = 1, maxLength = var.max_caracteres_mensagem }
      anexos = {
        type     = "array"
        maxItems = 2
        items    = { type = "string", pattern = "^[a-z0-9._/-]{1,200}$" }
      }
    }
  })
}

resource "aws_api_gateway_model" "decisao" {
  rest_api_id  = aws_api_gateway_rest_api.this.id
  name         = "Decisao"
  content_type = "application/json"
  schema = jsonencode({
    "$schema"            = "http://json-schema.org/draft-04/schema#"
    type                 = "object"
    additionalProperties = false
    required             = ["decisao", "aprovadorId"]
    properties = {
      decisao     = { type = "string", enum = ["aprovar", "rejeitar"] }
      aprovadorId = { type = "string", pattern = "^[a-z0-9-]{3,64}$" }
      motivo      = { type = "string", maxLength = 500 }
    }
  })
}

resource "aws_api_gateway_method" "mensagens" {
  rest_api_id          = aws_api_gateway_rest_api.this.id
  resource_id          = aws_api_gateway_resource.mensagens.id
  http_method          = "POST"
  authorization        = "AWS_IAM"
  api_key_required     = true
  request_validator_id = aws_api_gateway_request_validator.corpo.id
  request_models       = { "application/json" = aws_api_gateway_model.mensagem.name }
}

resource "aws_api_gateway_method" "aprovacao" {
  rest_api_id          = aws_api_gateway_rest_api.this.id
  resource_id          = aws_api_gateway_resource.aprovacao.id
  http_method          = "POST"
  authorization        = "AWS_IAM"
  api_key_required     = true
  request_validator_id = aws_api_gateway_request_validator.corpo.id
  request_models       = { "application/json" = aws_api_gateway_model.decisao.name }
  request_parameters   = { "method.request.path.acaoId" = true }
}

resource "aws_api_gateway_method" "apagar_memoria" {
  rest_api_id          = aws_api_gateway_rest_api.this.id
  resource_id          = aws_api_gateway_resource.memoria.id
  http_method          = "DELETE"
  authorization        = "AWS_IAM"
  api_key_required     = true
  request_validator_id = aws_api_gateway_request_validator.corpo.id
  request_parameters   = { "method.request.path.usuarioId" = true }
}

locals {
  metodos = {
    mensagens      = aws_api_gateway_method.mensagens
    aprovacao      = aws_api_gateway_method.aprovacao
    apagar_memoria = aws_api_gateway_method.apagar_memoria
  }
}

resource "aws_api_gateway_integration" "this" {
  for_each                = local.metodos
  rest_api_id             = aws_api_gateway_rest_api.this.id
  resource_id             = each.value.resource_id
  http_method             = each.value.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.orquestrador_invoke_arn
}

resource "aws_lambda_permission" "api" {
  statement_id  = "PermitirApiGateway"
  action        = "lambda:InvokeFunction"
  function_name = var.orquestrador_nome
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.this.execution_arn}/${var.stage}/*/v1/*"
}

resource "aws_api_gateway_deployment" "this" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  triggers = {
    redeploy = sha1(jsonencode([
      aws_api_gateway_model.mensagem.schema, aws_api_gateway_model.decisao.schema,
      [for k, m in local.metodos : [m.id, m.authorization, m.api_key_required]],
      [for k, i in aws_api_gateway_integration.this : i.id],
    ]))
  }
  lifecycle {
    create_before_destroy = true
  }
}

# ---------- logs de acesso (sem corpo: o corpo tem texto do paciente)
resource "aws_cloudwatch_log_group" "acesso" {
  #checkov:skip=CKV_AWS_338:Retenção de 30 dias no lab: custo e minimização de dados (LGPD); produção define por política (ADR-0007)
  name              = "/aws/apigateway/${var.nome}/acesso"
  retention_in_days = var.retencao_logs_dias
  kms_key_id        = var.kms_key_arn
  tags              = var.tags
}

resource "aws_iam_role" "logs_conta" {
  count = var.configurar_conta_logs ? 1 : 0
  name  = "${var.nome}-apigw-logs"
  tags  = var.tags
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "apigateway.amazonaws.com" }
      Action    = "sts:AssumeRole"
      Condition = { StringEquals = { "aws:SourceAccount" = var.account_id } }
    }]
  })
}

resource "aws_iam_role_policy" "logs_conta" {
  count = var.configurar_conta_logs ? 1 : 0
  name  = "logs-do-api-gateway"
  role  = aws_iam_role.logs_conta[0].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid    = "LogsDoApiGateway"
      Effect = "Allow"
      Action = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:DescribeLogGroups", "logs:DescribeLogStreams",
      "logs:PutLogEvents", "logs:GetLogEvents", "logs:FilterLogEvents"]
      Resource = "arn:${var.partition}:logs:${var.region}:${var.account_id}:log-group:*"
    }]
  })
}

resource "aws_api_gateway_account" "this" {
  count               = var.configurar_conta_logs ? 1 : 0
  cloudwatch_role_arn = aws_iam_role.logs_conta[0].arn
  depends_on          = [aws_iam_role_policy.logs_conta]
}

resource "aws_api_gateway_stage" "this" {
  #checkov:skip=CKV_AWS_120:Cache do API Gateway tem custo por hora (custo fixo ocioso); respostas são por usuário e não cacheáveis
  #checkov:skip=CKV2_AWS_29:WAF é opcional por custo fixo (módulo waf_borda, ADR-0005)
  #checkov:skip=CKV2_AWS_51:Certificado de cliente (mTLS) não se aplica: o chamador assina com SigV4
  deployment_id        = aws_api_gateway_deployment.this.id
  rest_api_id          = aws_api_gateway_rest_api.this.id
  stage_name           = var.stage
  xray_tracing_enabled = true
  tags                 = var.tags

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.acesso.arn
    format = jsonencode({
      requestId = "$context.requestId", ip = "$context.identity.sourceIp", caller = "$context.identity.caller",
      apiKeyId  = "$context.identity.apiKeyId", metodo = "$context.httpMethod", rota = "$context.resourcePath",
      status    = "$context.status", latenciaMs = "$context.responseLatency", erroValidacao = "$context.error.validationErrorString",
      wafStatus = "$context.wafResponseCode", xray = "$context.xrayTraceId"
    })
  }

  depends_on = [aws_api_gateway_account.this]
}

resource "aws_api_gateway_method_settings" "todas" {
  #checkov:skip=CKV_AWS_225:Cache do stage cobra por hora (custo fixo); respostas são por usuário e não cacheáveis
  rest_api_id = aws_api_gateway_rest_api.this.id
  stage_name  = aws_api_gateway_stage.this.stage_name
  method_path = "*/*"
  settings {
    metrics_enabled        = true
    logging_level          = "ERROR"
    data_trace_enabled     = false
    throttling_rate_limit  = var.throttling_rps
    throttling_burst_limit = var.throttling_burst
  }
}

resource "aws_api_gateway_usage_plan" "this" {
  name = "${var.nome}-canal"
  tags = var.tags
  api_stages {
    api_id = aws_api_gateway_rest_api.this.id
    stage  = aws_api_gateway_stage.this.stage_name
  }
  quota_settings {
    limit  = var.cota_diaria_requisicoes
    period = "DAY"
  }
  throttle_settings {
    rate_limit  = var.throttling_rps
    burst_limit = var.throttling_burst
  }
}

resource "aws_api_gateway_api_key" "canal" {
  name    = "${var.nome}-canal-lab"
  enabled = true
  tags    = var.tags
}

resource "aws_api_gateway_usage_plan_key" "canal" {
  key_id        = aws_api_gateway_api_key.canal.id
  key_type      = "API_KEY"
  usage_plan_id = aws_api_gateway_usage_plan.this.id
}

output "id" {
  value = aws_api_gateway_rest_api.this.id
}
output "nome" {
  value = aws_api_gateway_rest_api.this.name
}
output "stage" {
  value = aws_api_gateway_stage.this.stage_name
}
output "stage_arn" {
  value = aws_api_gateway_stage.this.arn
}
output "url" {
  value = aws_api_gateway_stage.this.invoke_url
}
output "api_key_id" {
  description = "Id da chave do canal (o valor fica só no API Gateway; ler com get-api-key --include-value)."
  value       = aws_api_gateway_api_key.canal.id
}
