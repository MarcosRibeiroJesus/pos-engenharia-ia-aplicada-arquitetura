# Regras R3 (menor privilégio), R2 (criptografia), R8 (logs e traces) e R4 (tags).
mock_provider "aws" {
  mock_resource "aws_iam_role" {
    defaults = { arn = "arn:aws:iam::123456789012:role/agenda-lab-gateway" }
  }
  mock_resource "aws_cloudwatch_log_group" {
    defaults = { arn = "arn:aws:logs:us-east-1:123456789012:log-group:/aws/lambda/agenda-lab-gateway" }
  }
}

variables {
  nome        = "agenda-lab-gateway"
  descricao   = "Gateway de LLM"
  handler     = "index.handler"
  pacote_zip  = "/tmp/fake.zip"
  pacote_hash = "aGFzaA=="
  kms_key_arn = "arn:aws:kms:us-east-1:123456789012:key/11111111-2222-3333-4444-555555555555"
  account_id  = "123456789012"
  variaveis   = { TABELA = "t" }
  permissoes = [
    { sid = "Tabela", actions = ["dynamodb:GetItem", "dynamodb:UpdateItem"], resources = ["arn:aws:dynamodb:us-east-1:123456789012:table/t"] }
  ]
  tags = { project = "assistente-agendamento", module = "02-apis-ia-generativa/arquitetura", "managed-by" = "terraform" }
}

run "traces_logs_e_env_criptografados" {
  command = apply

  assert {
    condition     = aws_lambda_function.this.tracing_config[0].mode == "Active"
    error_message = "R8: X-Ray ativo."
  }
  assert {
    condition     = aws_lambda_function.this.kms_key_arn == var.kms_key_arn
    error_message = "R2: variáveis de ambiente cifradas com a CMK."
  }
  assert {
    condition     = aws_cloudwatch_log_group.this.kms_key_id == var.kms_key_arn && aws_cloudwatch_log_group.this.retention_in_days == 30
    error_message = "R2/R8: log group próprio, cifrado e com retenção (sem log eterno)."
  }
  assert {
    condition     = aws_lambda_function.this.logging_config[0].log_format == "JSON"
    error_message = "R8: logs estruturados em JSON."
  }
}

run "confianca_so_do_lambda_da_conta" {
  command = apply

  assert {
    condition     = jsondecode(aws_iam_role.this.assume_role_policy).Statement[0].Principal.Service == "lambda.amazonaws.com"
    error_message = "R3: só o serviço Lambda assume a role."
  }
  assert {
    condition     = jsondecode(aws_iam_role.this.assume_role_policy).Statement[0].Condition.StringEquals["aws:SourceAccount"] == "123456789012"
    error_message = "R3: confused deputy: confiança restrita à conta."
  }
}

run "politica_sem_curinga_de_acao" {
  command = apply

  assert {
    condition = alltrue(flatten([
      for s in jsondecode(aws_iam_role_policy.this.policy).Statement : [
        for a in flatten([s.Action]) : a != "*" && !endswith(a, ":*")
      ]
    ]))
    error_message = "R3: nenhuma ação curinga (service:* ou *)."
  }
  assert {
    condition = anytrue([
      for s in jsondecode(aws_iam_role_policy.this.policy).Statement :
      s.Sid == "LogsProprios" && s.Resource == "${aws_cloudwatch_log_group.this.arn}:*"
    ])
    error_message = "R3: escrita de log só no próprio log group."
  }
}

run "rejeita_permissao_curinga" {
  command = plan
  variables {
    permissoes = [{ sid = "Ruim", actions = ["dynamodb:*"], resources = ["*"] }]
  }
  expect_failures = [var.permissoes]
}

run "rejeita_tags_incompletas" {
  command = plan
  variables {
    tags = { project = "x", module = "y" }
  }
  expect_failures = [var.tags]
}
