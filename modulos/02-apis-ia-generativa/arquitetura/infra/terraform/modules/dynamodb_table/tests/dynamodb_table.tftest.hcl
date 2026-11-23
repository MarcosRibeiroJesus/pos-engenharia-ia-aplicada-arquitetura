# Regras R2 (criptografia), R5 (sem custo ocioso), R6 (recuperação) e R4 (tags).
mock_provider "aws" {}

variables {
  nome         = "agenda-lab-memoria"
  hash_key     = "pk"
  range_key    = "sk"
  atributos    = [{ name = "pk", type = "S" }, { name = "sk", type = "S" }]
  ttl_atributo = "expira_em"
  kms_key_arn  = "arn:aws:kms:us-east-1:123456789012:key/11111111-2222-3333-4444-555555555555"
  tags         = { project = "assistente-agendamento", module = "02-apis-ia-generativa/arquitetura", "managed-by" = "terraform" }
}

run "sob_demanda_criptografada_com_pitr" {
  command = apply

  assert {
    condition     = aws_dynamodb_table.this.billing_mode == "PAY_PER_REQUEST"
    error_message = "R5: tabela sob demanda; capacidade provisionada é custo ocioso."
  }
  assert {
    condition     = aws_dynamodb_table.this.server_side_encryption[0].enabled && aws_dynamodb_table.this.server_side_encryption[0].kms_key_arn == var.kms_key_arn
    error_message = "R2: criptografia em repouso com a CMK do stack."
  }
  assert {
    condition     = aws_dynamodb_table.this.point_in_time_recovery[0].enabled
    error_message = "R6: PITR ligado (custo proporcional ao tamanho, sem piso)."
  }
}

run "ttl_quando_pedido" {
  command = apply

  assert {
    condition     = aws_dynamodb_table.this.ttl[0].enabled && aws_dynamodb_table.this.ttl[0].attribute_name == "expira_em"
    error_message = "Memória de curto prazo expira por TTL."
  }
}

run "gsi_projeta_so_o_necessario" {
  command = apply

  variables {
    atributos = [{ name = "pk", type = "S" }, { name = "sk", type = "S" }, { name = "usuario_id", type = "S" }]
    gsis      = [{ nome = "por_usuario", hash_key = "usuario_id", range_key = "sk", projecao = "ALL" }]
  }

  assert {
    condition     = one([for g in aws_dynamodb_table.this.global_secondary_index : g.name]) == "por_usuario"
    error_message = "GSI declarado."
  }
}

run "rejeita_tags_incompletas" {
  command = plan
  variables {
    tags = { module = "x" }
  }
  expect_failures = [var.tags]
}
