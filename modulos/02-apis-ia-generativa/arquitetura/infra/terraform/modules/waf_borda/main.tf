# WAF regional na frente do stage (camada 1 da defesa contra injeção, ADR-0005).
# Opcional: Web ACL + regras têm custo fixo mensal; desligado por padrão no lab (ADR-0007).
variable "nome" {
  type = string
}
variable "stage_arn" {
  type = string
}
variable "limite_por_ip_5min" {
  type    = number
  default = 300
}
variable "max_bytes_corpo" {
  type    = number
  default = 8192
}

resource "aws_wafv2_web_acl" "this" {
  #checkov:skip=CKV2_AWS_31:Log do WAF (Firehose/S3) fica para produção; métricas e amostras ligadas no lab
  name  = "${var.nome}-borda"
  scope = "REGIONAL"
  tags  = var.tags

  default_action {
    allow {}
  }

  rule {
    name     = "limite-por-ip"
    priority = 1
    action {
      block {}
    }
    statement {
      rate_based_statement {
        limit              = var.limite_por_ip_5min
        aggregate_key_type = "IP"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "limite-por-ip"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "corpo-grande"
    priority = 2
    action {
      block {}
    }
    statement {
      size_constraint_statement {
        comparison_operator = "GT"
        size                = var.max_bytes_corpo
        field_to_match {
          body {
            oversize_handling = "MATCH"
          }
        }
        text_transformation {
          priority = 0
          type     = "NONE"
        }
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "corpo-grande"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "aws-common"
    priority = 3
    override_action {
      none {}
    }
    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "aws-common"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "aws-bad-inputs"
    priority = 4
    override_action {
      none {}
    }
    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesKnownBadInputsRuleSet"
        vendor_name = "AWS"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "aws-bad-inputs"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${var.nome}-borda"
    sampled_requests_enabled   = true
  }
}

resource "aws_wafv2_web_acl_association" "this" {
  resource_arn = var.stage_arn
  web_acl_arn  = aws_wafv2_web_acl.this.arn
}

output "arn" {
  value = aws_wafv2_web_acl.this.arn
}
