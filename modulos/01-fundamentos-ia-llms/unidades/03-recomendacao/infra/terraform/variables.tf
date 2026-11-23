variable "aws_region" {
  description = "Região AWS."
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Postura do ambiente. 'lab' é a menor escala que demonstra o padrão."
  type        = string
  default     = "lab"

  validation {
    condition     = contains(["lab", "poc", "dev", "prod"], var.environment)
    error_message = "environment deve ser lab, poc, dev ou prod."
  }
}

variable "project_name" {
  description = "Prefixo dos nomes dos recursos (o prefixo 01-recomendacao- entra na T012). Não define a tag project, que é fixa no local.tags_padrao (D-031)."
  type        = string
  default     = "recsys"

  validation {
    condition     = can(regex("^[a-z0-9-]{3,20}$", var.project_name))
    error_message = "project_name: 3 a 20 caracteres [a-z0-9-] (limites de nome do ALB e do MemoryDB)."
  }
}

variable "enable_serverless_inference" {
  description = "SageMaker Serverless Inference (custo zero ocioso)."
  type        = bool
  default     = true
}

variable "force_destroy" {
  description = "Permite que o destroy apague buckets e repositórios com conteúdo (lab)."
  type        = bool
  default     = true
}

variable "enable_mwaa" {
  description = "Liga o MWAA e os endpoints de que ele precisa. Maior custo fixo do stack (ADR-0002)."
  type        = bool
  default     = false
}

variable "expose_api_publicly" {
  description = "Opt-in para ALB público com HTTPS. Exige certificate_arn."
  type        = bool
  default     = false
}

variable "certificate_arn" {
  description = "Certificado ACM do listener HTTPS (obrigatório se expose_api_publicly)."
  type        = string
  default     = null
}

variable "enable_interface_endpoints" {
  description = "Endpoints de interface para a saída das tasks (ADR-0002)."
  type        = bool
  default     = true
}

variable "interface_endpoint_az_count" {
  description = "AZs com endpoints de interface. 1 no lab, 2+ em produção (ADR-0002)."
  type        = number
  default     = 1
}

variable "ecs_desired_count" {
  description = "Tasks do serviço de recomendação."
  type        = number
  default     = 1
}

variable "container_image_tag" {
  description = "Tag da imagem no ECR do stack."
  type        = string
  default     = "lab"
}

variable "bedrock_model_id" {
  description = "Modelo Claude no Bedrock para as explicações (ADR-0004)."
  type        = string
  default     = "anthropic.claude-haiku-5-5"
}

variable "explanations_enabled" {
  description = "Liga a explicação por recomendação com Claude (opt-in por requisição)."
  type        = bool
  default     = true
}

variable "log_retention_days" {
  description = "Retenção dos log groups."
  type        = number
  default     = 14
}

variable "alert_emails" {
  description = "E-mails assinantes do tópico de alertas (alarmes e Budgets)."
  type        = list(string)
  default     = []
}

variable "monthly_budget_usd" {
  description = "Teto mensal do AWS Budgets para a conta do lab."
  type        = number
  default     = 10
}
