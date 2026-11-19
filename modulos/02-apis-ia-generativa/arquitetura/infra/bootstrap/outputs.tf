output "state_bucket" {
  description = "Use em backend.hcl (bucket = ...)."
  value       = aws_s3_bucket.state.bucket
}

output "plan_role_arn" {
  description = "Variável AWS_PLAN_ROLE_ARN do repositório no GitHub."
  value       = try(aws_iam_role.plan[0].arn, null)
}

output "deploy_role_arn" {
  description = "Variável AWS_DEPLOY_ROLE_ARN do ambiente protegido no GitHub."
  value       = try(aws_iam_role.deploy[0].arn, null)
}
