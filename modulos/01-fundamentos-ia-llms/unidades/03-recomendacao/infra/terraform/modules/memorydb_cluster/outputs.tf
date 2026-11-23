output "cluster_endpoint" {
  description = "host:porta do cluster (TLS)."
  value       = "${aws_memorydb_cluster.vector_cluster.cluster_endpoint[0].address}:${aws_memorydb_cluster.vector_cluster.cluster_endpoint[0].port}"
}

output "cluster_arn" {
  description = "ARN do cluster."
  value       = aws_memorydb_cluster.vector_cluster.arn
}

output "tags_dos_recursos" {
  description = "Atributo tags de cada recurso tagueável do módulo, para o teste de tags (TT-T01)."
  value = merge(
    { "aws_memorydb_subnet_group.main" = aws_memorydb_subnet_group.main.tags },
    { "aws_memorydb_parameter_group.redis7" = aws_memorydb_parameter_group.redis7.tags },
    { "aws_memorydb_cluster.vector_cluster" = aws_memorydb_cluster.vector_cluster.tags },
  )
}
