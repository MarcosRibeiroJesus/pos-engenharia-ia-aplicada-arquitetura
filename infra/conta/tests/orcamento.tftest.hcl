# Regras do limite mensal da conta (D-022) como testes, com mock provider (Art. III).
mock_provider "aws" {}

variables {
  emails_alerta      = ["alerta@exemplo.com"]
  repositorio_github = "dono-sintetico/repo-sintetico"
}

run "limite_mensal_de_20_dolares" {
  command = plan
  assert {
    condition     = aws_budgets_budget.mensal.limit_amount == "20" && aws_budgets_budget.mensal.time_unit == "MONTHLY"
    error_message = "O orçamento da conta é mensal e de US$ 20 (D-022)."
  }
  assert {
    condition     = aws_budgets_budget.mensal.budget_type == "COST" && aws_budgets_budget.mensal.limit_unit == "USD"
    error_message = "O orçamento é de custo, em dólar."
  }
}

run "alerta_real_e_previsto" {
  command = plan
  assert {
    condition     = length(aws_budgets_budget.mensal.notification) == 3
    error_message = "Três alertas: 80% e 100% do gasto real e 100% do previsto."
  }
  assert {
    condition     = contains([for n in aws_budgets_budget.mensal.notification : n.notification_type], "FORECASTED")
    error_message = "Sem alerta de previsão o aviso só chega depois do estouro."
  }
}

run "tags_obrigatorias" {
  command = plan
  assert {
    condition     = alltrue([for k in ["project", "module", "managed-by"] : contains(keys(aws_budgets_budget.mensal.tags), k)])
    error_message = "Tags project, module e managed-by em todos os recursos (Art. VI)."
  }
  # Os mesmos padrões da política de tags do Infracost (D-031).
  assert {
    condition     = can(regex("^[0-9]{2}-[a-z0-9]+(-[a-z0-9]+)*$", aws_budgets_budget.mensal.tags["project"]))
    error_message = "project é a chave do projeto (NN-nome-em-kebab)."
  }
  assert {
    condition     = can(regex("^[a-z0-9]+(-[a-z0-9]+)*$", aws_budgets_budget.mensal.tags["module"]))
    error_message = "module em minúsculas e hífen."
  }
  assert {
    condition     = aws_budgets_budget.mensal.tags["managed-by"] == "terraform"
    error_message = "managed-by é sempre terraform: recurso manual escapa do destroy (D-021)."
  }
}

run "nome_com_prefixo_do_projeto" {
  command = plan
  assert {
    condition     = startswith(aws_budgets_budget.mensal.name, "00-conta-")
    error_message = "Nome com o prefixo da chave do projeto (D-029)."
  }
}

run "sem_email_falha" {
  command = plan
  variables {
    emails_alerta = []
  }
  expect_failures = [var.emails_alerta]
}
