# project e managed-by vêm do default_tags; module vem do local.tags de cada módulo (D-031).
locals {
  tags_padrao = {
    project      = "00-plataforma-agentes"
    "managed-by" = "terraform"
  }
}

provider "aws" {
  region = var.regiao

  default_tags {
    tags = local.tags_padrao
  }
}
