# Assistente de agendamento: gateway de LLM, grafo da conversa, intenção em JSON com gate
# e aprovação humana, memória com direito de apagar e defesa contra prompt injection.
# Desenho e decisões: ../../docs/arquitetura.md e ../../adr/.
data "aws_caller_identity" "atual" {}
data "aws_region" "atual" {}
data "aws_partition" "atual" {}

locals {
  nome       = "agenda-${var.ambiente}"
  account_id = data.aws_caller_identity.atual.account_id
  region     = data.aws_region.atual.region
  partition  = data.aws_partition.atual.partition
  namespace  = "AssistenteAgendamento"
  pacotes    = coalesce(var.diretorio_pacotes, "${path.module}/../../src/dist")

  tags = {
    project      = var.projeto
    module       = "02-apis-ia-generativa/arquitetura"
    "managed-by" = "terraform"
    environment  = var.ambiente
  }

  # O KMS só é usado através destes serviços (condição kms:ViaService).
  via_servicos = [for s in ["dynamodb", "s3", "states", "sns"] : "${s}.${local.region}.amazonaws.com"]
}

module "kms" {
  source     = "./modules/kms_key"
  nome       = local.nome
  account_id = local.account_id
  region     = local.region
  partition  = local.partition
  tags       = local.tags
}

# ---------------------------------------------------------------- dados
module "tabela_agenda" {
  source      = "./modules/dynamodb_table"
  nome        = "${local.nome}-agenda"
  hash_key    = "pk"
  range_key   = "sk"
  atributos   = [{ name = "pk", type = "S" }, { name = "sk", type = "S" }, { name = "usuario_id", type = "S" }]
  gsis        = [{ nome = "por_usuario", hash_key = "usuario_id", range_key = "sk" }]
  kms_key_arn = module.kms.arn
  tags        = local.tags
}

module "tabela_memoria" {
  source       = "./modules/dynamodb_table"
  nome         = "${local.nome}-memoria"
  hash_key     = "pk"
  range_key    = "sk"
  atributos    = [{ name = "pk", type = "S" }, { name = "sk", type = "S" }]
  ttl_atributo = "expira_em"
  kms_key_arn  = module.kms.arn
  tags         = local.tags
}

module "tabela_gateway" {
  source       = "./modules/dynamodb_table"
  nome         = "${local.nome}-gateway"
  hash_key     = "pk"
  range_key    = "sk"
  atributos    = [{ name = "pk", type = "S" }, { name = "sk", type = "S" }]
  ttl_atributo = "expira_em"
  kms_key_arn  = module.kms.arn
  tags         = local.tags
}

module "tabela_operacoes" {
  source       = "./modules/dynamodb_table"
  nome         = "${local.nome}-operacoes"
  hash_key     = "pk"
  range_key    = "sk"
  atributos    = [{ name = "pk", type = "S" }, { name = "sk", type = "S" }]
  ttl_atributo = "expira_em"
  kms_key_arn  = module.kms.arn
  tags         = local.tags
}

module "anexos" {
  source        = "./modules/bucket_privado"
  nome          = "${local.nome}-anexos-${local.account_id}"
  kms_key_arn   = module.kms.arn
  dias_retencao = 30
  tags          = local.tags
}

resource "aws_sns_topic" "aprovacoes" {
  name              = "${local.nome}-aprovacoes"
  kms_master_key_id = module.kms.arn
  tags              = local.tags
}

# ---------------------------------------------------------------- pacotes
data "archive_file" "funcao" {
  for_each    = toset(["gateway", "orquestrador", "executor"])
  type        = "zip"
  source_dir  = "${local.pacotes}/${each.key}"
  output_path = "${path.module}/.build/${each.key}.zip"
}

