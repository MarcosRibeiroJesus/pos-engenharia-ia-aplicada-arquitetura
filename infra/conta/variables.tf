variable "regiao" {
  description = "Região do provider. O AWS Budgets é global; a região só define o endpoint."
  type        = string
  default     = "us-east-1"
}

variable "limite_mensal_usd" {
  description = "Limite mensal da conta somando todas as demonstrações (decisão do dono, D-022: US$ 20)."
  type        = number
  default     = 20
  validation {
    condition     = var.limite_mensal_usd > 0
    error_message = "O limite mensal precisa ser positivo."
  }
}

variable "emails_alerta" {
  description = "E-mails que recebem os alertas do orçamento. Sem e-mail o alerta não chega a ninguém."
  type        = list(string)
  validation {
    condition     = length(var.emails_alerta) > 0
    error_message = "Informe ao menos um e-mail para os alertas."
  }
}

variable "state_bucket_name" {
  description = "Nome do bucket de state da conta. Padrão: 00-conta-tfstate-<id da conta>."
  type        = string
  default     = null
  validation {
    condition     = var.state_bucket_name == null || startswith(coalesce(var.state_bucket_name, "00-conta-"), "00-conta-")
    error_message = "O bucket de state leva o prefixo da chave da conta, 00-conta- (D-029)."
  }
}

variable "repositorio_github" {
  description = "Repositório do GitHub (dono/repo) dos subjects do OIDC das roles por projeto (ADR-0015 da D01)."
  type        = string
  validation {
    condition     = can(regex("^[A-Za-z0-9-]+/[A-Za-z0-9._-]+$", var.repositorio_github))
    error_message = "Use dono/repo, sem curinga."
  }
}
