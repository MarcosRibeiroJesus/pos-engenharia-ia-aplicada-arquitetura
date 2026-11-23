# Tag module deste componente (ADR-0014, D-031); project e managed-by vêm do default_tags. Não usa
# orquestracao-mwaa: o parâmetro é da base e continua no ar quando a janela é destruída, e a
# verificação de sobras da janela filtra por project e module juntos (ADR-0007).
locals {
  tags = {
    module = "entradas-janela"
  }

  # Um só valor para o recurso e para o output. No root, o mock com override_during = plan deixa o
  # insecure_value nulo no plan, por isso o TT-J02 lê o output; o run recurso_recebe_o_valor_do_output
  # (mock sem override_during) prova que o insecure_value do recurso é este mesmo valor.
  valor = jsonencode(var.entradas)
}

# A janela lê só este parâmetro, nunca o state da base (ADR-0007, furo F5). String no tier Standard:
# sem custo e sem segredo (o valor não traz credencial; o TT-J02 confere o conjunto exato de campos).
resource "aws_ssm_parameter" "entradas" {
  #checkov:skip=CKV2_AWS_34:Sem segredo: só nomes e ARNs da base; o plano fixa String para a janela ler sem kms:Decrypt (ADR-0007)
  name           = "/${var.project_name}/${var.environment}/janela/entradas"
  description    = "Entradas da base para a raiz da janela do MWAA (ADR-0007)."
  type           = "String"
  tier           = "Standard"
  insecure_value = local.valor
  tags           = local.tags
}
