# Copiado de harness/modelos/tags.tftest.hcl (TT-T01, RNF-107, Art. VI). Os padrões são os mesmos da
# política de tags do Infracost (D-031), então o erro aparece no terraform test, antes do PR.
# project e managed-by vêm do default_tags do provider; module vem do local.tags de cada módulo,
# com os nomes do ADR-0014. O output tags_dos_recursos traz as tags efetivas de cada recurso
# tagueável do root (default_tags somado ao atributo tags do recurso).

mock_provider "aws" {
  # Mesmos valores conhecidos do regras_base.tftest.hcl, para o plan do root inteiro fechar.
  override_during = plan

  mock_resource "aws_s3_bucket" {
    defaults = {
      arn = "arn:aws:s3:::mock-golden-123456789012"
    }
  }
  mock_resource "aws_sns_topic" {
    defaults = {
      arn = "arn:aws:sns:us-east-1:123456789012:mock-alerts"
    }
  }
  mock_resource "aws_cloudwatch_log_group" {
    defaults = {
      arn = "arn:aws:logs:us-east-1:123456789012:log-group:mock"
    }
  }
  mock_resource "aws_ecr_repository" {
    defaults = {
      arn            = "arn:aws:ecr:us-east-1:123456789012:repository/mock/recommendation-service"
      repository_url = "123456789012.dkr.ecr.us-east-1.amazonaws.com/mock/recommendation-service"
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

variables {
  projeto = "01-recomendacao"

  # Nome da tag module de cada módulo (ADR-0014). Chave: o nome do bloco module no main.tf.
  modulos_esperados = {
    networking            = "rede"
    kms                   = "chave-kms"
    s3_golden_dataset     = "dados"
    lake_formation        = "catalogo"
    dynamodb_table        = "recomendacoes-lote"
    memorydb_cluster      = "busca-vetorial"
    sagemaker_endpoint    = "re-ranker"
    sagemaker_training    = "treino"
    ecs_service           = "servico"
    athena_queries        = "consultas"
    glue_pipeline         = "pipeline-glue"
    cloudwatch_monitoring = "monitoramento"
    entradas_janela       = "entradas-janela"
  }
}

run "tags_no_padrao_da_politica" {
  command = plan

  # Liga o opcional (API pública com TLS) para que ele também entre na checagem. O MWAA saiu da base
  # (T014); a tag orquestracao-mwaa é testada na raiz da janela (T060).
  variables {
    expose_api_publicly = true
    certificate_arn     = "arn:aws:acm:us-east-1:123456789012:certificate/00000000-0000-0000-0000-000000000000"
  }

  assert {
    condition     = can(regex("^[0-9]{2}-[a-z0-9]+(-[a-z0-9]+)*$", var.projeto))
    error_message = "project é a chave do projeto em harness/estado.json (NN-nome-em-kebab)."
  }
  # Regra que passa sem nada para checar não conta como teste.
  assert {
    condition     = length(output.tags_dos_recursos) > 0
    error_message = "tags_dos_recursos precisa listar ao menos um mapa de tags."
  }
  # Todo módulo do root contribui com os seus recursos.
  assert {
    condition     = toset([for k, _ in output.tags_dos_recursos : split(".", k)[0]]) == toset(keys(var.modulos_esperados))
    error_message = "tags_dos_recursos precisa trazer os recursos de cada um dos 13 módulos do root."
  }
  assert {
    condition = alltrue([for t in values(output.tags_dos_recursos) :
      t["project"] == var.projeto
      && can(regex("^[a-z0-9]+(-[a-z0-9]+)*$", t["module"]))
    && t["managed-by"] == "terraform"])
    error_message = "Tags fora do padrão (Art. VI, D-031): project = chave, module em kebab, managed-by = terraform."
  }
  assert {
    condition = alltrue([for k, t in output.tags_dos_recursos :
    t["module"] == var.modulos_esperados[split(".", k)[0]]])
    error_message = "A tag module de cada recurso é o nome do módulo dele no ADR-0014."
  }
}

run "default_tags_sem_module" {
  command = plan
  # O default_tags do provider leva só project e managed-by; module é de cada módulo e environment
  # saiu (D-031, ADR-0014).
  assert {
    condition     = output.tags_padrao == { project = var.projeto, "managed-by" = "terraform" }
    error_message = "default_tags é exatamente project = chave e managed-by = terraform."
  }
}
