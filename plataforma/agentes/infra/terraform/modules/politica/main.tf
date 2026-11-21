# Módulo politica: motor de política (Cedar) único da plataforma (T015; RF-002, Art. IV).
# ADR-0005 (ENFORCE por padrão; LOG_ONLY só com calibracao = true), ADR-0006 e ADR-0012 (nome
# p00_, porque a API exige letra inicial) e ADR-0001 (chave do cliente da plataforma).
#
# Sem política Cedar aqui: o motor nega por padrão, e cada produto cria os próprios permit no state
# dele (módulo registro-produto, RF-002). Assim a role de fumaça (T014) não tem nenhum permit.
# O modo do motor não é atributo do motor: ele vai no policy_engine_configuration do gateway. Este
# módulo guarda a trava do modo e devolve o modo validado (output modo_politica) ao root.
terraform {
  required_version = ">= 1.10.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.50"
    }
  }
}

locals {
  # project e managed-by vêm do default_tags do root (D-031).
  tags = { module = "politica" }

  # Regex da API: ^[A-Za-z][A-Za-z0-9_]*$ (ADR-0006); exceção ao prefixo no ADR-0012.
  nome_motor = "p00_plataforma_agentes"
}

resource "aws_bedrockagentcore_policy_engine" "plataforma" {
  name               = local.nome_motor
  description        = "Motor de politica Cedar da plataforma de agentes: nega por padrao (RF-002)."
  encryption_key_arn = var.encryption_key_arn

  tags = local.tags
}
