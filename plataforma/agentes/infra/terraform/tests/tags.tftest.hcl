# Copiado de harness/modelos/tags.tftest.hcl (TT-T01). Os padrões são os mesmos da política de
# tags do Infracost (D-031), então o erro aparece no terraform test, antes do PR.
# project e managed-by vêm do default_tags do provider; module vem do local.tags de cada módulo.
mock_provider "aws" {}

variables {
  projeto = "00-plataforma-agentes"
  # Desde a T015 o root compõe o gateway, que exige a role de deploy (sintética aqui).
  role_deploy_arn = "arn:aws:iam::111111111111:role/00-plataforma-agentes-deploy-sintetica"
}

run "tags_no_padrao_da_politica" {
  command = plan
  assert {
    condition     = can(regex("^[0-9]{2}-[a-z0-9]+(-[a-z0-9]+)*$", var.projeto))
    error_message = "project é a chave do projeto em harness/estado.json (NN-nome-em-kebab)."
  }
  # Regra que passa sem nada para checar não conta como teste.
  assert {
    condition     = length(output.tags_dos_recursos) > 0
    error_message = "tags_dos_recursos precisa listar ao menos um mapa de tags."
  }
  assert {
    condition = alltrue([for t in output.tags_dos_recursos :
      t["project"] == var.projeto
      && can(regex("^[a-z0-9]+(-[a-z0-9]+)*$", t["module"]))
    && t["managed-by"] == "terraform"])
    error_message = "Tags fora do padrão (Art. VI, D-031)."
  }
}

run "default_tags_sem_module" {
  command = plan
  # O default_tags do provider leva só project e managed-by; module é de cada módulo (D-031).
  assert {
    condition     = output.tags_padrao == { project = var.projeto, "managed-by" = "terraform" }
    error_message = "default_tags é exatamente project = chave e managed-by = terraform."
  }
}
