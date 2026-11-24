# ADR 0002 · Painel local de uso de IA com histórico persistente

Status: proposto · Data: 2026-11-18

## Contexto

O projeto precisa acompanhar ao vivo o consumo de tokens por modelo e por tarefa e o status das tarefas e das aprovações, e guardar esse histórico até o fim da pós para o relatório final. As sessões rodam no Claude Code, na máquina local e na nuvem. O Claude Code grava cada sessão num transcript JSONL com o uso de cada mensagem, mas apaga transcripts antigos por padrão.

## Decisão

- **App Node sem dependências** (`apps/painel-ia`), distribuído como pacote npm (`npm pack`) e como imagem Docker.
- **Fonte primária:** os transcripts, lidos por varredura periódica com leitura incremental, em vez de inotify.
- **Tempo real:** Server-Sent Events. O fluxo é só do servidor para o navegador, então WebSocket seria complexidade sem ganho.
- **Persistência em SQLite (`node:sqlite`)** guardando fatos, e não agregados: mensagens com uso acumulado, sessões, tarefas e histórico de status. Os agregados são recalculados na carga.
- **Relatório final** em Markdown e um CSV compatível com `docs/uso/uso-tokens.csv`.
- **Fontes opcionais:** Monday (aprovações) e GitHub (PRs), consultadas pelo servidor.

## Alternativas rejeitadas

- **Só ler os transcripts, sem banco:** perde o histórico quando o Claude Code limpa os arquivos e não serve para o relatório final.
- **Guardar agregados prontos:** uma mudança na regra de atribuição invalidaria o histórico. Com fatos, basta recalcular.
- **Prometheus e Grafana:** é a pilha certa para uma equipe, mas aqui custaria três contêineres para um usuário só. Fica como caminho de evolução: as métricas já estão estruturadas para virar exportador.
- **Postgres:** exigiria um servidor sempre ligado para uma pessoa, um custo fixo sem ganho.
- **inotify (`fs.watch`):** não recebe eventos em bind mounts do Docker Desktop no Windows e no macOS.
- **Frontend com framework e build:** traz dependências e superfície de supply chain para uma página de leitura.

## Trade-offs

- A varredura a cada 1,5 s custa um `stat` por arquivo; com milhares de transcripts, aumentar `INTERVALO_MS`.
- **Sessões de nuvem:** os transcripts de sessões em claude.ai/code não estão na máquina local. O uso delas entra pelo registro do repositório (`uso.py registrar` na própria sessão), não ao vivo.
- **Atribuição por tarefa:** é uma aproximação. Vale a tarefa em andamento no momento da mensagem, e mensagens sem tarefa ativa ficam só no projeto e no modelo.
- `node:sqlite` ainda é marcado como experimental em algumas versões do Node 22; a CI testa em Node 22 e 24.

## Custo

Zero de infraestrutura: roda local. A imagem é a base oficial `node:24-alpine` mais o app (pacote npm de 18 kB).

## Risco e mitigação

- **Exposição de dados dos transcripts:** a página só mostra agregados e títulos de tarefas. O servidor é endurecido como descrito na seção de segurança do README do app.
- **Formato do transcript mudar:** o parser ignora linhas inválidas e conta quantas foram ignoradas, e o rodapé do painel mostra esse número. Os testes fixam o formato esperado.
- **Perda do volume Docker:** exportar o relatório periodicamente para o repositório (`relatorio --formato csv`).

## Tarefas da prova exercitadas

- **3.6 e 1.7:** observabilidade do uso do Claude Code e das sessões.
- **5.6:** cada número tem origem rastreável (sessão, mensagem e tarefa).
- **1.4:** aprovações humanas visíveis ao lado do trabalho dos agentes.

Curso relacionado: *Claude Code in Action*.

## O que um arquiteto sênior faria em produção

Numa equipe, exportaria as mesmas métricas via OpenTelemetry, que o Claude Code já suporta, para um coletor central (CloudWatch ou Prometheus). Também colocaria autenticação SSO na frente do painel, reteria os dados por política e alertaria sobre gasto por projeto acima do orçamento. Este app é o recorte individual desse desenho.

## Evolução (2026-11-23 · Visões internas de consumo de tokens)

- **Decisão:** estender o próprio `apps/painel-ia` com 5 abas (Visão geral, Sessão & Timeline, Atribuição, Subagentes, Economia), mantendo zero dependências npm, 100% local em `127.0.0.1` (sem alterar `site/uso.html`), leitura em fluxo por chunks fixos de 64 KB e retenção indefinida de fatos detalhados no SQLite local (esquema v2, sempre sem texto de mensagens nem caminhos completos — arquivos são identificados apenas por hash SHA-256 curto).
- **Método de atribuição:** mede o aumento real de contexto (`input + cache_write + cache_read`) entre requisições consecutivas do mesmo fio e reparte proporcionalmente pelos bytes de cada origem (saída anterior, `tool_result`, `hook/attachment`, `system-reminder`, `meta/skill`, usuário); o que não se atribui entra em `nao-atribuido`, fechando 100% do delta medido. O custo de carregamento (`delta × requisições seguintes até compactação`) e as regras de economia vêm sempre rotulados como estimativa.
- **Alternativas rejeitadas:** rota separada `/consumo` (fragmentaria a navegação), envio de agregados internos ao site público (risco desnecessário de exposição de metadados) e contagem por tokenizador externo (traria dependência npm e divergiria do `usage` real da API).
- **Tarefas da prova exercitadas:** **5.1** (preservação de contexto e detecção de retomada > 8 h / compactação), **5.6** (proveniência e rotulagem explícita de estimativas vs. medições) e **1.7** (observabilidade de sessões e subagentes).
