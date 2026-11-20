---
name: ciclo-demonstracao
description: Ciclo de vida da infraestrutura real de demonstração (D-021, D-022, D-024). Use para criar ou revisar os workflows de apply e destroy de um projeto, o prazo de 24 horas, o destroy automático sem aprovação e a verificação de sobras.
---

# Subir, demonstrar, destruir

## Regras do dono
- **Teto:** o custo de um dia (D-021).
- **Limite mensal da conta:** US$ 20 (D-022).
- **Destroy automático em até 24 horas, sem aprovação** (D-024).

## Arquivos do projeto
- `.github/workflows/<chave>-apply.yml`, copiado de `harness/modelos/apply.yml`:
  - input `prazo_horas` (padrão e máximo 24);
  - ambiente `aws-lab`, com aprovação;
  - job `prazo` com `harness/infra.py registrar`.
- `.github/workflows/<chave>-destroy.yml`, copiado de `harness/modelos/destroy.yml`:
  - input `confirm_stack`;
  - ambiente `aws-lab-destroy`, sem aprovação e restrito ao `main`;
  - OIDC;
  - verificação de sobras pela tag `project`;
  - `harness/infra.py remover` no fim.
- Os caminhos ficam em `apply_workflow` e `destroy_workflow` no `harness/estado.json`. O `estado.py validar` confere os dois a partir da fase `verificar`.

## Antes da primeira demonstração com Claude (D-034)
- **Configurações da conta, pelo `infra/conta`, aplicado pelo dono:**
  - a tag `project` ativa como tag de alocação de custo, pelo menos 48 horas antes, para o custo por projeto aparecer;
  - o Transaction Search do CloudWatch ligado, para os traces dos agentes.
- **Caso de uso da Anthropic no Bedrock:** o dono envia à mão no console, porque é um termo aceito em nome dele, e só quando o modelo do produto for anterior ao Claude Opus 4.7. A orquestração lembra no Monday; nunca envia.
- O apply confere a tag e o Transaction Search e só avisa se faltarem (`estado.py validar` exige a conferência em todo apply).

## Operação
- `python3 harness/infra.py status` mostra o que está no ar.
- `python3 harness/infra.py estender <chave> --horas N` adia, sem passar de 24 horas desde o apply.
- O `expirar-infra.yml` avisa uma hora antes e dispara o destroy quando o prazo vence. Ele dispara de novo depois de 3 horas se o registro continuar.

## Proibido
- Rodar apply numa conta real por conta própria: quem dispara é o dono.
- Deixar recurso fora do Terraform. Ele escapa do destroy e da verificação de sobras.
- Prazo acima de 24 horas, ou destroy que dependa de aprovação humana.
