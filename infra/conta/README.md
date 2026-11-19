# Conta: limite mensal de custo

Um AWS Budgets **mensal de US$ 20** soma todas as demonstrações do mês (D-022). Ele é a segunda camada de custo:
- **Primeira camada:** o teto diário de cada projeto (`teto_diario_usd`, D-021).
- **Segunda camada:** este limite, para o caso de um destroy esquecido.
- **Proteção principal:** o prazo de vida com destroy automático (`harness/infra.py`). O alerta do Budgets chega com atraso, então não segura um esquecimento sozinho.

**Alertas:** 80% e 100% do gasto real e 100% do gasto previsto, por e-mail.

## Pré-requisitos
- Terraform 1.7 ou mais novo.
- Bucket de state com lock.
- Credencial da conta com permissão no AWS Budgets.

## Passos
1. `cp terraform.tfvars.example terraform.tfvars` e preencha os e-mails.
2. `terraform init -backend-config=bucket=<state> -backend-config=key=conta/lab.tfstate`
3. `terraform test`
4. `terraform plan`
5. `terraform apply`
