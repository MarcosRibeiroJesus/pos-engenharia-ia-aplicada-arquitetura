# Plan com mock do módulo gateway para as regras do plan em JSON (T013; TT-G02 e regras do T003).
# O plataforma/agentes/tests/plan/test_gateway.py roda este arquivo com `terraform test -json
# -verbose` e lê o plan do run abaixo, sem credencial da AWS. Conta e ARNs são sintéticos.
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
  # T014: a política da role de fumaça cita o ARN do gateway; sem o mock, ela fica desconhecida
  # no plan e as regras TT-S01 e TT-S03 não conseguem lê-la.
  mock_resource "aws_bedrockagentcore_gateway" {
    defaults = {
      gateway_arn = "arn:aws:bedrock-agentcore:us-east-1:111111111111:gateway/00-plataforma-agentes-gateway-sintetico"
      gateway_id  = "00-plataforma-agentes-gateway-sintetico"
      gateway_url = "https://00-plataforma-agentes-gateway-sintetico.gateway.bedrock-agentcore.us-east-1.amazonaws.com/mcp"
    }
  }
}

variables {
  kms_key_arn        = "arn:aws:kms:us-east-1:111111111111:key/00000000-0000-0000-0000-000000000001"
  motor_politica_arn = "arn:aws:bedrock-agentcore:us-east-1:111111111111:policy-engine/p00_plataforma_agentes-sintetico"
  role_deploy_arn    = "arn:aws:iam::111111111111:role/00-plataforma-agentes-deploy-sintetica"
}

run "plano_para_regras" {
  command = plan
}
