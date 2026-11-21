# Gateway MCP da plataforma (T013; RF-001, RF-003, Art. IV; TT-G01, TT-G02, TT-S02 gateway).
# ADR-0003 (AWS_IAM na entrada), ADR-0010 (versões MCP), ADR-0011 (entrada do motor anulável) e
# ADR-0014 (sem Principal curinga). A conta, a região e os ARNs são sintéticos, fixos no mock, para
# as políticas serem conhecidas no plan e os asserts lerem o JSON delas.
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
  mock_resource "aws_iam_role" {
    defaults = {
      arn = "arn:aws:iam::111111111111:role/00-plataforma-agentes-gateway-execucao"
    }
  }
  mock_resource "aws_bedrockagentcore_gateway" {
    defaults = {
      gateway_arn = "arn:aws:bedrock-agentcore:us-east-1:111111111111:gateway/00-plataforma-agentes-gateway-sintetico"
      gateway_id  = "00-plataforma-agentes-gateway-sintetico"
      gateway_url = "https://00-plataforma-agentes-gateway-sintetico.gateway.bedrock-agentcore.us-east-1.amazonaws.com/mcp"
    }
  }
}

variables {
  kms_key_arn = "arn:aws:kms:us-east-1:111111111111:key/00000000-0000-0000-0000-000000000001"
}

run "gateway_mcp_com_iam_e_chave_da_plataforma" {
  command = plan

  # TT-G02: o recurso é referenciado como instância única; count ou for_each quebram estes asserts.
  # A contagem de recursos do tipo no plan inteiro fica no test_gateway.py (plan em JSON).
  assert {
    condition     = length(aws_bedrockagentcore_gateway.plataforma[*]) == 1
    error_message = "Exatamente um aws_bedrockagentcore_gateway, sem count nem for_each (RF-001, TT-G02)."
  }
  assert {
    condition     = aws_bedrockagentcore_gateway.plataforma.protocol_type == "MCP"
    error_message = "O gateway usa protocol_type = MCP (RF-001, TT-G02)."
  }
  assert {
    condition     = aws_bedrockagentcore_gateway.plataforma.name == "00-plataforma-agentes-gateway"
    error_message = "O gateway leva o prefixo da chave do projeto no nome (D-029)."
  }
  # TT-G01: IAM (SigV4) na entrada, sem autorizador JWT.
  assert {
    condition     = aws_bedrockagentcore_gateway.plataforma.authorizer_type == "AWS_IAM"
    error_message = "O autorizador de entrada é AWS_IAM (RF-003, ADR-0003, TT-G01)."
  }
  assert {
    condition     = length(aws_bedrockagentcore_gateway.plataforma.authorizer_configuration) == 0
    error_message = "Com AWS_IAM, o gateway não tem authorizer_configuration de JWT (ADR-0003)."
  }
  # TT-S02 (gateway): cifrado com a chave do cliente da plataforma (T010, ADR-0001).
  assert {
    condition     = aws_bedrockagentcore_gateway.plataforma.kms_key_arn == var.kms_key_arn
    error_message = "O gateway usa kms_key_arn da chave da plataforma (Art. IV, ADR-0001, TT-S02)."
  }
  # ADR-0010: as duas versões mais recentes por padrão.
  assert {
    condition     = toset(aws_bedrockagentcore_gateway.plataforma.protocol_configuration[0].mcp[0].supported_versions) == toset(["2025-11-25", "2026-07-28"])
    error_message = "supported_versions padrão é [2025-11-25, 2026-07-28] (ADR-0010)."
  }
  # Busca semântica é cobrada à parte; DEBUG levaria o detalhe do erro ao cliente (plano, Gateway).
  assert {
    condition     = try(aws_bedrockagentcore_gateway.plataforma.protocol_configuration[0].mcp[0].search_type, null) != "SEMANTIC"
    error_message = "O gateway não liga search_type = SEMANTIC (custo à parte; plano, Gateway)."
  }
  assert {
    condition     = try(aws_bedrockagentcore_gateway.plataforma.exception_level, null) != "DEBUG"
    error_message = "O gateway não usa exception_level = DEBUG (o detalhe do erro iria ao cliente)."
  }
  assert {
    condition     = aws_bedrockagentcore_gateway.plataforma.role_arn == aws_iam_role.execucao.arn
    error_message = "O gateway usa a role de execução do módulo."
  }
  assert {
    condition     = aws_bedrockagentcore_gateway.plataforma.tags["module"] == "gateway" && aws_iam_role.execucao.tags["module"] == "gateway"
    error_message = "Gateway e role levam a tag module = gateway (D-031); project e managed-by vêm do default_tags."
  }
  assert {
    condition     = output.gateway_arn == aws_bedrockagentcore_gateway.plataforma.gateway_arn && output.gateway_id == aws_bedrockagentcore_gateway.plataforma.gateway_id && output.gateway_url == aws_bedrockagentcore_gateway.plataforma.gateway_url
    error_message = "O módulo expõe o ARN, o id e a URL do gateway (contrato, observabilidade e role de fumaça)."
  }
}

# ADR-0011: sem o ARN do motor (root do Floci), o bloco não existe.
run "sem_motor_nao_ha_policy_engine_configuration" {
  command = plan

  assert {
    condition     = length(aws_bedrockagentcore_gateway.plataforma.policy_engine_configuration) == 0
    error_message = "Com motor_politica_arn nulo, o gateway não tem policy_engine_configuration (ADR-0011)."
  }
}

