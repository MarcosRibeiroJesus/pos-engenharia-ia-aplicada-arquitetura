# Painel de IA

Painel local, em tempo real, do uso e diagnóstico de consumo de tokens nas sessões do Claude Code. Ele tem seis abas na mesma interface (a sexta, **Comparativo A x B**, está descrita abaixo, em "Comparativo A x B"):

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
| `ANTIGRAVITY_BRAIN_DIR` | `~/.gemini/antigravity-cli/brain` | Onde o Antigravity grava os `transcript.jsonl` (tempo real) |
| `DADOS_DIR` ou `BANCO` | `~/.pos-painel-ia/painel.db` | Banco com o histórico |
| `REGISTRO_CSV` | vazio | Registro manual do repositório |
| `TESTES_AB_CSV` | vazio | Registro dos testes A x B (`docs/uso/testes-ab.csv`) |
| `CODERABBIT_JSON` | `<dados>/coderabbit-ab.json` | Coleta do CodeRabbit gerada por `bin/coderabbit-ab.js` |
| `PORTA`, `HOST` | `4317`, `127.0.0.1` | Endereço do servidor |
| `INTERVALO_MS` | `1500` | Intervalo de leitura dos transcripts |
| `HOSTS_PERMITIDOS` | vazio | Nomes extras aceitos no cabeçalho Host (ex.: acesso por outro nome na rede) |
| `MONDAY_TOKEN`, `MONDAY_BOARD_ID` | vazio | Aprovações pendentes do board |
| `GITHUB_REPO`, `GITHUB_TOKEN` | vazio | PRs abertos; com token, também o resumo dos checks |
| `ANTHROPIC_ADMIN_API_KEY` | vazio | Uso e custo real (7d) direto da Anthropic Admin API (Organização) |
| `GITHUB_ORG` ou `GITHUB_USER` | vazio | Métricas/billing oficiais do GitHub Copilot (usa `GITHUB_TOKEN`) |
| `COTA_SESSAO_*`, `COTA_SEMANA_*` | `10M` / `50M` eq. | Limites por Code Agent (`CLAUDE`, `ANTIGRAVITY`, `COPILOT`) para o cálculo em `%` |

O Claude Code apaga transcripts antigos por padrão (configuração `cleanupPeriodDays`). Deixe o painel rodando, ou aumente esse prazo, para que todas as sessões entrem no banco.

## Como os números são calculados

- **Uso:** cada mensagem do assistente é contada uma vez pelo `id`. Linhas repetidas da mesma mensagem só somam a diferença.
- **Atribuição a tarefas:** os tokens de uma mensagem vão para a tarefa que estava em andamento na sessão. A mensagem que abre a tarefa conta para ela; a que a conclui, não.
- **Projeto:** a chave vem do branch da sessão. `modulo/NN-slug/UU-slug` vira `NN.UU-slug`, e `plataforma/*` vira `plataforma`.
- **Tokens equivalentes:** pesam cada tipo pelo custo relativo a um token de entrada comum (cache lido 0,1, cache escrito 2, saída 5). É uma medida de esforço, não um preço.

## Comparativo A x B

A aba **Comparativo A x B** mede, com os números que o banco já guarda, se o consumo caiu depois que a revisão de código passou a ser feita só no PR, pelo CodeRabbit (D-075, revisor único no CI), em vez de um revisor independente por tarefa.

- **Grupos:** A são as sessões iniciadas antes de `CORTE_AB`; B, as iniciadas a partir dele. O corte fica numa constante só, em `src/comparativo.js` (hoje `2026-11-23T00:00:00-03:00`). A sessão inteira vai para o grupo da sua primeira mensagem; ela nunca se divide no corte.
- **O que aparece:** sessões, requisições, tokens por tipo (entrada, cache escrito, cache lido, saída), total equivalente, equivalente por sessão, chamadas de subagente por `subagent_type` e, à parte, as de `revisor-independente`. A última coluna é a variação de B contra A, em percentual; "sem base em A" quando A é zero.
- **Amostra pequena:** com menos de `AMOSTRA_MINIMA` sessões (15, decisão do dono) em algum grupo, o resultado vem marcado como "amostra pequena" e é indício, não conclusão. Mesmo com amostra suficiente, o comparativo não controla o tamanho das tarefas de cada período.
- **Registro manual:** as linhas `medido` de `docs/uso/uso-tokens.csv` aparecem num cartão separado, para não somar duas vezes com o banco. Linhas `nao-medido` só são contadas.
- **CodeRabbit:** os tokens dele não são visíveis ao painel e nunca são estimados. O painel mostra o que o GitHub informa por PR mergeado, agrupado pela data do merge: reviews e comentários dos bots `coderabbitai`, e rodadas (commits depois do primeiro review). Para coletar, rode `node bin/coderabbit-ab.js` (usa o `gh` em modo leitura e grava `coderabbit-ab.json` no diretório de dados do painel, fora do repositório; `CODERABBIT_JSON` troca o caminho). Sem a coleta, o cartão mostra `nao-medido`.
- **API:** `GET /api/comparativo` devolve o mesmo conteúdo em JSON.

### Registrar um teste A x B

Para rodadas controladas (a mesma tarefa rodada com o harness de A e com o de B), acrescente uma linha em `docs/uso/testes-ab.csv`:

```csv
id,data,versao_harness,grupo,tokens,observacao
```

`grupo` é `A` ou `B`; `tokens` é o total medido da rodada (do painel ou do `uso.py`), nunca estimado; `versao_harness` é o commit do harness usado. Rode o painel com `TESTES_AB_CSV=../../docs/uso/testes-ab.csv` (o `compose.yml` já aponta para ele). Linha com grupo diferente de A ou B é ignorada. Sem linhas, a tabela mostra "Nenhum teste registrado".

## Segurança

- O servidor escuta só em `127.0.0.1` e recusa outros nomes no cabeçalho Host, o que protege contra DNS rebinding. Só aceita GET e HEAD e serve uma lista fixa de arquivos.
- A página roda com CSP restrita (`default-src 'none'`, só scripts próprios), sem scripts externos. Os dados entram na página só por `textContent`.
- Os tokens do Monday e do GitHub ficam no servidor e nunca vão para a página.
- O contêiner roda como usuário `node`, com sistema de arquivos somente leitura, sem capabilities, com `no-new-privileges` e com os transcripts montados como somente leitura.
- O painel não tem login. Não o exponha fora da sua máquina.
