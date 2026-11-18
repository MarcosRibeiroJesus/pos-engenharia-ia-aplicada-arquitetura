# Progresso do curso

Curso: **Engenharia de Software em IA Aplicada** (Platos/Anhanguera), matrícula 14085357.
Atualizado em 2026-11-18, a partir da plataforma. Neste repositório, cada "módulo" é uma disciplina.

Legenda das aulas: ✅ assistida · ⬜ pendente.

## Visão geral

| Módulo | Disciplina | Início | Plataforma | Videoaulas assistidas | Projeto | Post |
|---|---|---|---|---|---|---|
| — | Ambientação | 09/06/2026 | concluída (100%) | — | — | — |
| 01 | Fundamentos de IA e LLMs para Programadores | 10/06/2026 | em andamento (50%) | 17 de 38 | IA que vence Doom (variante em escolha) | rascunho sobre recomendação no site |
| 02 | APIs de IA Generativa e Prompt Engineering | 04/07/2026 | em andamento (0%) | 0 de 28 | a propor | — |
| 03 | Model Context Protocol (MCP) | 28/07/2026 | em andamento (0%) | 0 de 23 | a propor | — |
| 04 | Criação de Agentes Autônomos | 21/08/2026 | em andamento (0%) | 0 de 25 | a propor | — |
| 05 | Ferramentas de IA para UX e UI | 15/09/2026 | em andamento (0%) | 0 de 25 | a propor | — |
| 06 | Ferramentas de IA para DevOps | 09/10/2026 | em andamento (0%) | 0 de 49 | a propor | — |
| 07 | Ferramentas de IA para Gestão de projetos | 02/11/2026 | em andamento (0%) | 0 de 23 | a propor | — |

Disciplinas ainda bloqueadas na plataforma (entram aqui quando liberarem): Arquitetura de Sistemas com IA (27/11/2026), Processamento de Dados e Fine-Tuning de Modelos (21/12/2026), Segurança e Governança em IA (14/01/2027), Projeto Integrador – Capstone (08/02/2027), Carreira e Entrevistas para Engenheiros de AI Aplicada (04/03/2027), 4ª Revolução Industrial e Tecnologias Emergentes (28/03/2027), Foresight Estratégico (22/04/2027), Ecossistema de Inovação (16/05/2027).

Cada disciplina tem PDFs na plataforma (indicação de leitura, material autoral e, em algumas, material extra, slides ou materiais pós). Eles ficam fora do repositório; ver regra no CLAUDE.md.

## 01 · Fundamentos de IA e LLMs para Programadores

- Módulo 01 · Introdução: ✅ introdução ao curso · ✅ o que você verá, como praticar e comunidade
- Módulo 02 · ML, DL e IA: ✅ ML, DL e IA · ✅ Teachable Machine · ✅ redes neurais e como aprendem · ✅ primeira rede neural para categorizar alunos (pt 1 e 2)
- Módulo 03 · Sistemas de recomendação: ✅ como funcionam sistemas de recomendação (pt 1 a 7)
  - Projeto: plataforma híbrida de recomendação na AWS, em `modulos/01-fundamentos-ia-llms/unidades/03-recomendacao/`. Código e testes de aplicação prontos (21 testes Vitest e 14 Python passando); falta endurecer a infra (state remoto, saída de rede do ECS, TLS no MemoryDB, IAM, workflows), adicionar `terraform test`, o componente com Claude (explicação via Bedrock com saída estruturada), teste no Floci e os posts.
- **Módulo 04 · Como vencer qualquer jogo** (projeto escolhido): ✅ pt 1 · ⬜ pt 2 a 5
- Módulo 05 · Web AI e LLMs: ⬜ algoritmos genéticos · ⬜ transformers, embeddings e attention · ✅ IA na web com Web AI · ⬜ demo Web AI multimodal
- Módulo 06 · Prompts: ⬜ prompts que geram boas respostas · ⬜ padrão TOON e JSON para prompts
- Módulo 07 · Ferramentas e agentes: ⬜ Cursor vs. VS Code vs. Windsurf · ⬜ agentes de IA e decisões em etapas
- Módulo 08 · MCP na prática: ⬜ o que são MCPs · ⬜ gerar testes · ⬜ navegar em sites · ⬜ consultar documentação · ⬜ telemetria de apps
- Módulo 09 · Modelos: ⬜ abertos vs. fechados · ⬜ Ollama local · ⬜ OpenRouter
- Módulo 10 · RAG: ✅ o que é RAG · ⬜ embeddings e vector databases · ⬜ primeiro RAG com JavaScript e Neo4j
- Podcast ⬜ · Avaliação virtual ⬜

