data "aws_region" "current" {}

locals {
  name      = "${var.project_name}-${var.environment}"
  region    = data.aws_region.current.region
  namespace = var.metrics_namespace

  alb_dims = { LoadBalancer = var.alb_arn_suffix }

  # R6: um alarme por sinal crítico. Todos notificam o mesmo tópico.
  alarms = {
    api_p95_latency = {
      description         = "p95 da API acima de 60 ms (SLO de latencia)"
      namespace           = "AWS/ApplicationELB"
      metric_name         = "TargetResponseTime"
      extended_statistic  = "p95"
      statistic           = null
      threshold           = 0.060
      comparison_operator = "GreaterThanThreshold"
      evaluation_periods  = 3
      dimensions          = local.alb_dims
    }
    api_5xx = {
      description         = "Respostas 5xx do servico (meta zero: a degradacao deve absorver falhas)"
      namespace           = "AWS/ApplicationELB"
      metric_name         = "HTTPCode_Target_5XX_Count"
      extended_statistic  = null
      statistic           = "Sum"
      threshold           = 0
      comparison_operator = "GreaterThanThreshold"
      evaluation_periods  = 1
      dimensions          = local.alb_dims
    }
    healthy_targets = {
      description         = "Nenhum target saudavel atras do ALB"
      namespace           = "AWS/ApplicationELB"
      metric_name         = "HealthyHostCount"
      extended_statistic  = null
      statistic           = "Minimum"
      threshold           = 1
      comparison_operator = "LessThanThreshold"
      evaluation_periods  = 2
      dimensions          = { LoadBalancer = var.alb_arn_suffix, TargetGroup = var.target_group_arn_suffix }
    }
    running_tasks = {
      description         = "Servico ECS sem tasks em execucao"
      namespace           = "ECS/ContainerInsights"
      metric_name         = "RunningTaskCount"
      extended_statistic  = null
      statistic           = "Minimum"
      threshold           = 1
      comparison_operator = "LessThanThreshold"
      evaluation_periods  = 2
      dimensions          = { ClusterName = var.ecs_cluster_name, ServiceName = var.ecs_service_name }
    }
    degraded_mode = {
      description         = "Respostas em modo degradado (fallbacks de DynamoDB, MemoryDB ou SageMaker)"
      namespace           = local.namespace
      metric_name         = "DegradedModeCount"
      extended_statistic  = null
      statistic           = "Sum"
      threshold           = 50
      comparison_operator = "GreaterThanThreshold"
      evaluation_periods  = 5
      dimensions          = {}
    }
    explanation_fallback = {
      description         = "Explicacoes com Claude caindo no fallback (resposta sem explicacao)"
      namespace           = local.namespace
      metric_name         = "ExplanationFallbackCount"
      extended_statistic  = null
      statistic           = "Sum"
      threshold           = 20
      comparison_operator = "GreaterThanThreshold"
      evaluation_periods  = 5
      dimensions          = {}
    }
    sagemaker_errors = {
      description         = "Erros 5xx no endpoint do re-ranker"
      namespace           = "AWS/SageMaker"
      metric_name         = "Invocation5XXErrors"
      extended_statistic  = null
      statistic           = "Sum"
      threshold           = 5
      comparison_operator = "GreaterThanThreshold"
      evaluation_periods  = 3
      dimensions          = { EndpointName = var.sagemaker_endpoint_name, VariantName = "AllTraffic" }
    }
  }
}

# ---------------------------------------------------------------- alertas
resource "aws_sns_topic" "alerts" {
  name              = "${local.name}-alerts"
  kms_master_key_id = var.kms_key_arn
}

data "aws_iam_policy_document" "alerts" {
  statement {
    sid       = "AlarmsAndBudgetsPublish"
    actions   = ["sns:Publish"]
    resources = [aws_sns_topic.alerts.arn]
    principals {
      type        = "Service"
      identifiers = ["cloudwatch.amazonaws.com", "budgets.amazonaws.com"]
    }
  }
}

