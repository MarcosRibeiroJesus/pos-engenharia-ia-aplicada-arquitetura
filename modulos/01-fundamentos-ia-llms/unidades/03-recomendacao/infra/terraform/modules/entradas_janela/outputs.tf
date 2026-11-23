output "parametro" {
  description = "Nome, tipo, tier e valor (JSON) do parâmetro das entradas da janela (TT-J02)."
  value = {
    nome  = aws_ssm_parameter.entradas.name
    arn   = aws_ssm_parameter.entradas.arn
    tipo  = aws_ssm_parameter.entradas.type
    tier  = aws_ssm_parameter.entradas.tier
    valor = local.valor
  }
}

output "tags_dos_recursos" {
  description = "Atributo tags de cada recurso tagueável do módulo, para o teste de tags (TT-T01)."
  value = merge(
    { "aws_ssm_parameter.entradas" = aws_ssm_parameter.entradas.tags },
  )
}

# Nome de cada recurso nomeado do módulo, para o teste de prefixo (TT-T02, ADR-0014).
output "nomes_dos_recursos" {
  description = "Nome de cada recurso nomeado do módulo, para o teste de prefixo (TT-T02)."
  value = merge(
    { "aws_ssm_parameter.entradas" = aws_ssm_parameter.entradas.name },
  )
}

