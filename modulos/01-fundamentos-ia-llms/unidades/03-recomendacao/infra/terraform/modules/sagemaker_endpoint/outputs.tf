output "endpoint_name" {
  description = "Nome do endpoint."
  value       = aws_sagemaker_endpoint.reranker.name
}

output "endpoint_arn" {
  description = "ARN do endpoint."
  value       = aws_sagemaker_endpoint.reranker.arn
}
