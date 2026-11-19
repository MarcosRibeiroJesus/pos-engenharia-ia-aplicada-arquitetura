# Regras R1 (nada público), R8 (logs e traces), R10 (defesa na borda) e cotas.
mock_provider "aws" {
  mock_resource "aws_api_gateway_rest_api" {
    defaults = {
      id               = "abc123"
      root_resource_id = "root01"
      execution_arn    = "arn:aws:execute-api:us-east-1:123456789012:abc123"
    }
  }
  mock_resource "aws_cloudwatch_log_group" {
    defaults = { arn = "arn:aws:logs:us-east-1:123456789012:log-group:/aws/apigateway/agenda-lab/acesso" }
  }
  mock_resource "aws_iam_role" {
    defaults = { arn = "arn:aws:iam::123456789012:role/agenda-lab-apigw-logs" }
  }
}

variables {
  nome                    = "agenda-lab"
  orquestrador_invoke_arn = "arn:aws:apigateway:us-east-1:lambda:path/2015-03-31/functions/arn:aws:lambda:us-east-1:123456789012:function:agenda-lab-orquestrador/invocations"
  orquestrador_nome       = "agenda-lab-orquestrador"
  kms_key_arn             = "arn:aws:kms:us-east-1:123456789012:key/11111111-2222-3333-4444-555555555555"
  account_id              = "123456789012"
  region                  = "us-east-1"
  partition               = "aws"
  max_caracteres_mensagem = 2000
  cota_diaria_requisicoes = 500
  tags                    = { project = "assistente-agendamento", module = "02-apis-ia-generativa/arquitetura", "managed-by" = "terraform" }
}

run "todas_as_rotas_exigem_iam_e_chave" {
  command = apply
  assert {
    condition = alltrue([
      aws_api_gateway_method.mensagens.authorization == "AWS_IAM",
      aws_api_gateway_method.aprovacao.authorization == "AWS_IAM",
      aws_api_gateway_method.apagar_memoria.authorization == "AWS_IAM",
    ])
    error_message = "R1: nenhuma rota anônima; SigV4 em todas."
  }
  assert {
    condition = alltrue([
      aws_api_gateway_method.mensagens.api_key_required,
      aws_api_gateway_method.aprovacao.api_key_required,
      aws_api_gateway_method.apagar_memoria.api_key_required,
    ])
    error_message = "Cota por cliente: chave de API exigida (usage plan)."
  }
}

run "politica_de_recurso_restringe_a_conta" {
  command = apply
  assert {
    condition = anytrue([
      for s in jsondecode(aws_api_gateway_rest_api_policy.this.policy).Statement :
      s.Effect == "Deny" && s.Condition.StringNotEquals["aws:PrincipalAccount"] == "123456789012"
    ])
    error_message = "R1: nega qualquer principal fora da conta."
  }
  assert {
    condition     = aws_api_gateway_rest_api.this.endpoint_configuration[0].types[0] == "REGIONAL"
    error_message = "Endpoint regional (WAF regional; sem CloudFront implícito)."
  }
}

run "validacao_de_corpo_na_borda" {
  command = apply
  assert {
    condition     = aws_api_gateway_request_validator.corpo.validate_request_body
    error_message = "R10: corpo validado por schema antes de chegar ao Lambda."
  }
  assert {
    condition     = jsondecode(aws_api_gateway_model.mensagem.schema).properties.texto.maxLength == 2000
    error_message = "R10: tamanho máximo do texto na borda."
  }
  assert {
    condition     = jsondecode(aws_api_gateway_model.mensagem.schema).additionalProperties == false
    error_message = "R10: campos extras rejeitados."
  }
}

run "stage_com_logs_traces_e_throttling" {
  command = apply
  assert {
    condition     = aws_api_gateway_stage.this.xray_tracing_enabled
    error_message = "R8: X-Ray no stage."
  }
  assert {
    condition     = aws_api_gateway_stage.this.access_log_settings[0].destination_arn == aws_cloudwatch_log_group.acesso.arn && aws_cloudwatch_log_group.acesso.kms_key_id == var.kms_key_arn
    error_message = "R8/R2: log de acesso cifrado."
  }
  assert {
    condition     = aws_api_gateway_method_settings.todas.settings[0].throttling_rate_limit <= 10 && !aws_api_gateway_method_settings.todas.settings[0].data_trace_enabled
    error_message = "Throttling no stage e sem log de corpo (PII)."
  }
  assert {
    condition     = aws_api_gateway_usage_plan.this.quota_settings[0].limit == 500 && aws_api_gateway_usage_plan.this.quota_settings[0].period == "DAY"
    error_message = "Cota diária por cliente."
  }
}
