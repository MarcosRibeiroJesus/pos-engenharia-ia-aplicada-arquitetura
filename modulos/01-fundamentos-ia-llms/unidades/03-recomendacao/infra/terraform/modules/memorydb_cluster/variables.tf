variable "project_name" {
  type        = string
  description = "Prefixo dos recursos."
}

variable "environment" {
  type        = string
  description = "Ambiente."
}

variable "subnet_ids" {
  type        = list(string)
  description = "Subnets privadas."
}

variable "security_group_ids" {
  type        = list(string)
  description = "Security groups."
}

variable "node_type" {
  type        = string
  default     = "db.t4g.small"
  description = "Menor nó que suporta busca vetorial."
}

variable "kms_key_arn" {
  type        = string
  description = "Chave KMS da plataforma."
}
