# Auxiliar do TT-I01 (roles_projeto.tftest.hcl): lê a lista nomeada versionada ao lado do teste e
# troca os marcadores pelos valores sintéticos do teste, sem passar pelo código do infra/conta.
# Assim o teste compara a política gerada com a lista revisada, não com ela mesma.
terraform {
  required_version = ">= 1.10.0"
}

variable "conta" { type = string }
variable "regiao" { type = string }
variable "chave" { type = string }
variable "bucket_state" { type = string }
variable "chave_kms_state" { type = string }

locals {
  bruta = file("${path.module}/../acoes_sem_condicao_de_tag.json")
  renderizada = replace(replace(replace(replace(replace(replace(local.bruta,
    "{conta}", var.conta),
    "{regiao}", var.regiao),
    "{chave_glue}", replace(var.chave, "-", "_")),
    "{chave_kms_state}", var.chave_kms_state),
    "{bucket_state}", var.bucket_state),
  "{chave}", var.chave)
}

output "bruta" {
  value = local.bruta
}

output "excecoes" {
  value = jsondecode(local.renderizada).excecoes
}

output "documentadas" {
  value = jsondecode(local.renderizada).com_condicao_de_tag_documentadas
}
