# TT-T02 (RNF-108, Art. VI, D-029, ADR-0014): todo nome começa por 01-recomendacao- ou casa com uma
# exceção de tests/excecoes_de_nome.json para o mesmo tipo de recurso. O output nomes_dos_recursos
# traz o nome de cada recurso nomeado do root; o módulo tests/verificador_de_nomes aplica a regra.
# A lista de exceções é validada em static_rules.py (ST-04: motivo, fonte e ADR em cada uma).

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
}

# Root com o opcional ligado (API pública), para os nomes dele também entrarem. O MWAA saiu da base
# (T014, ADR-0007); a exceção mwaa-ambiente fica no excecoes_de_nome.json para a raiz da janela.
run "nomes_do_root" {
  command = plan

  variables {
    expose_api_publicly = true
    certificate_arn     = "arn:aws:acm:us-east-1:123456789012:certificate/00000000-0000-0000-0000-000000000000"
  }

  # Regra que passa sem nada para checar não conta como teste: os 12 módulos contribuem com nomes.
  assert {
    condition = toset([for k, _ in output.nomes_dos_recursos : split(".", k)[0]]) == toset([
      "networking", "kms", "s3_golden_dataset", "lake_formation", "dynamodb_table", "memorydb_cluster",
      "sagemaker_endpoint", "sagemaker_training", "ecs_service", "athena_queries", "glue_pipeline",
    "cloudwatch_monitoring"])
    error_message = "nomes_dos_recursos precisa trazer os recursos nomeados de cada um dos 12 módulos do root."
  }
  # O prefixo dos nomes é a chave do projeto (D-029), o mesmo que o harness de integração lê.
  assert {
    condition     = output.prefixo_dos_nomes == "01-recomendacao-lab"
    error_message = "prefixo_dos_nomes é 01-recomendacao-<environment>."
  }
  # Exceções por precaução do ADR-0014: os três nomes do MemoryDB começam por letra.
  assert {
    condition = alltrue([for k in [
      "memorydb_cluster.aws_memorydb_cluster.vector_cluster",
      "memorydb_cluster.aws_memorydb_subnet_group.main",
      "memorydb_cluster.aws_memorydb_parameter_group.redis7",
    ] : startswith(output.nomes_dos_recursos[k], "p01-recomendacao-lab-")])
    error_message = "Cluster, subnet group e parameter group do MemoryDB usam p01-recomendacao- (ADR-0014)."
  }
  # A19: os log groups do serviço e do Glue levam o prefixo; o --continuous-log-logGroup aponta para ele.
  assert {
    condition     = output.nomes_dos_recursos["ecs_service.aws_cloudwatch_log_group.ecs"] == "01-recomendacao-lab-servico"
    error_message = "O log group do serviço é 01-recomendacao-lab-servico (A19, padrão logs:GetLogEvents da T031)."
  }
  assert {
    condition     = startswith(output.nomes_dos_recursos["glue_pipeline.aws_cloudwatch_log_group.glue"], "01-recomendacao-lab-glue-")
    error_message = "O log group do Glue é 01-recomendacao-lab-glue-... (A19)."
  }
}

# A regra sobre os nomes reais do root.
run "nomes_do_root_no_prefixo" {
  command = plan

  module {
    source = "./tests/verificador_de_nomes"
  }

  variables {
    nomes = run.nomes_do_root.nomes_dos_recursos
  }

  assert {
    condition     = output.total == length(run.nomes_do_root.nomes_dos_recursos) && output.total > 0
    error_message = "O verificador precisa checar todos os nomes do root."
  }
}

# Vermelho: recurso sintético fora do prefixo e fora da lista reprova.
run "fixture_fora_do_prefixo_reprova" {
  command = plan

  module {
    source = "./tests/verificador_de_nomes"
  }

  variables {
    nomes = { "sintetico.aws_s3_bucket.antigo" = "recsys-lab-golden" }
  }

  expect_failures = [var.nomes]
}

# Vermelho: a exceção vale só para o tipo listado; um bucket com p01-recomendacao- reprova.
run "fixture_excecao_em_outro_tipo_reprova" {
  command = plan

  module {
    source = "./tests/verificador_de_nomes"
  }

  variables {
    nomes = { "sintetico.aws_s3_bucket.com_p" = "p01-recomendacao-lab-golden" }
  }

  expect_failures = [var.nomes]
}

# Vermelho: a exceção do MemoryDB não vale para o ElastiCache (outro tipo, mesmo padrão de nome).
run "fixture_excecao_do_memorydb_em_outro_tipo_reprova" {
  command = plan

  module {
    source = "./tests/verificador_de_nomes"
  }

  variables {
    nomes = { "sintetico.aws_elasticache_subnet_group.main" = "p01-recomendacao-lab-memdb-subnets" }
  }

  expect_failures = [var.nomes]
}

# Verde de controle: a exceção do cluster do MemoryDB passa só no tipo dela.
run "fixture_excecao_do_cluster_passa" {
  command = plan

  module {
    source = "./tests/verificador_de_nomes"
  }

  variables {
    nomes = { "sintetico.aws_memorydb_cluster.vector_cluster" = "p01-recomendacao-lab-vec" }
  }
}

# A variável project_name só aceita a chave do projeto: o prefixo não se troca por input (D-029).
run "project_name_fora_da_chave_reprova" {
  command = plan

  variables {
    project_name = "recsys"
  }

  expect_failures = [var.project_name]
}
