# Plan com mock para as regras transversais de segurança e custo (T003; TT-S01, TT-S03, TT-S05,
# TT-K02, TT-K03). O plataforma/agentes/tests/plan/plano.py roda este arquivo com
# `terraform test -json -verbose` e lê o plan em JSON do run abaixo, sem credencial da AWS.
#
# override_during = plan deixa conhecidos no plan os valores dos mock_resource abaixo. Toda
# política que usa o ARN de um recurso criado no stack precisa de um mock_resource com o arn aqui:
# política desconhecida no plan reprova, porque a regra não consegue lê-la.
mock_provider "aws" {
  override_during = plan

  # A partir da T015, o root compõe nucleo, politica e gateway. Conta e ARNs são sintéticos, os
  # mesmos dos testes dos módulos: as políticas (chave, tópico, roles) ficam conhecidas no plan, e
  # o TT-P01 (test_composicao.py) compara o ARN do motor no gateway com o do módulo politica.
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

run "plano_para_regras" {
  command = plan
}
