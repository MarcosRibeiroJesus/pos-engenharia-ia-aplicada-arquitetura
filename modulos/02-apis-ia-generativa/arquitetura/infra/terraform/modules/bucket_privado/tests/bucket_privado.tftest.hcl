# Regras R1 (nada público), R2 (criptografia em repouso e em trânsito), R7 (destroy sem sobras).
mock_provider "aws" {
  mock_resource "aws_s3_bucket" {
    defaults = { arn = "arn:aws:s3:::agenda-lab-anexos-123456789012" }
  }
}

variables {
  nome          = "agenda-lab-anexos-123456789012"
  kms_key_arn   = "arn:aws:kms:us-east-1:123456789012:key/11111111-2222-3333-4444-555555555555"
  dias_retencao = 30
  tags          = { project = "assistente-agendamento", module = "02-apis-ia-generativa/arquitetura", "managed-by" = "terraform" }
}

run "bloqueio_publico_total" {
  command = apply
  assert {
    condition = alltrue([
      aws_s3_bucket_public_access_block.this.block_public_acls,
      aws_s3_bucket_public_access_block.this.block_public_policy,
      aws_s3_bucket_public_access_block.this.ignore_public_acls,
      aws_s3_bucket_public_access_block.this.restrict_public_buckets,
    ])
    error_message = "R1: as quatro travas de acesso público ligadas."
  }
  assert {
    condition     = aws_s3_bucket_ownership_controls.this.rule[0].object_ownership == "BucketOwnerEnforced"
    error_message = "R1: ACLs desligadas."
  }
}

run "kms_e_tls" {
  command = apply
  assert {
    condition     = one(aws_s3_bucket_server_side_encryption_configuration.this.rule).apply_server_side_encryption_by_default[0].sse_algorithm == "aws:kms"
    error_message = "R2: SSE-KMS com a CMK do stack."
  }
  assert {
    condition     = one(aws_s3_bucket_server_side_encryption_configuration.this.rule).bucket_key_enabled
    error_message = "FinOps: bucket key reduz chamadas ao KMS."
  }
  assert {
    condition = anytrue([
      for s in jsondecode(aws_s3_bucket_policy.this.policy).Statement :
      s.Effect == "Deny" && s.Condition.Bool["aws:SecureTransport"] == "false"
    ])
    error_message = "R2: nega acesso sem TLS."
  }
}

run "expira_e_destroi_sem_sobras" {
  command = apply
  assert {
    condition     = aws_s3_bucket.this.force_destroy
    error_message = "R7: o destroy do lab apaga objetos e versões (dados sintéticos)."
  }
  assert {
    condition     = one([for r in aws_s3_bucket_lifecycle_configuration.this.rule : r.expiration[0].days]) == 30
    error_message = "LGPD/FinOps: anexos expiram."
  }
}
