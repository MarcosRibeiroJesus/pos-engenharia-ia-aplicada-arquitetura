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

# ---------------------------------------------------------------- alarmes (T017)

variable "nomes_dos_alarmes" {
  description = <<-EOT
    Nomes exatos dos cinco alarmes do RNF-003: o local.nomes_dos_alarmes do root, a mesma lista que
    o nucleo cita como aws:SourceArn exato na política da chave e na do tópico (ADR-0014). Cada
    nome termina no tipo do alarme (gateway-system-errors, gateway-throttles, gateway-user-errors,
    motor-system-errors, motor-deny-decisions), e o módulo escolhe o nome de cada alarme por esse
    sufixo. Sem padrão: um nome fora da lista não publicaria no tópico cifrado.
  EOT
  type        = list(string)

  validation {
    condition     = length(var.nomes_dos_alarmes) == 5 && length(distinct(var.nomes_dos_alarmes)) == 5
    error_message = "Informe os cinco nomes distintos dos alarmes do RNF-003 (local.nomes_dos_alarmes do root)."
  }
  validation {
    condition = alltrue([for n in var.nomes_dos_alarmes :
    startswith(n, "00-plataforma-agentes-") && can(regex("^[A-Za-z0-9-]{1,255}$", n))])
    error_message = "Cada alarme começa por 00-plataforma-agentes- e só tem letras, dígitos e hífen: sem curinga (ADR-0014)."
  }
  validation {
    condition = alltrue([for tipo in ["gateway-system-errors", "gateway-throttles", "gateway-user-errors", "motor-system-errors", "motor-deny-decisions"] :
    length([for n in var.nomes_dos_alarmes : n if endswith(n, "-${tipo}")]) == 1])
    error_message = "A lista tem exatamente um nome terminado em cada tipo: gateway-system-errors, gateway-throttles, gateway-user-errors, motor-system-errors e motor-deny-decisions."
  }
}

variable "topico_alarmes_arn" {
  description = "ARN do tópico cifrado dos alarmes (output topico_alarmes_arn do módulo nucleo, T011; ADR-0008): única ação dos alarmes."
  type        = string

  validation {
    condition     = can(regex("^arn:aws(-cn|-us-gov)?:sns:[a-z]{2}(-[a-z]+)+-[0-9]:[0-9]{12}:[A-Za-z0-9_-]{1,256}$", var.topico_alarmes_arn))
    error_message = "Informe o ARN completo do tópico SNS (arn:aws:sns:<região>:<conta>:<nome>), sem curinga (ADR-0014)."
  }
}

variable "policy_engine_id" {
  description = "Id do motor de política (output policy_engine_id do módulo politica, T015; no root do Floci, valor sintético fixo, ADR-0009): filtro dos alarmes do motor (ADR-0013)."
  type        = string

  validation {
    # O id entra num literal da consulta do Metrics Insights: sem aspas, espaço nem curinga.
    condition     = can(regex("^[A-Za-z][A-Za-z0-9_-]{0,99}$", var.policy_engine_id))
    error_message = "Informe o id do motor (letra inicial, depois letras, dígitos, hífen e sublinhado), sem aspas nem curinga."
  }
}
