# Tabela DynamoDB sob demanda, cifrada com a CMK, com PITR e TTL opcional.
variable "nome" {
  type = string
}
variable "hash_key" {
  type = string
}
variable "range_key" {
  type    = string
  default = null
}
variable "atributos" {
  type = list(object({ name = string, type = string }))
}
variable "gsis" {
  type = list(object({
    nome      = string
    hash_key  = string
    range_key = optional(string)
    projecao  = optional(string, "ALL")
  }))
  default = []
}
variable "ttl_atributo" {
  type    = string
  default = null
}
variable "kms_key_arn" {
  type = string
}
variable "protecao_exclusao" {
  description = "Lab: false, para o destroy não deixar sobras (ADR-0007). Produção: true."
  type        = bool
  default     = false
}

resource "aws_dynamodb_table" "this" {
  name                        = var.nome
  billing_mode                = "PAY_PER_REQUEST"
  hash_key                    = var.hash_key
  range_key                   = var.range_key
  deletion_protection_enabled = var.protecao_exclusao
  tags                        = var.tags

  dynamic "attribute" {
    for_each = var.atributos
    content {
      name = attribute.value.name
      type = attribute.value.type
    }
  }

  dynamic "global_secondary_index" {
    for_each = var.gsis
    content {
      name            = global_secondary_index.value.nome
      hash_key        = global_secondary_index.value.hash_key
      range_key       = global_secondary_index.value.range_key
      projection_type = global_secondary_index.value.projecao
    }
  }

  dynamic "ttl" {
    for_each = var.ttl_atributo == null ? [] : [var.ttl_atributo]
    content {
      attribute_name = ttl.value
      enabled        = true
    }
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled     = true
    kms_key_arn = var.kms_key_arn
  }
}

output "arn" {
  value = aws_dynamodb_table.this.arn
}
output "nome" {
  value = aws_dynamodb_table.this.name
}
