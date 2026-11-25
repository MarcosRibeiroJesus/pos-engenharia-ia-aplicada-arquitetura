# AGENTS.md · 01-doom (IA aplicada, D01)

Manual do projeto de IA aplicada. Fica em `specs/` porque o gate SDD bloqueia arquivos dentro da pasta do projeto antes da fase `implementar`. Vale para qualquer agente; as regras da raiz valem aqui.

## Estado
- Fase no `harness/estado.json` (hoje `especificar`). Confira com `python3 harness/estado.py status`.
- Pasta do projeto: `modulos/01-fundamentos-ia-llms/ia-aplicada/`. Código só depois de `implementar`.

## Escopo já decidido
- Estratégia principal, 100% fiel à aula (D-059, D-074): YOLO em TensorFlow.js rodando num Web Worker, com calibrador do limiar com gate humano. Rótulos vêm do motor do jogo.
- **Segunda estratégia comparativa (D-078):** arquitetura Jev + Astra, com Sistema 1 reativo de baixa latência e Sistema 2 de planejamento assíncrono em segundo plano, sobre estado estruturado. Fica dentro do mesmo projeto, atrás de um contrato com provider plugável.
  - Provider Jev + Astra usa chaves locais no `.env`. Fallback para Claude Haiku ou Opus. No CI, replay gravado (Art. III e V).
- Não é aprendizado por reforço. Não mudar o escopo sem o dono.
- Fiel às aulas. As legendas e os PDFs do curso ficam fora do repositório.

## Regras do projeto
- Código do navegador: testes primeiro; modelo e assets fora do repositório quando forem grandes.
- Chaves do provider Jev + Astra nunca no repositório: só no `.env` local, que está no `.gitignore`.
- Nenhum material do curso no repositório (`docs/curso/` é gitignorado).
- Especialista para o código: `engenheiro-visao-web`.
