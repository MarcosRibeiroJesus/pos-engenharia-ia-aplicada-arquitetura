# Teto do Budgets diário (Art. V, D-021), para o README e o resumo do apply. A T020 passa a mesma
# variável ao módulo nucleo; até lá, este output é o único consumidor dela no root.
output "teto_diario_usd" {
  description = "Teto de um dia de demonstração em USD (Budgets diário do módulo nucleo)."
  value       = var.teto_diario_usd
}

output "tags_padrao" {
  description = "Tags que o provider aplica a todo recurso (default_tags)."
  value       = local.tags_padrao
}

# Tags efetivas de cada componente: o default_tags do provider somado ao local.tags do módulo.
# O tests/tags.tftest.hcl itera sobre este mapa. Cada módulo novo entra aqui com as tags dele.
output "tags_dos_recursos" {
  description = "Tags efetivas por componente do stack, para o teste de tags (TT-T01)."
  value = {
    raiz = merge(local.tags_padrao, { module = "raiz" })
  }
}
