# TT-J02 (ADR-0007, RF-107, furo F5): a base publica as entradas da janela do MWAA num parâmetro SSM
# `/01-recomendacao/lab/janela/entradas` (String, Standard, até 4 KB). A raiz da janela (T060) lê só
# esse parâmetro, nunca o state da base. O parâmetro traz exatamente os campos que a janela lê e
# nenhum segredo; uma fixture sem o workgroup do Athena reprova na validação do módulo.
#
# Campos pendentes (lacuna registrada no relatório da T052): os jobs de publicação do Glue
# (`jobs_glue.publicar_dynamodb` e `jobs_glue.publicar_memorydb`) entram com a T050, e a imagem do
# treino (`treino.imagem`) com a T051. Até lá o DAG reprova a configuração no parse (CHAVES_OBRIGATORIAS),
# o que é uma falha visível, e não um nome inventado para um recurso que ainda não existe.

mock_provider "aws" {
  override_during = plan

  mock_resource "aws_s3_bucket" {
    defaults = {
      arn = "arn:aws:s3:::01-recomendacao-lab-golden-123456789012"
    }
  }
  mock_resource "aws_sns_topic" {
    defaults = {
      arn = "arn:aws:sns:us-east-1:123456789012:01-recomendacao-lab-alerts"
    }
  }
  mock_resource "aws_cloudwatch_log_group" {
    defaults = {
      arn = "arn:aws:logs:us-east-1:123456789012:log-group:mock"
    }
  }
  mock_resource "aws_ecr_repository" {
    defaults = {
      arn            = "arn:aws:ecr:us-east-1:123456789012:repository/01-recomendacao-lab/recommendation-service"
      repository_url = "123456789012.dkr.ecr.us-east-1.amazonaws.com/01-recomendacao-lab/recommendation-service"
    }
  }
  mock_data "aws_availability_zones" {
    defaults = {
      names = ["us-east-1a", "us-east-1b", "us-east-1c"]
    }
  }
  mock_data "aws_region" {
    defaults = {
      region = "us-east-1"
      name   = "us-east-1"
    }
  }
  mock_data "aws_caller_identity" {
    defaults = {
      account_id = "123456789012"
      arn        = "arn:aws:iam::123456789012:user/terraform"
    }
  }
  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":\"sts:AssumeRole\",\"Principal\":{\"Service\":\"ecs-tasks.amazonaws.com\"}}]}"
    }
  }
  mock_data "aws_partition" {
    defaults = {
      partition = "aws"
    }
  }
  # Valores computados que entram nas entradas da janela, conhecidos já no plan.
  mock_resource "aws_vpc" {
    defaults = {
      id = "vpc-0123456789abcdef0"
    }
  }
  mock_resource "aws_subnet" {
    defaults = {
      id = "subnet-0123456789abcdef0"
    }
  }
  mock_resource "aws_kms_key" {
    defaults = {
      arn = "arn:aws:kms:us-east-1:123456789012:key/00000000-0000-0000-0000-000000000000"
    }
  }
  mock_resource "aws_iam_role" {
    defaults = {
      arn = "arn:aws:iam::123456789012:role/01-recomendacao-lab-sm-train-role"
    }
  }
}

# Provider mock sem override_during, para o plan manter o insecure_value da configuração (A2).
mock_provider "aws" {
  alias = "simples"
}

variables {
  # Oráculo independente do módulo: os campos que a janela lê, achatados por ponto.
  campos_esperados = [
    "vpc_id", "subnets_privadas", "kms_key_arn", "bucket_golden", "prefixo_interacoes", "banco",
    "tabelas.interacoes", "tabelas.catalogo", "workgroup_athena", "jobs_glue.features",
    "treino.prefixo_do_job", "treino.role_arn",
  ]
}

run "entradas_da_janela" {
  command = plan

  assert {
    condition     = output.entradas_da_janela.nome == "/01-recomendacao/lab/janela/entradas"
    error_message = "O parâmetro das entradas é /01-recomendacao/lab/janela/entradas (ADR-0007)."
  }
  assert {
    condition     = output.entradas_da_janela.tipo == "String" && output.entradas_da_janela.tier == "Standard"
    error_message = "O parâmetro é String no tier Standard (sem custo, sem segredo)."
  }
  assert {
    condition     = length(output.entradas_da_janela.valor) <= 4096
    error_message = "O valor do parâmetro cabe nos 4 KB do tier Standard."
  }
  assert {
    condition = toset(flatten([for k, v in jsondecode(output.entradas_da_janela.valor) :
      can(keys(v)) ? [for k2 in keys(v) : "${k}.${k2}"] : [k]
    ])) == toset(var.campos_esperados)
    error_message = "O parâmetro traz exatamente os campos que a janela lê (TT-J02)."
  }
  # Cada campo vem da fonte certa da base, e não de um nome escrito à mão.
  assert {
    condition = (
      jsondecode(output.entradas_da_janela.valor).bucket_golden == output.s3_golden_dataset_bucket
      && jsondecode(output.entradas_da_janela.valor).workgroup_athena == output.athena_workgroup_name
      && jsondecode(output.entradas_da_janela.valor).jobs_glue.features == output.glue_job_name
      && jsondecode(output.entradas_da_janela.valor).banco == "p01_recomendacao_lab_golden"
      && jsondecode(output.entradas_da_janela.valor).tabelas == { interacoes = "interactions", catalogo = "catalog" }
      && jsondecode(output.entradas_da_janela.valor).prefixo_interacoes == "interactions"
      && length(jsondecode(output.entradas_da_janela.valor).subnets_privadas) > 0
    )
    error_message = "Bucket, workgroup, job, banco, tabelas, prefixo e subnets vêm dos módulos da base."
  }
  # O nome do training job casa com o training-job/01-recomendacao-* da role do MWAA (T063).
  assert {
    condition     = startswith(jsondecode(output.entradas_da_janela.valor).treino.prefixo_do_job, "01-recomendacao-lab-")
    error_message = "O prefixo do training job começa por 01-recomendacao-lab- (D-029)."
  }
  # Nenhum segredo: nenhum campo com nome de credencial (o tipo String já não serve para segredo).
  assert {
    condition = alltrue([for c in flatten([for k, v in jsondecode(output.entradas_da_janela.valor) :
      can(keys(v)) ? [for k2 in keys(v) : "${k}.${k2}"] : [k]]) :
    !can(regex("(?i)(senha|password|secret|segredo|token|credencial|access_key|chave_de_acesso)", c))])
    error_message = "Nenhum campo das entradas da janela é segredo."
  }
}

