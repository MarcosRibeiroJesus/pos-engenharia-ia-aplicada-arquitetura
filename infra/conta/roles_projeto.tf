# Roles de deploy e de plan por projeto, com ABAC (RNF-105 e ADR-0015 da D01, D-029, Art. IV).
# Geradas por esta lista: um projeto novo entra aqui com os serviços que o stack dele usa. As ações
# sem condição de tag ficam só na lista nomeada tests/acoes_sem_condicao_de_tag.json, com a fonte de
# cada item, e o módulo nega no plan qualquer declaração fora dessas regras (TT-I01).
locals {
  projetos_iam = {
    "01-recomendacao" = {
      servicos = [
        "ec2", "elasticloadbalancing", "dynamodb", "memorydb", "glue", "athena", "kms",
        "ecs", "ecr", "sagemaker", "airflow", "bedrock", "logs", "cloudwatch", "sns", "ssm", "iam",
      ]
    }
  }
}

module "roles_projeto" {
  source   = "./modules/role-projeto"
  for_each = local.projetos_iam

  chave             = each.key
  servicos          = each.value.servicos
  conta             = data.aws_caller_identity.atual.account_id
  regiao            = var.regiao
  repositorio       = var.repositorio_github
  oidc_provider_arn = aws_iam_openid_connect_provider.github.arn
  state_bucket      = local.state_bucket
  state_kms_key_arn = aws_kms_key.state.arn
  lista_sem_tag     = file("${path.module}/tests/acoes_sem_condicao_de_tag.json")
  # Recursos da conta: com project = <chave>, a própria deploy os alteraria pelo ABAC.
  tags = local.tags_identidade
}
