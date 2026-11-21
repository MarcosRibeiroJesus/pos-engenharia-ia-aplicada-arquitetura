variable "teto_diario_usd" {
  description = <<-EOT
    Teto de um dia de demonstração, em USD (Art. V, D-021). Sem padrão aqui: o valor vem do root,
    cujo padrão o TH-06 compara com teto_diario_usd do harness/estado.json.
  EOT
  type        = number

  validation {
    condition     = var.teto_diario_usd > 0
    error_message = "O teto diário é positivo: orçamento zero avisaria a cada centavo."
  }
}

variable "nomes_dos_alarmes" {
  description = <<-EOT
    Nomes exatos dos alarmes da plataforma que publicam no tópico cifrado (T017). Entram como
    aws:SourceArn exato na política da chave: o ADR-0014 proíbe curinga no valor (alarm:*), e o
    alarme não pode ser referenciado direto porque depende do tópico, que depende da chave.
  EOT
  type        = list(string)

  validation {
    condition     = length(var.nomes_dos_alarmes) > 0
    error_message = "Informe ao menos um alarme: a declaração do CloudWatch exige aws:SourceArn exato (ADR-0001)."
  }
  validation {
    condition = alltrue([for n in var.nomes_dos_alarmes :
    startswith(n, "00-plataforma-agentes-") && !can(regex("[*?]", n))])
    error_message = "Cada alarme começa por 00-plataforma-agentes- e não tem curinga (* ou ?), pelo ADR-0014."
  }
}