locals {
  kms_via_servico = {
    sid        = "CmkViaServicos"
    actions    = ["kms:Decrypt", "kms:GenerateDataKey"]
    resources  = [module.kms.arn]
    conditions = { StringEquals = { "kms:ViaService" = local.via_servicos } }
  }
  sm_arn = "arn:${local.partition}:states:${local.region}:${local.account_id}:stateMachine:${local.nome}-aprovacao"
}

# ---------------------------------------------------------------- gateway de LLM (camada 1)
module "gateway" {
  source      = "./modules/lambda_function"
  nome        = "${local.nome}-gateway"
  descricao   = "Gateway de LLM: roteamento, fallback, circuit breaker, cotas e custo por chamada"
  handler     = "index.handler"
  pacote_zip  = data.archive_file.funcao["gateway"].output_path
  pacote_hash = data.archive_file.funcao["gateway"].output_base64sha256
  timeout_s   = 60
  kms_key_arn = module.kms.arn
  account_id  = local.account_id
  tags        = local.tags
  variaveis = {
    TABELA_GATEWAY     = module.tabela_gateway.nome
    MODO_LLM           = var.modo_llm
    CADEIA_MODELOS     = jsonencode(var.cadeia_modelos)
    PRECOS_USD_MTOK    = jsonencode(var.precos_usd_por_mtok)
    COTA_TOKENS_DIA    = tostring(var.cota_tokens_dia_por_cliente)
    NAMESPACE_METRICAS = local.namespace
  }
  permissoes = [
    {
      sid       = "EstadoDoGateway"
      actions   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem"]
      resources = [module.tabela_gateway.arn]
    },
    {
      # Só o gateway fala com o modelo: ponto único de cota, custo e auditoria (ADR-0001).
      sid        = "ClaudeNoBedrock"
      actions    = ["bedrock-mantle:CreateInference"]
      resources  = ["arn:${local.partition}:bedrock-mantle:${local.region}:${local.account_id}:project/*"]
      conditions = { StringEquals = { "aws:ResourceAccount" = [local.account_id] } }
    },
    local.kms_via_servico,
  ]
}

# ---------------------------------------------------------------- executor (escreve na agenda)
module "executor" {
  source      = "./modules/lambda_function"
  nome        = "${local.nome}-executor"
  descricao   = "Executa ações que mudam estado (agendar, cancelar) depois do gate e da aprovação"
  handler     = "index.handler"
  pacote_zip  = data.archive_file.funcao["executor"].output_path
  pacote_hash = data.archive_file.funcao["executor"].output_base64sha256
  kms_key_arn = module.kms.arn
  account_id  = local.account_id
  tags        = local.tags
  variaveis = {
    TABELA_AGENDA      = module.tabela_agenda.nome
    TABELA_OPERACOES   = module.tabela_operacoes.nome
    TOPICO_APROVACOES  = aws_sns_topic.aprovacoes.arn
    NAMESPACE_METRICAS = local.namespace
  }
  permissoes = [
    {
      sid       = "EscritaNaAgenda"
      actions   = ["dynamodb:GetItem", "dynamodb:Query", "dynamodb:TransactWriteItems", "dynamodb:UpdateItem"]
      resources = [module.tabela_agenda.arn]
    },
    {
      sid       = "TrilhaDeOperacoes"
      actions   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem"]
      resources = [module.tabela_operacoes.arn]
    },
    {
      sid       = "AvisarAprovador"
      actions   = ["sns:Publish"]
      resources = [aws_sns_topic.aprovacoes.arn]
    },
    local.kms_via_servico,
  ]
}

