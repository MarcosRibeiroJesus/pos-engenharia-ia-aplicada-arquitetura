# Bucket privado dos anexos enviados pelo usuário (vetor de injeção indireta, ADR-0005).
# Nada público, SSE-KMS, só TLS, versionado e com expiração (dados sintéticos no lab).
variable "nome" {
  type = string
}
variable "kms_key_arn" {
  type = string
}
variable "dias_retencao" {
  type    = number
  default = 30
}
variable "forcar_destroy" {
  description = "Lab: true, para o destroy não deixar objetos nem versões (ADR-0007)."
  type        = bool
  default     = true
}

resource "aws_s3_bucket" "this" {
  #checkov:skip=CKV_AWS_18:Sem access logs no lab (bucket extra); o acesso é auditado pelo CloudTrail da conta (ADR-0007)
  #checkov:skip=CKV_AWS_144:Replicação entre regiões fora do escopo; anexos sintéticos e com expiração
  #checkov:skip=CKV2_AWS_62:Sem consumidores de eventos; a leitura é feita sob demanda pela tool ler_anexo
  bucket        = var.nome
  force_destroy = var.forcar_destroy
  tags          = var.tags
}

resource "aws_s3_bucket_public_access_block" "this" {
  bucket                  = aws_s3_bucket.this.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "this" {
  bucket = aws_s3_bucket.this.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_versioning" "this" {
  bucket = aws_s3_bucket.this.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "this" {
  bucket = aws_s3_bucket.this.id
  rule {
    bucket_key_enabled = true
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = var.kms_key_arn
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "this" {
  bucket = aws_s3_bucket.this.id
  rule {
    id     = "expira-anexos"
    status = "Enabled"
    filter {}
    expiration {
      days = var.dias_retencao
    }
    noncurrent_version_expiration {
      noncurrent_days = 7
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

resource "aws_s3_bucket_policy" "this" {
  bucket = aws_s3_bucket.this.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "NegarSemTLS"
      Effect    = "Deny"
      Principal = "*"
      Action    = "s3:*"
      Resource  = [aws_s3_bucket.this.arn, "${aws_s3_bucket.this.arn}/*"]
      Condition = { Bool = { "aws:SecureTransport" = "false" } }
    }]
  })
  depends_on = [aws_s3_bucket_public_access_block.this]
}

output "arn" {
  value = aws_s3_bucket.this.arn
}
output "nome" {
  value = aws_s3_bucket.this.id
}
