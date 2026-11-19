variable "aws_region" {
  description = "Região do stack. O Claude no Bedrock usa o endpoint global (sem acréscimo de preço)."
  type        = string
  default     = "us-east-1"
}

variable "projeto" {
  type    = string
  default = "assistente-agendamento"
}

variable "ambiente" {
  type    = string
  default = "lab"
  validation {
    condition     = contains(["lab", "prod"], var.ambiente)
    error_message = "Ambiente deve ser lab ou prod."
  }
}

variable "teto_mensal_usd" {
  description = "Teto do AWS Budgets. PENDENTE: decisão do dono do repositório; sem valor padrão de propósito."
  type        = number
}

variable "custo_diario_llm_alarme_usd" {
  description = "Alarme quando o custo estimado de tokens no dia passa deste valor."
  type        = number
  default     = 1
}

variable "modo_llm" {
  description = "gravado: respostas gravadas, sem chamada ao Claude (padrão do lab e dos testes). bedrock: Claude no Amazon Bedrock."
  type        = string
  default     = "gravado"
  validation {
    condition     = contains(["gravado", "bedrock"], var.modo_llm)
    error_message = "modo_llm deve ser gravado ou bedrock."
  }
}

variable "cadeia_modelos" {
  description = "Ordem de fallback do gateway (ADR-0001). IDs do Claude no Amazon Bedrock (endpoint bedrock-mantle)."
  type        = list(string)
  default     = ["anthropic.claude-haiku-5-5", "anthropic.claude-sonnet-5-5"]
}

variable "precos_usd_por_mtok" {
  description = "Preço por milhão de tokens usado no ledger de custo. Valores da API da Anthropic (2026-11); conferir a página de preços do Bedrock antes de usar em produção."
  type        = map(object({ entrada = number, saida = number }))
  default = {
    "anthropic.claude-haiku-5-5"  = { entrada = 0.10, saida = 0.50 }
    "anthropic.claude-sonnet-5-5" = { entrada = 2.00, saida = 10.00 }
  }
}

variable "cota_tokens_dia_por_cliente" {
  description = "Cota diária de tokens (entrada + saída) por cliente do gateway."
  type        = number
  default     = 200000
}

variable "cota_diaria_requisicoes" {
  description = "Cota diária de requisições por chave de API do canal (usage plan)."
  type        = number
  default     = 500
}

variable "timeout_aprovacao_s" {
  description = "Tempo máximo de espera pela decisão humana no cancelamento."
  type        = number
  default     = 86400
}

variable "habilitar_waf" {
  description = "WAF regional na borda. Desligado no lab por custo fixo mensal (ADR-0007)."
  type        = bool
  default     = false
}

variable "configurar_conta_logs_apigw" {
  description = "Cria a role de logs do API Gateway na conta (configuração única por região)."
  type        = bool
  default     = true
}

variable "emails_alerta" {
  type    = list(string)
  default = []
}

variable "diretorio_pacotes" {
  description = "Onde o build (npm run build) deixa os pacotes das Lambdas."
  type        = string
  default     = null
}
