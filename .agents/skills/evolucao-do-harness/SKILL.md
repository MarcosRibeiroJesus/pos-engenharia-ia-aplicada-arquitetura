---
name: evolucao-do-harness
description: Mudar o próprio harness (harness/, .claude/, .githooks/, workflows do harness, templates SDD) até uma versão estável e testada (D-027). Use ao criar ou alterar scripts, hooks, gates, skills, especialistas ou modelos do harness.
---

# Evoluir o harness

O pacote npx só será criado depois de uma **versão estável e testada** (D-027); a publicação é decisão do dono. Até lá, toda mudança no harness deixa o caminho pronto para extrair o núcleo.

## Regras de toda mudança
1. **Teste primeiro:** em `harness/test_harness.py` ou nos testes de `.claude/hooks/`. Estado compartilhado é testado em repositório git temporário.
2. **Só biblioteca padrão do Python 3** nos scripts do harness. Dependência nova precisa de ADR.
3. **Arquivo gerado nunca se edita à mão:** mude `harness/especialistas.json` e rode `python3 harness/sincronizar_agentes.py`.
4. **Núcleo genérico:** regra que só vale para a pós vai no `CLAUDE.md`, na memória compartilhada ou em skills específicas, não no código do harness.
5. **Registro:** suba a versão e escreva a mudança em `harness/VERSAO.md`, com os critérios de estabilidade afetados.
6. **CI verde** no workflow `harness.yml` antes do merge.

## Critérios de estabilidade
Estão em `harness/VERSAO.md`. Quando todos estiverem atendidos, leve ao dono a pergunta "publicar o pacote?". Nunca publique por conta própria.
