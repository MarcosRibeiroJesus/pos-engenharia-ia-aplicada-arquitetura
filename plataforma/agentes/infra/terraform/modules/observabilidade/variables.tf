# Entradas de composição obrigatórias, sem padrão (T013, ADR-0011): no root real vêm dos módulos
# gateway e nucleo; no root do Floci, de valores sintéticos fixos (ADR-0009). A T017 e a T018 seguem
# o mesmo padrão.

variable "gateway_id" {
  description = "Id do gateway (output gateway_id do módulo gateway, T013): compõe o nome do grupo de logs entregue (RF-006, ADR-0012)."
  type        = string

  validation {
    # Sem curinga nem barra: o id entra no nome do grupo e na condição da chave (ADR-0001).
    condition     = can(regex("^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$", var.gateway_id))
    error_message = "Informe o id do gateway (letras, dígitos, hífen e sublinhado), sem curinga nem barra."
  }
}

variable "gateway_arn" {
  description = "ARN do gateway (output gateway_arn do módulo gateway, T013): recurso das fontes de entrega de logs e traces (RF-006)."
  type        = string

  validation {
    condition     = can(regex("^arn:aws(-cn|-us-gov)?:bedrock-agentcore:[a-z]{2}(-[a-z]+)+-[0-9]:[0-9]{12}:gateway/[A-Za-z0-9][A-Za-z0-9_-]*$", var.gateway_arn))
    error_message = "Informe o ARN completo do gateway (arn:aws:bedrock-agentcore:<região>:<conta>:gateway/<id>), sem curinga (ADR-0014)."
  }
}

variable "kms_key_arn" {
  description = "ARN da chave do cliente da plataforma (output chave_arn do módulo nucleo, T010; ADR-0001). Vai em kms_key_id dos grupos de log, que exige o ARN."
  type        = string

  validation {
    condition     = can(regex("^arn:aws[a-z-]*:kms:[a-z]{2}(-[a-z]+)+-[0-9]:[0-9]{12}:key/[0-9a-f-]{36}$", var.kms_key_arn))
    error_message = "Informe o ARN completo de uma chave KMS (arn:aws:kms:<região>:<conta>:key/<id>), não alias nem id: o CloudWatch Logs só aceita o ARN."
  }
}
