# Regras do stack inteiro: menor privilégio ENTRE funções (R3), sem custo fixo ocioso por
# padrão (R5), modo sem chamada ao Claude real por padrão (ADR-0006) e tags (R4).
mock_provider "aws" {
  mock_data "aws_caller_identity" {
    defaults = { account_id = "123456789012" }
  }
  mock_data "aws_region" {
    defaults = { region = "us-east-1", name = "us-east-1" }
  }
  mock_data "aws_partition" {
    defaults = { partition = "aws" }
  }
  mock_resource "aws_kms_key" {
    defaults = { arn = "arn:aws:kms:us-east-1:123456789012:key/11111111-2222-3333-4444-555555555555" }
  }
  mock_resource "aws_dynamodb_table" {
    defaults = { arn = "arn:aws:dynamodb:us-east-1:123456789012:table/agenda-lab-x" }
  }
  mock_resource "aws_s3_bucket" {
    defaults = { arn = "arn:aws:s3:::agenda-lab-anexos-123456789012" }
  }
  mock_resource "aws_sns_topic" {
    defaults = { arn = "arn:aws:sns:us-east-1:123456789012:agenda-lab-x" }
  }
  mock_resource "aws_iam_role" {
    defaults = { arn = "arn:aws:iam::123456789012:role/agenda-lab-x" }
  }
  mock_resource "aws_cloudwatch_log_group" {
    defaults = { arn = "arn:aws:logs:us-east-1:123456789012:log-group:agenda-lab-x" }
  }
  mock_resource "aws_lambda_function" {
    defaults = {
      arn        = "arn:aws:lambda:us-east-1:123456789012:function:agenda-lab-x"
      invoke_arn = "arn:aws:apigateway:us-east-1:lambda:path/2015-03-31/functions/arn:aws:lambda:us-east-1:123456789012:function:agenda-lab-x/invocations"
    }
  }
  mock_resource "aws_sfn_state_machine" {
    defaults = { arn = "arn:aws:states:us-east-1:123456789012:stateMachine:agenda-lab-aprovacao" }
  }
  mock_resource "aws_api_gateway_rest_api" {
    defaults = {
      id               = "abc123"
      root_resource_id = "root01"
      execution_arn    = "arn:aws:execute-api:us-east-1:123456789012:abc123"
    }
  }
  mock_resource "aws_wafv2_web_acl" {
    defaults = { arn = "arn:aws:wafv2:us-east-1:123456789012:regional/webacl/agenda-lab-borda/abc" }
  }
  mock_resource "aws_api_gateway_stage" {
    defaults = { arn = "arn:aws:apigateway:us-east-1::/restapis/abc123/stages/lab" }
  }
}

mock_provider "archive" {
  mock_data "archive_file" {
    defaults = {
      output_path         = "/tmp/pacote.zip"
      output_base64sha256 = "aGFzaA=="
    }
  }
}

variables {
  teto_mensal_usd = 10
}

run "so_o_gateway_fala_com_o_modelo" {
  command = apply

  assert {
    condition     = contains(flatten([for s in output.politicas.gateway.Statement : s.Action]), "bedrock-mantle:CreateInference")
    error_message = "O gateway precisa da permissão de inferência."
  }
  assert {
    condition = alltrue([for f in ["orquestrador", "executor"] :
      !anytrue([for a in flatten([for s in output.politicas[f].Statement : s.Action]) : startswith(a, "bedrock")])
    ])
    error_message = "R3: orquestrador e executor não chamam o modelo direto; tudo passa pelo gateway (cota e custo)."
  }
}

run "orquestrador_nao_escreve_na_agenda" {
  command = apply

  assert {
    condition = !anytrue(flatten([
      for s in output.politicas.orquestrador.Statement : [
        for a in flatten([s.Action]) : contains(["dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:DeleteItem", "dynamodb:TransactWriteItems"], a)
      ] if s.Sid == "LeituraDaAgenda"
    ]))
    error_message = "R9/R3: o grafo (onde está o modelo) só lê a agenda; quem escreve é o executor, depois do gate."
  }
  assert {
    condition     = anytrue([for s in output.politicas.executor.Statement : s.Sid == "EscritaNaAgenda" && contains(flatten([s.Action]), "dynamodb:TransactWriteItems")])
    error_message = "O executor escreve na agenda com transação (slot + consulta)."
  }
  assert {
    condition     = !anytrue([for s in output.politicas.executor.Statement : contains(flatten([s.Action]), "lambda:InvokeFunction")])
    error_message = "R3: o executor não chama outras funções."
  }
}

run "kms_so_atraves_dos_servicos" {
  command = apply

  assert {
    condition = alltrue([for f in ["gateway", "orquestrador", "executor"] :
      anytrue([for s in output.politicas[f].Statement : s.Sid == "CmkViaServicos" && length(s.Condition.StringEquals["kms:ViaService"]) == 4])
    ])
    error_message = "R3: uso da CMK restrito a DynamoDB, S3, Step Functions e SNS."
  }
}

run "padroes_do_lab_sem_custo_fixo_nem_modelo_real" {
  command = apply

  assert {
    condition     = output.waf_habilitado == false
    error_message = "R5: WAF desligado por padrão (custo fixo mensal, ADR-0007)."
  }
  assert {
    condition     = module.gateway.nome == "agenda-lab-gateway"
    error_message = "Nomes seguem o prefixo do stack."
  }
  assert {
    condition     = var.modo_llm == "gravado"
    error_message = "ADR-0006: o padrão é resposta gravada, sem chamada ao Claude real."
  }
}

run "tags_obrigatorias" {
  command = apply

  assert {
    condition     = output.tags.project == "assistente-agendamento" && output.tags.module == "02-apis-ia-generativa/arquitetura" && output.tags["managed-by"] == "terraform"
    error_message = "R4: tags project, module e managed-by."
  }
}

run "waf_quando_habilitado" {
  command = apply

  variables {
    habilitar_waf = true
  }

  assert {
    condition     = output.waf_habilitado
    error_message = "WAF ligado sob demanda."
  }
}

run "rejeita_modo_desconhecido" {
  command = plan
  variables {
    modo_llm = "openai"
  }
  expect_failures = [var.modo_llm]
}
