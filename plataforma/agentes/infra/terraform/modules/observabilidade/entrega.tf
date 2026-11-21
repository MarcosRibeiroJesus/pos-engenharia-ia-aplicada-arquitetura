# Módulo observabilidade: entrega de logs e traces do gateway (T016; RF-006, Art. VI, RNF-002).
# Os alarmes (T017) e a role de evidências (T068) entram neste módulo em arquivos próprios.
#
# - Logs de aplicação do gateway: fonte APPLICATION_LOGS -> destino no grupo
#   /aws/vendedlogs/bedrock-agentcore/gateway/APPLICATION_LOGS/<id> (nome do RF-006, exceção ao
#   prefixo no ADR-0012), com 7 dias de retenção e a chave da plataforma (ADR-0001).
# - Traces do gateway: fonte TRACES -> destino do tipo XRAY. Os spans caem no grupo aws/spans pelo
#   Transaction Search, que é configuração da conta (infra/conta); este módulo não cria esse grupo.
#
# KMS: a política da chave (módulo nucleo, declaração LogsDosGruposDaPlataforma) dá ao serviço
# logs.<região>.amazonaws.com o uso da chave com kms:EncryptionContext:aws:logs:arn no prefixo
# deste grupo. Nada de KMS é concedido aqui.
terraform {
  required_version = ">= 1.10.0"

  required_providers {
    aws = {
      source = "hashicorp/aws"
      # delivery_destination_type = "XRAY" e o destination_resource_arn opcional foram conferidos
      # só no schema do provider 6.73.0 (terraform providers schema -json), que é a versão do lock
      # do root (root: ~> 6.50). Por isso o piso do módulo é 6.73.
      version = ">= 6.73, < 7.0"
    }
  }
}

data "aws_caller_identity" "atual" {}

locals {
  # project e managed-by vêm do default_tags do root (D-031).
  tags = { module = "observabilidade" }

  prefixo = "00-plataforma-agentes"
  conta   = data.aws_caller_identity.atual.account_id

  # RNF-002: logs de um dia de demonstração; 7 dias bastam para a revisão (T088) e custam pouco.
  retencao_dias = 7
}

# ---------------------------------------------------------------- logs de aplicação do gateway

resource "aws_cloudwatch_log_group" "gateway" {
  # checkov:skip=CKV_AWS_338: RNF-002 e RF-006 fixam 7 dias (lab de um dia; a chave do ADR-0001 sai no destroy). ADR plataforma/agentes/adr/0015
  # ADR-0012: nome exigido pelo RF-006, fora do prefixo da chave.
  name              = "/aws/vendedlogs/bedrock-agentcore/gateway/APPLICATION_LOGS/${var.gateway_id}"
  retention_in_days = local.retencao_dias
  kms_key_id        = var.kms_key_arn

  # Destroy sem sobras (Art. V): explícitos, para uma mudança futura não tirar o grupo do destroy.
  skip_destroy                = false
  deletion_protection_enabled = false

  tags = local.tags
}

resource "aws_cloudwatch_log_delivery_source" "logs_gateway" {
  name         = "${local.prefixo}-gateway-logs"
  log_type     = "APPLICATION_LOGS"
  resource_arn = var.gateway_arn

  tags = local.tags
}

resource "aws_cloudwatch_log_delivery_destination" "logs_gateway" {
  name = "${local.prefixo}-gateway-logs"

  delivery_destination_configuration {
    destination_resource_arn = aws_cloudwatch_log_group.gateway.arn
  }

  tags = local.tags
}

# Política de recurso do CloudWatch Logs para a entrega gravar no grupo. Sem ela, a CreateDelivery
# acrescenta sozinha uma política da AWS, fora do Terraform e do destroy, e com curinga no
# aws:SourceArn (arn:aws:logs:<região>:<conta>:*), que o ADR-0014 proíbe. Aqui: principal de
# serviço, conta concreta e ARNs exatos.
#
# NÃO VERIFICADO: qual ARN o serviço de entrega envia em aws:SourceArn. A política de exemplo da
# documentação (Enabling logging from AWS services, logs para o CloudWatch Logs) usa o curinga de
# todos os recursos do Logs da conta, então o valor é um recurso do Logs. Ficam a fonte e o destino
# desta entrega; o ARN da própria entrega não entra, porque ela depende desta política (ciclo).
# A conferência é do ensaio contra a AWS (T084): se a entrega não gravar, o ajuste é aqui.
#
# Cota: o CloudWatch Logs aceita até 10 políticas de recurso por região na conta, e a conta é
# única para todos os projetos (D-029). Esta política ocupa uma delas durante a demonstração.
resource "aws_cloudwatch_log_resource_policy" "entrega_gateway" {
  policy_name = "${local.prefixo}-entrega-logs-gateway"

  # jsonencode, e não aws_iam_policy_document: com o mock, o data source devolve texto aleatório e
  # a regra TT-S01 do plan não lê a política.
  policy_document = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "EntregaDosLogsDoGateway"
        Effect    = "Allow"
        Principal = { Service = "delivery.logs.amazonaws.com" }
        Action    = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource  = "${aws_cloudwatch_log_group.gateway.arn}:log-stream:*"
        Condition = {
          StringEquals = { "aws:SourceAccount" = local.conta }
          ArnEquals = {
            "aws:SourceArn" = [
              aws_cloudwatch_log_delivery_source.logs_gateway.arn,
              aws_cloudwatch_log_delivery_destination.logs_gateway.arn,
            ]
          }
        }
      },
    ]
  })
}

resource "aws_cloudwatch_log_delivery" "logs_gateway" {
  delivery_source_name     = aws_cloudwatch_log_delivery_source.logs_gateway.name
  delivery_destination_arn = aws_cloudwatch_log_delivery_destination.logs_gateway.arn

  tags = local.tags

  # A política precisa existir antes, para a CreateDelivery não criar a dela (ver acima).
  depends_on = [aws_cloudwatch_log_resource_policy.entrega_gateway]
}

# ---------------------------------------------------------------- traces do gateway (X-Ray)

resource "aws_cloudwatch_log_delivery_source" "traces_gateway" {
  name         = "${local.prefixo}-gateway-traces"
  log_type     = "TRACES"
  resource_arn = var.gateway_arn

  tags = local.tags
}

# Destino XRAY sem delivery_destination_configuration: o X-Ray grava no aws/spans da conta
# (Transaction Search, infra/conta).
resource "aws_cloudwatch_log_delivery_destination" "traces_xray" {
  name                      = "${local.prefixo}-gateway-traces"
  delivery_destination_type = "XRAY"

  tags = local.tags
}

resource "aws_cloudwatch_log_delivery" "traces_gateway" {
  delivery_source_name     = aws_cloudwatch_log_delivery_source.traces_gateway.name
  delivery_destination_arn = aws_cloudwatch_log_delivery_destination.traces_xray.arn

  tags = local.tags
}
