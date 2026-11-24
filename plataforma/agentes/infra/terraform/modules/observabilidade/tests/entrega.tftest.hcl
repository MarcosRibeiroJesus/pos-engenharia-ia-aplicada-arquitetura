# Entrega de logs e traces do gateway (T016; RF-006, Art. VI, RNF-002; TT-O01, TT-O02).
# Logs de aplicação do gateway no grupo /aws/vendedlogs/bedrock-agentcore/gateway/APPLICATION_LOGS/
# <id do gateway>, com 7 dias de retenção e a chave da plataforma (ADR-0001, ADR-0012), e traces
# entregues ao X-Ray. O grupo aws/spans é da conta (infra/conta) e não nasce aqui. Conta, região e
# ARNs são sintéticos, fixos no mock, para a política de recurso ser conhecida no plan.
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
  mock_resource "aws_cloudwatch_log_group" {
    defaults = {
      arn = "arn:aws:logs:us-east-1:111111111111:log-group:/aws/vendedlogs/bedrock-agentcore/gateway/APPLICATION_LOGS/00-plataforma-agentes-gateway-sintetico"
    }
  }
  mock_resource "aws_cloudwatch_log_delivery_source" {
    defaults = {
      arn = "arn:aws:logs:us-east-1:111111111111:delivery-source:00-plataforma-agentes-sintetico"
    }
  }
  mock_resource "aws_cloudwatch_log_delivery_destination" {
    defaults = {
      arn = "arn:aws:logs:us-east-1:111111111111:delivery-destination:00-plataforma-agentes-sintetico"
    }
  }
}

variables {
  gateway_id  = "00-plataforma-agentes-gateway-sintetico"
  gateway_arn = "arn:aws:bedrock-agentcore:us-east-1:111111111111:gateway/00-plataforma-agentes-gateway-sintetico"
  kms_key_arn = "arn:aws:kms:us-east-1:111111111111:key/00000000-0000-0000-0000-000000000001"

  # Entradas dos alarmes (T017), obrigatórias no módulo; as regras delas estão no alarmes.tftest.hcl.
  policy_engine_id   = "p00_plataforma_agentes-sintetico"
  topico_alarmes_arn = "arn:aws:sns:us-east-1:111111111111:00-plataforma-agentes-alarmes"
  nomes_dos_alarmes = [
    "00-plataforma-agentes-gateway-system-errors",
    "00-plataforma-agentes-gateway-throttles",
    "00-plataforma-agentes-gateway-user-errors",
    "00-plataforma-agentes-motor-system-errors",
    "00-plataforma-agentes-motor-deny-decisions",
  ]
}

