output "bucket_id" {
  description = "ID do bucket."
  value       = aws_s3_bucket.golden_dataset.id
}

output "bucket_name" {
  description = "Nome do bucket."
  value       = aws_s3_bucket.golden_dataset.bucket
}

output "bucket_arn" {
  description = "ARN do bucket."
  value       = aws_s3_bucket.golden_dataset.arn
}

output "tags_dos_recursos" {
  description = "Atributo tags de cada recurso tagueável do módulo, para o teste de tags (TT-T01)."
  value = merge(
    { "aws_s3_bucket.golden_dataset" = aws_s3_bucket.golden_dataset.tags },
    { for k, r in aws_s3_object.prefix : "aws_s3_object.prefix[${k}]" => r.tags },
  )
}