# Vermelho: uma fixture sem o workgroup do Athena reprova.
run "fixture_sem_workgroup_reprova" {
  command = plan

  module {
    source = "./modules/entradas_janela"
  }

  variables {
    project_name = "01-recomendacao"
    environment  = "lab"
    entradas = {
      vpc_id             = "vpc-0123456789abcdef0"
      subnets_privadas   = ["subnet-0123456789abcdef0"]
      kms_key_arn        = "arn:aws:kms:us-east-1:123456789012:key/00000000-0000-0000-0000-000000000000"
      bucket_golden      = "01-recomendacao-lab-golden"
      prefixo_interacoes = "interactions"
      banco              = "p01_recomendacao_lab_golden"
      tabelas            = { interacoes = "interactions", catalogo = "catalog" }
      jobs_glue          = { features = "01-recomendacao-lab-feature-engineering" }
      treino = {
        prefixo_do_job = "01-recomendacao-lab-reranker"
        role_arn       = "arn:aws:iam::123456789012:role/01-recomendacao-lab-sm-train-role"
      }
    }
  }

  expect_failures = [var.entradas]
}

# Vermelho: um campo a mais (um segredo) também reprova: o conjunto é exato.
run "fixture_com_campo_a_mais_reprova" {
  command = plan

  module {
    source = "./modules/entradas_janela"
  }

  variables {
    project_name = "01-recomendacao"
    environment  = "lab"
    entradas = {
      vpc_id             = "vpc-0123456789abcdef0"
      subnets_privadas   = ["subnet-0123456789abcdef0"]
      kms_key_arn        = "arn:aws:kms:us-east-1:123456789012:key/00000000-0000-0000-0000-000000000000"
      bucket_golden      = "01-recomendacao-lab-golden"
      prefixo_interacoes = "interactions"
      banco              = "p01_recomendacao_lab_golden"
      tabelas            = { interacoes = "interactions", catalogo = "catalog" }
      workgroup_athena   = "01-recomendacao-lab-workgroup"
      jobs_glue          = { features = "01-recomendacao-lab-feature-engineering" }
      treino = {
        prefixo_do_job = "01-recomendacao-lab-reranker"
        role_arn       = "arn:aws:iam::123456789012:role/01-recomendacao-lab-sm-train-role"
      }
      senha_do_redis = "nao-pode"
    }
  }

  expect_failures = [var.entradas]
}

# O valor que o recurso recebe é o mesmo que o output expõe (revisão da T052, A2). Num provider mock
# sem override_during, o insecure_value planejado é o da configuração; assim um insecure_value
# diferente do local.valor (por exemplo, um segredo) reprova aqui.
run "recurso_recebe_o_valor_do_output" {
  command = plan

  providers = {
    aws = aws.simples
  }

  module {
    source = "./modules/entradas_janela"
  }

  variables {
    project_name = "01-recomendacao"
    environment  = "lab"
    entradas = {
      vpc_id             = "vpc-0123456789abcdef0"
      subnets_privadas   = ["subnet-0123456789abcdef0"]
      kms_key_arn        = "arn:aws:kms:us-east-1:123456789012:key/00000000-0000-0000-0000-000000000000"
      bucket_golden      = "01-recomendacao-lab-golden"
      prefixo_interacoes = "interactions"
      banco              = "p01_recomendacao_lab_golden"
      tabelas            = { interacoes = "interactions", catalogo = "catalog" }
      workgroup_athena   = "01-recomendacao-lab-workgroup"
      jobs_glue          = { features = "01-recomendacao-lab-feature-engineering" }
      treino = {
        prefixo_do_job = "01-recomendacao-lab-reranker"
        role_arn       = "arn:aws:iam::123456789012:role/01-recomendacao-lab-sm-train-role"
      }
    }
  }

  assert {
    condition     = aws_ssm_parameter.entradas.insecure_value == output.parametro.valor
    error_message = "O insecure_value do parâmetro é exatamente o valor exposto no output (TT-J02)."
  }
  assert {
    condition     = jsondecode(aws_ssm_parameter.entradas.insecure_value).workgroup_athena == "01-recomendacao-lab-workgroup"
    error_message = "O parâmetro leva as entradas recebidas pelo módulo."
  }
}