# ADR-0011 e ADR-0005: com o ARN preenchido, o bloco existe, com mode = var.modo_politica (ENFORCE).
run "com_motor_ha_policy_engine_configuration_em_enforce" {
  command = plan
  variables {
    motor_politica_arn = "arn:aws:bedrock-agentcore:us-east-1:111111111111:policy-engine/p00_plataforma_agentes-sintetico"
  }

  assert {
    condition     = length(aws_bedrockagentcore_gateway.plataforma.policy_engine_configuration) == 1
    error_message = "Com motor_politica_arn preenchido, o gateway tem um policy_engine_configuration (ADR-0011)."
  }
  assert {
    condition     = aws_bedrockagentcore_gateway.plataforma.policy_engine_configuration[0].arn == var.motor_politica_arn
    error_message = "O policy_engine_configuration usa o ARN do motor recebido (ADR-0011)."
  }
  assert {
    condition     = aws_bedrockagentcore_gateway.plataforma.policy_engine_configuration[0].mode == "ENFORCE"
    error_message = "O modo padrão do motor é ENFORCE (RF-002, ADR-0005)."
  }
}

run "modo_do_motor_segue_a_variavel" {
  command = plan
  variables {
    motor_politica_arn = "arn:aws:bedrock-agentcore:us-east-1:111111111111:policy-engine/p00_plataforma_agentes-sintetico"
    modo_politica      = "LOG_ONLY"
  }

  assert {
    condition     = aws_bedrockagentcore_gateway.plataforma.policy_engine_configuration[0].mode == var.modo_politica
    error_message = "mode = var.modo_politica (ADR-0011); a trava de LOG_ONLY com calibracao é do módulo politica (T015)."
  }
}

# Role de execução: confiada só pelo AgentCore da conta, sem permissão de invocar alvos (plano, Role
# de execução do gateway; ADR-0003) e só com bedrock:InvokeGuardrailChecks, num recurso da conta (R4).
run "role_de_execucao_sem_invocar_alvos" {
  command = plan

  assert {
    condition     = aws_iam_role.execucao.name == "00-plataforma-agentes-gateway-execucao"
    error_message = "A role de execução leva o prefixo da chave (D-029)."
  }
  assert {
    condition = alltrue([for d in jsondecode(aws_iam_role.execucao.assume_role_policy).Statement :
    d.Effect == "Allow" && d.Principal == { Service = "bedrock-agentcore.amazonaws.com" } && d.Action == "sts:AssumeRole"])
    error_message = "Só o principal de serviço bedrock-agentcore.amazonaws.com assume a role (ADR-0014)."
  }
  assert {
    condition = alltrue([for d in jsondecode(aws_iam_role.execucao.assume_role_policy).Statement :
    d.Condition.StringEquals["aws:SourceAccount"] == "111111111111"])
    error_message = "A confiança leva aws:SourceAccount com a conta concreta, sem curinga (ADR-0014)."
  }
  assert {
    condition     = length(jsondecode(aws_iam_role_policy.execucao.policy).Statement) == 1
    error_message = "A role de execução tem uma única declaração: InvokeGuardrailChecks."
  }
  assert {
    condition = alltrue([for d in jsondecode(aws_iam_role_policy.execucao.policy).Statement :
    d.Effect == "Allow" && flatten([d.Action]) == ["bedrock:InvokeGuardrailChecks"]])
    error_message = "A role só tem bedrock:InvokeGuardrailChecks: nada de lambda:InvokeFunction, InvokeAgentRuntime ou curinga (invocar alvos é concedido por cada produto)."
  }
  assert {
    condition = alltrue([for d in jsondecode(aws_iam_role_policy.execucao.policy).Statement :
      alltrue([for r in flatten([d.Resource]) :
    r != "*" && startswith(r, "arn:aws:bedrock:us-east-1:111111111111:")])])
    error_message = "InvokeGuardrailChecks fica num recurso da região e da conta, nunca \"*\" (R4)."
  }
  assert {
    condition     = aws_iam_role_policy.execucao.role == aws_iam_role.execucao.name
    error_message = "A política inline é da role de execução."
  }
}

# TT-G01: nada além de AWS_IAM na entrada.
run "authorizer_none_falha" {
  command = plan
  variables {
    authorizer_type = "NONE"
  }
  expect_failures = [var.authorizer_type]
}

run "authorizer_authenticate_only_falha" {
  command = plan
  variables {
    authorizer_type = "AUTHENTICATE_ONLY"
  }
  expect_failures = [var.authorizer_type]
}

run "authorizer_custom_jwt_falha" {
  command = plan
  variables {
    authorizer_type = "CUSTOM_JWT"
  }
  expect_failures = [var.authorizer_type]
}

run "kms_key_arn_que_nao_e_de_chave_falha" {
  command = plan
  variables {
    kms_key_arn = "alias/aws/bedrock-agentcore"
  }
  expect_failures = [var.kms_key_arn]
}

run "versoes_mcp_vazia_falha" {
  command = plan
  variables {
    versoes_mcp = []
  }
  expect_failures = [var.versoes_mcp]
}

run "versao_mcp_desconhecida_falha" {
  command = plan
  variables {
    versoes_mcp = ["2026-07-28", "2099-01-01"]
  }
  expect_failures = [var.versoes_mcp]
}

run "modo_politica_desconhecido_falha" {
  command = plan
  variables {
    modo_politica = "DESLIGADO"
  }
  expect_failures = [var.modo_politica]
}
