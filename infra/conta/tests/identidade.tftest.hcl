# Identidade e state da conta (RNF-105 da D01, ADR-0015 da D01, Art. IV e VI), com mock provider (Art. III).
# Um provedor OIDC do GitHub e um bucket de state por conta, servindo a todos os projetos.
mock_provider "aws" {
  override_data {
    target = data.aws_caller_identity.atual
    values = { account_id = "111122223333" }
  }
  override_resource {
    target          = aws_kms_key.state
    override_during = plan
    values          = { arn = "arn:aws:kms:us-east-1:111122223333:key/00000000-0000-0000-0000-000000000000" }
  }
  override_resource {
    target          = aws_s3_bucket.state
    override_during = plan
    values = {
      arn = "arn:aws:s3:::00-conta-tfstate-111122223333"
      id  = "00-conta-tfstate-111122223333"
    }
  }
}

variables {
  emails_alerta = ["alerta@exemplo.com"]
}

run "provedor_oidc_do_github" {
  command = plan
  assert {
    condition     = aws_iam_openid_connect_provider.github.url == "https://token.actions.githubusercontent.com"
    error_message = "O provedor OIDC é o do GitHub Actions (token.actions.githubusercontent.com)."
  }
  assert {
    condition     = length(aws_iam_openid_connect_provider.github.client_id_list) == 1 && contains(aws_iam_openid_connect_provider.github.client_id_list, "sts.amazonaws.com")
    error_message = "A audiência do token é só sts.amazonaws.com."
  }
}

run "bucket_de_state_com_versionamento" {
  command = plan
  assert {
    condition     = aws_s3_bucket_versioning.state.versioning_configuration[0].status == "Enabled"
    error_message = "Versionamento ligado: perder o state é perder o mapa do que existe (ADR-0001)."
  }
  assert {
    condition     = aws_s3_bucket.state.force_destroy == false
    error_message = "O bucket de state sobrevive ao destroy de qualquer stack."
  }
  assert {
    condition     = aws_s3_bucket.state.bucket == "00-conta-tfstate-111122223333"
    error_message = "Nome com o prefixo da chave da conta e o id da conta (D-029)."
  }
}

run "bucket_de_state_com_kms_do_cliente" {
  command = plan
  assert {
    condition = alltrue([for r in aws_s3_bucket_server_side_encryption_configuration.state.rule :
      r.apply_server_side_encryption_by_default[0].sse_algorithm == "aws:kms"
      && r.apply_server_side_encryption_by_default[0].kms_master_key_id == aws_kms_key.state.arn
    ])
    error_message = "SSE-KMS com a chave do cliente do próprio stack, não SSE-S3 nem a chave gerenciada da AWS (Art. IV)."
  }
  assert {
    condition     = aws_kms_key.state.enable_key_rotation == true
    error_message = "Rotação anual da chave ligada."
  }
  assert {
    condition     = aws_kms_key.state.deletion_window_in_days == 7
    error_message = "Janela de exclusão mínima (7 dias)."
  }
}

run "bucket_de_state_sem_acesso_publico" {
  command = plan
  assert {
    condition = alltrue([
      aws_s3_bucket_public_access_block.state.block_public_acls,
      aws_s3_bucket_public_access_block.state.block_public_policy,
      aws_s3_bucket_public_access_block.state.ignore_public_acls,
      aws_s3_bucket_public_access_block.state.restrict_public_buckets,
    ])
    error_message = "Os quatro bloqueios de acesso público ligados (Art. IV)."
  }
  assert {
    condition     = aws_s3_bucket_ownership_controls.state.rule[0].object_ownership == "BucketOwnerEnforced"
    error_message = "ACLs desligadas (BucketOwnerEnforced)."
  }
}

run "bucket_de_state_so_com_tls" {
  command = plan
  assert {
    condition = anytrue([for s in jsondecode(aws_s3_bucket_policy.state.policy).Statement :
      s.Effect == "Deny"
      && s.Principal == "*"
      && try(s.Condition.Bool["aws:SecureTransport"], "") == "false"
      && contains(s.Resource, "arn:aws:s3:::00-conta-tfstate-111122223333")
      && contains(s.Resource, "arn:aws:s3:::00-conta-tfstate-111122223333/*")
    ])
    error_message = "A política do bucket nega acesso com aws:SecureTransport = false no bucket e nos objetos (Art. IV)."
  }
}

