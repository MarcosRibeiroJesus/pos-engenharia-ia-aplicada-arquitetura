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
