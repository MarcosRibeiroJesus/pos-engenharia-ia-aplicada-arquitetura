# Modelo (harness/modelos): copie para infra/terraform/tests/tags.tftest.hcl do projeto e troque TROCAR-CHAVE.
# Os padrões são os mesmos da política de tags do Infracost (D-031), então o erro aparece no
# terraform test, antes do PR. O Infracost lê o default_tags do provider.
mock_provider "aws" {}

variables {
  projeto = "TROCAR-CHAVE"
}

run "tags_no_padrao_da_politica" {
  command = plan
  assert {
    condition     = can(regex("^[0-9]{2}-[a-z0-9]+(-[a-z0-9]+)*$", var.projeto))
    error_message = "project é a chave do projeto em harness/estado.json (NN-nome-em-kebab)."
  }
  # Repita para cada recurso tagueável do stack, ou itere sobre um output com os mapas de tags:
  # assert {
  #   condition = alltrue([for t in output.tags_dos_recursos.value :
  #     t["project"] == var.projeto
  #     && can(regex("^[a-z0-9]+(-[a-z0-9]+)*$", t["module"]))
  #     && t["managed-by"] == "terraform"])
  #   error_message = "Tags fora do padrão (Art. VI, D-031)."
  # }
}
