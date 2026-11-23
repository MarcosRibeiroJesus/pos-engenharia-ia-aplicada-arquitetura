terraform {
  # >= 1.10 para o lockfile nativo do backend S3 (use_lockfile), sem tabela de lock (ADR-0007).
  required_version = ">= 1.10.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.7"
    }
  }

  # Configuração parcial: bucket e chave vêm de backend.hcl (ver backend.hcl.example).
  backend "s3" {}
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = local.tags
  }
}
