# Cinco alarmes da plataforma (T017; RNF-003, Art. VI; TT-O03; ADR-0008, ADR-0013, ADR-0014).
#
# Parâmetros do RNF-003: período de 300 s, 1 avaliação, soma, dado ausente "não violado" e ação no
# tópico cifrado do nucleo (T011). Os nomes vêm de uma lista só (local.nomes_dos_alarmes do root),
# a mesma que a política da chave e a do tópico citam como aws:SourceArn exato (ADR-0014): o
# módulo não inventa nome, e um nome fora da lista não publicaria no tópico cifrado.
#
# Dimensões (ADR-0013, análise 1 A05): um alarme comum só casa com a série que tem exatamente o
# mesmo conjunto de dimensões. Por isso os cinco alarmes são por consulta do Metrics Insights,
# filtrada pelo recurso e somada numa série só, sem GROUP BY:
# - motor (SystemErrors e DenyDecisions): a página "Policy observability data"
#   (https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/observability-policy-metrics.html),
#   consultada em 2026-11-20 (ADR-0013), lista só as dimensões disponíveis (PolicyEngine, Mode, ...),
#   não o conjunto de cada métrica. O filtro é PolicyEngine = '<id do motor>', e as negações também
#   têm Mode = 'ENFORCE', para o apply de calibração (LOG_ONLY, ADR-0005) não disparar o alarme.
#   NÃO VERIFICADO: se o valor de PolicyEngine é o id ou o ARN do motor; o ensaio (T069 ou T084,
#   list-metrics) confere.
# - gateway (SystemErrors, Throttles, UserErrors): a página de métricas do Gateway
#   (https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/observability-gateway-metrics.html),
#   consultada em 2026-11-21 pelo AWS documentation search, diz que o gateway publica métricas com
#   as dimensões Operation, Resource e Name. O filtro é Resource = '<ARN do gateway>'. NÃO
#   VERIFICADO: se o valor de Resource é o ARN ou o id do gateway; o ensaio (T069 ou T084,
#   list-metrics) confere, e o ajuste fica só em local.filtro_gateway (alarmes.tf).
# O alarme comum de DenyDecisions só com Mode (a "fixture vermelha" do T017) reprova na regra
# TT-O03 do plan em JSON: plataforma/agentes/tests/plan/test_regras_plan.py.
mock_provider "aws" {
  override_during = plan

  mock_data "aws_caller_identity" {
    defaults = {
      account_id = "111111111111"
    }
  }
}

variables {
  gateway_id         = "00-plataforma-agentes-gateway-sintetico"
  gateway_arn        = "arn:aws:bedrock-agentcore:us-east-1:111111111111:gateway/00-plataforma-agentes-gateway-sintetico"
  kms_key_arn        = "arn:aws:kms:us-east-1:111111111111:key/00000000-0000-0000-0000-000000000001"
  policy_engine_id   = "p00_plataforma_agentes-sintetico"
  topico_alarmes_arn = "arn:aws:sns:us-east-1:111111111111:00-plataforma-agentes-alarmes"
  # Cópia, no teste, do local.nomes_dos_alarmes do root (a fonte única). O composicao.tftest.hcl
  # do root (T020) confere que o módulo recebe a lista do root, não esta.
  nomes_dos_alarmes = [
    "00-plataforma-agentes-gateway-system-errors",
    "00-plataforma-agentes-gateway-throttles",
    "00-plataforma-agentes-gateway-user-errors",
    "00-plataforma-agentes-motor-system-errors",
    "00-plataforma-agentes-motor-deny-decisions",
  ]
}

run "cinco_alarmes_com_os_nomes_da_lista" {
  command = plan

  assert {
    condition     = length(aws_cloudwatch_metric_alarm.plataforma) == 5
    error_message = "O módulo cria exatamente os cinco alarmes do RNF-003 (TT-O03)."
  }
  # R1 da revisão da T015: a política da chave e a do tópico citam estes ARNs exatos.
  assert {
    condition     = sort([for a in aws_cloudwatch_metric_alarm.plataforma : a.alarm_name]) == sort(var.nomes_dos_alarmes)
    error_message = "Os nomes dos alarmes são exatamente os da lista recebida (local.nomes_dos_alarmes do root); outro nome não publica no tópico cifrado (ADR-0014)."
  }
  assert {
    condition     = alltrue([for a in aws_cloudwatch_metric_alarm.plataforma : startswith(a.alarm_name, "00-plataforma-agentes-")])
    error_message = "Todo alarme leva o prefixo 00-plataforma-agentes- (D-029)."
  }
}

