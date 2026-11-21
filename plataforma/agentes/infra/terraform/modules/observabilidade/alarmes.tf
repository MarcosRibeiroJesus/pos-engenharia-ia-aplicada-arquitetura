# Cinco alarmes da plataforma (T017; RNF-003, Art. VI; ADR-0008, ADR-0013, ADR-0014).
#
# - Nomes: vêm de var.nomes_dos_alarmes, que é o local.nomes_dos_alarmes do root, a mesma lista
#   que o nucleo cita como aws:SourceArn exato na política da chave e na do tópico. O módulo só
#   conhece o tipo de cada alarme e escolhe o nome pelo sufixo; a validação da variável garante um
#   nome por tipo.
# - Ação: só o tópico cifrado do nucleo (T011, ADR-0008).
# - Dimensões (ADR-0013): os cinco são alarmes por consulta do Metrics Insights, filtrada pelo
#   recurso e somada numa série só, sem GROUP BY. Um alarme comum só casaria com um conjunto exato
#   de dimensões, e nenhum dos cinco conjuntos está confirmado:
#   - motor: a página "Policy observability data" (consultada em 2026-11-20, ADR-0013) lista só as
#     dimensões disponíveis; o filtro é PolicyEngine, e as negações também Mode = 'ENFORCE', para a
#     calibração em LOG_ONLY não disparar (ADR-0005). NÃO VERIFICADO: se o valor de PolicyEngine é
#     o id ou o ARN do motor; o ensaio (T069 ou T084, list-metrics) confere;
#   - gateway: a página de métricas do Gateway
#     (https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/observability-gateway-metrics.html),
#     consultada em 2026-11-21 pelo AWS documentation search, diz que o gateway publica métricas com
#     as dimensões Operation, Resource e Name. O filtro é pela dimensão Resource. NÃO VERIFICADO: se
#     o valor de Resource é o ARN ou o id do gateway; o ensaio (T069 ou T084, list-metrics) confere,
#     e o ajuste é só em local.filtro_gateway.
# - Custo (ADR-0013): o alarme por consulta cobra por métrica analisada; o T073 confere no PR.

locals {
  namespace_agentcore = "AWS/Bedrock-AgentCore"

  # Dimensão Resource publicada (página do Gateway, 2026-11-21). NÃO VERIFICADO: o valor ser o ARN
  # do gateway (e não o id); conferência no ensaio (T069 ou T084, list-metrics).
  filtro_gateway = "Resource = '${var.gateway_arn}'"
  # Dimensão PolicyEngine disponível (página do Policy, 2026-11-20). NÃO VERIFICADO: o valor ser o
  # id do motor (e não o ARN); conferência no ensaio (T069 ou T084, list-metrics).
  filtro_motor = "PolicyEngine = '${var.policy_engine_id}'"

  # tipo (sufixo do nome) -> métrica, filtro e limiar do RNF-003
  tipos_de_alarme = {
    "gateway-system-errors" = { metrica = "SystemErrors", filtro = local.filtro_gateway, limiar = 1, descricao = "Erro do gateway: qualquer 5xx numa demonstração é defeito." }
    "gateway-throttles"     = { metrica = "Throttles", filtro = local.filtro_gateway, limiar = 1, descricao = "Limite de taxa do gateway: 429 numa demonstração indica loop." }
    "gateway-user-errors"   = { metrica = "UserErrors", filtro = local.filtro_gateway, limiar = 3, descricao = "Erros de cliente do gateway em série: parâmetro ou autenticação errados." }
    "motor-system-errors"   = { metrica = "SystemErrors", filtro = local.filtro_motor, limiar = 1, descricao = "Erro do motor de política: falha na decisão." }
    "motor-deny-decisions"  = { metrica = "DenyDecisions", filtro = "${local.filtro_motor} AND Mode = 'ENFORCE'", limiar = 5, descricao = "Negações do motor em ENFORCE: o roteiro prevê no máximo 2; 5 indicam loop ou tentativa de injeção." }
  }

  alarmes = {
    for tipo, a in local.tipos_de_alarme : tipo => merge(a, {
      nome     = one([for n in var.nomes_dos_alarmes : n if endswith(n, "-${tipo}")])
      consulta = "SELECT SUM(${a.metrica}) FROM \"${local.namespace_agentcore}\" WHERE ${a.filtro}"
    })
  }
}

resource "aws_cloudwatch_metric_alarm" "plataforma" {
  for_each = local.alarmes

  alarm_name        = each.value.nome
  alarm_description = "${each.value.descricao} RNF-003; consulta do Metrics Insights (ADR-0013)."

  comparison_operator = "GreaterThanOrEqualToThreshold"
  threshold           = each.value.limiar
  evaluation_periods  = 1
  datapoints_to_alarm = 1
  # Fora da demonstração não há tráfego (RNF-003).
  treat_missing_data = "notBreaching"

  metric_query {
    id          = "q1"
    expression  = each.value.consulta
    period      = 300
    return_data = true
  }

  actions_enabled = true
  alarm_actions   = [var.topico_alarmes_arn]

  tags = local.tags
}
