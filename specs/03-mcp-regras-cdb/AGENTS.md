# AGENTS.md · 03-mcp-regras-cdb (arquitetura Azure comparativa, D03)

Manual do projeto. A arquitetura principal é AWS; a comparativa é Azure (D-007). Este arquivo fica em `specs/` porque o gate SDD bloqueia a pasta do projeto antes de `implementar`.

## Estado
- Fase no `harness/estado.json`: `implementar`. Confira com `python3 harness/estado.py status`.
- Plano e análise aprovados (PR #46, D-073). Delegação liberada pelo plano aprovado.
- Pasta do projeto: `modulos/03-mcp/arquitetura/`. Ela ainda não aparece na `main`; confirme na branch antes de criar código.

## Escopo já decidido
- MCP de regras do CDB com liquidez diária, com dados sintéticos versionados (D03-P1 a P10).
- Exposição só por HTTP sem estado, pelo gateway da plataforma (D03-P4).
- Consumo 100% da plataforma (D-074).
- Teto diário de US$ 0,50 com cota de 300.000 tokens no agente (D-073).
- Lane de compatibilidade só em `2025-11-25` (D-072).

## Regras do projeto
- Servidor MCP: erros com `isError`, testes de contrato, versão do protocolo `2026-07-28`.
- Dados de aplicações são sintéticos (`sintetico: true`, sem PII).
- Especialista do servidor: `engenheiro-mcp`. Terraform: `engenheiro-terraform`.
- Conferir a fidelidade às legendas e PDFs das unidades 04 a 08 antes de `analisar` (D03-P9). Material do curso não entra no repositório.
