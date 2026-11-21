# Chave KMS do cliente da plataforma (T010; Art. IV, RNF-001, TT-S02 chave; ADR-0001 e ADR-0014).
# A conta e a região vêm de data sources com valor fixo no mock, para a política ser conhecida no
# plan e o assert ler o JSON dela. Os nomes de alarme são sintéticos: os reais são do T017.
mock_provider "aws" {
  override_during = plan

  mock_data "aws_caller_identity" {
    defaults = {
      account_id = "111111111111"
    }
  }
  mock_data "aws_region" {
    defaults = {
      region = "us-east-1"
    }
  }
  mock_resource "aws_kms_key" {
    defaults = {
      arn    = "arn:aws:kms:us-east-1:111111111111:key/00000000-0000-0000-0000-000000000001"
      key_id = "00000000-0000-0000-0000-000000000001"
    }
  }
  mock_data "aws_partition" {
    defaults = {
      partition = "aws"
    }
  }
}

variables {
  nomes_dos_alarmes = ["00-plataforma-agentes-sintetico-a", "00-plataforma-agentes-sintetico-b"]
  teto_diario_usd   = 1.2
}

run "chave_com_rotacao_exclusao_e_alias" {
  command = plan

  assert {
    condition     = aws_kms_key.plataforma.enable_key_rotation == true
    error_message = "A chave tem rotação automática ligada (ADR-0001)."
  }
  assert {
    condition     = aws_kms_key.plataforma.deletion_window_in_days == 7
    error_message = "deletion_window_in_days = 7, o mínimo (ADR-0001)."
  }
  assert {
    condition     = aws_kms_key.plataforma.key_usage == "ENCRYPT_DECRYPT" && aws_kms_key.plataforma.customer_master_key_spec == "SYMMETRIC_DEFAULT"
    error_message = "A chave é simétrica (ADR-0001)."
  }
  assert {
    condition     = aws_kms_key.plataforma.bypass_policy_lockout_safety_check == false
    error_message = "A checagem de bloqueio da política não é ignorada."
  }
  assert {
    condition     = aws_kms_alias.plataforma.name == "alias/00-plataforma-agentes-chave"
    error_message = "O alias é alias/00-plataforma-agentes-chave (ADR-0001)."
  }
  assert {
    condition     = aws_kms_key.plataforma.tags["module"] == "nucleo"
    error_message = "A chave leva a tag module = nucleo (D-031); project e managed-by vêm do default_tags."
  }
  assert {
    condition     = output.chave_arn == aws_kms_key.plataforma.arn && output.chave_id == aws_kms_key.plataforma.key_id
    error_message = "O módulo expõe o ARN e o id da chave para SNS, logs, gateway e motor."
  }
}

