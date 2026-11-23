output "endpoint_name" {
  description = "Nome do endpoint."
  value       = aws_sagemaker_endpoint.reranker.name
}

output "endpoint_arn" {
  description = "ARN do endpoint."
  value       = aws_sagemaker_endpoint.reranker.arn
}

output "tags_dos_recursos" {
  description = "Atributo tags de cada recurso tagueável do módulo, para o teste de tags (TT-T01)."
  value = merge(
    { "aws_iam_role.sagemaker_execution" = aws_iam_role.sagemaker_execution.tags },
    { "aws_cloudwatch_log_group.endpoint" = aws_cloudwatch_log_group.endpoint.tags },
    { "aws_sagemaker_model.reranker" = aws_sagemaker_model.reranker.tags },
    { "aws_sagemaker_endpoint_configuration.reranker" = aws_sagemaker_endpoint_configuration.reranker.tags },
    { "aws_sagemaker_endpoint.reranker" = aws_sagemaker_endpoint.reranker.tags },
  )
}

# Nome de cada recurso nomeado do módulo, para o teste de prefixo (TT-T02, ADR-0014). Recursos sem
# atributo de nome entram pela tag Name; nomes de policy inline (escopo da role) não entram.
output "nomes_dos_recursos" {
  description = "Nome de cada recurso nomeado do módulo, para o teste de prefixo (TT-T02)."
  value = merge(
    { "aws_iam_role.sagemaker_execution" = aws_iam_role.sagemaker_execution.name },
    { "aws_cloudwatch_log_group.endpoint" = aws_cloudwatch_log_group.endpoint.name },
    { "aws_sagemaker_model.reranker" = aws_sagemaker_model.reranker.name },
    { "aws_sagemaker_endpoint_configuration.reranker" = aws_sagemaker_endpoint_configuration.reranker.name },
    { "aws_sagemaker_endpoint.reranker" = aws_sagemaker_endpoint.reranker.name },
  )
}
