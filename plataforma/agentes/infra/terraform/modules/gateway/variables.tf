variable "kms_key_arn" {
  description = "ARN da chave do cliente da plataforma (output chave_arn do módulo nucleo, T010; ADR-0001). Obrigatória: o gateway não usa chave gerenciada pela AWS (Art. IV, TT-S02)."
  type        = string

  validation {
    condition     = can(regex("^arn:aws[a-z-]*:kms:[a-z]{2}(-[a-z]+)+-[0-9]:[0-9]{12}:key/[0-9a-f-]{36}$", var.kms_key_arn))
    error_message = "Informe o ARN completo de uma chave KMS (arn:aws:kms:<região>:<conta>:key/<id>), não alias nem id."
  }
}

variable "authorizer_type" {
  description = "Autorizador de entrada do gateway. Só AWS_IAM (SigV4 com a role do agente; ADR-0003, RF-003, TT-G01)."
  type        = string
  default     = "AWS_IAM"

  validation {
    condition     = var.authorizer_type == "AWS_IAM"
    error_message = "O gateway só aceita AWS_IAM na entrada: NONE abre a porta e AUTHENTICATE_ONLY tira o principal do Cedar (ADR-0003)."
  }
}

variable "versoes_mcp" {
  description = "Versões de MCP servidas pelo gateway (ADR-0010). Mudar a lista é versão menor do contrato."
  type        = list(string)
  default     = ["2025-11-25", "2026-07-28"]

  validation {
    condition     = length(var.versoes_mcp) > 0
    error_message = "Informe ao menos uma versão de MCP (ADR-0010)."
  }
  validation {
    # Versões que o gateway aceita, pela fonte do ADR-0010 (blog da AWS de 2026-07-28).
    condition     = alltrue([for v in var.versoes_mcp : contains(["2025-03-26", "2025-06-18", "2025-11-25", "2026-07-28"], v)])
    error_message = "Cada versão é uma das aceitas pelo gateway: 2025-03-26, 2025-06-18, 2025-11-25 ou 2026-07-28 (ADR-0010)."
  }
}

variable "motor_politica_arn" {
  description = <<-EOT
    ARN do motor de política (módulo politica, T015). Anulável só aqui (ADR-0011): o root do Floci
    compõe o gateway sem o motor. No root real, quem garante o valor é o TT-P01 (T015 e T020).
  EOT
  type        = string
  default     = null
  nullable    = true
}

variable "modo_politica" {
  description = "Modo do motor de política no gateway (ADR-0005). ENFORCE por padrão; a trava de LOG_ONLY com calibracao fica no módulo politica (T015)."
  type        = string
  default     = "ENFORCE"

  validation {
    condition     = contains(["ENFORCE", "LOG_ONLY"], var.modo_politica)
    error_message = "modo_politica é ENFORCE ou LOG_ONLY (ADR-0005)."
  }
}

variable "role_deploy_arn" {
  description = "ARN da role de deploy (OIDC do GitHub), a única que assume a role de fumaça (T014, ADR-0014). ARN completo de uma role, sem curinga."
  type        = string

  validation {
    condition     = can(regex("^arn:aws(-cn|-us-gov)?:iam::[0-9]{12}:role/[A-Za-z0-9+=,.@_/-]+$", var.role_deploy_arn))
    error_message = "Informe o ARN completo de uma role IAM (arn:aws:iam::<conta>:role/<nome>), sem curinga nem a raiz da conta (ADR-0014)."
  }
}
