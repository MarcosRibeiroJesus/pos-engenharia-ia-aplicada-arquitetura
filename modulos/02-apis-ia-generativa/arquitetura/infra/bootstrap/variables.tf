variable "aws_region" {
  type        = string
  default     = "us-east-1"
  description = "Região do bucket de state."
}

variable "project_name" {
  type        = string
  default     = "agenda"
  description = "Prefixo dos recursos e valor da tag project."
}

variable "state_bucket_name" {
  type        = string
  default     = null
  description = "Nome do bucket de state. Padrão: <project>-tfstate-<account_id>."
}

variable "github_repository" {
  type        = string
  default     = null
  description = "owner/repo autorizado a assumir as roles de CI via OIDC. null = não cria as roles."
}

variable "github_deploy_environment" {
  type        = string
  default     = "aws-lab"
  description = "Ambiente protegido do GitHub que pode assumir a role de deploy/destroy."
}

variable "create_github_oidc_provider" {
  type        = bool
  default     = true
  description = "false se a conta já tem o provedor OIDC token.actions.githubusercontent.com."
}
