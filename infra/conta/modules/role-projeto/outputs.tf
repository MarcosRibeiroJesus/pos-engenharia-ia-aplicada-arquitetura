output "nome_deploy" {
  description = "Nome da role de deploy."
  value       = aws_iam_role.deploy.name
}

output "nome_plan" {
  description = "Nome da role de plan."
  value       = aws_iam_role.plan.name
}

# ARNs montados pelo nome: conhecidos já no plan, para a variável AWS_DEPLOY_ROLE_ARN_<CHAVE> (T033).
output "arn_deploy" {
  description = "ARN da role de deploy."
  value       = local.arn_deploy
}

output "arn_plan" {
  description = "ARN da role de plan."
  value       = local.arn_plan
}

output "confianca_deploy" {
  description = "Política de confiança da role de deploy (JSON)."
  value       = local.confianca.deploy
}

output "confianca_plan" {
  description = "Política de confiança da role de plan (JSON)."
  value       = local.confianca.plan
}

output "politicas_deploy" {
  description = "Políticas gerenciadas da role de deploy, por grupo (JSON)."
  value       = local.politicas_deploy
}

output "politicas_plan" {
  description = "Políticas gerenciadas da role de plan, por grupo (JSON)."
  value       = local.politicas_plan
}

output "nomes_politicas" {
  description = "Nomes das políticas gerenciadas das duas roles."
  value       = concat([for g in keys(local.politicas_deploy) : "00-conta-${var.chave}-deploy-${g}"], [for g in keys(local.politicas_plan) : "00-conta-${var.chave}-plan-${g}"])
}

output "tags_deploy" {
  description = "Tags da role de deploy."
  value       = aws_iam_role.deploy.tags
}

output "tags_plan" {
  description = "Tags da role de plan."
  value       = aws_iam_role.plan.tags
}
