variable "project_name" {
  type        = string
  description = "Project name"
}

variable "environment" {
  type        = string
  description = "Environment name"
}

variable "s3_bucket_arn" {
  type        = string
  description = "ARN of the S3 Golden Dataset bucket to register in Lake Formation"
}

variable "database_name" {
  type        = string
  description = "Banco do Glue Data Catalog, com a exceção p01_recomendacao_ do ADR-0014 (vem do root)."
}

variable "glue_role_arn" {
  type        = string
  description = "Role do job do Glue que lê e escreve no catálogo."
}
