# Plan com mock do módulo nucleo para as regras do plan em JSON (TT-S06 do T011 e regras do T003).
# O plataforma/agentes/tests/plan/plano.py roda este arquivo com `terraform test -json -verbose` e
# lê o plan do run abaixo, sem credencial da AWS. Os e-mails são sintéticos (example.com).
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
}

variables {
  nomes_dos_alarmes = ["00-plataforma-agentes-sintetico-a", "00-plataforma-agentes-sintetico-b"]
  teto_diario_usd   = 1.2
}

run "plano_para_regras" {
  command = plan
}
