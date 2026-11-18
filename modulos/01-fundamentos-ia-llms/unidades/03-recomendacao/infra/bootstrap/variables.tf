variable "aws_region" {
  type        = string
  default     = "us-east-1"
  description = "Região do bucket de state."
}

variable "project_name" {
  type        = string
  default     = "recsys"
  description = "Prefixo dos recursos e valor da tag project."
}

variable "state_bucket_name" {
  type        = string
  default     = null
  description = "Nome do bucket de state. Padrão: <project>-tfstate-<account_id>."
}
