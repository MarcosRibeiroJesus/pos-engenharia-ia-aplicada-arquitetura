# AGENTS.md · 01-recomendacao (arquitetura AWS, D01)

Manual do projeto. Fica em `specs/` porque o gate SDD bloqueia arquivos dentro da pasta do projeto antes da fase `implementar`. Vale para qualquer agente; as regras da raiz valem aqui.

## Estado
- Fase no `harness/estado.json`: a que estiver lá (hoje `especificar`). Confira com `python3 harness/estado.py status` antes de agir.
- Pasta do projeto (`modulos/01-fundamentos-ia-llms/unidades/03-recomendacao/`) só recebe código depois de `implementar`.
- Spec, plano e tarefas ficam em `specs/01-recomendacao/`.

## Escopo que já está decidido
- Arquitetura AWS: recomendação de e-commerce, consumindo a plataforma `00-plataforma-agentes` (D-074).
- Cloud comparativa: GCP (D-007).
- Âncora oficial da AWS no `estado.json` (regra D-065).

## Pendências que dependem do dono
- Teto diário, tema de IA aplicada e publicação não são decisões de agente. Ver as perguntas registradas no plano.

## Regras do projeto
- Testes primeiro. Infra com `terraform test`, `checkov` e `tflint`.
- Sem dado real: dados sintéticos e fontes públicas.
- Custo: teto diário e alarme de orçamento num único lugar, o `estado.json`.