run "parametros_comuns_do_rnf_003" {
  command = plan

  assert {
    condition = alltrue([for a in aws_cloudwatch_metric_alarm.plataforma :
    a.evaluation_periods == 1 && a.datapoints_to_alarm == 1])
    error_message = "Todo alarme avalia 1 período, e 1 ponto basta para disparar (RNF-003)."
  }
  assert {
    condition = alltrue([for a in aws_cloudwatch_metric_alarm.plataforma :
    length(a.metric_query) == 1 && one(a.metric_query).period == 300 && one(a.metric_query).return_data == true])
    error_message = "Todo alarme tem uma consulta só, com período de 300 s, que devolve a série avaliada (RNF-003, ADR-0013)."
  }
  assert {
    condition = alltrue([for a in aws_cloudwatch_metric_alarm.plataforma :
    startswith(one(a.metric_query).expression, "SELECT SUM(") && !strcontains(upper(one(a.metric_query).expression), "GROUP BY")])
    error_message = "Toda consulta soma as séries numa só: SELECT SUM(...) sem GROUP BY (RNF-003 Sum, ADR-0013)."
  }
  assert {
    condition = alltrue([for a in aws_cloudwatch_metric_alarm.plataforma :
    strcontains(one(a.metric_query).expression, "FROM \"AWS/Bedrock-AgentCore\" WHERE ")])
    error_message = "Toda consulta lê o namespace AWS/Bedrock-AgentCore com filtro WHERE pelo recurso (ADR-0013)."
  }
  assert {
    condition = alltrue([for a in aws_cloudwatch_metric_alarm.plataforma :
    a.comparison_operator == "GreaterThanOrEqualToThreshold" && a.treat_missing_data == "notBreaching"])
    error_message = "Todo alarme dispara em >= limiar, e dado ausente é não violado (RNF-003)."
  }
  # Alarme por consulta: sem métrica única no topo, que casaria só com um conjunto de dimensões.
  assert {
    condition = alltrue([for a in aws_cloudwatch_metric_alarm.plataforma :
    a.metric_name == null && a.namespace == null && a.dimensions == null && a.statistic == null])
    error_message = "Os alarmes da plataforma não são alarmes comuns de métrica única (ADR-0013)."
  }
  # Ação no tópico do T011 (ADR-0008), sem curinga (ADR-0014).
  assert {
    condition = alltrue([for a in aws_cloudwatch_metric_alarm.plataforma :
    a.alarm_actions == toset([var.topico_alarmes_arn]) && a.actions_enabled != false])
    error_message = "Todo alarme publica só no tópico cifrado da plataforma, com as ações ligadas (ADR-0008)."
  }
  assert {
    condition     = alltrue([for a in aws_cloudwatch_metric_alarm.plataforma : a.tags["module"] == "observabilidade"])
    error_message = "Todo alarme leva module = observabilidade (D-031)."
  }
}

