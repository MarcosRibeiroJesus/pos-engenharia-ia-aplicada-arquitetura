output "state_bucket" {
  description = "Use em backend.hcl (bucket = ...)."
  value       = aws_s3_bucket.state.bucket
}
