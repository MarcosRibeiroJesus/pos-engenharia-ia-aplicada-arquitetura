# Entradas de composição obrigatórias, sem padrão (T018; RF-007, emenda 1 F3, ADR-0009, ADR-0011):
# no root real vêm dos módulos gateway, politica, nucleo e observabilidade (a T020 liga e o TT-P01
# confere o motor); no root do Floci, de valores sintéticos fixos. Cada validação espelha o
# v1.schema.json, para o valor ruim falhar no plan e não só no teste do schema.

variable "gateway_arn" {
  description = "ARN do gateway (output gateway_arn do módulo gateway, T013): campo gateway_arn do contrato comum."
  type        = string

  validation {
    condition     = can(regex("^arn:aws(-cn|-us-gov)?:bedrock-agentcore:[a-z]{2}(-[a-z]+)+-[0-9]:[0-9]{12}:gateway/[A-Za-z0-9][A-Za-z0-9_-]*$", var.gateway_arn))
    error_message = "Informe o ARN completo do gateway (arn:aws:bedrock-agentcore:<região>:<conta>:gateway/<id>), sem curinga (ADR-0014)."
  }
}

variable "gateway_url" {
  description = "URL MCP do gateway (output gateway_url do módulo gateway, T013): campo gateway_url do contrato comum. Só HTTPS (Art. IV)."
  type        = string

  validation {
    condition     = can(regex("^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?(/[A-Za-z0-9._~/-]*)?$", var.gateway_url))
    error_message = "A URL do gateway é HTTPS (TLS em trânsito, Art. IV), sem consulta nem fragmento."
  }
}

variable "gateway_id" {
  description = "Id do gateway (output gateway_id do módulo gateway, T013): campo gateway_id do contrato comum."
  type        = string

  validation {
    condition     = can(regex("^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$", var.gateway_id))
    error_message = "Informe o id do gateway (letras, dígitos, hífen e sublinhado), sem curinga nem barra."
  }
}

variable "motor_politica_id" {
  description = "Id do motor de política (output policy_engine_id do módulo politica, T015; no root do Floci, valor sintético fixo, ADR-0009). Obrigatório no schema (emenda 1, F3)."
  type        = string

  validation {
    condition     = can(regex("^[A-Za-z][A-Za-z0-9_-]{0,99}$", var.motor_politica_id))
    error_message = "Informe o id do motor (letra inicial, depois letras, dígitos, hífen e sublinhado), sem curinga."
  }
}

variable "motor_politica_arn" {
  description = "ARN do motor de política (output policy_engine_arn do módulo politica, T015; no root do Floci, valor sintético fixo, ADR-0009). Obrigatório no schema (emenda 1, F3)."
  type        = string

  validation {
    condition     = can(regex("^arn:aws(-cn|-us-gov)?:bedrock-agentcore:[a-z]{2}(-[a-z]+)+-[0-9]:[0-9]{12}:policy-engine/[A-Za-z][A-Za-z0-9_-]*$", var.motor_politica_arn))
    error_message = "Informe o ARN completo do motor (arn:aws:bedrock-agentcore:<região>:<conta>:policy-engine/<id>), sem curinga (ADR-0014)."
  }
}

variable "versoes_mcp" {
  description = "Versões de MCP aceitas pelo gateway (a mesma lista do módulo gateway, ADR-0010): campo versoes_mcp do contrato comum."
  type        = list(string)

  validation {
    condition     = length(var.versoes_mcp) > 0 && length(distinct(var.versoes_mcp)) == length(var.versoes_mcp)
    error_message = "Informe ao menos uma versão de MCP, sem repetir."
  }
  validation {
    condition     = alltrue([for v in var.versoes_mcp : contains(["2025-03-26", "2025-06-18", "2025-11-25", "2026-07-28"], v)])
    error_message = "Versões aceitas pelo gateway: 2025-03-26, 2025-06-18, 2025-11-25 e 2026-07-28 (ADR-0010)."
  }
}

variable "grupo_log_gateway" {
  description = "Grupo dos logs de aplicação do gateway (output grupo_log_gateway do módulo observabilidade, T016): campo grupo_log_gateway do contrato comum."
  type        = string

  validation {
    condition     = can(regex("^/aws/vendedlogs/bedrock-agentcore/gateway/APPLICATION_LOGS/[A-Za-z0-9][A-Za-z0-9_-]*$", var.grupo_log_gateway))
    error_message = "Informe o grupo /aws/vendedlogs/bedrock-agentcore/gateway/APPLICATION_LOGS/<id do gateway> (RF-006, ADR-0012)."
  }
}

variable "topico_alarmes_arn" {
  description = "ARN do tópico dos alarmes (output topico_alarmes_arn do módulo nucleo, T011; ADR-0008): campo topico_alarmes_arn do contrato comum."
  type        = string

  validation {
    condition     = can(regex("^arn:aws(-cn|-us-gov)?:sns:[a-z]{2}(-[a-z]+)+-[0-9]:[0-9]{12}:[A-Za-z0-9_-]{1,256}$", var.topico_alarmes_arn))
    error_message = "Informe o ARN completo do tópico SNS (arn:aws:sns:<região>:<conta>:<nome>), sem curinga (ADR-0014)."
  }
}

variable "chave_kms_arn" {
  description = "ARN da chave da plataforma (output chave_arn do módulo nucleo, T010; ADR-0001): campo chave_kms_arn do contrato comum. O parâmetro em si não usa a chave (ADR-0002)."
  type        = string

  validation {
    condition     = can(regex("^arn:aws(-cn|-us-gov)?:kms:[a-z]{2}(-[a-z]+)+-[0-9]:[0-9]{12}:key/[0-9a-f-]{36}$", var.chave_kms_arn))
    error_message = "Informe o ARN completo da chave KMS (arn:aws:kms:<região>:<conta>:key/<id>), não alias nem id."
  }
}
