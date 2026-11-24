# AGENTS.md · 01-doom (IA aplicada, D01)

Manual do projeto de IA aplicada. Fica em `specs/` porque o gate SDD bloqueia arquivos dentro da pasta do projeto antes da fase `implementar`. Vale para qualquer agente; as regras da raiz valem aqui.

## Estado
- Fase no `harness/estado.json` (hoje `especificar`). Confira com `python3 harness/estado.py status`.
- Pasta do projeto: `modulos/01-fundamentos-ia-llms/ia-aplicada/`. Código só depois de `implementar`.

## Escopo já decidido
- Opção 04-C (D-059): calibrador do limiar com gate humano sobre YOLO em TensorFlow.js, rodando num Web Worker. Rótulos vêm do motor do jogo.
- Não é aprendizado por reforço. Não mudar o escopo sem o dono.
- Fiel às aulas. As legendas e os PDFs do curso ficam fora do repositório.

## Regras do projeto
- Código do navegador: testes primeiro; modelo e assets fora do repositório quando forem grandes.
- Nenhum material do curso no repositório (`docs/curso/` é gitignorado).
- Especialista para o código: `engenheiro-visao-web`.
