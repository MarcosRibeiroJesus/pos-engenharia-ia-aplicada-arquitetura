variable "encryption_key_arn" {
  description = "ARN da chave do cliente da plataforma (output chave_arn do módulo nucleo, T010; ADR-0001). Obrigatória: o motor não usa chave gerenciada pela AWS (Art. IV, TT-S02)."
  type        = string

  validation {
    condition     = can(regex("^arn:aws[a-z-]*:kms:[a-z]{2}(-[a-z]+)+-[0-9]:[0-9]{12}:key/[0-9a-f-]{36}$", var.encryption_key_arn))
    error_message = "Informe o ARN completo de uma chave KMS (arn:aws:kms:<região>:<conta>:key/<id>), não alias nem id."
  }
}

variable "calibracao" {
  description = "Liga o apply de calibração, o único em que LOG_ONLY é aceito (ADR-0005). Nunca é input de workflow nem entra em tfvars versionado."
  type        = bool
  default     = false
  nullable    = false
}

variable "modo_politica" {
  description = "Modo do motor no gateway (ADR-0005): ENFORCE por padrão; LOG_ONLY só com calibracao = true, num apply separado da demonstração. Nunca é input de workflow."
  type        = string
  default     = "ENFORCE"
  nullable    = false

  validation {
    condition     = var.modo_politica == "ENFORCE" || (var.modo_politica == "LOG_ONLY" && var.calibracao)
    error_message = "modo_politica é ENFORCE. LOG_ONLY só com calibracao = true, num apply de calibração fora da demonstração (ADR-0005, TT-P02)."
  }
}
