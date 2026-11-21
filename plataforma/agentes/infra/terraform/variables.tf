variable "regiao" {
  description = "Região do stack. us-east-1 tem Policy, guardrails no Policy e Evaluations do AgentCore (RNF-006)."
  type        = string
  default     = "us-east-1"

  validation {
    condition     = can(regex("^[a-z]{2}(-[a-z]+)+-[0-9]$", var.regiao))
    error_message = "Use o código da região, como us-east-1."
  }
}

variable "teto_diario_usd" {
  description = "Teto de um dia de demonstração em USD, no Budgets diário do módulo nucleo (Art. V, D-021). O TH-06 compara este padrão com teto_diario_usd do harness/estado.json: mude os dois juntos, com o plano aprovado."
  type        = number
  default     = 1.2

  validation {
    condition     = var.teto_diario_usd > 0
    error_message = "O teto diário é positivo."
  }
}

variable "role_deploy_arn" {
  description = "ARN da role de deploy (OIDC do GitHub), a única que assume a role de fumaça do módulo gateway (T014, ADR-0014). Não é segredo, mas leva a conta: vem do workflow, fora do repositório."
  type        = string
}

variable "modo_politica" {
  description = <<-EOT
    Modo do motor de política no gateway (ADR-0005): ENFORCE por padrão. LOG_ONLY só com
    calibracao = true, num apply de calibração fora da demonstração gravada. Nunca é input de
    workflow nem entra em tfvars versionado; o apply recusa TF_VAR_modo_politica=LOG_ONLY (TH-05).
  EOT
  type        = string
  default     = "ENFORCE"
  nullable    = false

  # A mesma trava do módulo politica, no ponto de entrada: o erro aparece antes do módulo e o
  # terraform test do root consegue esperá-lo (expect_failures não alcança variável de módulo).
  validation {
    condition     = var.modo_politica == "ENFORCE" || (var.modo_politica == "LOG_ONLY" && var.calibracao)
    error_message = "modo_politica é ENFORCE. LOG_ONLY só com calibracao = true, num apply de calibração fora da demonstração (ADR-0005, TT-P02)."
  }
}

variable "calibracao" {
  description = "Liga o apply de calibração, o único em que LOG_ONLY é aceito (ADR-0005). Nunca é input de workflow nem entra em tfvars versionado."
  type        = bool
  default     = false
  nullable    = false
}