run "tags_da_conta_na_identidade" {
  command = plan
  assert {
    condition = alltrue([for t in [
      aws_iam_openid_connect_provider.github.tags,
      aws_s3_bucket.state.tags,
      aws_kms_key.state.tags,
      ] :
      t["project"] == "00-conta"
      && can(regex("^[a-z0-9]+(-[a-z0-9]+)*$", t["module"]))
      && t["managed-by"] == "terraform"
    ])
    error_message = "project = 00-conta, module em kebab e managed-by = terraform (Art. VI, D-031)."
  }
}

run "nome_do_bucket_sem_prefixo_falha" {
  command = plan
  variables {
    state_bucket_name = "recsys-tfstate-111122223333"
  }
  expect_failures = [var.state_bucket_name]
}

run "bucket_de_state_nega_gravacao_sem_kms_do_cliente" {
  command = plan
  # encrypt = true sem kms_key_id pede SSE-S3 e sobrepõe a criptografia padrão: o servidor nega.
  assert {
    condition = anytrue([for s in jsondecode(aws_s3_bucket_policy.state.policy).Statement :
      s.Effect == "Deny"
      && s.Principal == "*"
      && contains(flatten([s.Action]), "s3:PutObject")
      && contains(flatten([s.Resource]), "arn:aws:s3:::00-conta-tfstate-111122223333/*")
      && try(s.Condition.StringNotEqualsIfExists["s3:x-amz-server-side-encryption"], "") == "aws:kms"
    ])
    error_message = "A política nega PutObject que peça criptografia diferente de aws:kms (Art. IV)."
  }
  assert {
    condition = anytrue([for s in jsondecode(aws_s3_bucket_policy.state.policy).Statement :
      s.Effect == "Deny"
      && contains(flatten([s.Action]), "s3:PutObject")
      && try(s.Condition.StringNotEqualsIfExists["s3:x-amz-server-side-encryption-aws-kms-key-id"], "") == aws_kms_key.state.arn
    ])
    error_message = "A política nega PutObject com uma chave KMS que não seja a do state."
  }
}

run "politica_da_chave_so_para_a_conta" {
  command = plan
  assert {
    condition     = length([for s in jsondecode(aws_kms_key.state.policy).Statement : s if s.Effect == "Allow"]) == 1
    error_message = "A política da chave tem exatamente uma declaração Allow."
  }
  assert {
    condition = alltrue([for s in jsondecode(aws_kms_key.state.policy).Statement :
      s.Effect != "Allow" || try(s.Principal.AWS, "") == "arn:aws:iam::111122223333:root"
    ])
    error_message = "O único Allow da chave é para a raiz da própria conta."
  }
  assert {
    condition = alltrue([for s in jsondecode(aws_kms_key.state.policy).Statement :
      s.Principal != "*" && !contains(flatten([try(s.Principal.AWS, [])]), "*")
    ])
    error_message = "Nenhum principal * na política da chave do state (Art. IV)."
  }
}

run "bucket_de_state_nega_kms_sem_chave_e_sse_c" {
  command = plan
  assert {
    condition = anytrue([for s in jsondecode(aws_s3_bucket_policy.state.policy).Statement :
      s.Effect == "Deny"
      && contains(flatten([s.Action]), "s3:PutObject")
      && try(s.Condition.StringEquals["s3:x-amz-server-side-encryption"], "") == "aws:kms"
      && try(s.Condition.Null["s3:x-amz-server-side-encryption-aws-kms-key-id"], "") == "true"
    ])
    error_message = "A política nega aws:kms sem key-id (cairia na chave gerenciada aws/s3, não na CMK)."
  }
  assert {
    condition = anytrue([for s in jsondecode(aws_s3_bucket_policy.state.policy).Statement :
      s.Effect == "Deny"
      && contains(flatten([s.Action]), "s3:PutObject")
      && try(s.Condition.Null["s3:x-amz-server-side-encryption-customer-algorithm"], "") == "false"
    ])
    error_message = "A política nega SSE-C (chave do cliente fora da AWS deixaria o state ilegível)."
  }
}
