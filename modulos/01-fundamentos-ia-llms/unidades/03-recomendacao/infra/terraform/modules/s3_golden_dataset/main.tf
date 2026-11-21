data "aws_caller_identity" "current" {}

resource "aws_s3_bucket" "golden_dataset" {
  #checkov:skip=CKV_AWS_18:Lab sem access logs (bucket extra e custo); produção usa CloudTrail data events
  #checkov:skip=CKV_AWS_144:Replicação entre regiões fora do escopo do lab; dados sintéticos e reconstruíveis
  #checkov:skip=CKV2_AWS_62:Sem consumidores de eventos do bucket; o pipeline é agendado pelo MWAA
  bucket        = "${var.project_name}-${var.environment}-golden-${data.aws_caller_identity.current.account_id}"
  force_destroy = var.force_destroy

  tags = {
    Name     = "${var.project_name}-${var.environment}-golden-dataset"
    DataTier = "Golden"
  }
}

resource "aws_s3_bucket_ownership_controls" "golden_dataset" {
  bucket = aws_s3_bucket.golden_dataset.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_versioning" "golden_dataset" {
  bucket = aws_s3_bucket.golden_dataset.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "golden_dataset" {
  bucket = aws_s3_bucket.golden_dataset.id

  rule {
    apply_server_side_encryption_by_default {
      kms_master_key_id = var.kms_key_arn
      sse_algorithm     = "aws:kms"
    }
    bucket_key_enabled = true # reduz chamadas ao KMS (custo) em leituras do Athena/Glue
  }
}

resource "aws_s3_bucket_public_access_block" "golden_dataset" {
  bucket = aws_s3_bucket.golden_dataset.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# R2: nega qualquer acesso sem TLS.
resource "aws_s3_bucket_policy" "tls_only" {
  bucket = aws_s3_bucket.golden_dataset.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "DenyInsecureTransport"
      Effect    = "Deny"
      Principal = "*"
      Action    = "s3:*"
      Resource  = [aws_s3_bucket.golden_dataset.arn, "${aws_s3_bucket.golden_dataset.arn}/*"]
      Condition = { Bool = { "aws:SecureTransport" = "false" } }
    }]
  })
  depends_on = [aws_s3_bucket_public_access_block.golden_dataset]
}

resource "aws_s3_bucket_lifecycle_configuration" "golden_dataset" {
  bucket = aws_s3_bucket.golden_dataset.id

  rule {
    id     = "archive-raw-and-expire"
    status = "Enabled"
    filter {}

    transition {
      days          = 90
      storage_class = "GLACIER"
    }

    expiration {
      days = 365
    }

    noncurrent_version_expiration {
      noncurrent_days = 30
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }

  rule {
    id     = "expire-scratch"
    status = "Enabled"

    filter {
      prefix = "scratch/"
    }

    expiration {
      days = 14
    }
  }

  depends_on = [aws_s3_bucket_versioning.golden_dataset]
}

# Prefixos dos datasets Parquet
resource "aws_s3_object" "prefix" {
  for_each = toset(["catalog/", "interactions/", "user_features/", "recommendations/"])
  bucket   = aws_s3_bucket.golden_dataset.id
  key      = each.key
}
