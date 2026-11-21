# Plan com mock do módulo observabilidade para as regras do plan em JSON (T016; TT-O01 e regras do
# T003). O plataforma/agentes/tests/plan/test_observabilidade.py roda este arquivo com
# `terraform test -json -verbose` e lê o plan do run abaixo, sem credencial da AWS. Conta e ARNs são
# sintéticos; os ARNs ficam fixos no mock para a política de recurso ser conhecida no plan.
mock_provider "aws" {
  override_during = plan

  mock_data "aws_caller_identity" {
    defaults = {
      account_id = "111111111111"
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

  # Entradas dos alarmes (T017).
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

run "plano_para_regras" {
  command = plan
}
