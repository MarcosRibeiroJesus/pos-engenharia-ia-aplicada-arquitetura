# Composição do stack da plataforma. A T015 liga nucleo, politica e gateway, que o TT-P01
# (tests/composicao.tftest.hcl) precisa: o motor vem do módulo politica e entra no gateway em
# ENFORCE (ADR-0005, ADR-0011). A T020 completa o root com observabilidade e contrato.

locals {
  # Os cinco alarmes do RNF-003 (T017). A política da chave do nucleo cita o ARN exato de cada um
  # (ADR-0014: sem curinga no aws:SourceArn), e o alarme não pode ser referenciado direto, porque
  # depende do tópico, que depende da chave. O módulo observabilidade (T017) recebe esta mesma
  # lista na T020, para os nomes ficarem num lugar só.
  nomes_dos_alarmes = [
    "00-plataforma-agentes-gateway-system-errors",
    "00-plataforma-agentes-gateway-throttles",
    "00-plataforma-agentes-gateway-user-errors",
    "00-plataforma-agentes-motor-system-errors",
    "00-plataforma-agentes-motor-deny-decisions",
  ]
}

module "nucleo" {
  source = "./modules/nucleo"

  teto_diario_usd   = var.teto_diario_usd
  nomes_dos_alarmes = local.nomes_dos_alarmes
}

module "politica" {
  source = "./modules/politica"

  encryption_key_arn = module.nucleo.chave_arn
  modo_politica      = var.modo_politica
  calibracao         = var.calibracao
}

module "gateway" {
  source = "./modules/gateway"

  kms_key_arn     = module.nucleo.chave_arn
  role_deploy_arn = var.role_deploy_arn

  # ADR-0011: anulável só no módulo; no root real, sempre o motor do módulo politica (TT-P01).
  # O modo vem do output validado do módulo politica, onde fica a trava do ADR-0005.
  motor_politica_arn = module.politica.policy_engine_arn
  modo_politica      = module.politica.modo_politica
}