run "limiares_e_consultas_de_cada_alarme" {
  command = plan

  # gateway: filtro pelo ARN do gateway (dimensão NÃO VERIFICADA, ver cabeçalho)
  assert {
    condition     = aws_cloudwatch_metric_alarm.plataforma["gateway-system-errors"].threshold == 1 && one(aws_cloudwatch_metric_alarm.plataforma["gateway-system-errors"].metric_query).expression == "SELECT SUM(SystemErrors) FROM \"AWS/Bedrock-AgentCore\" WHERE Resource = '${var.gateway_arn}'"
    error_message = "Erro do gateway: SUM(SystemErrors) do gateway >= 1 (RNF-003)."
  }
  assert {
    condition     = aws_cloudwatch_metric_alarm.plataforma["gateway-throttles"].threshold == 1 && one(aws_cloudwatch_metric_alarm.plataforma["gateway-throttles"].metric_query).expression == "SELECT SUM(Throttles) FROM \"AWS/Bedrock-AgentCore\" WHERE Resource = '${var.gateway_arn}'"
    error_message = "Limite de taxa: SUM(Throttles) do gateway >= 1 (RNF-003)."
  }
  assert {
    condition     = aws_cloudwatch_metric_alarm.plataforma["gateway-user-errors"].threshold == 3 && one(aws_cloudwatch_metric_alarm.plataforma["gateway-user-errors"].metric_query).expression == "SELECT SUM(UserErrors) FROM \"AWS/Bedrock-AgentCore\" WHERE Resource = '${var.gateway_arn}'"
    error_message = "Erro de cliente: SUM(UserErrors) do gateway >= 3 (RNF-003)."
  }
  # motor: filtro pelo id do motor (ADR-0013)
  assert {
    condition     = aws_cloudwatch_metric_alarm.plataforma["motor-system-errors"].threshold == 1 && one(aws_cloudwatch_metric_alarm.plataforma["motor-system-errors"].metric_query).expression == "SELECT SUM(SystemErrors) FROM \"AWS/Bedrock-AgentCore\" WHERE PolicyEngine = '${var.policy_engine_id}'"
    error_message = "Erro do motor: SUM(SystemErrors) do motor >= 1 (RNF-003, ADR-0013)."
  }
  assert {
    condition     = aws_cloudwatch_metric_alarm.plataforma["motor-deny-decisions"].threshold == 5 && one(aws_cloudwatch_metric_alarm.plataforma["motor-deny-decisions"].metric_query).expression == "SELECT SUM(DenyDecisions) FROM \"AWS/Bedrock-AgentCore\" WHERE PolicyEngine = '${var.policy_engine_id}' AND Mode = 'ENFORCE'"
    error_message = "Negações: SUM(DenyDecisions) do motor só em Mode = 'ENFORCE', >= 5; a calibração em LOG_ONLY não dispara (RNF-003, ADR-0005, ADR-0013)."
  }
  # Cada alarme pega da lista o nome do seu tipo.
  assert {
    condition = alltrue([for k, a in aws_cloudwatch_metric_alarm.plataforma :
    a.alarm_name == "00-plataforma-agentes-${k}"])
    error_message = "Cada alarme recebe da lista o nome terminado no seu tipo (gateway-system-errors, ...)."
  }
}

# ---------------------------------------------------------------- entradas obrigatórias e validadas

run "rejeita_lista_sem_um_dos_alarmes" {
  command = plan

  variables {
    nomes_dos_alarmes = [
      "00-plataforma-agentes-gateway-system-errors",
      "00-plataforma-agentes-gateway-throttles",
      "00-plataforma-agentes-gateway-user-errors",
      "00-plataforma-agentes-motor-system-errors",
    ]
  }

  expect_failures = [var.nomes_dos_alarmes]
}

run "rejeita_nome_repetido_para_o_mesmo_tipo" {
  command = plan

  variables {
    nomes_dos_alarmes = [
      "00-plataforma-agentes-gateway-system-errors",
      "00-plataforma-agentes-gateway-throttles",
      "00-plataforma-agentes-gateway-user-errors",
      "00-plataforma-agentes-motor-system-errors",
      "00-plataforma-agentes-x-motor-system-errors",
    ]
  }

  expect_failures = [var.nomes_dos_alarmes]
}

run "rejeita_nome_com_curinga" {
  command = plan

  variables {
    nomes_dos_alarmes = [
      "00-plataforma-agentes-gateway-system-errors",
      "00-plataforma-agentes-gateway-throttles",
      "00-plataforma-agentes-gateway-user-errors",
      "00-plataforma-agentes-motor-system-errors",
      "00-plataforma-agentes-*-motor-deny-decisions",
    ]
  }

  expect_failures = [var.nomes_dos_alarmes]
}

run "rejeita_topico_com_curinga" {
  command = plan

  variables {
    topico_alarmes_arn = "arn:aws:sns:us-east-1:111111111111:*"
  }

  expect_failures = [var.topico_alarmes_arn]
}

run "rejeita_motor_com_aspas" {
  command = plan

  # O id entra num literal SQL; aspas ou curinga abririam o filtro (ADR-0013, ADR-0014).
  variables {
    policy_engine_id = "x' OR PolicyEngine != '"
  }

  expect_failures = [var.policy_engine_id]
}

run "rejeita_motor_vazio" {
  command = plan

  variables {
    policy_engine_id = ""
  }

  expect_failures = [var.policy_engine_id]
}
