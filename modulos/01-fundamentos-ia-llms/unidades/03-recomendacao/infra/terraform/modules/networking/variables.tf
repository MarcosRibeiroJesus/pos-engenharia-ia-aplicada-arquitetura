variable "project_name" {
  type        = string
  description = "Prefixo dos recursos."
}

variable "environment" {
  type        = string
  description = "Ambiente."
}

variable "vpc_cidr" {
  type        = string
  default     = "10.0.0.0/16"
  description = "CIDR da VPC."
}

variable "az_count" {
  type        = number
  default     = 2
  description = "AZs das subnets privadas (ALB e MemoryDB exigem 2)."
}

variable "kms_key_arn" {
  type        = string
  description = "Chave KMS dos logs."
}

variable "expose_api_publicly" {
  type        = bool
  default     = false
  description = "Cria IGW e subnets públicas para um ALB público (opt-in)."
}

variable "public_ingress_cidrs" {
  type        = list(string)
  default     = ["0.0.0.0/0"]
  description = "Origens aceitas no ALB público (só com expose_api_publicly)."
}

variable "enable_interface_endpoints" {
  type        = bool
  default     = true
  description = "Cria os endpoints de interface (ADR-0002)."
}

variable "interface_endpoint_services" {
  type        = list(string)
  default     = ["ecr.api", "ecr.dkr", "logs", "monitoring", "sagemaker.runtime", "bedrock-runtime"]
  description = "Serviços com endpoint de interface para as tasks."
}

variable "interface_endpoint_az_count" {
  type        = number
  default     = 1
  description = "AZs que recebem ENIs dos endpoints (1 no lab)."

  validation {
    condition     = var.interface_endpoint_az_count >= 1
    error_message = "Ao menos 1 AZ."
  }
}

variable "enable_mwaa" {
  type        = bool
  default     = false
  description = "Adiciona os endpoints de que o MWAA privado precisa."
}

variable "enable_flow_logs" {
  type        = bool
  default     = true
  description = "VPC Flow Logs (tráfego rejeitado) no CloudWatch."
}

variable "log_retention_days" {
  type        = number
  default     = 14
  description = "Retenção dos logs."
}
