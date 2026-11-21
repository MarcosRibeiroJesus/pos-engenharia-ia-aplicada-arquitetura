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
