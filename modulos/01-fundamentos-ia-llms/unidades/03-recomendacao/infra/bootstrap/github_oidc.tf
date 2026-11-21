# GitHub Actions sem chaves estáticas: o workflow troca o token OIDC do GitHub por
# credenciais temporárias. Duas roles com confiança diferente (ADR-0005):
#  - plan: qualquer pull_request do repositório; só leitura + state.
#  - deploy: só jobs no ambiente protegido (aprovação manual no GitHub).
locals {
  github_enabled = var.github_repository != null
  oidc_host      = "token.actions.githubusercontent.com"
  oidc_arn = local.github_enabled ? (
    var.create_github_oidc_provider ? aws_iam_openid_connect_provider.github[0].arn :
    "arn:aws:iam::${data.aws_caller_identity.current.account_id}:oidc-provider/${local.oidc_host}"
  ) : null
  state_object_arn = "${aws_s3_bucket.state.arn}/modulos/01-fundamentos-ia-llms/03-recomendacao/*"
}

resource "aws_iam_openid_connect_provider" "github" {
  count          = local.github_enabled && var.create_github_oidc_provider ? 1 : 0
  url            = "https://${local.oidc_host}"
  client_id_list = ["sts.amazonaws.com"]
}

data "aws_iam_policy_document" "plan_trust" {
  count = local.github_enabled ? 1 : 0
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [local.oidc_arn]
    }
    condition {
      test     = "StringEquals"
      variable = "${local.oidc_host}:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "${local.oidc_host}:sub"
      values   = ["repo:${var.github_repository}:pull_request"]
    }
  }
}

data "aws_iam_policy_document" "deploy_trust" {
  count = local.github_enabled ? 1 : 0
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [local.oidc_arn]
    }
    condition {
      test     = "StringEquals"
      variable = "${local.oidc_host}:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "${local.oidc_host}:sub"
      values   = ["repo:${var.github_repository}:environment:${var.github_deploy_environment}"]
    }
  }
}

resource "aws_iam_role" "plan" {
  count                = local.github_enabled ? 1 : 0
  name                 = "${var.project_name}-gha-plan"
  assume_role_policy   = data.aws_iam_policy_document.plan_trust[0].json
  max_session_duration = 3600
}

resource "aws_iam_role_policy_attachment" "plan_readonly" {
  count      = local.github_enabled ? 1 : 0
  role       = aws_iam_role.plan[0].name
  policy_arn = "arn:aws:iam::aws:policy/ReadOnlyAccess"
}

# O plan lê o state e grava/apaga o lockfile; não altera o state.
resource "aws_iam_role_policy" "plan_state" {
  count = local.github_enabled ? 1 : 0
  name  = "tfstate-read-and-lock"
  role  = aws_iam_role.plan[0].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Effect = "Allow", Action = ["s3:ListBucket"], Resource = aws_s3_bucket.state.arn },
      { Effect = "Allow", Action = ["s3:GetObject"], Resource = local.state_object_arn },
      { Effect = "Allow", Action = ["s3:PutObject", "s3:DeleteObject"], Resource = "${local.state_object_arn}.tflock" }
    ]
  })
}

resource "aws_iam_role" "deploy" {
  count                = local.github_enabled ? 1 : 0
  name                 = "${var.project_name}-gha-deploy"
  assume_role_policy   = data.aws_iam_policy_document.deploy_trust[0].json
  max_session_duration = 3600
}

# Deploy de um stack com IAM, VPC e 14 serviços: PowerUser + IAM restrito ao prefixo do projeto.
# Em produção, troque por uma política gerada pelo IAM Access Analyzer a partir do CloudTrail.
resource "aws_iam_role_policy_attachment" "deploy_poweruser" {
  count      = local.github_enabled ? 1 : 0
  role       = aws_iam_role.deploy[0].name
  policy_arn = "arn:aws:iam::aws:policy/PowerUserAccess"
}

resource "aws_iam_role_policy" "deploy_iam" {
  count = local.github_enabled ? 1 : 0
  name  = "iam-project-prefix-only"
  role  = aws_iam_role.deploy[0].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ManageProjectRolesAndPolicies"
        Effect = "Allow"
        Action = ["iam:*Role*", "iam:*Policy*", "iam:PassRole", "iam:TagRole", "iam:UntagRole"]
        Resource = [
          "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/${var.project_name}-*",
          "arn:aws:iam::${data.aws_caller_identity.current.account_id}:policy/${var.project_name}-*",
        ]
      },
      {
        Sid      = "ServiceLinkedRoles"
        Effect   = "Allow"
        Action   = ["iam:CreateServiceLinkedRole"]
        Resource = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/aws-service-role/*"
      },
      {
        Sid    = "ReadIam"
        Effect = "Allow"
        Action = ["iam:Get*", "iam:List*"]
        Resource = [
          "arn:aws:iam::${data.aws_caller_identity.current.account_id}:*",
          "arn:aws:iam::aws:policy/*",
        ]
      },
      {
        Sid      = "State"
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
        Resource = [local.state_object_arn, "${local.state_object_arn}.tflock"]
      }
    ]
  })
}
