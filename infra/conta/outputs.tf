output "orcamento" {
  description = "Nome e limite do orçamento mensal da conta."
  value       = { nome = aws_budgets_budget.mensal.name, limite_usd = var.limite_mensal_usd }
}

output "oidc_provider_arn" {
  description = "ARN do provedor OIDC do GitHub, único na conta; as roles por projeto confiam nele."
  value       = aws_iam_openid_connect_provider.github.arn
}

output "state_bucket" {
  description = "Bucket de state de todos os projetos (vars.TF_STATE_BUCKET no GitHub)."
  value       = aws_s3_bucket.state.bucket
}

output "state_kms_key_arn" {
  description = "Chave KMS do state; as roles de cada projeto precisam de kms:Decrypt e kms:GenerateDataKey nela."
  value       = aws_kms_key.state.arn
}
