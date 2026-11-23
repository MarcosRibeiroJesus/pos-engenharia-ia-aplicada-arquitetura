terraform {
  # >= 1.10 para o lock nativo do backend S3 (use_lockfile) e mock providers no terraform test.
  required_version = ">= 1.10.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  # Configuração parcial: os valores vêm de backend.hcl (ver backend.hcl.example e ADR-0001).
  backend "s3" {}
}
