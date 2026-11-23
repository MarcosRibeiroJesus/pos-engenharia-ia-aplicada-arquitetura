variable "project_name" {
  type        = string
  description = "Prefixo dos recursos."
}

variable "environment" {
  type        = string
  description = "Ambiente."
}

variable "s3_output_bucket" {
  type        = string
  description = "Bucket dos resultados."
}

variable "database_name" {
  type        = string
  description = "Banco do Glue Data Catalog, com a exceção p01_recomendacao_ do ADR-0014 (vem do root)."
}

variable "kms_key_arn" {
  type        = string
  description = "Chave KMS da plataforma."
}

variable "force_destroy" {
  type        = bool
  default     = true
  description = "O destroy remove o workgroup com histórico (lab)."
}
