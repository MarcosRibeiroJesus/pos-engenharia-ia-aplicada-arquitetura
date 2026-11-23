# Regra R9 (ação que muda estado passa por gate e aprovação humana) e R2/R3/R8.
mock_provider "aws" {
  mock_resource "aws_iam_role" {
    defaults = { arn = "arn:aws:iam::123456789012:role/agenda-lab-aprovacao" }
  }
  mock_resource "aws_cloudwatch_log_group" {
    defaults = { arn = "arn:aws:logs:us-east-1:123456789012:log-group:/aws/vendedlogs/states/agenda-lab-aprovacao" }
  }
}

variables {
  nome                = "agenda-lab-aprovacao"
  executor_lambda_arn = "arn:aws:lambda:us-east-1:123456789012:function:agenda-lab-executor"
  timeout_aprovacao_s = 86400
  kms_key_arn         = "arn:aws:kms:us-east-1:123456789012:key/11111111-2222-3333-4444-555555555555"
  account_id          = "123456789012"
  tags                = { project = "assistente-agendamento", module = "02-apis-ia-generativa/arquitetura", "managed-by" = "terraform" }
}

run "espera_humano_com_token_e_timeout" {
  command = apply
  assert {
    condition     = jsondecode(aws_sfn_state_machine.this.definition).States.AguardarAprovacao.Resource == "arn:aws:states:::lambda:invoke.waitForTaskToken"
    error_message = "R9: o cancelamento espera a decisão humana via task token."
  }
  assert {
    condition     = jsondecode(aws_sfn_state_machine.this.definition).States.AguardarAprovacao.TimeoutSeconds == 86400
    error_message = "R9: pedido sem decisão expira (não fica pendurado)."
  }
  assert {
    condition     = jsondecode(aws_sfn_state_machine.this.definition).States.Decidir.Type == "Choice"
    error_message = "R9: a decisão é um Choice determinístico, não o modelo."
  }
  assert {
    condition     = jsondecode(aws_sfn_state_machine.this.definition).States.Decidir.Default == "Rejeitar"
    error_message = "R9: na dúvida, rejeita (fail closed)."
  }
}

run "standard_cifrado_e_observavel" {
  command = apply
  assert {
    condition     = aws_sfn_state_machine.this.type == "STANDARD"
    error_message = "Espera de horas exige Standard (Express dura no máximo 5 min)."
  }
  assert {
    condition     = aws_sfn_state_machine.this.encryption_configuration[0].type == "CUSTOMER_MANAGED_KMS_KEY"
    error_message = "R2: estado e histórico cifrados com a CMK."
  }
  assert {
    condition     = aws_sfn_state_machine.this.tracing_configuration[0].enabled && aws_sfn_state_machine.this.logging_configuration[0].level == "ALL" && !aws_sfn_state_machine.this.logging_configuration[0].include_execution_data
    error_message = "R8: traces e histórico completo, sem dados da execução (PII) no log."
  }
}

run "role_invoca_so_o_executor" {
  command = apply
  assert {
    condition = anytrue([
      for s in jsondecode(aws_iam_role_policy.this.policy).Statement :
      s.Sid == "InvocarExecutor" && s.Resource == var.executor_lambda_arn
    ])
    error_message = "R3: a máquina de estados só invoca o executor."
  }
}
