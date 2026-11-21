output "cluster_endpoint" {
  description = "host:porta do cluster (TLS)."
  value       = "${aws_memorydb_cluster.vector_cluster.cluster_endpoint[0].address}:${aws_memorydb_cluster.vector_cluster.cluster_endpoint[0].port}"
}

output "cluster_arn" {
  description = "ARN do cluster."
  value       = aws_memorydb_cluster.vector_cluster.arn
}
