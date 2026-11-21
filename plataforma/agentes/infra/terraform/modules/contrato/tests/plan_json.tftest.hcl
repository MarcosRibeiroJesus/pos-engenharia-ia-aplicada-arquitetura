# Plan com mock do módulo contrato para o TS-01 e as regras do T003 (T018). O
# plataforma/agentes/tests/contrato/test_contrato.py roda este arquivo com
# `terraform test -json -verbose` e lê o plan do run abaixo, sem credencial da AWS. Conta e ARNs
# são sintéticos.
mock_provider "aws" {
  override_during = plan

  mock_data "aws_region" {
    defaults = {
      region = "us-east-1"
    }
  }
}

variables {
  gateway_arn        = "arn:aws:bedrock-agentcore:us-east-1:111111111111:gateway/00-plataforma-agentes-gateway-sintetico"
  gateway_url        = "https://00-plataforma-agentes-gateway-sintetico.gateway.bedrock-agentcore.us-east-1.amazonaws.com/mcp"
  gateway_id         = "00-plataforma-agentes-gateway-sintetico"
  motor_politica_id  = "p00_plataforma_agentes-sintetico"
  motor_politica_arn = "arn:aws:bedrock-agentcore:us-east-1:111111111111:policy-engine/p00_plataforma_agentes-sintetico"
  versoes_mcp        = ["2025-11-25", "2026-07-28"]
  grupo_log_gateway  = "/aws/vendedlogs/bedrock-agentcore/gateway/APPLICATION_LOGS/00-plataforma-agentes-gateway-sintetico"
  topico_alarmes_arn = "arn:aws:sns:us-east-1:111111111111:00-plataforma-agentes-alarmes"
  chave_kms_arn      = "arn:aws:kms:us-east-1:111111111111:key/00000000-0000-0000-0000-000000000001"
}

run "plano_para_regras" {
  command = plan
}
