# TT-P01 · composição do root real (T015; RF-002, ADR-0005, ADR-0011). O gateway é anulável no
# motor (ADR-0011) para o root do Floci; quem garante o motor no root real é este teste:
# - exatamente um policy_engine_configuration no gateway;
# - mode = ENFORCE por padrão;
# - o ARN vem de module.politica, e a chave do motor vem de module.nucleo.
# O vermelho com nulo é o plataforma/agentes/tests/plan/test_composicao.py (fixture de root que
# passa motor_politica_arn = null, que precisa reprovar a mesma regra sobre o plan em JSON).
# A T020 acrescenta aqui o id e o ARN do motor no contrato e no observabilidade (emenda 1, F3).
#
# Conta e ARNs sintéticos, fixos no mock: o ARN do motor é distinto de todo outro valor do plan,
# então a igualdade abaixo só vale se o gateway recebeu o output do módulo politica.
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
  mock_data "aws_ssm_parameter" {
    defaults = {
      value = "alerta-a@example.com,alerta-b@example.com"
    }
  }
  mock_resource "aws_kms_key" {
    defaults = {
      arn    = "arn:aws:kms:us-east-1:111111111111:key/00000000-0000-0000-0000-000000000001"
      key_id = "00000000-0000-0000-0000-000000000001"
    }
  }
  mock_resource "aws_sns_topic" {
    defaults = {
      arn = "arn:aws:sns:us-east-1:111111111111:00-plataforma-agentes-alarmes"
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
  mock_resource "aws_bedrockagentcore_policy_engine" {
    defaults = {
      policy_engine_arn = "arn:aws:bedrock-agentcore:us-east-1:111111111111:policy-engine/p00_plataforma_agentes-sintetico"
      policy_engine_id  = "p00_plataforma_agentes-sintetico"
    }
  }
}

variables {
  role_deploy_arn = "arn:aws:iam::111111111111:role/00-plataforma-agentes-deploy-sintetica"
}

run "gateway_com_motor_do_modulo_politica_em_enforce" {
  command = plan

  assert {
    condition     = length(module.gateway.policy_engine_configuration) == 1
    error_message = "TT-P01: o gateway do root real tem exatamente um policy_engine_configuration (ADR-0011)."
  }
  assert {
    condition     = module.gateway.policy_engine_configuration[0].mode == "ENFORCE"
    error_message = "TT-P01: o motor entra no gateway em ENFORCE por padrão (RF-002, ADR-0005)."
  }
  assert {
    condition     = module.gateway.policy_engine_configuration[0].arn == module.politica.policy_engine_arn
    error_message = "TT-P01: o ARN do motor no gateway vem de module.politica (ADR-0011)."
  }
  assert {
    condition     = module.politica.policy_engine_arn == "arn:aws:bedrock-agentcore:us-east-1:111111111111:policy-engine/p00_plataforma_agentes-sintetico"
    error_message = "TT-P01: o module.politica devolve o ARN do motor do mock (o ARN não vem de outro lugar)."
  }
  # TT-S02: gateway e motor cifrados com a chave do cliente do módulo nucleo (T010, ADR-0001).
  assert {
    condition     = module.politica.encryption_key_arn == module.nucleo.chave_arn && module.nucleo.chave_arn == "arn:aws:kms:us-east-1:111111111111:key/00000000-0000-0000-0000-000000000001"
    error_message = "TT-S02: o motor usa a chave da plataforma, vinda de module.nucleo (ADR-0001)."
  }
  assert {
    condition     = module.gateway.kms_key_arn == module.nucleo.chave_arn
    error_message = "TT-S02: o gateway usa a chave da plataforma, vinda de module.nucleo (ADR-0001)."
  }
}

# TT-P02 no ponto de entrada do root: LOG_ONLY sem calibracao = true reprova antes do módulo.
run "log_only_sem_calibracao_falha_no_root" {
  command = plan
  variables {
    modo_politica = "LOG_ONLY"
  }
  expect_failures = [var.modo_politica]
}

# Calibração (apply separado, fora da demonstração gravada): o modo chega ao gateway pelo módulo
# politica, onde fica a trava.
run "calibracao_leva_log_only_ao_gateway" {
  command = plan
  variables {
    modo_politica = "LOG_ONLY"
    calibracao    = true
  }

  assert {
    condition     = module.gateway.policy_engine_configuration[0].mode == "LOG_ONLY" && module.politica.modo_politica == "LOG_ONLY"
    error_message = "O modo do gateway vem do output modo_politica do módulo politica (ADR-0005)."
  }
}
