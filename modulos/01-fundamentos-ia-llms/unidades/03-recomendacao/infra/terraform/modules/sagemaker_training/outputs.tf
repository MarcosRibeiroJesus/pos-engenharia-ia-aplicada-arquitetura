output "training_role_arn" {
  value = aws_iam_role.sagemaker_train_role.arn
}

output "train_script_s3_uri" {
  value = "s3://${var.s3_bucket_name}/${aws_s3_object.train_script.key}"
}

output "tags_dos_recursos" {
  description = "Atributo tags de cada recurso tagueável do módulo, para o teste de tags (TT-T01)."
  value = merge(
    { "aws_iam_role.sagemaker_train_role" = aws_iam_role.sagemaker_train_role.tags },
    { "aws_iam_policy.sagemaker_s3_policy" = aws_iam_policy.sagemaker_s3_policy.tags },
    { "aws_s3_object.train_script" = aws_s3_object.train_script.tags },
  )
}

# Nome de cada recurso nomeado do módulo, para o teste de prefixo (TT-T02, ADR-0014). Recursos sem
# atributo de nome entram pela tag Name; nomes de policy inline (escopo da role) não entram.
output "nomes_dos_recursos" {
  description = "Nome de cada recurso nomeado do módulo, para o teste de prefixo (TT-T02)."
  value = merge(
    { "aws_iam_role.sagemaker_train_role" = aws_iam_role.sagemaker_train_role.name },
    { "aws_iam_policy.sagemaker_s3_policy" = aws_iam_policy.sagemaker_s3_policy.name },
  )
}
