# AGENTS.md · 02-assistente-agendamento (arquitetura AWS, D02)

Manual do projeto. A pasta do projeto é `modulos/02-apis-ia-generativa/arquitetura/`. Pelo gate SDD, código e arquivos dessa pasta ficam bloqueados até a fase `implementar`. Este arquivo fica em `specs/`.

## Estado
- Fase no `harness/estado.json`: `planejar`. Confira com `python3 harness/estado.py status`.
- **Pausado pelo dono** em 2026-11-24, junto com a PR #1 (D01). Não delegue tarefa nem avance fase sem a decisão dele.
- Branch de trabalho: `modulo/02-apis-ia-generativa/assistente-agendamento-seguranca` (fase `tarefas`).

## Pendências que dependem do dono
- **Código do projeto na `main`:** 118 arquivos de `modulos/02-apis-ia-generativa/arquitetura/` estão na `main` enquanto o estado diz `planejar`. Isso viola o Artigo I. O dono decide: tirar da `main` ou avançar pelo SDD.
- **D02-P6:** permissions boundary nas roles criadas. Resposta: na role da conta, depois da P00-P2. Tarefa T210 pendente.
- **D02-P7:** troca do PowerUserAccess pela política do IAM Access Analyzer. Resposta: no primeiro deploy real da demonstração. Tarefa T211 pendente.

## Escopo já decidido
- Consumo completo da plataforma `00-plataforma-agentes` (D-074, opção B do ADR-0003).
- Tracing com Langfuse Cloud, só com dados sintéticos (D-048). Chaves em secrets.
- Teto diário de US$ 0,85 (D-070).
- Cloud comparativa: GCP (D-007).

## Regras do projeto
- Testes do componente Claude só com respostas gravadas (D-006).
- Avaliações e red team em `src/tests/avaliacao` e `src/tests/redteam`.
- `npm test` em `src/` (vitest). Typecheck com `npm run typecheck`.
