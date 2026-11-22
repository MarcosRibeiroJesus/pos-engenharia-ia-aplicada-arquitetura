output "orcamento" {
  description = "Nome e limite do orçamento mensal da conta."
  value       = { nome = aws_budgets_budget.mensal.name, limite_usd = var.limite_mensal_usd }
}
