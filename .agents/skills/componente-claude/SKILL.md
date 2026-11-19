---
name: componente-claude
description: Construir e testar o componente com Claude de cada projeto (Bedrock ou API da Anthropic). Use para loop de agente, saída estruturada via tool_use, validação com retentativa, erros estruturados, prompt caching, Batches e testes com respostas gravadas.
---

# Componente com Claude

Todo projeto tem um componente que exercita tarefas da prova CCAR-F (Artigo VII). Cite os ids no ADR.

## Padrões obrigatórios
- **Loop pelo `stop_reason`** (1.1): continue enquanto for `tool_use`, pare em `end_turn`, e trate `max_tokens` e `refusal` como saídas explícitas. Nunca decida pelo texto.
- **Saída estruturada via tool_use** (4.3): defina uma tool com JSON Schema e force com `tool_choice`. Valide com o schema no código.
- **Validação e retentativa** (4.4): se a validação falhar, reenvie uma vez com o erro de validação como `tool_result` `is_error`. Depois disso, escale (5.2).
- **Critérios explícitos e few-shot** (4.1, 4.2): defina critérios mensuráveis no prompt de sistema e use de 2 a 4 exemplos, incluindo um caso limite.
- **Erros estruturados nas tools** (2.2): `isError`, categoria (`validacao`, `permissao`, `transitorio`, `negocio`) e `retentavel`.
- **Poucas tools por agente** (2.3): no máximo 4 ou 5 por agente; mais que isso vira coordenador com subagentes (1.2).
- **Custo:** prompt caching no prefixo estável e Message Batches para lote sem pressa (4.5).

## Testes (Artigo III, D-006)
- **Só respostas gravadas** em `tests/fixtures/claude/*.json`, nunca o Claude real.
- O cliente recebe um transporte injetável: em teste, um fake que devolve a resposta gravada pelo hash do pedido.
- **Casos mínimos:** resposta válida, JSON inválido seguido de correção, `max_tokens`, erro transitório com retentativa, recusa e prompt injection no dado de entrada.

## Bedrock (só na demonstração, D-028)
- **Credencial:** via role com OIDC. A política IAM só permite `bedrock:InvokeModel` no perfil de inferência de aplicação do produto, criado pela plataforma para atribuir custo.
- **Guardrail da plataforma** em toda chamada (skill `plataforma-agentes`).
- **O ID do modelo e o do perfil** ficam em variável, nunca fixos no código.
- **Os agentes de código não passam por aqui:** usam a assinatura do dono.

## Skill de mercado complementar
`claude-api`, da Anthropic. Ela vem embutida no Claude Code e, para os outros agentes, está no repositório `anthropics/skills`. Use-a para a referência atualizada de SDK, parâmetros e modelos.
