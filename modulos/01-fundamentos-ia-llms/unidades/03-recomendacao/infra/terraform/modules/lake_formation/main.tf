data "aws_caller_identity" "current" {}

resource "aws_glue_catalog_database" "ecommerce_golden_db" {
  name        = var.database_name
  description = "${var.project_name}: golden datasets governados pelo Lake Formation"

  parameters = {
    Classification = "parquet"
    Environment    = var.environment
    CostPosture    = "Minimum-Cost-PoC"
  }
}

resource "aws_lakeformation_resource" "golden_dataset" {
  arn = var.s3_bucket_arn
}

resource "aws_lakeformation_permissions" "database_permissions" {
  principal   = data.aws_caller_identity.current.arn
  permissions = ["ALTER", "CREATE_TABLE", "DESCRIBE", "DROP"] # sem ALL: menor privilégio

  database {
    name = aws_glue_catalog_database.ecommerce_golden_db.name
  }
}
