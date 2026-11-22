terraform {
  required_version = ">= 1.7.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.80"
    }
  }
  # State remoto com lock (Art. VI). Valores no init: -backend-config=bucket=... -backend-config=key=conta/lab.tfstate
  backend "s3" {}
}

provider "aws" {
  region = var.regiao
  default_tags {
    tags = local.tags
  }
}
