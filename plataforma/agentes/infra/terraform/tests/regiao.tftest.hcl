# Região do stack (RNF-006, TT-T03): us-east-1 por padrão, onde estão Policy, guardrails no Policy
# e Evaluations do AgentCore nos anúncios consultados no plano.
mock_provider "aws" {}

# Desde a T015 o root compõe o gateway, que exige a role de deploy (sintética aqui).
variables {
  role_deploy_arn = "arn:aws:iam::111111111111:role/00-plataforma-agentes-deploy-sintetica"
}

run "regiao_padrao_us_east_1" {
  command = plan
  assert {
    condition     = var.regiao == "us-east-1"
    error_message = "A região padrão é us-east-1 (RNF-006)."
  }
}

run "regiao_fora_do_formato_falha" {
  command = plan
  variables {
    regiao = "US East (N. Virginia)"
  }
  expect_failures = [var.regiao]
}
