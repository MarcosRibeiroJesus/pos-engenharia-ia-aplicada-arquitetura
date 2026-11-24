# Painel de IA

Painel local, em tempo real, do uso e diagnóstico de consumo de tokens nas sessões do Claude Code. Ele tem cinco abas na mesma interface:

- **Visão geral:** tokens equivalentes por tipo (entrada, cache escrito, cache lido, saída — destacando o que mais pesa), por dia, por modelo, por projeto, últimos 60 minutos, tarefas (`TaskCreate`/`TaskUpdate` e `TodoWrite`), sessões e (opcionalmente) Monday e GitHub;
- **Sessão & Timeline:** gráfico SVG de crescimento do contexto por requisição, taxa de acerto do cache e marcadores (cache frio, compactação, pausa > 8 h, troca de modelo, subagente, hook);
- **Atribuição:** repartição proporcional por bytes do crescimento de contexto (ferramentas, hooks/system-reminders, usuário, saída, mais `nao-atribuido` fechando 100% do delta medido) e ranking de custo de carregamento (`delta × requisições seguintes`, rotulado como estimativa proporcional);
- **Subagentes:** custo total e por tipo (`subagent_type`), fios mais caros e arquivos reabertos entre fios (detectados via hash curto SHA-256, sem guardar caminhos nem conteúdo);
- **Economia:** regras determinísticas de oportunidade de economia (cache frio, saída de ferramenta grande, sessão longa / retomada > 8 h, arquivos relidos, briefing grande, injeções de hook repetidas, Opus sem Sonnet no mecânico, excesso de revisões), sempre com evidência, economia rotulada como *estimativa* e ação sugerida.

O histórico fica num banco SQLite local, que sobrevive a reinícios e à limpeza automática dos transcripts. Dele saem o relatório final (Markdown) e o registro no formato de `docs/uso/uso-tokens.csv`.

Não há dependências de npm: só Node 22.13 ou mais novo (usa `node:sqlite`).

## Rodar

**Como pacote npm**

```bash
cd apps/painel-ia
npm pack                                   # gera pos-painel-ia-0.1.0.tgz
npm install -g ./pos-painel-ia-0.1.0.tgz
pos-painel-ia --registro ../../docs/uso/uso-tokens.csv
# abra http://localhost:4317
```

Sem instalar: `node bin/pos-painel-ia.js`.

**Em contêiner**

```bash
cd apps/painel-ia
cp .env.example .env                       # preencha CLAUDE_PROJECTS_DIR (e, se quiser, Monday e GitHub)
docker compose up -d --build
# abra http://localhost:4317
```

O histórico fica no volume `painel-dados`. `docker compose down` preserva o volume; só `down -v` o apaga.

## Relatório para o fechamento

```bash
pos-painel-ia relatorio --formato md  --saida relatorio-uso-ia.md
pos-painel-ia relatorio --formato csv --saida uso-tokens-sessoes.csv
# no contêiner:
docker compose exec painel node bin/pos-painel-ia.js relatorio --formato md
```

Com o painel aberto, os mesmos arquivos saem pelos links "Relatório (MD)" e "Registro (CSV)".

O relatório cobre o que veio dos transcripts. As medições manuais continuam em `docs/uso/uso-tokens.csv`, que o painel lê com `--registro` e soma aos totais.

## Configuração

| Variável | Padrão | Para quê |
|---|---|---|
| `CLAUDE_PROJECTS_DIR` | `~/.claude/projects` | Onde o Claude Code grava os transcripts |
| `DADOS_DIR` ou `BANCO` | `~/.pos-painel-ia/painel.db` | Banco com o histórico |
| `REGISTRO_CSV` | vazio | Registro manual do repositório |
| `PORTA`, `HOST` | `4317`, `127.0.0.1` | Endereço do servidor |
| `INTERVALO_MS` | `1500` | Intervalo de leitura dos transcripts |
| `HOSTS_PERMITIDOS` | vazio | Nomes extras aceitos no cabeçalho Host (ex.: acesso por outro nome na rede) |
| `MONDAY_TOKEN`, `MONDAY_BOARD_ID` | vazio | Aprovações pendentes do board |
| `GITHUB_REPO`, `GITHUB_TOKEN` | vazio | PRs abertos; com token, também o resumo dos checks |

O Claude Code apaga transcripts antigos por padrão (configuração `cleanupPeriodDays`). Deixe o painel rodando, ou aumente esse prazo, para que todas as sessões entrem no banco.

## Como os números são calculados

- **Uso:** cada mensagem do assistente é contada uma vez pelo `id`. Linhas repetidas da mesma mensagem só somam a diferença.
- **Atribuição a tarefas:** os tokens de uma mensagem vão para a tarefa que estava em andamento na sessão. A mensagem que abre a tarefa conta para ela; a que a conclui, não.
- **Projeto:** a chave vem do branch da sessão. `modulo/NN-slug/UU-slug` vira `NN.UU-slug`, e `plataforma/*` vira `plataforma`.
- **Tokens equivalentes:** pesam cada tipo pelo custo relativo a um token de entrada comum (cache lido 0,1, cache escrito 2, saída 5). É uma medida de esforço, não um preço.

## Segurança

- O servidor escuta só em `127.0.0.1` e recusa outros nomes no cabeçalho Host, o que protege contra DNS rebinding. Só aceita GET e HEAD e serve uma lista fixa de arquivos.
- A página roda com CSP restrita (`default-src 'none'`, só scripts próprios), sem scripts externos. Os dados entram na página só por `textContent`.
- Os tokens do Monday e do GitHub ficam no servidor e nunca vão para a página.
- O contêiner roda como usuário `node`, com sistema de arquivos somente leitura, sem capabilities, com `no-new-privileges` e com os transcripts montados como somente leitura.
- O painel não tem login. Não o exponha fora da sua máquina.
