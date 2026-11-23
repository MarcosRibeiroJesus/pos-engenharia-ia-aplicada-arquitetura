variable "chave" {
  description = "Chave do projeto em harness/estado.json (NN-nome-em-kebab); prefixo dos nomes e valor da tag project (D-029, D-031)."
  type        = string
  validation {
    condition     = can(regex("^[0-9]{2}-[a-z0-9]+(-[a-z0-9]+)*$", var.chave))
    error_message = "A chave segue o padrão da política de tags: NN-nome-em-kebab (D-031)."
  }
}

variable "servicos" {
  description = "Serviços do catálogo que o stack do projeto usa; cada um gera as declarações Criar (aws:RequestTag) e Alterar (aws:ResourceTag)."
  type        = list(string)
  default = [
    "ec2", "elasticloadbalancing", "dynamodb", "memorydb", "glue", "athena", "kms",
    "ecs", "ecr", "sagemaker", "airflow", "bedrock", "logs", "cloudwatch", "sns", "ssm", "iam",
  ]
}

variable "conta" {
  description = "Id da conta AWS."
  type        = string
}

variable "regiao" {
  description = "Região dos recursos do projeto."
  type        = string
}

variable "repositorio" {
  description = "Repositório do GitHub no formato dono/repo, usado nos subjects do OIDC."
  type        = string
  validation {
    condition     = can(regex("^[A-Za-z0-9-]+/[A-Za-z0-9._-]+$", var.repositorio))
    error_message = "Use dono/repo, sem curinga."
  }
}

variable "ambientes_deploy" {
  description = "Ambientes do GitHub em que a role de deploy pode ser assumida: o do apply e o do destroy (D-024)."
  type        = list(string)
  default     = ["aws-lab", "aws-lab-destroy"]
  validation {
    condition     = length(var.ambientes_deploy) == 2 && toset(var.ambientes_deploy) == toset(["aws-lab", "aws-lab-destroy"])
    error_message = "A role de deploy confia exatamente nos ambientes aws-lab e aws-lab-destroy (RNF-105, D-024); um terceiro subject é negado."
  }
}

variable "oidc_provider_arn" {
  description = "ARN do provedor OIDC do GitHub da conta (identidade.tf)."
  type        = string
}

variable "state_bucket" {
  description = "Nome do bucket de state da conta."
  type        = string
}

variable "state_kms_key_arn" {
  description = "ARN da CMK do bucket de state (saída state_kms_key_arn)."
  type        = string
}

variable "lista_sem_tag" {
  description = "Conteúdo JSON da lista nomeada das ações sem condição de tag (tests/acoes_sem_condicao_de_tag.json), com marcadores."
  type        = string
  validation {
    condition = alltrue([for e in try(jsondecode(var.lista_sem_tag).excecoes, [{}]) :
      can(regex("^[A-Za-z0-9]+$", e.id))
      && length(try(e.motivo, "")) > 0
      && length(try(e.fonte, "")) > 0
      && can(regex("^[0-9]{4}-[0-9]{2}-[0-9]{2}$", try(e.data_consulta, "")))
      && length(try(e.acoes, [])) > 0
      && length(try(e.recursos, [])) > 0
      && alltrue([for a in try(e.acoes, []) : a != "*" && !endswith(a, ":*")])
      && (!contains(try(e.recursos, []), "*") || try(e.asterisco_justificado, false))
      && length(setsubtract(try(e.roles, []), ["deploy", "plan"])) == 0
    ])
    error_message = "Todo item da lista nomeada tem id, motivo, fonte, data da consulta, ações sem svc:* e recursos; '*' só com asterisco_justificado."
  }
}

variable "declaracoes_extras_deploy" {
  description = "Declarações próprias do projeto para a role de deploy. Passam pelo mesmo gate: condição de tag do projeto ou item da lista nomeada."
  type        = any
  default     = []
}

variable "tags" {
  description = "Tags das roles e políticas de identidade (project = 00-conta: são recursos da conta)."
  type        = map(string)
}