run "politica_da_chave_do_adr_0001" {
  command = plan

  # Cada assert lê uma declaração pelo Sid. A conta é a do mock (111111111111).
  assert {
    condition     = length(jsondecode(aws_kms_key.plataforma.policy).Statement) == 5
    error_message = "A política tem só as cinco declarações do ADR-0001 (conta, logs, cloudwatch, sns, bedrock-agentcore)."
  }
  assert {
    condition = alltrue([for d in jsondecode(aws_kms_key.plataforma.policy).Statement :
    d.Effect == "Allow" && !contains(keys(d), "NotPrincipal") && d.Principal != "*"])
    error_message = "Nenhuma declaração com Principal \"*\" ou NotPrincipal (ADR-0014)."
  }

  # 1. A conta administra a chave pelo principal explícito (raiz da conta), sem curinga.
  assert {
    condition = one([for d in jsondecode(aws_kms_key.plataforma.policy).Statement : d
    if d.Sid == "AdministracaoPelaConta"]).Principal.AWS == "arn:aws:iam::111111111111:root"
    error_message = "A administração usa a raiz da conta como principal explícito (ADR-0001, ADR-0014)."
  }

  # 2. CloudWatch Logs: só grupos no prefixo dos logs de aplicação do gateway da plataforma.
  assert {
    condition = one([for d in jsondecode(aws_kms_key.plataforma.policy).Statement : d
    if d.Sid == "LogsDosGruposDaPlataforma"]).Principal.Service == "logs.us-east-1.amazonaws.com"
    error_message = "O principal de logs é logs.<região>.amazonaws.com (ADR-0001)."
  }
  assert {
    condition = one([for d in jsondecode(aws_kms_key.plataforma.policy).Statement : d
      if d.Sid == "LogsDosGruposDaPlataforma"]).Condition.ArnLike["kms:EncryptionContext:aws:logs:arn"] == (
    "arn:aws:logs:us-east-1:111111111111:log-group:/aws/vendedlogs/bedrock-agentcore/gateway/APPLICATION_LOGS/*")
    error_message = "Logs só com kms:EncryptionContext:aws:logs:arn no prefixo dos grupos da plataforma, na conta concreta (ADR-0001)."
  }

  # 3. CloudWatch (alarmes): conta concreta e ARN exato de cada alarme, sem curinga (ADR-0014).
  assert {
    condition = one([for d in jsondecode(aws_kms_key.plataforma.policy).Statement : d
    if d.Sid == "AlarmesDaPlataforma"]).Principal.Service == "cloudwatch.amazonaws.com"
    error_message = "O principal dos alarmes é cloudwatch.amazonaws.com (ADR-0001)."
  }
  assert {
    condition = one([for d in jsondecode(aws_kms_key.plataforma.policy).Statement : d
    if d.Sid == "AlarmesDaPlataforma"]).Condition.StringEquals["aws:SourceAccount"] == "111111111111"
    error_message = "Os alarmes levam aws:SourceAccount com a conta concreta (ADR-0001)."
  }
  assert {
    condition = toset(one([for d in jsondecode(aws_kms_key.plataforma.policy).Statement : d
      if d.Sid == "AlarmesDaPlataforma"]).Condition.ArnEquals["aws:SourceArn"]) == toset([
      "arn:aws:cloudwatch:us-east-1:111111111111:alarm:00-plataforma-agentes-sintetico-a",
      "arn:aws:cloudwatch:us-east-1:111111111111:alarm:00-plataforma-agentes-sintetico-b",
    ])
    error_message = "Os alarmes levam aws:SourceArn com o ARN exato de cada alarme, sem curinga (ADR-0001, ADR-0014)."
  }

  # 4. SNS: conta concreta e ARN exato do tópico de alarmes.
  assert {
    condition = one([for d in jsondecode(aws_kms_key.plataforma.policy).Statement : d
    if d.Sid == "TopicoDeAlarmes"]).Principal.Service == "sns.amazonaws.com"
    error_message = "O principal do tópico é sns.amazonaws.com (ADR-0001)."
  }
  assert {
    condition = one([for d in jsondecode(aws_kms_key.plataforma.policy).Statement : d
    if d.Sid == "TopicoDeAlarmes"]).Condition.StringEquals["aws:SourceAccount"] == "111111111111"
    error_message = "O tópico leva aws:SourceAccount com a conta concreta (ADR-0001)."
  }
  assert {
    condition = one([for d in jsondecode(aws_kms_key.plataforma.policy).Statement : d
    if d.Sid == "TopicoDeAlarmes"]).Condition.ArnEquals["aws:SourceArn"] == "arn:aws:sns:us-east-1:111111111111:00-plataforma-agentes-alarmes"
    error_message = "O tópico leva aws:SourceArn com o ARN exato de 00-plataforma-agentes-alarmes (ADR-0001)."
  }

  # 5. AgentCore (gateway e motor): conta concreta.
  assert {
    condition = one([for d in jsondecode(aws_kms_key.plataforma.policy).Statement : d
    if d.Sid == "GatewayEMotor"]).Principal.Service == "bedrock-agentcore.amazonaws.com"
    error_message = "O principal do gateway e do motor é bedrock-agentcore.amazonaws.com (ADR-0001)."
  }
  assert {
    condition = one([for d in jsondecode(aws_kms_key.plataforma.policy).Statement : d
    if d.Sid == "GatewayEMotor"]).Condition.StringEquals["aws:SourceAccount"] == "111111111111"
    error_message = "O gateway e o motor levam aws:SourceAccount com a conta concreta (ADR-0001)."
  }

  # Serviços só usam a chave; nenhuma ação de administração ou kms:* fora da conta.
  assert {
    condition = alltrue([for d in jsondecode(aws_kms_key.plataforma.policy).Statement :
      alltrue([for a in flatten([d.Action]) : !contains(["*", "kms:*", "kms:PutKeyPolicy", "kms:ScheduleKeyDeletion"], a)])
    if d.Sid != "AdministracaoPelaConta"])
    error_message = "Os principais de serviço só usam a chave (sem kms:*, PutKeyPolicy ou ScheduleKeyDeletion)."
  }
}

run "nomes_de_alarme_com_curinga_falham" {
  command = plan
  variables {
    nomes_dos_alarmes = ["00-plataforma-agentes-*"]
  }
  expect_failures = [var.nomes_dos_alarmes]
}

run "nomes_de_alarme_fora_do_prefixo_falham" {
  command = plan
  variables {
    nomes_dos_alarmes = ["outro-projeto-alarme"]
  }
  expect_failures = [var.nomes_dos_alarmes]
}

run "lista_de_alarmes_vazia_falha" {
  command = plan
  variables {
    nomes_dos_alarmes = []
  }
  expect_failures = [var.nomes_dos_alarmes]
}