### Projeto: IA que vence Doom

Base: módulo 04 da disciplina ("Como vencer qualquer jogo"), com o módulo 05 (algoritmos genéticos e Web AI) como complemento. As variantes abaixo são hipóteses até a leitura do material da unidade, que define a técnica ensinada.

"Vencer Doom" é dividido em uma escada de cenários do ViZDoom, do mais simples ao mais difícil: `basic` → `defend_the_center` → `deadly_corridor` → mapa completo. Zerar a campanha inteira é problema de pesquisa; o projeto define até onde chegar e mede cada degrau.

| | Variante | Arquitetura principal (AWS) | Comparativa | Teste local | Custo em lab |
|---|---|---|---|---|---|
| D1 | Treino e jogo no navegador: TensorFlow.js com neuroevolução ou RL, Doom compilado para WebAssembly com assets Freedoom | S3 + CloudFront para o site; API Gateway + Lambda + DynamoDB para placar das gerações e telemetria | GCP: Cloud Storage + Cloud CDN + Cloud Run + Firestore | Alto (serviços cobertos no Floci) | Quase zero |
| D2 (recomendada) | Treino em escala na nuvem, demo no navegador: ViZDoom + PPO em contêiner, pipeline de MLOps (treinar → avaliar → promover), política exportada para TensorFlow.js e replays no site | Step Functions orquestrando AWS Batch em instâncias Spot, checkpoints e modelos em S3, métricas no CloudWatch, site em S3 + CloudFront | GCP: Vertex AI custom training com Spot VMs + Vertex AI Pipelines | Médio (orquestração no Floci; treino real no Docker local) | Baixo, só durante o treino |
| D3 | Agente com LLM multimodal: o modelo vê os frames e decide as ações | Lambda/ECS chamando Bedrock, frames em S3, traces no CloudWatch | GCP: Gemini na Vertex AI | Baixo (Bedrock com resposta simulada no Floci) | Por token; latência alta para jogo em tempo real |

Por que D2: é a que mais exercita decisões de arquiteto (orquestração, Spot com checkpoint, promoção de modelo por avaliação, separação entre treino e inferência) e ainda entrega a parte "Web ML" da unidade no navegador. Risco a validar: a política treinada no ViZDoom precisa ver no navegador as mesmas observações do treino; por isso a demo começa com replays e só depois tenta jogo ao vivo em WebAssembly.

Assets: usar Freedoom (livre) e nunca os WADs comerciais do Doom.

### Post já rascunhado
"Recomendação em escala: do batch ao LLM" (módulo 03 da disciplina). Referências:
- AWS Big Data Blog, recomendação do batch ao tempo real: https://aws.amazon.com/pt/blogs/big-data/building-a-scalable-personalized-recommendation-system-on-aws-from-batch-to-real-time/
- AI Engineer, "Teaching Gemini to Speak YouTube" (Devansh Tandon, 2025): https://www.youtube.com/watch?v=LxQsQ3vZDqo

## 02 · APIs de IA Generativa e Prompt Engineering
- Módulo 01: mercado de IA como serviço · oportunidades para devs · OpenRouter na prática (projeto inicial; roteamento multi-modelo, fallback e testes)
- Módulo 02: LangChain.js (pipes, fluxos condicionais, gerador de apps) · LangGraph Studio e estado · nodes e edges · pipeline completo com testes · node de fallback
- Módulo 03: intenção de usuários e marcação de consultas · structured JSON com OpenRouter · intenção em JSON e teste end-to-end · cancelamento a partir de texto livre
- Módulo 04: recomendador de músicas por preferências · extração de preferências · memória em SQLite · resumo de histórico e persistência em Postgres
- Módulo 05: prompt injection (introdução, ataque na prática, safeguards) · prompt templates e MCP adapters
- Módulo 06: query planner · Cypher generator com structured outputs · Cypher executor · correção de queries e respostas analíticas (Neo4j)
- Módulo 07: modelos multimodais · monitoramento com Langfuse e evaluation tests
- Podcast · Avaliação

