# TT-K02 (RNF-002, Art. V, ADR-0002, ADR-0007, ADR-0013): sem custo fixo ocioso na base. O root tem só
# os 5 endpoints de interface da saída das tasks, em 1 AZ, mais os de gateway S3 e DynamoDB; nenhum NAT
# Gateway; nenhum MWAA (ele vive na raiz da janela); MemoryDB sem snapshot; 1 ALB, 1 nó e 1 task, como
# a tabela "Custo do lab" do plano. O output custo_fixo_da_base reúne isso; os tipos vêm das chaves de
# tags_dos_recursos e nomes_dos_recursos, que o ST-T01 e o ST-T02 mantêm completos. O módulo
# tests/verificador_de_custo_fixo aplica a regra ao root e às fixtures que precisam reprovar.
# O ST-07 do static_rules.py complementa: todo recurso cobrado por hora do root é citado num ADR.

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

# Root com os opcionais ligados (API pública com HTTPS): nem eles podem trazer custo fixo a mais.
run "custo_fixo_do_root" {
  command = plan

  variables {
    expose_api_publicly = true
    certificate_arn     = "arn:aws:acm:us-east-1:123456789012:certificate/00000000-0000-0000-0000-000000000000"
  }

  assert {
    condition = toset(keys(output.custo_fixo_da_base.endpoints_de_interface)) == toset([
      "ecr.api", "ecr.dkr", "logs", "sagemaker.runtime", "bedrock-runtime"
    ])
    error_message = "A base tem só os 5 endpoints de interface; monitoring saiu (EMF, ADR-0013)."
  }
  assert {
    condition     = output.custo_fixo_da_base.endpoints_de_gateway == toset(["s3", "dynamodb"])
    error_message = "S3 e DynamoDB por endpoint de gateway, sem custo por hora (ADR-0002)."
  }
  assert {
    condition     = lookup(output.custo_fixo_da_base.contagem_por_tipo, "aws_mwaa_environment", 0) == 0 && lookup(output.custo_fixo_da_base.contagem_por_tipo, "aws_nat_gateway", 0) == 0
    error_message = "Nenhum MWAA nem NAT Gateway na base (ADR-0002, ADR-0007)."
  }
  # Regra que passa sem nada para checar não conta como teste: os tipos vêm do root inteiro.
  assert {
    condition     = lookup(output.custo_fixo_da_base.contagem_por_tipo, "aws_vpc_endpoint", 0) == 7
    error_message = "contagem_por_tipo precisa enxergar os 7 endpoints do root (5 de interface e 2 de gateway)."
  }
}

# A regra sobre o custo fixo real do root.
run "custo_fixo_do_root_na_tabela" {
  command = plan

  module {
    source = "./tests/verificador_de_custo_fixo"
  }

  variables {
    base = run.custo_fixo_do_root.custo_fixo_da_base
  }

  assert {
    condition     = output.total_de_endpoints_de_interface == 5
    error_message = "O verificador precisa checar os 5 endpoints da base."
  }
}

# Vermelho: o endpoint monitoring de volta na base reprova (ADR-0013).
run "fixture_com_monitoring_reprova" {
  command = plan

  module {
    source = "./tests/verificador_de_custo_fixo"
  }

  variables {
    base = merge(run.custo_fixo_do_root.custo_fixo_da_base, {
      endpoints_de_interface = merge(run.custo_fixo_do_root.custo_fixo_da_base.endpoints_de_interface, { monitoring = 1 })
    })
  }

  expect_failures = [var.base]
}

# Vermelho: um MWAA na base reprova; ele vive só na raiz da janela (ADR-0007).
run "fixture_com_mwaa_reprova" {
  command = plan

  module {
    source = "./tests/verificador_de_custo_fixo"
  }

  variables {
    base = merge(run.custo_fixo_do_root.custo_fixo_da_base, {
      contagem_por_tipo = merge(run.custo_fixo_do_root.custo_fixo_da_base.contagem_por_tipo, { aws_mwaa_environment = 1 })
    })
  }

  expect_failures = [var.base]
}

# Vermelho: um NAT Gateway na base reprova (ADR-0002).
run "fixture_com_nat_reprova" {
  command = plan

  module {
    source = "./tests/verificador_de_custo_fixo"
  }

  variables {
    base = merge(run.custo_fixo_do_root.custo_fixo_da_base, {
      contagem_por_tipo = merge(run.custo_fixo_do_root.custo_fixo_da_base.contagem_por_tipo, { aws_nat_gateway = 1 })
    })
  }

  expect_failures = [var.base]
}

# Vermelho: endpoint em 2 AZs reprova (no lab, 1 AZ).
run "fixture_endpoint_em_duas_azs_reprova" {
  command = plan

  module {
    source = "./tests/verificador_de_custo_fixo"
  }

  variables {
    base = merge(run.custo_fixo_do_root.custo_fixo_da_base, {
      endpoints_de_interface = merge(run.custo_fixo_do_root.custo_fixo_da_base.endpoints_de_interface, { logs = 2 })
    })
  }

  expect_failures = [var.base]
}

# Vermelho: snapshot do MemoryDB reprova (cobraria depois do destroy).
run "fixture_com_snapshot_reprova" {
  command = plan

  module {
    source = "./tests/verificador_de_custo_fixo"
  }

  variables {
    base = merge(run.custo_fixo_do_root.custo_fixo_da_base, { memorydb_snapshot_retention_limit = 1 })
  }

  expect_failures = [var.base]
}

# Vermelho: uma task a mais reprova (a tabela do plano prevê 1).
run "fixture_com_duas_tasks_reprova" {
  command = plan

  module {
    source = "./tests/verificador_de_custo_fixo"
  }

  variables {
    base = merge(run.custo_fixo_do_root.custo_fixo_da_base, { ecs_tarefas = 2 })
  }

  expect_failures = [var.base]
}
