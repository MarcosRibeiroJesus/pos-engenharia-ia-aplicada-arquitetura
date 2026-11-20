# Plan com mock para as regras transversais de segurança e custo (T003; TT-S01, TT-S03, TT-S05,
# TT-K02, TT-K03). O plataforma/agentes/tests/plan/plano.py roda este arquivo com
# `terraform test -json -verbose` e lê o plan em JSON do run abaixo, sem credencial da AWS.
#
# override_during = plan deixa conhecidos no plan os valores dos mock_resource abaixo. Toda
# política que usa o ARN de um recurso criado no stack precisa de um mock_resource com o arn aqui:
# política desconhecida no plan reprova, porque a regra não consegue lê-la.
mock_provider "aws" {
  override_during = plan
}

run "plano_para_regras" {
  command = plan
}
