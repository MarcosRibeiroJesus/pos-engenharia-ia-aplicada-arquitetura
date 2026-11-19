---
name: cloud-comparativa
description: Arquitetura comparativa em outra cloud (GCP na D01 e D02, Azure na D03, D-007). Use para o mapeamento serviço a serviço, o que muda sem equivalente direto, o design doc, o diagrama e o post da cloud comparativa.
---

# Cloud comparativa

A cloud de cada disciplina é decisão do dono (D-007): GCP na D01 e na D02, Azure na D03. Não troque.

## Mapeamento
| Componente | AWS | <cloud> | Equivalência | O que muda e por quê | Fonte oficial |
|---|---|---|---|---|---|

Na coluna "Equivalência", use: direta, parcial ou sem equivalente.

- **Uma linha por serviço AWS do plano**, incluindo IAM, KMS, logs, alarmes, orçamento e o acesso ao Claude: Vertex AI no GCP e Azure AI Foundry no Azure, com a disponibilidade do Claude conferida na fonte oficial.
- **Sem equivalente direto:** descreva a alternativa e o trade-off (custo, operação, limite). Não force uma equivalência que não existe.
- **Toda afirmação de serviço** cita a documentação oficial com a data da consulta.

## Entrega
- `docs/<cloud>.md` (design doc), com o diagrama em Mermaid.
- `posts/<cloud>.md` (skill `post-tecnico`).
- Implementar só se for barato validar, e com a aprovação do dono.

## Skills de mercado complementares
`azure@claude-plugins-official` (Microsoft) e `google-cloud-developer@google-plugins` (Google). Use para consultar a documentação, não para criar recursos.
