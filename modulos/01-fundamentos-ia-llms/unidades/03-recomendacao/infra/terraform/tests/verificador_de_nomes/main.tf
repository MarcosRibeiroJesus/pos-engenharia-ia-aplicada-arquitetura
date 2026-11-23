# Verificador da regra de nome (TT-T02, RNF-108, D-029, ADR-0014), usado só pelo tests/prefixo.tftest.hcl.
# Recebe {"<modulo>.<tipo>.<recurso>" = nome} e reprova (validação da variável) todo nome que não
# começa pelo prefixo do projeto nem casa com uma exceção do excecoes_de_nome.json para o mesmo tipo.
# A mesma regra roda sobre os nomes reais do root e sobre a fixture sintética que precisa reprovar.
terraform {
  required_version = ">= 1.10.0"
}

variable "nomes" {
  description = "Nome de cada recurso, pela chave <modulo>.<tipo>.<recurso>."
  type        = map(string)

  validation {
    condition = alltrue([for k, n in var.nomes :
      startswith(n, jsondecode(file("${path.module}/../excecoes_de_nome.json")).prefixo)
      || anytrue([for e in jsondecode(file("${path.module}/../excecoes_de_nome.json")).excecoes :
      e.recurso == split(".", k)[1] && can(regex(e.padrao, n))])
    ])
    error_message = "Nome fora do prefixo 01-recomendacao- e fora de excecoes_de_nome.json (RNF-108, ADR-0014): ${jsonencode([for k, n in var.nomes : "${k} = ${n}" if !(startswith(n, jsondecode(file("${path.module}/../excecoes_de_nome.json")).prefixo) || anytrue([for e in jsondecode(file("${path.module}/../excecoes_de_nome.json")).excecoes : e.recurso == split(".", k)[1] && can(regex(e.padrao, n))]))])}"
  }
}

output "total" {
  description = "Quantidade de nomes verificados (a regra precisa ter o que checar)."
  value       = length(var.nomes)
}
