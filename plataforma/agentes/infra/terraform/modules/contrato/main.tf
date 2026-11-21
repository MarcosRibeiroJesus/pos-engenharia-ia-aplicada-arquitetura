# Módulo contrato: parâmetro comum do contrato v1 (T018; RF-007, RF-011, ADR-0002, ADR-0009).
#
# /00-plataforma-agentes/contrato/v1/comum: String, camada Standard, valor JSON validado por
# plataforma/agentes/contrato/v1.schema.json (TS-01). Sem SecureString e sem a chave do cliente: o
# contrato não guarda segredo, e o controle de acesso é por IAM, por ARN (ADR-0002). O parâmetro
# de cada produto (produtos/<chave>) é do módulo registro-produto, no state do produto (T030).
#
# Mudança de campo: campo novo sobe a versão menor (1.1.0); remover, renomear ou mudar o sentido
# é versão maior, com o v2 publicado ao lado do v1 (RF-007).
terraform {
  required_version = ">= 1.10.0"

  required_providers {
    aws = {
      source = "hashicorp/aws"
      # insecure_value no aws_ssm_parameter existe desde a 5.x; o piso acompanha o root (~> 6.50).
      version = ">= 6.50, < 7.0"
    }
  }
}

data "aws_region" "atual" {}

locals {
  # project e managed-by vêm do default_tags do root (D-031).
  tags = { module = "contrato" }

  nome_comum      = "/00-plataforma-agentes/contrato/v1/comum"
  versao_contrato = "1.0.0"

  # RF-011: categoria -> origem, retentável e o que o produto faz. Só limite_taxa e
  # falha_transitoria são retentáveis, com até 3 tentativas e espera de 1, 2 e 4 s. Mascaramento
  # (ANONYMIZED) não é erro e não entra no mapa.
  retentativa = { tentativas_max = 3, espera_segundos = [1, 2, 4] }
  mapa_erros = {
    politica_negada         = { origem = "isError true com AuthorizeActionException", retentavel = false, acao = "informa o usuário; não tenta de novo" }
    requer_aprovacao_humana = { origem = "negação de tool sensivel (RF-012)", retentavel = false, acao = "escala para humano (handoff)" }
    guardrail_entrada       = { origem = "stopReason guardrail_intervened com ação BLOCKED", retentavel = false, acao = "responde com a mensagem de bloqueio" }
    guardrail_saida         = { origem = "saída suprimida ou bloqueada", retentavel = false, acao = "responde com a mensagem de bloqueio" }
    autenticacao            = { origem = "4xx de autorização do gateway", retentavel = false, acao = "falha a sessão e alarma" }
    limite_taxa             = merge({ origem = "429 (Throttles)", retentavel = true, acao = "tenta de novo com espera exponencial" }, local.retentativa)
    falha_transitoria       = merge({ origem = "5xx (SystemErrors)", retentavel = true, acao = "tenta de novo; depois escala com o erro propagado" }, local.retentativa)
    erro_desconhecido       = { origem = "isError true sem regra no mapa", retentavel = false, acao = "trata como negação (falha fechada)" }
  }

  # Campos da tabela "Contrato v1" do plano, linha do comum.
  comum = {
    versao_contrato    = local.versao_contrato
    regiao             = data.aws_region.atual.region
    gateway_arn        = var.gateway_arn
    gateway_url        = var.gateway_url
    gateway_id         = var.gateway_id
    motor_politica_id  = var.motor_politica_id
    motor_politica_arn = var.motor_politica_arn
    versoes_mcp        = var.versoes_mcp
    grupo_log_gateway  = var.grupo_log_gateway
    grupo_spans        = "aws/spans" # grupo do Transaction Search, da conta (infra/conta)
    topico_alarmes_arn = var.topico_alarmes_arn
    chave_kms_arn      = var.chave_kms_arn
    mapa_erros         = local.mapa_erros
  }

  valor_comum = jsonencode(local.comum)
  # Bytes UTF-8 pelo base64 (length() conta caracteres): 4 caracteres são 3 bytes, menos o "=".
  base64_comum       = base64encode(local.valor_comum)
  tamanho_comum_byte = length(local.base64_comum) / 4 * 3 - length(regexall("=", local.base64_comum))
}

resource "aws_ssm_parameter" "comum" {
  # checkov:skip=CKV2_AWS_34: String por decisão (ADR-0002, plataforma/agentes/adr/0002): o contrato não guarda segredo, e SecureString exigiria kms:Decrypt de todo leitor numa chave que muda a cada apply.
  name        = local.nome_comum
  description = "Contrato v1 da plataforma de agentes (RF-007): campos comuns e mapa de erros. Schema em plataforma/agentes/contrato/v1.schema.json."
  type        = "String"
  tier        = "Standard"
  data_type   = "text"

  # insecure_value deixa o valor legível no plan, para os testes do contrato (ADR-0002).
  insecure_value = local.valor_comum

  tags = local.tags

  lifecycle {
    precondition {
      condition     = local.tamanho_comum_byte <= 4096
      error_message = "O contrato comum passa de 4 KB, o limite da camada Standard; mova as listas grandes para um parâmetro próprio, como versão menor (ADR-0002)."
    }
  }
}