run "logs_de_aplicacao_do_gateway" {
  command = plan

  # TT-O01: a fonte é o gateway, com o tipo de log de aplicação.
  assert {
    condition     = aws_cloudwatch_log_delivery_source.logs_gateway.log_type == "APPLICATION_LOGS"
    error_message = "A fonte de entrega dos logs do gateway usa log_type = APPLICATION_LOGS (RF-006, TT-O01)."
  }
  assert {
    condition     = aws_cloudwatch_log_delivery_source.logs_gateway.resource_arn == var.gateway_arn
    error_message = "A fonte de entrega dos logs aponta para o ARN do gateway da plataforma (RF-006)."
  }
  assert {
    condition     = startswith(aws_cloudwatch_log_delivery_source.logs_gateway.name, "00-plataforma-agentes-")
    error_message = "A fonte de entrega leva o prefixo da chave do projeto (D-029)."
  }

  # TT-O01 e TT-O02: grupo com o nome do RF-006, 7 dias e a chave da plataforma.
  assert {
    condition     = aws_cloudwatch_log_group.gateway.name == "/aws/vendedlogs/bedrock-agentcore/gateway/APPLICATION_LOGS/${var.gateway_id}"
    error_message = "O grupo é /aws/vendedlogs/bedrock-agentcore/gateway/APPLICATION_LOGS/<id do gateway> (RF-006, ADR-0012)."
  }
  assert {
    condition     = aws_cloudwatch_log_group.gateway.retention_in_days == 7
    error_message = "O grupo de logs do gateway retém 7 dias (RF-006, RNF-002, TT-O02)."
  }
  assert {
    condition     = aws_cloudwatch_log_group.gateway.kms_key_id == var.kms_key_arn
    error_message = "O grupo de logs do gateway é cifrado com a chave da plataforma (Art. IV, ADR-0001)."
  }
  # Destroy sem sobras (Art. V): o grupo sai no destroy.
  assert {
    condition     = aws_cloudwatch_log_group.gateway.skip_destroy != true
    error_message = "O grupo de logs entra no destroy: skip_destroy não pode ser true (Art. V)."
  }
  assert {
    condition     = aws_cloudwatch_log_group.gateway.deletion_protection_enabled != true
    error_message = "O grupo de logs entra no destroy: deletion_protection_enabled não pode ser true (Art. V)."
  }

  # O destino é o grupo, e a entrega liga a fonte ao destino.
  assert {
    condition     = one(aws_cloudwatch_log_delivery_destination.logs_gateway.delivery_destination_configuration).destination_resource_arn == aws_cloudwatch_log_group.gateway.arn
    error_message = "O destino dos logs do gateway é o grupo de logs do RF-006."
  }
  assert {
    condition     = aws_cloudwatch_log_delivery.logs_gateway.delivery_source_name == aws_cloudwatch_log_delivery_source.logs_gateway.name
    error_message = "A entrega dos logs parte da fonte APPLICATION_LOGS do gateway."
  }
  assert {
    condition     = aws_cloudwatch_log_delivery.logs_gateway.delivery_destination_arn == aws_cloudwatch_log_delivery_destination.logs_gateway.arn
    error_message = "A entrega dos logs vai para o destino do grupo do gateway."
  }

  # Tags do módulo (D-031): project e managed-by vêm do default_tags do root.
  assert {
    condition = alltrue([
      aws_cloudwatch_log_group.gateway.tags["module"] == "observabilidade",
      aws_cloudwatch_log_delivery_source.logs_gateway.tags["module"] == "observabilidade",
      aws_cloudwatch_log_delivery_destination.logs_gateway.tags["module"] == "observabilidade",
      aws_cloudwatch_log_delivery.logs_gateway.tags["module"] == "observabilidade",
      aws_cloudwatch_log_delivery_source.traces_gateway.tags["module"] == "observabilidade",
      aws_cloudwatch_log_delivery_destination.traces_xray.tags["module"] == "observabilidade",
      aws_cloudwatch_log_delivery.traces_gateway.tags["module"] == "observabilidade",
    ])
    error_message = "Todo recurso do módulo leva module = observabilidade (D-031)."
  }
}

run "politica_de_entrega_no_grupo" {
  command = plan

  # ADR-0014: principal de serviço, conta concreta e ARNs exatos, sem curinga em nenhum dos dois.
  assert {
    condition     = jsondecode(aws_cloudwatch_log_resource_policy.entrega_gateway.policy_document).Statement[0].Principal.Service == "delivery.logs.amazonaws.com"
    error_message = "Só o serviço de entrega do CloudWatch Logs escreve no grupo (ADR-0014)."
  }
  assert {
    condition     = jsondecode(aws_cloudwatch_log_resource_policy.entrega_gateway.policy_document).Statement[0].Condition.StringEquals["aws:SourceAccount"] == "111111111111"
    error_message = "A política de entrega exige aws:SourceAccount com a conta concreta (ADR-0014)."
  }
  assert {
    condition = toset(jsondecode(aws_cloudwatch_log_resource_policy.entrega_gateway.policy_document).Statement[0].Condition.ArnEquals["aws:SourceArn"]) == toset([
      "arn:aws:logs:us-east-1:111111111111:delivery-source:00-plataforma-agentes-sintetico",
      "arn:aws:logs:us-east-1:111111111111:delivery-destination:00-plataforma-agentes-sintetico",
    ])
    error_message = "A política de entrega exige aws:SourceArn exato da fonte e do destino dos logs, com ArnEquals (ADR-0014)."
  }
  assert {
    condition = toset(jsondecode(aws_cloudwatch_log_resource_policy.entrega_gateway.policy_document).Statement[0].Action) == toset([
      "logs:CreateLogStream", "logs:PutLogEvents",
    ])
    error_message = "A entrega só cria streams e grava eventos (menor privilégio)."
  }
  assert {
    condition     = jsondecode(aws_cloudwatch_log_resource_policy.entrega_gateway.policy_document).Statement[0].Resource == "${aws_cloudwatch_log_group.gateway.arn}:log-stream:*"
    error_message = "A política de entrega vale só para as streams do grupo do gateway."
  }
  assert {
    condition     = length(jsondecode(aws_cloudwatch_log_resource_policy.entrega_gateway.policy_document).Statement) == 1
    error_message = "A política de entrega tem uma única declaração."
  }
}

