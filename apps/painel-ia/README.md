# Painel de IA

Painel local, em tempo real, do uso e diagnóstico de consumo de tokens nas sessões do Claude Code. Ele tem seis abas na mesma interface:

- **Visão geral:** tokens equivalentes por tipo (entrada, cache escrito, cache lido, saída — destacando o que mais pesa), por dia, por modelo, por projeto, últimos 60 minutos, tarefas (`TaskCreate`/`TaskUpdate` e `TodoWrite`), sessões e (opcionalmente) Monday e GitHub;
- **Sessão & Timeline:** gráfico SVG de crescimento do contexto por requisição, taxa de acerto do cache e marcadores (cache frio, compactação, pausa > 8 h, troca de modelo, subagente, hook);
- **Atribuição:** repartição proporcional por bytes do crescimento de contexto (ferramentas, hooks/system-reminders, usuário, saída, mais `nao-atribuido` fechando 100% do delta medido) e ranking de custo de carregamento (`delta × requisições seguintes`, rotulado como estimativa proporcional);
- **Subagentes:** custo total e por tipo (`subagent_type`), fios mais caros e arquivos reabertos entre fios (detectados via hash curto SHA-256, sem guardar caminhos nem conteúdo);
- **Economia:** regras determinísticas de oportunidade de economia (cache frio, saída de ferramenta grande, sessão longa / retomada > 8 h, arquivos relidos, briefing grande, injeções de hook repetidas, Opus sem Sonnet no mecânico, excesso de revisões), sempre com evidência, economia rotulada como *estimativa* e ação sugerida;
- **Modelos:** requisições, tokens por tipo, acerto do cache, custo estimado em USD, latência observada (mediana e p90) e vazão por modelo (detalhes em "Aba Modelos", abaixo). Os dados vêm de `GET /api/modelos`.

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

## Aba Modelos

Tudo sai das requisições medidas nos transcripts (uma por mensagem do assistente, do fio principal e dos subagentes). Onde falta dado, a tela mostra `nao-medido` e o motivo; nenhum número é estimado para preencher lacuna. As medições manuais do `--registro` não entram nesta aba.

1. **Requisições e tokens por tipo:** entrada nova, cache escrito 5m, cache escrito 1h, cache lido e saída, somados por modelo. Cache escrito sem a divisão 5m/1h no transcript aparece à parte ("sem TTL").
2. **Acerto do cache:** `cache lido ÷ (entrada nova + cache escrito + cache lido)`.
3. **Custo estimado (USD):** `tokens × preço de lista por MTok`, por tipo e por requisição, somado por modelo. É **estimativa, preços a conferir**.
   - Os preços ficam em `src/precos.json` (fonte, data de consulta e `status: "conferir"`). São entrada do dono: **confira na [página oficial de preços](https://platform.claude.com/docs/en/about-claude/pricing) antes de usar os números.**
   - **Faixa por tamanho do prompt (Haiku 5.5):** o tamanho do prompt de uma requisição é `entrada nova + cache escrito + cache lido`. Até 100 mil tokens vale a primeira faixa; acima, a segunda. A faixa é escolhida requisição a requisição.
   - **Tipo de token sem preço** (`null` na tabela, como o cache escrito do Haiku 5.5 e o cache escrito 1h do Sonnet 5.5): os tokens não entram no custo e a linha diz "parcial", com quantos tokens ficaram sem preço cadastrado.
   - **Modelo fora da tabela** (Fable, Mythos, versões antigas): "sem preço cadastrado", sem custo.
4. **Latência observada:** para cada mensagem do assistente, `Δ = horário da mensagem − horário do evento anterior` no mesmo fio. O evento anterior é o último **resultado de ferramenta** (grupo a) ou a última **mensagem do usuário** (grupo b) ainda não usado por outra mensagem; anexos de hook, `system-reminder`, mensagens meta e resumos de compactação não contam. Δ negativo e Δ acima de 10 minutos (pausas) são descartados e contados à parte. A tela mostra mediana e p90 (interpolação linear) de cada grupo.
   - **Limitação:** é *tempo observado entre eventos; inclui processamento local e rede; não é tempo até o primeiro token*. O horário da mensagem é o do primeiro bloco gravado no transcript, e o grupo (a) inclui o tempo dos hooks que rodam depois da ferramenta.
5. **Vazão:** `tokens de saída ÷ Δ (em segundos)`, só no grupo (a), com Δ maior que zero. Mediana por modelo. Como Δ vai até o primeiro bloco gravado e a saída conta a mensagem inteira, em mensagens com vários blocos a vazão tende a sair acima da real; leia como comparação entre modelos, não como medida absoluta.

**Linhas antigas:** o esquema 3 do banco acrescentou o horário e o tipo do evento anterior (`quando_anterior`, `tipo_anterior`). Linhas gravadas antes ficam com esses campos nulos (latência `nao-medido`) e são preenchidas quando o painel relê o transcript correspondente, se ele ainda existir.

## Segurança

- O servidor escuta só em `127.0.0.1` e recusa outros nomes no cabeçalho Host, o que protege contra DNS rebinding. Só aceita GET e HEAD e serve uma lista fixa de arquivos.
- A página roda com CSP restrita (`default-src 'none'`, só scripts próprios), sem scripts externos. Os dados entram na página só por `textContent`.
- Os tokens do Monday e do GitHub ficam no servidor e nunca vão para a página.
- O contêiner roda como usuário `node`, com sistema de arquivos somente leitura, sem capabilities, com `no-new-privileges` e com os transcripts montados como somente leitura.
- O painel não tem login. Não o exponha fora da sua máquina.