# ---------------------------------------------------------------- orquestrador (grafo)
module "orquestrador" {
  source      = "./modules/lambda_function"
  nome        = "${local.nome}-orquestrador"
  descricao   = "Grafo da conversa: defesa de entrada, intenção, gate, memória e resposta"
  handler     = "index.handler"
  pacote_zip  = data.archive_file.funcao["orquestrador"].output_path
  pacote_hash = data.archive_file.funcao["orquestrador"].output_base64sha256
  timeout_s   = 60
  memoria_mb  = 512
  kms_key_arn = module.kms.arn
  account_id  = local.account_id
  tags        = local.tags
  variaveis = {
    TABELA_AGENDA      = module.tabela_agenda.nome
    TABELA_MEMORIA     = module.tabela_memoria.nome
    TABELA_OPERACOES   = module.tabela_operacoes.nome
    BUCKET_ANEXOS      = module.anexos.nome
    FUNCAO_GATEWAY     = module.gateway.nome
    FUNCAO_EXECUTOR    = module.executor.nome
    STATE_MACHINE_ARN  = local.sm_arn
    NAMESPACE_METRICAS = local.namespace
  }
  permissoes = [
    {
      # Só leitura: o orquestrador nunca escreve na agenda (o executor escreve).
      sid       = "LeituraDaAgenda"
      actions   = ["dynamodb:GetItem", "dynamodb:Query"]
      resources = [module.tabela_agenda.arn, "${module.tabela_agenda.arn}/index/por_usuario"]
    },
    {
      sid       = "Memoria"
      actions   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:Query", "dynamodb:DeleteItem", "dynamodb:BatchWriteItem"]
      resources = [module.tabela_memoria.arn]
    },
    {
      sid       = "Operacoes"
      actions   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem"]
      resources = [module.tabela_operacoes.arn]
    },
    {
      sid       = "LerAnexos"
      actions   = ["s3:GetObject"]
      resources = ["${module.anexos.arn}/anexos/*"]
    },
    {
      sid       = "ChamarGatewayEExecutor"
      actions   = ["lambda:InvokeFunction"]
      resources = [module.gateway.arn, module.executor.arn]
    },
    {
      sid       = "IniciarEDecidirAprovacao"
      actions   = ["states:StartExecution", "states:SendTaskSuccess", "states:SendTaskFailure"]
      resources = [local.sm_arn]
    },
    local.kms_via_servico,
  ]
}

# ---------------------------------------------------------------- aprovação humana
module "aprovacao" {
  source              = "./modules/fluxo_aprovacao"
  nome                = "${local.nome}-aprovacao"
  executor_lambda_arn = module.executor.arn
  timeout_aprovacao_s = var.timeout_aprovacao_s
  kms_key_arn         = module.kms.arn
  account_id          = local.account_id
  tags                = local.tags
}

# ---------------------------------------------------------------- borda
module "api" {
  source                  = "./modules/api_assistente"
  nome                    = local.nome
  stage                   = var.ambiente
  orquestrador_invoke_arn = module.orquestrador.invoke_arn
  orquestrador_nome       = module.orquestrador.nome
  kms_key_arn             = module.kms.arn
  account_id              = local.account_id
  region                  = local.region
  partition               = local.partition
  cota_diaria_requisicoes = var.cota_diaria_requisicoes
  configurar_conta_logs   = var.configurar_conta_logs_apigw
  tags                    = local.tags
}

module "waf" {
  count     = var.habilitar_waf ? 1 : 0
  source    = "./modules/waf_borda"
  nome      = local.nome
  stage_arn = module.api.stage_arn
  tags      = local.tags
}

# ---------------------------------------------------------------- observabilidade e custo
module "monitoramento" {
  source                      = "./modules/monitoramento"
  nome                        = local.nome
  kms_key_arn                 = module.kms.arn
  account_id                  = local.account_id
  funcoes_lambda              = [module.gateway.nome, module.orquestrador.nome, module.executor.nome]
  api_nome                    = module.api.nome
  api_stage                   = module.api.stage
  state_machine_arn           = module.aprovacao.arn
  namespace_metricas          = local.namespace
  teto_mensal_usd             = var.teto_mensal_usd
  custo_diario_llm_alarme_usd = var.custo_diario_llm_alarme_usd
  project                     = var.projeto
  emails_alerta               = var.emails_alerta
  tags                        = local.tags
}
