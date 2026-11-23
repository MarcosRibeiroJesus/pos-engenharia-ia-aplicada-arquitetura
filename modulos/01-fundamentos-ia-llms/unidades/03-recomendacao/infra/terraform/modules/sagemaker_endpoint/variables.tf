variable "project_name" {
  type        = string
  description = "Prefixo dos recursos."
}

variable "environment" {
  type        = string
  description = "Ambiente."
}

variable "enable_serverless_inference" {
  type        = bool
  default     = true
  description = "Serverless Inference (custo zero ocioso)."
}

variable "kms_key_arn" {
  type        = string
  description = "Chave KMS da plataforma."
}

variable "log_retention_days" {
  type        = number
  default     = 14
  description = "Retenção dos logs do endpoint."
}

variable "model_image" {
  type        = string
  default     = "683313688378.dkr.ecr.us-east-1.amazonaws.com/sagemaker-xgboost:1.7-1"
  description = "Imagem do re-ranker."
}

variable "model_data_url" {
  type        = string
  default     = null
  description = "model.tar.gz no S3 produzido pelo treino (obrigatório para o endpoint servir de verdade)."
}
