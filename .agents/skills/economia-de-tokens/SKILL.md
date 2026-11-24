---
name: economia-de-tokens
description: Regras obrigatórias de economia de tokens do harness (AGENTS.md, seção 9), com checklist antes de cada disparo de subagente, cada leitura grande, cada pausa e cada revisão. Use em toda sessão de orquestração e de projeto, e ao disparar um especialista.
---

# Economia de tokens (obrigatória)

As sete regras estão na seção 9 do `AGENTS.md`. Esta skill diz o que fazer em cada momento. Os números vêm do painel de IA (ADR 0002); a economia é sempre estimativa, e um sinal sem medição fica `nao-medido`.

## Antes de disparar um subagente
1. Defina `model` explicitamente (regra 2). Opus só se a tarefa decide arquitetura, código de produção, segurança ou análise SDD.
2. No briefing, passe o trecho exato ou um resumo, nunca o arquivo inteiro (regra 7).
3. Se a tarefa é só ajuste de texto ou alinhamento, use Sonnet; se é só verificável, use Haiku.
4. Se o contexto da conversa já tem mais de 4 horas, ou a memória mudou, resuma antes (regra 1). Na orquestração, reinicie com resumo ao passar de 230 mil tokens de transcript, numa pausa entre tarefas (D-076).

## Antes de ler ou trazer saída
- Leia arquivo grande por trecho com `offset` e `limit` (regra 6).
- Filtre comando com `rtk`, `head`, `tail`, `grep` ou `-C` antes de voltar ao contexto (regra 6).
- Se a inspeção for grande e descartável, mande para um subagente (regra 6).
- Não releia arquivo que não mudou desde a última leitura (regra 7).

## Antes de pausar
- Pausa acima do TTL do cache (5 minutos em subagente, 1 hora na principal) no meio de tarefa é o caso a evitar (regra 3). Se for inevitável, ao voltar: resumo estruturado, não contexto reenviado.

## Antes de chamar o revisor
1. Rode os testes e os linters locais. Se falhar, corrija antes de revisar (regra 4).
2. A revisão independente por tarefa continua obrigatória. Não a pule para economizar.

## Hooks
- Hook do harness não imprime nada quando tudo está certo e injeta só o delta do estado (regra 5). Ao mexer em um hook, confira que a saída de sucesso continua vazia.

## Conferência
- Rode `python3 -m unittest harness/test_harness.py`; ele inclui `harness/testes/test_economia.py`, que confere que as sete regras continuam no `AGENTS.md`.
- Registre o uso ao fechar a entrega (seção 7 do `CLAUDE.md`).
