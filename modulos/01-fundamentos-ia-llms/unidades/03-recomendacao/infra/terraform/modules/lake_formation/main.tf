resource "aws_glue_catalog_database" "ecommerce_golden_db" {
  name        = var.database_name
  description = "${var.project_name}: golden datasets governados pelo Lake Formation"

  parameters = {
    Classification = "parquet"
    Environment    = var.environment
  }
}

resource "aws_lakeformation_resource" "golden_dataset" {
  arn = var.s3_bucket_arn
}

# R3: quem usa o catálogo é o job do Glue. O ARN de quem roda o Terraform (root ou
# assumed-role) nem é aceito como principal pelo Lake Formation.
resource "aws_lakeformation_permissions" "database_permissions" {
  principal   = var.glue_role_arn
  permissions = ["ALTER", "CREATE_TABLE", "DESCRIBE"]

  database {
    name = aws_glue_catalog_database.ecommerce_golden_db.name
  }
}

resource "aws_lakeformation_permissions" "data_location" {
  principal   = var.glue_role_arn
  permissions = ["DATA_LOCATION_ACCESS"]

  data_location {
    arn = aws_lakeformation_resource.golden_dataset.arn
  }
}