resource "aws_sns_topic_policy" "alerts" {
  arn    = aws_sns_topic.alerts.arn
  policy = data.aws_iam_policy_document.alerts.json
}

resource "aws_sns_topic_subscription" "email" {
  for_each  = toset(var.alert_emails)
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = each.value
}

resource "aws_cloudwatch_metric_alarm" "this" {
  for_each = local.alarms

  alarm_name          = "${local.name}-${replace(each.key, "_", "-")}"
  alarm_description   = each.value.description
  namespace           = each.value.namespace
  metric_name         = each.value.metric_name
  statistic           = each.value.statistic
  extended_statistic  = each.value.extended_statistic
  period              = 60
  evaluation_periods  = each.value.evaluation_periods
  threshold           = each.value.threshold
  comparison_operator = each.value.comparison_operator
  dimensions          = each.value.dimensions
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
}

# ---------------------------------------------------------------- orçamento (R9)
# Orçamento da conta do lab (os dois primeiros budgets da conta não têm custo).
# O filtro por tag só funciona depois de ativar 'project' como cost allocation tag no Billing.
resource "aws_budgets_budget" "monthly" {
  name         = "${local.name}-monthly"
  budget_type  = "COST"
  limit_amount = tostring(var.monthly_budget_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  dynamic "cost_filter" {
    for_each = var.budget_filter_by_project_tag ? [1] : []
    content {
      name   = "TagKeyValue"
      values = ["user:project$${var.project_name}"]
    }
  }

  notification {
    comparison_operator       = "GREATER_THAN"
    threshold                 = 80
    threshold_type            = "PERCENTAGE"
    notification_type         = "ACTUAL"
    subscriber_sns_topic_arns = [aws_sns_topic.alerts.arn]
  }

  notification {
    comparison_operator       = "GREATER_THAN"
    threshold                 = 100
    threshold_type            = "PERCENTAGE"
    notification_type         = "FORECASTED"
    subscriber_sns_topic_arns = [aws_sns_topic.alerts.arn]
  }

  depends_on = [aws_sns_topic_policy.alerts]
}

# ---------------------------------------------------------------- dashboard
resource "aws_cloudwatch_dashboard" "platform" {
  dashboard_name = "${local.name}-dashboard"

  dashboard_body = jsonencode({
    widgets = [
      {
        type   = "metric"
        x      = 0
        y      = 0
        width  = 12
        height = 6
        properties = {
          metrics = [
            [local.namespace, "DegradedModeCount", { stat = "Sum", label = "Modo degradado" }],
            [local.namespace, "SageMakerFallbackCount", { stat = "Sum", label = "Fallback do SageMaker" }],
            [local.namespace, "MemoryDbFallbackCount", { stat = "Sum", label = "Fallback do MemoryDB" }],
            [local.namespace, "DynamoDbFallbackCount", { stat = "Sum", label = "Fallback do DynamoDB" }],
            [local.namespace, "ExplanationFallbackCount", { stat = "Sum", label = "Explicacao sem Claude" }],
            [local.namespace, "ExplanationRetryCount", { stat = "Sum", label = "Retentativas de validacao" }]
          ]
          period = 60
          region = local.region
          title  = "Degradacao controlada (zero 500)"
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 0
        width  = 12
        height = 6
        properties = {
          metrics = [
            ["AWS/ApplicationELB", "TargetResponseTime", "LoadBalancer", var.alb_arn_suffix, { stat = "p95", label = "p95" }],
            ["AWS/ApplicationELB", "TargetResponseTime", "LoadBalancer", var.alb_arn_suffix, { stat = "p99", label = "p99" }]
          ]
          period = 60
          region = local.region
          title  = "Latencia da API (SLO p95 < 60 ms)"
        }
      }
    ]
  })
}
