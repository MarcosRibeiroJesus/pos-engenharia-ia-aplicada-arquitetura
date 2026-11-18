variable "project_name" {
  type        = string
  description = "Prefixo dos recursos."
}

variable "environment" {
  type        = string
  description = "Ambiente."
}

variable "table_name" {
  type        = string
  default     = "user_recommendations"
  description = "Sufixo do nome da tabela."
}

variable "kms_key_arn" {
  type        = string
  description = "Chave KMS da plataforma."
}

variable "deletion_protection" {
  type        = bool
  default     = false
  description = "Proteção contra exclusão (true em produção)."
}
