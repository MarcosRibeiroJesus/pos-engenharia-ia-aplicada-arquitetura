# Motor de política da plataforma (T015; RF-002, Art. IV; TT-P02 e TT-S02 do motor).
# ADR-0005 (ENFORCE por padrão; LOG_ONLY só com calibracao = true), ADR-0006 e ADR-0012 (nome com
# letra inicial, prefixo p00_) e ADR-0001 (chave do cliente da plataforma). A conta e os ARNs são
# sintéticos, fixos no mock, para o plan ter os valores e os asserts lerem.
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

run "motor_com_nome_da_api_e_chave_da_plataforma" {
  command = plan

  # Instância única: count ou for_each quebram estes asserts.
  assert {
    condition     = length(aws_bedrockagentcore_policy_engine.plataforma[*]) == 1
    error_message = "Exatamente um motor de política na plataforma (RF-002)."
  }
  # A API do AgentCore Policy exige letra inicial e só letras, dígitos e sublinhado (ADR-0006):
  # por isso p00_ no lugar de 00-, e a exceção ao prefixo fica no ADR-0012.
  assert {
    condition     = aws_bedrockagentcore_policy_engine.plataforma.name == "p00_plataforma_agentes"
    error_message = "O motor se chama p00_plataforma_agentes (plano, Motor de política; ADR-0012)."
  }
  assert {
    condition     = can(regex("^[A-Za-z][A-Za-z0-9_]*$", aws_bedrockagentcore_policy_engine.plataforma.name))
    error_message = "O nome do motor segue a regex da API ^[A-Za-z][A-Za-z0-9_]*$ (ADR-0006)."
  }
  # TT-S02 (motor): cifrado com a chave do cliente da plataforma (T010, ADR-0001).
  assert {
    condition     = aws_bedrockagentcore_policy_engine.plataforma.encryption_key_arn == var.encryption_key_arn
    error_message = "O motor usa encryption_key_arn da chave da plataforma (Art. IV, ADR-0001, TT-S02)."
  }
  assert {
    condition     = aws_bedrockagentcore_policy_engine.plataforma.tags["module"] == "politica"
    error_message = "O motor leva a tag module = politica (D-031); project e managed-by vêm do default_tags."
  }
  assert {
    condition     = output.policy_engine_arn == aws_bedrockagentcore_policy_engine.plataforma.policy_engine_arn && output.policy_engine_id == aws_bedrockagentcore_policy_engine.plataforma.policy_engine_id
    error_message = "O módulo expõe o ARN (gateway) e o id (alarmes e contrato) do motor."
  }
}

# TT-P02 e ADR-0005: o padrão é ENFORCE, e o módulo devolve o modo que o gateway usa.
run "modo_padrao_enforce" {
  command = plan

  assert {
    condition     = var.modo_politica == "ENFORCE" && var.calibracao == false
    error_message = "O padrão é modo_politica = ENFORCE, sem calibração (RF-002, ADR-0005)."
  }
  assert {
    condition     = output.modo_politica == "ENFORCE"
    error_message = "O output modo_politica, que o root passa ao gateway, é ENFORCE por padrão (ADR-0005)."
  }
}

# TT-P02: LOG_ONLY sem calibracao = true reprova; a política vira observação (ADR-0005).
run "log_only_sem_calibracao_falha" {
  command = plan
  variables {
    modo_politica = "LOG_ONLY"
  }
  expect_failures = [var.modo_politica]
}

run "log_only_com_calibracao_false_explicita_falha" {
  command = plan
  variables {
    modo_politica = "LOG_ONLY"
    calibracao    = false
  }
  expect_failures = [var.modo_politica]
}

# A calibração é um apply separado, fora da demonstração gravada (ADR-0005).
run "log_only_com_calibracao_passa" {
  command = plan
  variables {
    modo_politica = "LOG_ONLY"
    calibracao    = true
  }

  assert {
    condition     = output.modo_politica == "LOG_ONLY"
    error_message = "Com calibracao = true, LOG_ONLY passa (apply de calibração, ADR-0005)."
  }
}

run "modo_desconhecido_falha" {
  command = plan
  variables {
    modo_politica = "DESLIGADO"
    calibracao    = true
  }
  expect_failures = [var.modo_politica]
}

run "encryption_key_arn_que_nao_e_de_chave_falha" {
  command = plan
  variables {
    encryption_key_arn = "alias/aws/bedrock-agentcore"
  }
  expect_failures = [var.encryption_key_arn]
}