run "traces_do_gateway_para_o_xray" {
  command = plan

  # TT-O01: traces do gateway entregues ao X-Ray (os spans caem no aws/spans da conta).
  assert {
    condition     = aws_cloudwatch_log_delivery_source.traces_gateway.log_type == "TRACES"
    error_message = "A fonte de traces do gateway usa log_type = TRACES (RF-006, TT-O01)."
  }
  assert {
    condition     = aws_cloudwatch_log_delivery_source.traces_gateway.resource_arn == var.gateway_arn
    error_message = "A fonte de traces aponta para o ARN do gateway da plataforma (RF-006)."
  }
  assert {
    condition     = aws_cloudwatch_log_delivery_destination.traces_xray.delivery_destination_type == "XRAY"
    error_message = "O destino dos traces é o X-Ray (RF-006, TT-O01)."
  }
  assert {
    condition     = length(aws_cloudwatch_log_delivery_destination.traces_xray.delivery_destination_configuration) == 0
    error_message = "O destino X-Ray não aponta para grupo: o aws/spans é da conta (infra/conta), não deste módulo."
  }
  assert {
    condition     = aws_cloudwatch_log_delivery.traces_gateway.delivery_source_name == aws_cloudwatch_log_delivery_source.traces_gateway.name
    error_message = "A entrega de traces parte da fonte TRACES do gateway."
  }
  assert {
    condition     = aws_cloudwatch_log_delivery.traces_gateway.delivery_destination_arn == aws_cloudwatch_log_delivery_destination.traces_xray.arn
    error_message = "A entrega de traces vai para o destino X-Ray."
  }
  # O grupo do módulo é o do gateway, não o aws/spans. Que ele é o ÚNICO grupo do módulo é conferido
  # no plan em JSON, pelo test_grupos_com_retencao_e_chave_e_sem_spans de
  # plataforma/agentes/tests/plan/test_observabilidade.py (o HCL só enxerga recursos pelo nome).
  assert {
    condition     = aws_cloudwatch_log_group.gateway.name != "aws/spans" && startswith(aws_cloudwatch_log_group.gateway.name, "/aws/vendedlogs/bedrock-agentcore/gateway/APPLICATION_LOGS/")
    error_message = "O grupo do módulo é o dos logs do gateway; o aws/spans é da conta (infra/conta)."
  }
}

# Entradas obrigatórias e validadas (padrão das T017 e T018: id e ARN do gateway sem padrão).
run "rejeita_gateway_arn_invalido" {
  command = plan

  variables {
    gateway_arn = "arn:aws:bedrock-agentcore:us-east-1:111111111111:gateway/*"
  }

  expect_failures = [var.gateway_arn]
}

run "rejeita_gateway_id_vazio" {
  command = plan

  variables {
    gateway_id = ""
  }

  expect_failures = [var.gateway_id]
}

run "rejeita_chave_que_nao_e_arn" {
  command = plan

  variables {
    kms_key_arn = "alias/00-plataforma-agentes-chave"
  }

  expect_failures = [var.kms_key_arn]
}
