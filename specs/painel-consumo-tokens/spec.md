# Spec · Painel de Consumo de Tokens (`apps/painel-ia`)

## Enquadramento
`apps/painel-ia` é uma ferramenta de plataforma local (não é um projeto de disciplina em `harness/estado.json`). Por isso segue esta spec enxuta, o ADR [0002-painel-de-uso-de-ia.md](../../docs/adr/0002-painel-de-uso-de-ia.md) e TDD estrito (Art. III da constituição).

## Decisões do dono (2026-11-23)
1. **Integração:** estender `apps/painel-ia` com abas na mesma interface (Visão Geral, Sessão & Timeline, Atribuição, Subagentes, Economia), mantendo uma única URL, zero dependências npm, SQLite local e SSE.
2. **Escopo de publicação:** 100% local (`127.0.0.1`), sem alterar `site/uso.html`.
3. **Retenção:** manter fatos detalhados (requisições, deltas proporcionais, marcadores — sempre sem texto de mensagem) indefinidamente no SQLite local.

## Requisitos funcionais
- **RF-01 · Leitura em fluxo:** `LeitorTranscripts` lê arquivos JSONL em chunks fixos (64 KB), sem carregar arquivos de centenas de MB inteiros em memória, identificando fio principal e subagentes (`<sessao>/subagents/*.jsonl`).
- **RF-02 · Conciliação exata:** deduplicação por `message.id` (máximo monotônico), ignorando `model === "<synthetic>"` e linhas sem `usage` ou corrompidas. Totais por sessão e modelo batem com `.claude/hooks/registrar_uso.py` e `scripts/uso/uso.py`.
- **RF-03 · Linha do tempo por sessão:** por requisição no mesmo fio, calcula tamanho do contexto (`input + cache_write + cache_read`), taxa de acerto do cache (`cache_read / contexto`) e marcadores (`cache_frio`, `compactacao`, `retomada_longa`, `troca_modelo`, `subagente`, `hook`).
- **RF-04 · Atribuição que fecha 100%:** reparte cada crescimento positivo de contexto proporcionalmente pelos bytes da resposta anterior, `tool_result`, `hook/attachment`, `system-reminder`, `meta/skill` e mensagem do usuário (rotulado como *proporcional*); tudo que não se atribui entra em `"nao-atribuido"`. Calcula também custo de carregamento (`delta × requisições seguintes até compactação`, rotulado como *estimativa proporcional*).
- **RF-05 · Subagentes:** agrega custo por fio de subagente e por tipo (`subagent_type`), relação briefing/resultado e contagem de arquivos reabertos (via hash SHA-256 curto do caminho, sem guardar caminho ou conteúdo).
- **RF-06 · Oportunidades de economia:** regras explícitas e testadas (`resultado_ferramenta_grande`, `arquivo_relido`, `modelo_caro_mecanica`, `sessao_longa_sem_compactar`, `cache_frio_pausa`, `injecao_hook_repetida`, `briefing_subagente_grande`, `revisao_excessiva`), cada uma com evidência, economia estimada rotulada como *estimativa* e ação sugerida.
- **RF-07 · Visões e exportação:** 5 abas na UI em tema escuro com gráficos SVG sem dependências externas; exportação MD e CSV preserva compatibilidade e adiciona as visões agregadas sem conteúdo de mensagem.

## Requisitos não funcionais e privacidade (Art. IV e VIII)
- **RNF-01 · Privacidade:** nenhum conteúdo de prompt, resposta ou saída de ferramenta é salvo no SQLite, servido pela API ou exportado. Caminhos de arquivo são reduzidos a hash curto para detectar releitura.
- **RNF-02 · Segurança local:** servidor escuta somente em `127.0.0.1`, CSP restrita, `textContent` apenas.
- **RNF-03 · Desempenho:** leitura em fluxo com memória constante por arquivo; tempo de processamento medido em teste com arquivo sintético grande.
