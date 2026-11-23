# Identidade e state da conta (ADR-0015 da D01, RNF-105). O provedor OIDC do GitHub é único por
# conta e o bucket de state serve a todos os projetos, então os dois vivem aqui, fora do destroy de
# qualquer projeto. As roles por projeto (com ABAC, D-029) ficam em roles_projeto.tf (T031 da D01).
data "aws_caller_identity" "atual" {}

locals {
  tags_identidade = merge(local.tags, { module = "identidade" })
  tags_state      = merge(local.tags, { module = "estado-terraform" })
  oidc_host       = "token.actions.githubusercontent.com"
  state_bucket    = coalesce(var.state_bucket_name, "00-conta-tfstate-${data.aws_caller_identity.atual.account_id}")
}

# GitHub Actions troca o token OIDC por credenciais temporárias, sem chave estática.
# Desde 2023 a AWS confia na CA raiz do GitHub e ignora o thumbprint; o provider o calcula sozinho.
resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://${local.oidc_host}"
  client_id_list = ["sts.amazonaws.com"]
  tags           = local.tags_identidade
}

# Chave do cliente para o state (Art. IV). O state pode guardar valores sensíveis gravados pelos
# providers; com a CMK, ler o state exige também kms:Decrypt, que só as roles do projeto recebem.
resource "aws_kms_key" "state" {
  description             = "00-conta: state do Terraform de todos os projetos"
  enable_key_rotation     = true
  deletion_window_in_days = 7
  # Política explícita (CKV2_AWS_64): administração pela própria conta; o acesso de uso vem do IAM
  # de cada role. Na política de chave, Resource "*" é a própria chave.
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "AdministracaoPelaConta"
      Effect    = "Allow"
      Principal = { AWS = "arn:aws:iam::${data.aws_caller_identity.atual.account_id}:root" }
      Action    = "kms:*"
      Resource  = "*"
    }]
  })
  tags = local.tags_state
  # Recurso da conta: um destroy por engano apagaria a chave do state de todos os projetos.
  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_kms_alias" "state" {
  name          = "alias/00-conta-tfstate"
  target_key_id = aws_kms_key.state.key_id
}

resource "aws_s3_bucket" "state" {
  #checkov:skip=CKV_AWS_18:Access logs exigiriam outro bucket; o acesso ao state é auditado pelo CloudTrail de gerenciamento
  #checkov:skip=CKV_AWS_144:Replicação entre regiões fora do escopo do lab; o state é reconstruível por import e tag
  #checkov:skip=CKV2_AWS_62:Sem consumidores de eventos; o state é lido só pelo Terraform
  bucket = local.state_bucket
  # O state sobrevive ao destroy de qualquer stack: é ele que sabe o que precisa ser removido.
  force_destroy = false
  tags          = local.tags_state
  lifecycle {
    prevent_destroy = true
  }
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
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.state.arn
    }
    # Bucket key: uma chave de dados por bucket, menos chamadas (e custo) ao KMS.
    bucket_key_enabled = true
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
    id     = "expira-versoes-antigas"
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
    Statement = [
      {
        Sid       = "NegaTransporteSemTLS"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource  = [aws_s3_bucket.state.arn, "${aws_s3_bucket.state.arn}/*"]
        Condition = { Bool = { "aws:SecureTransport" = "false" } }
      },
      # Garantia no servidor: um cliente com encrypt = true e sem kms_key_id pede SSE-S3 (AES256)
      # e sobrepõe a criptografia padrão do bucket. Pedido explícito de outro algoritmo é negado; sem
      # cabeçalho, vale a criptografia padrão, que é a CMK (por isso o IfExists).
      {
        Sid       = "NegaGravacaoSemKmsDoCliente"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:PutObject"
        Resource  = "${aws_s3_bucket.state.arn}/*"
        Condition = { StringNotEqualsIfExists = { "s3:x-amz-server-side-encryption" = "aws:kms" } }
      },
      {
        Sid       = "NegaGravacaoComOutraChave"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:PutObject"
        Resource  = "${aws_s3_bucket.state.arn}/*"
        Condition = { StringNotEqualsIfExists = { "s3:x-amz-server-side-encryption-aws-kms-key-id" = aws_kms_key.state.arn } }
      },
      # Pedido de aws:kms sem key-id: segundo o relato da revisão (a confirmar, README), a API usa a
      # chave gerenciada aws/s3, não a CMK. Defesa em profundidade, sem custo.
      {
        Sid       = "NegaKmsSemChaveExplicita"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:PutObject"
        Resource  = "${aws_s3_bucket.state.arn}/*"
        Condition = {
          StringEquals = { "s3:x-amz-server-side-encryption" = "aws:kms" }
          Null         = { "s3:x-amz-server-side-encryption-aws-kms-key-id" = "true" }
        }
      },
      # SSE-C: a chave fica com o cliente e o state vira ilegível sem ela.
      {
        Sid       = "NegaSseC"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:PutObject"
        Resource  = "${aws_s3_bucket.state.arn}/*"
        Condition = { Null = { "s3:x-amz-server-side-encryption-customer-algorithm" = "false" } }
      },
    ]
  })
  depends_on = [aws_s3_bucket_public_access_block.state]
}
