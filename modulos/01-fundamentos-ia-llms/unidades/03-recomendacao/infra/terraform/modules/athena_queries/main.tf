# Tag module deste componente (ADR-0014, D-031); project e managed-by vêm do default_tags.
locals {
  tags = {
    module = "consultas"
  }
}

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

  tags = merge(local.tags, {
    Name = "${var.project_name}-${var.environment}-athena-workgroup"
  })
}

resource "aws_athena_named_query" "extract_curated_features" {
  name      = "${var.project_name}-${var.environment}-extract-features"
  workgroup = aws_athena_workgroup.analytics.id
  database  = var.database_name
  # RF-107 (T041): banco e tabelas pelos marcadores do SQL, os mesmos que o DAG preenche.
  query = templatefile("${path.module}/../../../../src/batch/athena/extract_curated_features.sql", {
    banco             = var.database_name
    tabela_interacoes = var.tabelas.interacoes
    tabela_catalogo   = var.tabelas.catalogo
  })
}
