resource "aws_athena_workgroup" "analytics" {
  name          = "${var.project_name}-${var.environment}-workgroup"
  force_destroy = var.force_destroy

  configuration {
    enforce_workgroup_configuration    = true
    publish_cloudwatch_metrics_enabled = true
    bytes_scanned_cutoff_per_query     = 10737418240 # 10 GB por consulta: teto de custo do Athena

    result_configuration {
      output_location = "s3://${var.s3_output_bucket}/athena_results/"

      encryption_configuration {
        encryption_option = "SSE_KMS"
        kms_key_arn       = var.kms_key_arn
      }
    }
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-athena-workgroup"
  }
}

resource "aws_athena_named_query" "extract_curated_features" {
  name      = "${var.project_name}-${var.environment}-extract-features"
  workgroup = aws_athena_workgroup.analytics.id
  database  = var.database_name
  query     = file("${path.module}/../../../../src/batch/athena/extract_curated_features.sql")
}
