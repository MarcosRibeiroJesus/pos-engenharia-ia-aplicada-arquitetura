variable "project_name" {
  type        = string
  description = "Prefixo dos recursos."
}

variable "environment" {
  type        = string
  description = "Ambiente."
}

variable "vpc_id" {
  type        = string
  description = "VPC."
}

variable "vpc_cidr" {
  type        = string
  description = "CIDR da VPC (destino da saída do SG)."
}

variable "private_subnet_ids" {
  type        = list(string)
  description = "Subnets privadas (2 AZs)."
}

variable "s3_bucket_arn" {
  type        = string
  description = "Bucket dos DAGs."
}

variable "s3_bucket_name" {
  type        = string
  description = "Nome do bucket dos DAGs."
}

variable "enable_mwaa" {
  type        = bool
  default     = false
  description = "Liga o ambiente MWAA (maior custo fixo do stack)."
}

variable "kms_key_arn" {
  type        = string
  description = "Chave KMS da plataforma."
}
