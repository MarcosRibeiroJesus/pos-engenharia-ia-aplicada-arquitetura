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
  description = "Chave KMS do tópico SNS."
}

variable "ecs_service_name" {
  type        = string
  description = "Serviço ECS."
}

variable "ecs_cluster_name" {
  type        = string
  description = "Cluster ECS."
}

variable "alb_arn_suffix" {
  type        = string
  description = "Dimensão LoadBalancer das métricas do ALB."
}

variable "target_group_arn_suffix" {
  type        = string
  description = "Dimensão TargetGroup."
}

variable "sagemaker_endpoint_name" {
  type        = string
  description = "Endpoint do re-ranker."
}

variable "metrics_namespace" {
  type        = string
  default     = "Ecommerce/Recommendations"
  description = "Namespace das métricas do serviço."
}

variable "alert_emails" {
  type        = list(string)
  default     = []
  sensitive   = true
  description = "Assinantes por e-mail (exigem confirmação manual). Sensível: fora do plan e dos outputs."
}

variable "teto_diario_usd" {
  type        = number
  description = "Teto do AWS Budgets diário, em USD: o custo estimado de um dia de demonstração (D-021)."

  validation {
    condition     = var.teto_diario_usd > 0 && var.teto_diario_usd <= 20
    error_message = "teto_diario_usd precisa ser positivo e caber no limite mensal da conta, US$ 20 (D-022)."
  }
}

variable "alertas_do_orcamento" {
  type = list(object({
    threshold         = number
    notification_type = string
  }))
  default = [
    { threshold = 80, notification_type = "ACTUAL" },
    { threshold = 100, notification_type = "ACTUAL" },
  ]
  description = "Alertas do Budgets diário, em % do teto. Só ACTUAL (A09 da análise 1)."

  validation {
    condition     = length(var.alertas_do_orcamento) > 0 && alltrue([for a in var.alertas_do_orcamento : a.notification_type == "ACTUAL"])
    error_message = "O Budgets diário só aceita alertas ACTUAL: a previsão nunca dispara num stack de um dia (A09)."
  }
}
