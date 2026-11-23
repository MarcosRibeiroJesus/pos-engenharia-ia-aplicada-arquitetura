terraform {
  required_version = ">= 1.10.0" # lock nativo do backend S3 (use_lockfile)
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.81" # 5.81+: thumbprint_list opcional no aws_iam_openid_connect_provider (obrigatório no 5.80)
    }
  }
  # State remoto com lock nativo (Art. VI), no bucket criado por este mesmo stack (identidade.tf).
  # Valores no init: -backend-config=bucket=... -backend-config=key=conta/lab.tfstate
  # Primeiro apply da conta: com state local e migração depois (README).
  backend "s3" {
    use_lockfile = true
  }
}

provider "aws" {
  region = var.regiao
  default_tags {
    tags = local.tags
  }
}
