variable "project_name" {
  type        = string
  description = "Prefixo dos recursos (a chave do projeto)."
}

variable "environment" {
  type        = string
  description = "Ambiente."
}

# Contrato da base com a raiz da janela (ADR-0007, RF-107, TT-J02). O conjunto de campos é exato: um
# campo faltando quebraria a janela no apply, e um a mais (um segredo, por exemplo) não tem lugar num
# parâmetro String. Os jobs de publicação do Glue (T050) e a imagem do treino (T051) entram aqui
# quando os recursos existirem.
variable "entradas" {
  type        = any
  description = "Valores da base que a janela do MWAA lê (VPC, subnets, KMS, bucket, dados, jobs e treino)."

  validation {
    condition = try(
      toset(keys(var.entradas)) == toset([
        "vpc_id", "subnets_privadas", "kms_key_arn", "bucket_golden", "prefixo_interacoes", "banco",
        "tabelas", "workgroup_athena", "jobs_glue", "treino",
      ])
      && toset(keys(var.entradas.tabelas)) == toset(["interacoes", "catalogo"])
      && toset(keys(var.entradas.jobs_glue)) == toset(["features"])
      && toset(keys(var.entradas.treino)) == toset(["prefixo_do_job", "role_arn"]),
      false
    )
    error_message = "As entradas da janela têm exatamente os campos do contrato (ADR-0007, TT-J02)."
  }

  # Tier Standard: até 4 KB por valor (https://docs.aws.amazon.com/systems-manager/latest/userguide/parameter-store-advanced-parameters.html).
  validation {
    condition     = length(jsonencode(var.entradas)) <= 4096
    error_message = "As entradas da janela passam dos 4 KB do tier Standard do Parameter Store."
  }
}
