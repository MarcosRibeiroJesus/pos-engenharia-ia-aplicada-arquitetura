# Bootstrap do state remoto (ADR-0001). Roda uma única vez por conta, com state local,
# antes do stack principal. Cria só o bucket do state: o lock usa o lockfile nativo do
# backend S3 (Terraform >= 1.10), então não há tabela DynamoDB para manter.
terraform {
  required_version = ">= 1.10.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      project      = var.project_name
      module       = "01-fundamentos-ia-llms/03-recomendacao"
      "managed-by" = "terraform"
      component    = "tfstate"
    }
  }
}

data "aws_caller_identity" "current" {}

locals {
  bucket_name = coalesce(var.state_bucket_name, "${var.project_name}-tfstate-${data.aws_caller_identity.current.account_id}")
}

resource "aws_s3_bucket" "state" {
  #checkov:skip=CKV_AWS_18:Lab sem access logs (bucket extra e custo); produção usa CloudTrail data events
  #checkov:skip=CKV_AWS_144:Replicação entre regiões fora do escopo do lab; dados sintéticos e reconstruíveis
  #checkov:skip=CKV2_AWS_62:Sem consumidores de eventos do bucket; o state é lido só pelo Terraform
  #checkov:skip=CKV_AWS_145:SSE-S3 no state para evitar CMK de US$ 1/mês (ADR-0001)
  bucket = local.bucket_name
  # O state sobrevive ao destroy do stack: é ele que sabe o que precisa ser removido.
  force_destroy = false
}

resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    # SSE-S3: evita uma chave KMS de US$ 1/mês só para o state do lab (ver ADR-0001).
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "state" {
  bucket                  = aws_s3_bucket.state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "state" {
  bucket = aws_s3_bucket.state.id

  rule {
    id     = "expire-old-state-versions"
    status = "Enabled"
    filter {}
    noncurrent_version_expiration {
      noncurrent_days = 90
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

resource "aws_s3_bucket_policy" "state" {
  bucket = aws_s3_bucket.state.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "DenyInsecureTransport"
      Effect    = "Deny"
      Principal = "*"
      Action    = "s3:*"
      Resource  = [aws_s3_bucket.state.arn, "${aws_s3_bucket.state.arn}/*"]
      Condition = { Bool = { "aws:SecureTransport" = "false" } }
    }]
  })
  depends_on = [aws_s3_bucket_public_access_block.state]
}
