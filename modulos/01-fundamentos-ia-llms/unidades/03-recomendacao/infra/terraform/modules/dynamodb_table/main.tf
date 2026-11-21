resource "aws_dynamodb_table" "user_recommendations" {
  name                        = "${var.project_name}-${var.environment}-${var.table_name}"
  billing_mode                = "PAY_PER_REQUEST"
  hash_key                    = "userId"
  deletion_protection_enabled = var.deletion_protection

  attribute {
    name = "userId"
    type = "S"
  }

  ttl {
    attribute_name = "ttlTimestamp"
    enabled        = true
  }

  server_side_encryption {
    enabled     = true
    kms_key_arn = var.kms_key_arn
  }

  # PITR cobra por GB armazenado; a tabela do lab tem poucos MB.
  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-user-recommendations"
  }
}
