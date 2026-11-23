# Regras R2 (criptografia em repouso) e R4 (tags) para a chave KMS do stack.
mock_provider "aws" {}

variables {
  nome       = "agenda-lab"
  account_id = "123456789012"
  region     = "us-east-1"
  partition  = "aws"
  tags       = { project = "assistente-agendamento", module = "02-apis-ia-generativa/arquitetura", "managed-by" = "terraform" }
}

run "rotacao_e_janela_de_exclusao" {
  command = apply

  assert {
    condition     = aws_kms_key.this.enable_key_rotation == true
    error_message = "R2: a chave precisa de rotação automática."
  }
  assert {
    condition     = aws_kms_key.this.deletion_window_in_days == 7
    error_message = "R7: janela mínima de exclusão, para o destroy do lab não deixar a chave viva por 30 dias."
  }
  assert {
    condition     = aws_kms_alias.this.name == "alias/agenda-lab"
    error_message = "Alias segue o nome do stack."
  }
}

run "politica_sem_principal_curinga" {
  command = apply

  assert {
    condition = alltrue([
      for s in jsondecode(aws_kms_key.this.policy).Statement :
      try(s.Principal.AWS, "") != "*" && try(s.Principal, "") != "*"
    ])
    error_message = "R1/R3: a política da chave não pode ter principal curinga."
  }
  assert {
    condition = alltrue([
      for s in jsondecode(aws_kms_key.this.policy).Statement :
      try(s.Principal.Service, null) == null || length(try(s.Condition, {})) > 0
    ])
    error_message = "R3: todo serviço com acesso à chave precisa de condição (conta de origem ou contexto)."
  }
}

run "tags_obrigatorias" {
  command = apply

  assert {
    condition     = alltrue([for k in ["project", "module", "managed-by"] : contains(keys(aws_kms_key.this.tags), k)])
    error_message = "R4: tags project, module e managed-by na chave."
  }
}

run "rejeita_tags_incompletas" {
  command = plan

  variables {
    tags = { project = "x" }
  }
  expect_failures = [var.tags]
}
