# Plan com mock do módulo politica para as regras do plan em JSON (T015; regras do T003).
# O plataforma/agentes/tests/plan/test_politica.py roda este arquivo com `terraform test -json
# -verbose` e lê o plan do run abaixo, sem credencial da AWS. Conta e ARNs são sintéticos.
mock_provider "aws" {
  override_during = plan

  mock_resource "aws_bedrockagentcore_policy_engine" {
    defaults = {
      policy_engine_arn = "arn:aws:bedrock-agentcore:us-east-1:111111111111:policy-engine/p00_plataforma_agentes-sintetico"
      policy_engine_id  = "p00_plataforma_agentes-sintetico"
    }
  }
}

variables {
  encryption_key_arn = "arn:aws:kms:us-east-1:111111111111:key/00000000-0000-0000-0000-000000000001"
}

run "plano_para_regras" {
  command = plan
}
