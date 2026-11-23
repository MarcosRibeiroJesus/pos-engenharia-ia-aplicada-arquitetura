variable "project_name" {
  type        = string
  description = "Prefixo dos recursos."
}

variable "environment" {
  type        = string
  description = "Ambiente."
}

variable "s3_scripts_bucket" {
  type        = string
  description = "Bucket dos scripts e dados."
}

variable "s3_bucket_arn" {
  type        = string
  description = "ARN do bucket (escopo do IAM)."
}

variable "dynamodb_table_arn" {
  type        = string
  description = "Tabela onde o job publica as recomendações."
}

variable "database_name" {
  type        = string
  description = "Banco do Glue Data Catalog, com a exceção p01_recomendacao_ do ADR-0014 (vem do root)."
}

variable "kms_key_arn" {
  type        = string
  description = "Chave KMS da plataforma."
}

variable "log_retention_days" {
  type        = number
  default     = 14
  description = "Retenção dos logs."
}

variable "prefixos" {
  type = object({
    interacoes = string
    catalogo   = string
    features   = string
  })
  description = "Prefixos do lote no golden dataset (local.prefixos_do_lote do root), passados ao job de features por argumento (RF-107)."
}
