output "key_arn" {
  description = "ARN da chave da plataforma."
  value       = aws_kms_key.platform.arn
}
