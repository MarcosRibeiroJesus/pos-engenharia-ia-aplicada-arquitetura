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
  description = "Assinantes por e-mail (exigem confirmação manual)."
}

variable "monthly_budget_usd" {
  type        = number
  default     = 10
  description = "Teto mensal do orçamento."
}

variable "budget_filter_by_project_tag" {
  type        = bool
  default     = false
  description = "Filtra o orçamento pela tag project (exige cost allocation tag ativa)."
}
