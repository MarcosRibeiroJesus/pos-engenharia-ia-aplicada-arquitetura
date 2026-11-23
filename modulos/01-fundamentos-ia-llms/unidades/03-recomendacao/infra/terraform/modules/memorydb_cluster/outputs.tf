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

# Nome de cada recurso nomeado do módulo, para o teste de prefixo (TT-T02, ADR-0014). Recursos sem
# atributo de nome entram pela tag Name; nomes de policy inline (escopo da role) não entram.
output "nomes_dos_recursos" {
  description = "Nome de cada recurso nomeado do módulo, para o teste de prefixo (TT-T02)."
  value = merge(
    { "aws_memorydb_subnet_group.main" = aws_memorydb_subnet_group.main.name },
    { "aws_memorydb_parameter_group.redis7" = aws_memorydb_parameter_group.redis7.name },
    { "aws_memorydb_cluster.vector_cluster" = aws_memorydb_cluster.vector_cluster.name },
  )
}

output "cluster_name" {
  description = "Nome do cluster (exceção p01-recomendacao- do ADR-0014)."
  value       = aws_memorydb_cluster.vector_cluster.name
}

# Custo fixo (TT-K02, RNF-002): nós cobrados por hora e retenção de snapshot (que cobraria depois do destroy).
output "custo_fixo" {
  description = "Nós do cluster e retenção de snapshot, para o teste de custo fixo (TT-K02)."
  value = {
    nos                      = aws_memorydb_cluster.vector_cluster.num_shards * (aws_memorydb_cluster.vector_cluster.num_replicas_per_shard + 1)
    snapshot_retention_limit = aws_memorydb_cluster.vector_cluster.snapshot_retention_limit
  }
}
