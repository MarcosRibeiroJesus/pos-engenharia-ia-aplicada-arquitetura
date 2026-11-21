variable "project_name" {
  type        = string
  description = "Prefixo dos recursos."
}

variable "environment" {
  type        = string
  description = "Ambiente."
}

variable "kms_key_arn" {
  type        = string
  description = "Chave KMS da plataforma."
}

variable "vpc_id" {
  type        = string
  description = "VPC."
}

variable "alb_subnet_ids" {
  type        = list(string)
  description = "Subnets do ALB (privadas por padrão)."
}

variable "private_subnet_ids" {
  type        = list(string)
  description = "Subnets privadas das tasks."
}

variable "alb_security_group_id" {
  type        = string
  description = "SG do ALB."
}

variable "ecs_security_group_id" {
  type        = string
  description = "SG das tasks."
}

variable "expose_api_publicly" {
  type        = bool
  default     = false
  description = "ALB público com HTTPS (opt-in)."
}

variable "certificate_arn" {
  type        = string
  default     = null
  description = "Certificado ACM do listener HTTPS."

  validation {
    condition     = !var.expose_api_publicly || var.certificate_arn != null
    error_message = "R2: API pública exige certificate_arn (listener HTTPS)."
  }
}

variable "force_destroy" {
  type        = bool
  default     = true
  description = "O destroy apaga o repositório ECR com imagens (lab)."
}

variable "desired_count" {
  type        = number
  default     = 1
  description = "Número de tasks."
}

variable "container_image_tag" {
  type        = string
  default     = "lab"
  description = "Tag da imagem no ECR."
}

variable "dynamodb_table_name" {
  type        = string
  description = "Tabela de recomendações em lote."
}

variable "dynamodb_table_arn" {
  type        = string
  description = "ARN da tabela (escopo do IAM)."
}

variable "memorydb_cluster_endpoint" {
  type        = string
  description = "host:porta do MemoryDB."
}

variable "sagemaker_endpoint_name" {
  type        = string
  description = "Endpoint do re-ranker."
}

variable "sagemaker_endpoint_arn" {
  type        = string
  description = "ARN do endpoint (escopo do IAM)."
}

variable "bedrock_model_id" {
  type        = string
  description = "Modelo Claude no Bedrock (ADR-0004)."
}

variable "explanations_enabled" {
  type        = bool
  default     = true
  description = "Liga as explicações com Claude."
}

variable "metrics_namespace" {
  type        = string
  default     = "Ecommerce/Recommendations"
  description = "Namespace das métricas do serviço."
}

variable "log_retention_days" {
  type        = number
  default     = 14
  description = "Retenção dos logs."
}