## 03 · Model Context Protocol (MCP)
- Módulo 01: MCP vs. tools/plugins clássicos
- Módulo 02: template e arquitetura · parsing de entrada · orquestração com LangChain.js e MCP no MongoDB · tool customizada · MCP para sistema de arquivos · services como tools (Google Trends)
- Módulo 03: agents e instructions · skills
- Módulo 04: MCP do zero (testes via MCP client, tools, inspeção) · resources e prompts, uso no VS Code
- Módulo 05: template e boas práticas · MCPs conectando IA a sistemas legados · tools de CRUD de clientes
- Módulo 06: RBAC e JWT em Web API · service tokens · rate limiting · service tokens no servidor MCP
- Módulo 07: publicação em npm e Verdaccio · transports e ideias de servidores
- Módulo 08: agente de operações de clientes com Customers MCP Server e LangChain.js
- Podcast · Avaliação

## 04 · Criação de Agentes Autônomos
- Módulo 01: agente de código por dentro (GitHub Copilot) · context engineering e contrato de permissões · spec-driven development (pt 1 e 2) · guardrails, revisor e delegação
- Módulo 02: padrões de raciocínio · Spec Kit · ReAct · plan-and-execute · reflection e benchmark · API que também é agente
- Módulo 03: integração com banco · incidentes · disponibilidade de provedores externos · agente via MCP
- Módulo 04: memória episódica · vector store
- Módulo 05: contexto como orçamento (medição e sumarização) · context stitching
- Módulo 06: LangGraph e fallback de modelo
- Módulo 07: estratégias de observabilidade
- Módulo 08: War Room e memória do agente · publicação no GitHub Pages
- Módulo 09: multiagentes
- Podcast · Avaliação

## 05 · Ferramentas de IA para UX e UI
- Módulo 01: requisitos e edge cases · fluxos e diagramação · UX writing · datasets · structured prompts no AI Studio · prompt as code
- Módulo 02: Angular e MCP · tokens e estilização · componentes acessíveis · Stitch · Figma · correção de interface com IA
- Módulo 03: Nx monorepo e MCP · OpenSpec · orquestração paralela · code review · Google Jules
- Módulo 04: QA com Nx e Cypress · asserções semânticas · agente de QA com Playwright MCP
- Módulo 05: Genkit (flows, Zod, Google AI) · design system · micro-BFF · encerramento
- Podcast · Avaliação

## 06 · Ferramentas de IA para DevOps
- Módulo 01: da automação à inteligência agêntica (pt 1 a 4)
- Módulo 02: geração, auditoria e self-healing (pt 1 a 3)
- Módulo 03: orquestração e SRE assistida (pt 1 a 3)
- Módulo 04: reduzindo MTTR (pt 1 a 3)
- Módulo 05: observabilidade preditiva (pt 1 a 3)
- Módulo 06: IA com segurança no Slack/Teams (pt 1 a 3)
- Módulo 07: priorização de vulnerabilidades (pt 1 a 3)
- Módulo 08: eficiência no ciclo de entrega (pt 1 a 4)
- Módulo 09: FinOps com IA (pt 1 e 2)
- Módulo 10: conhecimento vivo e auto-remediação (pt 1 e 2)
- Módulo 11: automação com segurança operacional (pt 1 e 2)
- Módulo 12: bot full-stack (pt 1 a 3)
- Módulo 13: Docker · Kubernetes local com Minikube · LocalStack no Kubernetes · Streamlit · Ollama no Kubernetes · IA em DevOps (pt 1 a 3)
- Podcast · Avaliação

## 07 · Ferramentas de IA para Gestão de projetos
- Módulo 01: planejamento e escopo (pt 1 a 3)
- Módulo 02: priorização de backlog (pt 1 a 3)
- Módulo 03: cronograma, capacidade e alocação (pt 1 e 2)
- Módulo 04: estimativas e previsões (pt 1 e 2)
- Módulo 05: riscos e AIOps de projeto (pt 1 e 2)
- Módulo 06: reuniões (notas, ações, follow-ups) (pt 1 e 2)
- Módulo 07: status reports e executive summaries (pt 1 e 2)
- Módulo 08: governança, compliance e qualidade (pt 1 e 2)
- Módulo 09: automação de boards e comunicação (pt 1 e 2)
- Módulo 10: portfólio e OKRs (pt 1 a 3)
- Podcast · Avaliação
