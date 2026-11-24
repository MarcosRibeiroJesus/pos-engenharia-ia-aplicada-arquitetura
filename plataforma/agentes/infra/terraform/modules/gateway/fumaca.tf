# Role de fumaça da plataforma (T014; RF-002, RNF-001, RNF-002; TT-R09). Plano, "Role de fumaça",
# e emenda 1 (F1): a fumaça prova que o gateway nega por padrão (tools/list vazio, tools/call
# negado) sem chamar o Claude nem o guardrail. Por isso a role:
# - é confiada só pela role de deploy, pelo ARN exato (ADR-0014, sem Principal curinga);
# - tem uma única declaração, bedrock-agentcore:InvokeGateway no ARN do gateway (TT-R09);
# - não tem bedrock:ApplyGuardrail, KMS nem alvo Lambda;
# - não aparece em nenhum permit do Cedar (conferido no T036).
# IAM não cobra por role: nada de custo fixo (RNF-002).
resource "aws_iam_role" "fumaca" {
  name        = "${local.prefixo}-fumaca"
  description = "Role de fumaca do gateway MCP: so InvokeGateway, sem permit no Cedar (nega por padrao)."

  # jsonencode, e não aws_iam_policy_document: com o mock, o data source devolve texto aleatório e
  # a regra TT-S01 do plan não lê a política.
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "SoARoleDeDeploy"
        Effect    = "Allow"
        Principal = { AWS = var.role_deploy_arn }
        Action    = "sts:AssumeRole"
      },
    ]
  })

  tags = local.tags
}

# TT-R09: uma única declaração. Uma segunda reprova o fumaca.tftest.hcl.
resource "aws_iam_role_policy" "fumaca" {
  name = "${local.prefixo}-fumaca-invoke-gateway"
  role = aws_iam_role.fumaca.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "InvocarSoOGatewayDaPlataforma"
        Effect   = "Allow"
        Action   = ["bedrock-agentcore:InvokeGateway"]
        Resource = [aws_bedrockagentcore_gateway.plataforma.gateway_arn]
      },
    ]
  })
}
