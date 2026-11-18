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
  default     = "ecommerce_golden_db"
  description = "Banco do Glue Catalog."
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
