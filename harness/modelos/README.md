# Modelos de workflow para infraestrutura real

Ponto de partida para o apply e o destroy de cada projeto com `infra_real: true` (Artigo V, D-021 e D-022). Copie para `.github/workflows/<chave>-apply.yml` e `.github/workflows/<chave>-destroy.yml` e troque os valores marcados com `TROCAR`. O `harness/estado.py validar` confere os requisitos a partir da fase `verificar`.

## Ciclo da demonstração
1. **Apply:** disparo manual com `prazo_horas` (padrão e máximo 24, D-024). O workflow registra o prazo no branch `infra-no-ar`.
2. **Demonstração:** grave o vídeo. Se precisar de mais tempo, rode `python3 harness/infra.py estender <chave> --horas 2`, sem passar de 24 h desde o apply.
3. **Destroy:** manual, digitando o nome do stack. Se você esquecer:
   - o `expirar-infra.yml` abre uma issue de aviso uma hora antes do prazo;
   - quando o prazo vence, ele dispara o mesmo destroy.
4. **Verificação:** o destroy confere as sobras pela tag `project` e só então remove o registro.

## Ambientes do GitHub
- **`aws-lab`:** usado pelo apply, com aprovação obrigatória.
- **`aws-lab-destroy`:** usado pelo destroy, sem aprovação e restrito ao branch `main` (D-024). Com ele, o destroy automático não espera ninguém.
- **Confiança do OIDC na AWS:** a role assumida pelo destroy precisa aceitar o subject `repo:<dono>/<repo>:environment:aws-lab-destroy`.

## Limites de custo
- **Teto diário do projeto:** `teto_diario_usd`, configurado no AWS Budgets diário.
- **Limite mensal da conta:** US$ 20, configurado no AWS Budgets mensal de `infra/conta`.
- **Atraso do alerta:** o alerta do Budgets pode chegar com até um dia de atraso. Por isso o prazo de vida é a proteção principal.
