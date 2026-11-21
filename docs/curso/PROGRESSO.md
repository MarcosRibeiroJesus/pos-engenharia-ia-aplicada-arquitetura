# Progresso dos projetos

Status público dos projetos de cada disciplina e unidade. Detalhes do curso e do aluno (plataforma, matrícula, datas, aulas assistidas) ficam fora do repositório, numa cópia privada local.

Cada unidade com conteúdo técnico tem dois projetos: **IA aplicada** (baseado nas aulas, escolhido pelo dono depois de assistir) e **arquitetura AWS** (escolhida no `docs/curso/CATALOGO-AWS.md`).

## Visão geral

| Módulo | Disciplina | Projetos IA aplicada | Arquiteturas AWS | Opções |
|---|---|---|---|---|
| 01 | Fundamentos de IA e LLMs para Programadores | 04: IA que vence Doom (variante em escolha) | 03: plataforma de recomendação (em construção, PR #1) | PR #8 |
| 02 | APIs de IA Generativa e Prompt Engineering | a escolher | a escolher | PR #7 |
| 03 | Model Context Protocol (MCP) | a escolher | a escolher | PR #6 |
| 04 | Criação de Agentes Autônomos | a escolher | a escolher | PR #2 |
| 05 | Ferramentas de IA para UX e UI | a escolher | a escolher | PR #5 |
| 06 | Ferramentas de IA para DevOps | a escolher | a escolher | PR #3 |
| 07 | Ferramentas de IA para Gestão de projetos | a escolher | a escolher | PR #4 |

## Temas das unidades

Resumo dos temas, com palavras próprias, para orientar as propostas. Introduções, podcasts e avaliações não geram projeto.

### 01 · Fundamentos de IA e LLMs para Programadores
- 02 · Fundamentos de ML, deep learning e redes neurais; primeira rede neural de classificação.
- 03 · Sistemas de recomendação.
- 04 · IA que aprende a vencer jogos.
- 05 · Algoritmos genéticos, transformers e embeddings, IA rodando no navegador (inclusive multimodal).
- 06 · Escrita de prompts e formatos estruturados para prompts (JSON, TOON).
- 07 · Editores com IA e como agentes decidem em etapas.
- 08 · MCP na prática: testes, navegação, documentação atualizada e telemetria.
- 09 · Modelos abertos e fechados, execução local e roteamento entre modelos.
- 10 · RAG, embeddings e bancos vetoriais; RAG com grafo.

### 02 · APIs de IA Generativa e Prompt Engineering
- 01 · Mercado de IA como serviço e roteamento multi-modelo com fallback e testes.
- 02 · Orquestração com LangChain.js e LangGraph: fluxos condicionais, estado e fallback.
- 03 · Intenção do usuário em JSON estruturado, com testes ponta a ponta.
- 04 · Recomendação por preferências, com memória curta e longa.
- 05 · Prompt injection: ataque e defesa.
- 06 · Perguntas em linguagem natural para consultas em grafo (planejar, gerar, validar e corrigir).
- 07 · Modelos multimodais, monitoramento e testes de avaliação.

### 03 · Model Context Protocol (MCP)
- 01 · MCP comparado a tools e plugins clássicos.
- 02 · Orquestração com MCP sobre banco de dados, sistema de arquivos e serviços externos.
- 03 · Agents, instruções e skills.
- 04 · Servidor MCP do zero: tools, resources, prompts e testes.
- 05 · MCP conectando IA a sistemas legados.
- 06 · Autenticação, autorização, service tokens e rate limiting.
- 07 · Publicação de servidores MCP e transports.
- 08 · Agente de operações sobre um servidor MCP próprio.

### 04 · Criação de Agentes Autônomos
- 01 · Agente de código por dentro, context engineering, spec-driven development e guardrails.
- 02 · Padrões de raciocínio: ReAct, plan-and-execute e reflection.
- 03 · Agente integrado a banco e a provedores externos, exposto via MCP.
- 04 · Memória episódica e vector store.
- 05 · Contexto como orçamento e sumarização.
- 06 · Fallback de modelo com LangGraph.
- 07 · Observabilidade de agentes.
- 08 · War room e publicação do agente.
- 09 · Multiagentes.

### 05 · Ferramentas de IA para UX e UI
- 01 · Requisitos, fluxos, UX writing, datasets e prompt as code.
- 02 · Design system, componentes acessíveis e interfaces geradas com IA.
- 03 · Monorepo, spec-driven development e orquestração paralela de agentes.
- 04 · QA com asserções semânticas e agente de QA.
- 05 · Fluxos de IA com schema validado e BFF.

### 06 · Ferramentas de IA para DevOps
- 01 · Da automação à inteligência agêntica.
- 02 · Geração, auditoria e self-healing de infraestrutura.
- 03 · Orquestração e SRE assistida por IA.
- 04 · Redução de MTTR.
- 05 · Observabilidade preditiva.
- 06 · IA com segurança em chat corporativo.
- 07 · Priorização de vulnerabilidades.
- 08 · Eficiência no ciclo de entrega.
- 09 · FinOps com IA.
- 10 · Conhecimento vivo e auto-remediação.
- 11 · Automação com segurança operacional.
- 12 · Bot full-stack.
- 13 · Contêineres, Kubernetes local, cloud simulada, dashboards e modelos locais.

### 07 · Ferramentas de IA para Gestão de projetos
- 01 · Planejamento e escopo.
- 02 · Priorização de backlog.
- 03 · Cronograma, capacidade e alocação.
- 04 · Estimativas e previsões.
- 05 · Riscos e mitigações.
- 06 · Reuniões: notas, ações e follow-ups.
- 07 · Status reports e resumos executivos.
- 08 · Governança, compliance e qualidade.
- 09 · Automação de boards e comunicação.
- 10 · Portfólio e OKRs.

## Projetos em andamento

### 01.03 · Plataforma híbrida de recomendação na AWS (arquitetura AWS)
**Pausado pelo dono em 2026-11-21 (D-060), sem cancelar:** por ora a D01 segue só com o Doom.
Em `modulos/01-fundamentos-ia-llms/unidades/03-recomendacao/`, PR #1. Código e testes de aplicação prontos; em andamento: state remoto, saída de rede do ECS, TLS no MemoryDB, IAM, workflows, `terraform test`, componente com Claude (explicação via Bedrock com saída estruturada), teste no Floci e posts.

### 01.04 · IA que vence Doom (IA aplicada)
Opção 04-C escolhida (D-059): calibrador do limiar de confiança com gate humano, sobre o jogo fiel à aula, um detector YOLO pronto em TensorFlow.js rodando num Web Worker. O jogo é Doom (assets Freedoom), com rótulos gerados pelo motor do jogo para ajustar o YOLO; esse ajuste fica fora do que a aula ensina. As variantes antigas com ViZDoom e treino por reforço foram descartadas, porque a aula não as ensina. Opções em `modulos/01-fundamentos-ia-llms/OPCOES.md` (PR #8). Fase: especificar.

### Post já rascunhado
"Recomendação em escala: do batch ao LLM". Referências:
- AWS Big Data Blog, recomendação do batch ao tempo real: https://aws.amazon.com/pt/blogs/big-data/building-a-scalable-personalized-recommendation-system-on-aws-from-batch-to-real-time/
- AI Engineer, "Teaching Gemini to Speak YouTube" (Devansh Tandon, 2025): https://www.youtube.com/watch?v=LxQsQ3vZDqo
