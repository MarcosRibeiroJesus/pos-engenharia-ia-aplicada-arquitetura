# Contrato v1, parâmetro comum (T018; RF-007, RF-011, ADR-0002, ADR-0009; TT-C01).
# /00-plataforma-agentes/contrato/v1/comum: String, camada Standard, sem KMS do cliente, valor JSON
# de até 4 KB. O schema do valor é conferido pelo plataforma/agentes/tests/contrato/test_contrato.py
# (TS-01). Conta, região e ARNs são sintéticos, os mesmos dos testes dos outros módulos.
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

run "parametro_comum" {
  command = plan

  assert {
    condition     = aws_ssm_parameter.comum.name == "/00-plataforma-agentes/contrato/v1/comum"
    error_message = "O parâmetro comum é /00-plataforma-agentes/contrato/v1/comum (RF-007)."
  }
  assert {
    condition     = aws_ssm_parameter.comum.type == "String"
    error_message = "O contrato é String, sem SecureString (ADR-0002)."
  }
  assert {
    condition     = aws_ssm_parameter.comum.tier == "Standard"
    error_message = "O contrato fica na camada Standard, sem custo (ADR-0002)."
  }
  # key_id é computado no plan (só vale para SecureString); o test_contrato.py confere que o
  # módulo não o define (ADR-0002).
  # Bytes UTF-8 do valor pelo base64: cada 4 caracteres são 3 bytes, menos o preenchimento "=".
  assert {
    condition = (
      length(base64encode(aws_ssm_parameter.comum.insecure_value)) / 4 * 3
      -length(regexall("=", base64encode(aws_ssm_parameter.comum.insecure_value)))
    ) <= 4096
    error_message = "O valor do comum passa de 4 KB, o limite da camada Standard (ADR-0002, TS-01)."
  }
  assert {
    condition     = aws_ssm_parameter.comum.insecure_value == jsonencode(output.contrato_v1)
    error_message = "O parâmetro guarda o mesmo objeto do output contrato_v1 (RF-007)."
  }
  assert {
    condition     = output.contrato_v1.versao_contrato == "1.0.0"
    error_message = "versao_contrato é 1.0.0 (RF-007)."
  }
  assert {
    condition     = output.contrato_v1.motor_politica_id == var.motor_politica_id && output.contrato_v1.motor_politica_arn == var.motor_politica_arn
    error_message = "O id e o ARN do motor vêm das entradas de composição (emenda 1, F3; ADR-0009)."
  }
  assert {
    condition     = output.contrato_v1.regiao == "us-east-1" && output.contrato_v1.grupo_spans == "aws/spans"
    error_message = "A região vem do provider, e o grupo de spans é o aws/spans da conta."
  }
  assert {
    condition = (
      length(keys(output.contrato_v1.mapa_erros)) == 8
      && toset([for c, v in output.contrato_v1.mapa_erros : c if v.retentavel]) == toset(["limite_taxa", "falha_transitoria"])
    )
    error_message = "mapa_erros tem as oito categorias do RF-011, e só limite_taxa e falha_transitoria são retentáveis."
  }
  assert {
    condition     = aws_ssm_parameter.comum.tags.module == "contrato"
    error_message = "A tag module do contrato vem do local.tags (D-031)."
  }
}

# Revisão A3: a precondition de 4 KB barra o parâmetro. A URL válida com um caminho de 3150
# caracteres (350 vezes "mcp-longo") leva o valor de 2007 bytes para 5155 bytes: acima de 4096,
# mas abaixo de 40960, para a mutação 4096 -> 40960 reprovar este run.
run "valor_acima_de_4kb_falha" {
  command = plan

  variables {
    gateway_url = "https://00-plataforma-agentes-gateway-sintetico.gateway.bedrock-agentcore.us-east-1.amazonaws.com/${join("", [for i in range(350) : "mcp-longo"])}/"
  }

  expect_failures = [aws_ssm_parameter.comum]
}

# Entradas ruins falham no plan, antes de virar contrato.
run "url_sem_tls_falha" {
  command = plan

  variables {
    gateway_url = "http://00-plataforma-agentes-gateway-sintetico.gateway.bedrock-agentcore.us-east-1.amazonaws.com/mcp"
  }

  expect_failures = [var.gateway_url]
}

run "motor_com_curinga_falha" {
  command = plan

  variables {
    motor_politica_arn = "arn:aws:bedrock-agentcore:us-east-1:111111111111:policy-engine/*"
  }

  expect_failures = [var.motor_politica_arn]
}

run "versao_mcp_desconhecida_falha" {
  command = plan

  variables {
    versoes_mcp = ["2024-11-05"]
  }

  expect_failures = [var.versoes_mcp]
}
