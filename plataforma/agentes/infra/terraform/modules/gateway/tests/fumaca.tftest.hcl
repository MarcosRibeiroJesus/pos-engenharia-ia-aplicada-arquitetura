# Role de fumaça da plataforma (T014; RF-002, RNF-001, RNF-002; TT-R09). Plano, "Role de fumaça",
# e emenda 1 (F1): a fumaça testa só o gateway, sem guardrail. ADR-0014: sem Principal curinga.
# Conta, região e ARNs são sintéticos, fixos no mock, para as políticas serem conhecidas no plan.
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
  # ARN padrão das roles: o da role de execução. A role de fumaça ganha o próprio ARN pelo
  # override_resource abaixo, para o assert do output distinguir as duas roles.
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

override_resource {
  target          = aws_iam_role.fumaca
  override_during = plan
  values = {
    arn = "arn:aws:iam::111111111111:role/00-plataforma-agentes-fumaca"
  }
}

variables {
  kms_key_arn     = "arn:aws:kms:us-east-1:111111111111:key/00000000-0000-0000-0000-000000000001"
  role_deploy_arn = "arn:aws:iam::111111111111:role/00-plataforma-agentes-deploy-sintetica"
}

run "role_de_fumaca_so_com_invoke_gateway" {
  command = plan

  assert {
    condition     = aws_iam_role.fumaca.name == "00-plataforma-agentes-fumaca"
    error_message = "A role de fumaça se chama 00-plataforma-agentes-fumaca (plano, Role de fumaça; D-029)."
  }
  assert {
    condition     = aws_iam_role.fumaca.tags["module"] == "gateway"
    error_message = "A role de fumaça leva a tag module = gateway (D-031); project e managed-by vêm do default_tags."
  }

  # Confiança: só a role de deploy, pelo ARN exato, sem curinga (ADR-0014).
  assert {
    condition     = length(jsondecode(aws_iam_role.fumaca.assume_role_policy).Statement) == 1
    error_message = "A confiança da role de fumaça tem uma única declaração (a role de deploy)."
  }
  assert {
    condition = alltrue([for d in jsondecode(aws_iam_role.fumaca.assume_role_policy).Statement :
    d.Effect == "Allow" && d.Principal == { AWS = var.role_deploy_arn } && d.Action == "sts:AssumeRole"])
    error_message = "Só a role de deploy (var.role_deploy_arn, Principal AWS explícito) assume a role de fumaça (ADR-0014)."
  }

  # TT-R09: uma única declaração, InvokeGateway no ARN do gateway. Uma segunda declaração reprova.
  assert {
    condition     = length(jsondecode(aws_iam_role_policy.fumaca.policy).Statement) == 1
    error_message = "TT-R09: a role de fumaça tem uma única declaração; uma segunda reprova (emenda 1, F1)."
  }
  assert {
    condition = alltrue([for d in jsondecode(aws_iam_role_policy.fumaca.policy).Statement :
    d.Effect == "Allow" && flatten([d.Action]) == ["bedrock-agentcore:InvokeGateway"]])
    error_message = "TT-R09: a única ação é bedrock-agentcore:InvokeGateway; nada de bedrock:ApplyGuardrail, KMS ou alvo Lambda."
  }
  assert {
    condition = alltrue([for d in jsondecode(aws_iam_role_policy.fumaca.policy).Statement :
    flatten([d.Resource]) == [output.gateway_arn]])
    error_message = "TT-R09: o recurso é só o ARN do gateway da plataforma (output gateway_arn), nunca \"*\"."
  }
  assert {
    condition = alltrue([for d in jsondecode(aws_iam_role_policy.fumaca.policy).Statement :
    !contains(flatten([d.Action]), "bedrock:ApplyGuardrail")])
    error_message = "A role de fumaça não tem bedrock:ApplyGuardrail: a fumaça não chama o guardrail (emenda 1, F1; RNF-002)."
  }
  assert {
    condition     = aws_iam_role_policy.fumaca.role == aws_iam_role.fumaca.name
    error_message = "A política inline é da role de fumaça."
  }
  assert {
    condition     = output.role_fumaca_arn == aws_iam_role.fumaca.arn && endswith(output.role_fumaca_arn, ":role/00-plataforma-agentes-fumaca")
    error_message = "O módulo expõe o ARN da role de fumaça (script de fumaça, T066; workflow, T069)."
  }
}

# A role de deploy é o ARN completo de uma role, sem curinga (ADR-0014).
run "role_deploy_com_curinga_falha" {
  command = plan
  variables {
    role_deploy_arn = "arn:aws:iam::111111111111:role/*"
  }
  expect_failures = [var.role_deploy_arn]
}

run "role_deploy_que_nao_e_arn_de_role_falha" {
  command = plan
  variables {
    role_deploy_arn = "111111111111"
  }
  expect_failures = [var.role_deploy_arn]
}

run "role_deploy_raiz_da_conta_falha" {
  command = plan
  variables {
    role_deploy_arn = "arn:aws:iam::111111111111:root"
  }
  expect_failures = [var.role_deploy_arn]
}

run "role_deploy_curinga_puro_falha" {
  command = plan
  variables {
    role_deploy_arn = "*"
  }
  expect_failures = [var.role_deploy_arn]
}

run "role_deploy_com_conta_curinga_falha" {
  command = plan
  variables {
    role_deploy_arn = "arn:aws:iam::*:role/x"
  }
  expect_failures = [var.role_deploy_arn]
}
