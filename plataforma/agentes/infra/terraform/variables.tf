variable "regiao" {
  description = "Região do stack. us-east-1 tem Policy, guardrails no Policy e Evaluations do AgentCore (RNF-006)."
  type        = string
  default     = "us-east-1"

  validation {
    condition     = can(regex("^[a-z]{2}(-[a-z]+)+-[0-9]$", var.regiao))
    error_message = "Use o código da região, como us-east-1."
  }
}
