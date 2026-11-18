variable "project_name" {
  type        = string
  description = "Prefixo dos recursos."
}

variable "environment" {
  type        = string
  description = "Ambiente."
}

variable "force_destroy" {
  type        = bool
  default     = true
  description = "Permite o destroy com objetos (lab)."
}

variable "kms_key_arn" {
  type        = string
  description = "Chave KMS da plataforma."
}
