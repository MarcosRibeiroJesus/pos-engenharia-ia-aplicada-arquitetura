# Regra R10 (defesa em camadas na borda). Só é criado quando habilitado (custo fixo, ADR-0008).
mock_provider "aws" {
  mock_resource "aws_wafv2_web_acl" {
    defaults = { arn = "arn:aws:wafv2:us-east-1:123456789012:regional/webacl/agenda-lab-borda/abc" }
  }
}

variables {
  nome               = "agenda-lab"
  stage_arn          = "arn:aws:apigateway:us-east-1::/restapis/abc123/stages/lab"
  limite_por_ip_5min = 300
  max_bytes_corpo    = 8192
  tags               = { project = "assistente-agendamento", module = "02-apis-ia-generativa/arquitetura", "managed-by" = "terraform" }
}

run "regras_de_tamanho_taxa_e_gerenciadas" {
  command = apply
  assert {
    condition     = aws_wafv2_web_acl.this.scope == "REGIONAL" && aws_wafv2_web_acl.this.default_action[0].allow != null
    error_message = "Web ACL regional."
  }
  assert {
    condition     = toset([for r in aws_wafv2_web_acl.this.rule : r.name]) == toset(["limite-por-ip", "corpo-grande", "aws-common", "aws-bad-inputs"])
    error_message = "R10: taxa por IP, tamanho do corpo e regras gerenciadas."
  }
  assert {
    condition     = aws_wafv2_web_acl.this.visibility_config[0].cloudwatch_metrics_enabled
    error_message = "R8: métricas do WAF."
  }
}
