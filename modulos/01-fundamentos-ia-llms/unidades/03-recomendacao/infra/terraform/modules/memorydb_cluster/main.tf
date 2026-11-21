resource "aws_memorydb_subnet_group" "main" {
  name        = "${var.project_name}-${var.environment}-memdb-subnets"
  subnet_ids  = var.subnet_ids
  description = "MemoryDB subnet group across private subnets"
}

resource "aws_memorydb_parameter_group" "redis7" {
  name   = "${var.project_name}-${var.environment}-memdb-params"
  family = "memorydb_redis7"

  parameter {
    name  = "activedefrag"
    value = "yes"
  }
}

resource "aws_memorydb_cluster" "vector_cluster" {
  name = "${var.project_name}-${var.environment}-vec"
  # open-access + TLS + SG que só aceita as tasks. Autenticação IAM por usuário é o
  # próximo passo de produção (ver ADR-0003).
  acl_name                   = "open-access"
  node_type                  = var.node_type
  num_shards                 = 1
  num_replicas_per_shard     = 0
  port                       = 6379
  engine                     = "redis"
  engine_version             = "7.1"
  parameter_group_name       = aws_memorydb_parameter_group.redis7.name
  subnet_group_name          = aws_memorydb_subnet_group.main.name
  security_group_ids         = var.security_group_ids
  tls_enabled                = true
  kms_key_arn                = var.kms_key_arn
  snapshot_retention_limit   = 0 # vetores são reconstruídos pelo batch diário
  auto_minor_version_upgrade = true

  tags = {
    Name     = "${var.project_name}-${var.environment}-memorydb-vector"
    Replicas = "0"
  }
}
