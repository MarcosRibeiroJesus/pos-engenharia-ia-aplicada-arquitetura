# Disciplina 02 · APIs de IA Generativa e Prompt Engineering — opções de projeto

Status: **proposta, nada implementado.** Gerado em 2026-11-18 a partir do CLAUDE.md e da seção 02 do `docs/curso/PROGRESSO.md`. Quem escolhe é o dono do repositório.

## 0. Como ler e o que NÃO foi verificado

- **Sem acesso às aulas.** Tudo vem dos títulos do PROGRESSO.md. Cada unidade tem uma lista "Confirmar nas legendas/PDF" com o que pode mudar a escolha.
- **Fontes AWS.** O `fetch` direto de `aws.amazon.com` e `docs.aws.amazon.com` estava bloqueado nesta sessão. Os links foram localizados por busca; títulos e resumos vêm dos resultados da busca, **não li as páginas inteiras**. Antes de escrever ADR ou post, abrir cada link e conferir arquitetura, data e preço. Onde digo "a confirmar", é lacuna real.
- **Floci.** Não há CLI `floci` neste ambiente. A cobertura vem da documentação oficial ([Services Overview](https://floci.io/floci/services/) e [Bedrock Runtime](https://floci.io/floci/services/bedrock-runtime/)), lida em 2026-11-18. Confirmar com `floci aws services` na imagem que será usada.
- **Custos** são estimativas de ordem de grandeza, sem cotação na calculadora da AWS. Preço por token do Bedrock varia por modelo; validar com a calculadora e o Infracost antes de aprovar teto.
- **Outras clouds.** Só a parte Azure de gateway (Learn) foi pesquisada. Os mapeamentos GCP e o resto do Azure são do meu conhecimento e estão marcados "a confirmar".
- **Stack da aula** (pelos títulos): OpenRouter, LangChain.js/LangGraph, Neo4j, SQLite→Postgres, Langfuse, TypeScript. Propus Claude via Amazon Bedrock no lugar do OpenRouter; isso exige um ADR (o curso ensina o padrão multi-provedor, e o ADR deve mostrar como ele se preserva).

### Fatos do Floci que afetam todas as unidades

| Item | O que a documentação diz | Consequência |
|---|---|---|
| Bedrock Runtime | Stub por padrão: `Converse` e `ConverseStream` respondem; ignora `system`, `inferenceConfig` e restrições de saída; **não valida JSON Schema**; `InvokeModelWithResponseStream` devolve 501; `toolConfig` não faz round-trip no stub | Teste de integração com Claude real não existe no Floci. Testar a **lógica determinística** (validadores, roteamento, estado) e usar fixtures de respostas |
| Modo proxy | Encaminha `Converse`/`ConverseStream` a endpoint OpenAI-compatível (Ollama, OpenRouter, LiteLLM, vLLM) e traduz tools, `json_schema` e imagens | Dá para rodar o fluxo ponta a ponta com um modelo local pequeno. Marcar como "comportamento do modelo substituto", não de Claude |
| Bedrock (plano de controle) | Tabela de serviços lista 18 operações, incluindo guardrails; a página do Runtime diz que Guardrails, Agents e Knowledge Bases estão fora de escopo | **Contradição na documentação.** `ApplyGuardrail` não aparece: tratar como lacuna do emulador **somente após** testar contra a imagem |
| AgentCore | Controle com 71 operações (inclui memories); dados: só `InvokeAgentRuntime`, resposta enlatada | Memória do AgentCore não é testável no Floci |
| Cobertos de verdade | Lambda e ECS rodam containers reais; API Gateway v1/v2, DynamoDB, Step Functions, SQS, SNS, EventBridge, S3, Secrets Manager, KMS, CloudWatch, X-Ray, WAF, RDS (containers reais), ElastiCache, Cognito, Budgets, Textract, Rekognition, Comprehend, Transcribe, SSM, ECR, CloudFront | Base boa para tudo que não é o modelo |
| Neptune | 14 operações + proxy TCP **Gremlin** | openCypher no Neptune: a confirmar (provável lacuna) |

### Resumo das recomendações

| Un. | Tema | Recomendada | Por quê (uma linha) |
|---|---|---|---|
| 01 | Mercado de IA como serviço, OpenRouter, roteamento e fallback | **C** · Gateway serverless de LLM com fallback e quotas | O gateway oficial (LiteLLM em Fargate) traz custo fixo ocioso; C entrega o mesmo padrão sob demanda |
| 02 | LangChain.js, LangGraph, pipeline com testes, node de fallback | **C** · Pipeline em grafo testável, com a versão Step Functions ao lado | Foca no que é testável sem modelo; o checkpointer fica para a unidade 04 |
| 03 | Intenção em JSON, cancelamento por texto livre | **B** · Extração estruturada + gate determinístico + aprovação humana | Exercita o núcleo de 1.4, 4.3 e 4.4 com serviços 100% cobertos no Floci |
| 04 | Memória, resumo de histórico, SQLite→Postgres | **B** · Memória em DynamoDB com resumo e direito de apagar | Sem custo ocioso (o Postgres gerenciado teria); AgentCore Memory entra como alternativa no ADR |
| 05 | Prompt injection, safeguards, templates | **C** · Harness de red team + defesa em camadas | Segurança medida (taxa de sucesso de ataque) em vez de só configurada |
| 06 | Query planner, Cypher, executor, correção | **A (reduzida)** · Texto→Cypher com validador, grafo em container | Mantém o padrão oficial sem o custo fixo do Neptune |
| 07 | Multimodal, Langfuse, evaluation tests | **C** · Extração multimodal com gate de avaliação no CI | A avaliação é o produto; Langfuse fica local/opcional por custo |

---

## Unidade 01 · Mercado de IA como serviço, oportunidades e OpenRouter na prática

Título-base: "mercado de IA como serviço", "oportunidades para devs", "OpenRouter na prática (projeto inicial; roteamento multi-modelo, fallback e testes)". Conteúdo técnico: o último item.

**Confirmar nas legendas/PDF:** quais critérios de roteamento o curso usa (custo, latência, capacidade, falha); se o fallback é por erro, por timeout ou por qualidade; que tipo de teste é feito (mock de provedor? contrato?); se há controle de custo por chave.

### Opção A · Gateway multi-provedor oficial (LiteLLM) em ECS

- **Constrói:** gateway com API única compatível com OpenAI na frente de Bedrock e outros provedores, com chaves virtuais, limites e cache.
- **AWS:** ECS Fargate ou EKS, Secrets Manager, CloudFront, Route 53, CloudWatch. Banco e cache do gateway: a confirmar na página.
- **Claude:** Claude no Bedrock como backend principal; o gateway aplica Bedrock Guardrails. Tarefas: **2.2, 5.3** (erro estruturado e propagação), **4.1**.
- **Outra cloud:** Azure API Management AI gateway (limite de tokens por consumidor, balanceamento, circuit breaker, cache semântico com Redis externo, segundo a [visão geral no Learn](https://learn.microsoft.com/azure/api-management/genai-gateway-capabilities) e a [arquitetura de referência](https://learn.microsoft.com/en-us/ai/playbook/technology-guidance/generative-ai/dev-starters/genai-gateway/reference-architectures/apim-based)). GCP: LiteLLM em Cloud Run + Vertex AI (a confirmar). Equivalência alta.
- **Floci:** ECS (containers reais), Secrets Manager, CloudFront, CloudWatch cobertos. O modelo não: Bedrock Runtime é stub (o proxy do Floci até aponta para LiteLLM, o que é um bom teste de contrato).
- **Custo em lab:** **médio, com piso fixo** (tarefa Fargate 24/7, balanceador, banco e cache). Só entra com ADR e destroy diário.
- **Fonte:** [Guidance for Multi-Provider Generative AI Gateway on AWS](https://docs.aws.amazon.com/solutions/multi-provider-generative-ai-gateway-on-aws/) (Solutions Library) e o [anúncio no blog de ML](https://aws.amazon.com/blogs/machine-learning/streamline-ai-operations-with-the-multi-provider-generative-ai-gateway-reference-architecture).

### Opção B · Padrões de resiliência com Bedrock e gateway de LLM

- **Constrói:** o mesmo gateway com foco em retry, fallback entre modelos e regiões, circuit breaker e comportamento sob throttling.
- **AWS:** Bedrock (inferência entre regiões), gateway em contêiner, CloudWatch. Detalhes: a confirmar, não li o post.
- **Claude:** troca de modelo Claude por indisponibilidade; erros classificados como retentáveis ou não. **2.2, 5.3, 1.4**.
- **Outra cloud:** Azure OpenAI/Foundry com APIM (circuit breaker e backends com prioridade); GCP com Vertex AI e Cloud Run. Média-alta.
- **Floci:** o caminho de falha dá para simular com stub e respostas de erro fabricadas; resiliência real do Bedrock (throttling, inferência entre regiões) **não** é emulada.
- **Custo em lab:** baixo se o gateway for efêmero.
- **Fonte:** [Implementing resilience patterns with Amazon Bedrock and LLM Gateway](https://aws.amazon.com/blogs/machine-learning/implementing-resilience-patterns-with-amazon-bedrock-and-llm-gateway/) (blog de ML).

### Opção C (sugestão minha) · Gateway serverless de LLM com fallback, quotas e custo por chamada

- **Constrói:** API Gateway + Lambda que recebe uma requisição neutra, escolhe o modelo por política (custo, tarefa, saúde), chama o Bedrock via Converse, aplica fallback em cadeia (Claude de menor custo → Claude maior → modelo de outro provedor atrás de uma interface `LlmProvider`), um circuit breaker simples em DynamoDB, quota por chave de API e registro de tokens e custo por chamada. Mantém um adaptador OpenRouter opcional, para preservar o que o curso ensina.
- **AWS:** API Gateway, Lambda, DynamoDB (estado do breaker, quotas, ledger de custo), Secrets Manager, CloudWatch (métricas customizadas e alarmes), AWS Budgets, KMS.
- **Claude:** Claude no Bedrock como provedor primário; erro tipado (`category`, `retryable`) devolvido ao chamador. **2.2, 5.3, 1.4, 4.1**. Inspirado em A e B, sem o piso fixo.
- **Outra cloud:** Azure: API Management (política de limite de tokens) + Functions + Cosmos DB; GCP: Cloud Run + Firestore + Vertex AI. Alta, e a diferença é que A/B ganham um serviço gerenciado de gateway.
- **Floci:** API Gateway, Lambda, DynamoDB, Secrets Manager, CloudWatch, Budgets e KMS cobertos. Provedor mockado por uma interface; testes de breaker e quota rodam inteiros no Floci.
- **Custo em lab:** **~zero ocioso** (tudo sob demanda). Tokens: centavos por rodada com modelo pequeno; validar.
- **Fonte:** composição de A, B e do [guia de custo no Bedrock](https://aws.amazon.com/solutions/guidance/tracking-and-managing-costs-on-amazon-bedrock) (Solutions Library, só vi o resultado de busca).

### Recomendação: **C**

Como arquiteta sênior: A é a referência oficial, mas é um serviço sempre ligado (Fargate, balanceador, banco), o que o CLAUDE.md proíbe sem ADR e não acrescenta aprendizado de arquitetura além de "subir um LiteLLM". C força as decisões que importam num gateway: política de roteamento, classificação de erro, idempotência de fallback (não repetir efeito colateral), contabilidade de custo. O ADR de A vs C documenta quando LiteLLM é a escolha certa em produção (muitos times, muitos provedores). Risco: reinventar um gateway; mitigação, escopo mínimo e ADR explícito.

---

## Unidade 02 · LangChain.js, LangGraph, pipeline com testes e node de fallback

Título-base: "LangChain.js (pipes, fluxos condicionais, gerador de apps)", "LangGraph Studio e estado", "nodes e edges", "pipeline completo com testes", "node de fallback".

**Confirmar nas legendas/PDF:** o que é o "gerador de apps" (entrada e saída); formato do estado do grafo; que condições levam ao node de fallback; que ferramenta de teste é usada (Vitest, Jest, evals?).

### Opção A · Workflows agênticos (Prescriptive Guidance)

- **Constrói:** implementação dos padrões de workflow do guia (encadeamento de prompts, roteamento, paralelização, avaliador-otimizador) como grafo, com Claude em cada nó.
- **AWS:** Lambda ou Step Functions, Bedrock, CloudWatch. Detalhes: a confirmar.
- **Claude:** **1.4, 1.6, 4.4, 1.1**.
- **Outra cloud:** Azure Durable Functions ou Logic Apps + Foundry; GCP Workflows + Vertex AI. Alta.
- **Floci:** Lambda, Step Functions, CloudWatch cobertos; modelo em stub.
- **Custo em lab:** baixo, tudo sob demanda.
- **Fonte:** [Agentic AI patterns and workflows on AWS](https://docs.aws.amazon.com/prescriptive-guidance/latest/agentic-ai-patterns/introduction.html) e [LangChain and LangGraph](https://docs.aws.amazon.com/prescriptive-guidance/latest/agentic-ai-frameworks/langchain-langgraph.html) (Prescriptive Guidance).

### Opção B · Agente durável com LangGraph e DynamoDB

- **Constrói:** o pipeline com estado persistido por passo, para retomar após falha.
- **AWS:** Lambda ou ECS, DynamoDB (metadados do checkpoint) e S3 (payloads grandes), Bedrock. Detalhes: a confirmar.
- **Claude:** **1.7** (sessões), **5.1, 1.1**.
- **Outra cloud:** Cosmos DB ou Blob (Azure); Firestore ou GCS (GCP). Média: o `DynamoDBSaver` é da AWS, os outros precisam de checkpointer próprio.
- **Floci:** DynamoDB, S3, Lambda cobertos.
- **Custo em lab:** quase zero em modo on-demand.
- **Fonte:** [Build durable AI agents with LangGraph and Amazon DynamoDB](https://aws.amazon.com/blogs/database/build-durable-ai-agents-with-langgraph-and-amazon-dynamodb) (AWS Database Blog; a data apareceu divergente nos agregadores, conferir) e [guia do DynamoDB](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/ddb-langgraph-checkpoint.html).

### Opção C (sugestão minha) · Pipeline em grafo testável com nó de fallback e orquestrador gêmeo

- **Constrói:** o gerador de apps como grafo explícito (nós puros, arestas condicionais, estado tipado) rodando em Lambda, com o nó de fallback degradando de forma controlada (modelo alternativo, resposta parcial marcada, ou escalonamento a humano). A mesma topologia é descrita também como máquina de estados no Step Functions, para comparar "grafo no código" e "grafo na plataforma". Testes em três níveis: unitário de nó com fixture de modelo, teste de aresta (roteamento) e teste de pipeline por *golden files*.
- **AWS:** Lambda, Step Functions, S3 (artefatos gerados), CloudWatch, Bedrock.
- **Claude:** **1.1** (loop por `stop_reason`), **1.4** (gates programáticos), **1.6** (decomposição), **4.4** (validação e retentativa), **5.3**.
- **Outra cloud:** Azure Durable Functions; GCP Workflows. Alta.
- **Floci:** Lambda, Step Functions, S3, CloudWatch cobertos; nós testados sem modelo real.
- **Custo em lab:** ~zero ocioso.
- **Fonte:** composição de A e B. O guia de frameworks da AWS ajuda a justificar LangGraph vs alternativas no ADR.

### Recomendação: **C**

Esta unidade tem o aprendizado mais "de engenharia de software" da disciplina: grafos de LLM são código não determinístico, e o que um arquiteto entrega é a fronteira entre o que é determinístico e testável (arestas, validação, fallback) e o que não é (o modelo). O checkpointer (B) é valioso, mas é o mesmo tema da unidade 04; adiar evita duplicar projeto. Risco: parecer "só um exemplo de LangGraph"; mitigação é o orquestrador gêmeo e o ADR comparando os dois.

---

## Unidade 03 · Intenção de usuários, JSON estruturado e cancelamento a partir de texto livre

Título-base: "intenção de usuários e marcação de consultas", "structured JSON com OpenRouter", "intenção em JSON e teste end-to-end", "cancelamento a partir de texto livre".

**Confirmar nas legendas/PDF:** o esquema de intenção (campos, enums); como o curso trata ambiguidade ("cancela a de quinta" com duas consultas); se há confirmação antes de cancelar; o que o teste end-to-end cobre.

### Opção A · Saídas estruturadas do Bedrock para classificação de intenção

- **Constrói:** API que transforma texto livre em JSON validado (intenção, entidades, confiança) com schema forçado, validador próprio e retentativa com o erro.
- **AWS:** API Gateway, Lambda, Bedrock Converse com `outputConfig.textFormat`, DynamoDB (agenda), CloudWatch.
- **Claude:** **4.3, 4.4, 4.1, 4.2**.
- **Outra cloud:** Azure: Functions + Foundry com saída estruturada; GCP: Cloud Run + Vertex AI com schema de resposta. Alta.
- **Floci:** API Gateway, Lambda, DynamoDB cobertos. **Lacuna do emulador:** o stub ignora restrições de saída e não valida schema, então a validação tem de ser nossa; em modo proxy o `json_schema` é traduzido para um modelo local.
- **Custo em lab:** baixo.
- **Fonte:** [Structured outputs for Anthropic Claude models on Amazon Bedrock](https://aws.amazon.com/blogs/machine-learning/structured-outputs-for-anthropic-claude-models-on-amazon-bedrock/) e a [documentação](https://docs.aws.amazon.com/bedrock/latest/userguide/structured-output.html). O recurso foi anunciado em fev/2026 (busca): conferir modelos e regiões suportados.

### Opção B · Extração estruturada + validação determinística + aprovação humana (cancelamento)

- **Constrói:** fluxo em que Claude extrai a intenção de cancelamento, **código** valida (a consulta existe? é do usuário? está dentro da política?), e ações de risco passam por confirmação humana antes de executar. Decisão registrada e idempotente.
- **AWS:** Step Functions (Choice, `waitForTaskToken`), Lambda, Bedrock, DynamoDB (agenda e trilha de decisões), SNS ou SQS para notificar o aprovador, EventBridge.
- **Claude:** **1.4** (gate programático e handoff a humano), **4.3, 4.4, 5.2** (escalonamento), **2.2**.
- **Outra cloud:** Azure Durable Functions (eventos externos) + Service Bus; GCP Workflows (callbacks) + Pub/Sub. Alta.
- **Floci:** Step Functions, Lambda, DynamoDB, SNS, SQS, EventBridge cobertos. Atenção: suporte do Floci a `waitForTaskToken` precisa ser verificado na imagem (a confirmar).
- **Custo em lab:** baixo.
- **Fonte:** [Validating multi-agent decisions with Step Functions and Bedrock AgentCore](https://aws.amazon.com/blogs/compute/validating-multi-agent-decisions-with-step-functions-and-bedrock-agentcore/) (AWS Compute Blog; exemplo de cancelamento de voo com validação determinística e revisão humana — li só o resumo da busca) e [human-in-the-loop em fluxos agênticos](https://aws.amazon.com/blogs/machine-learning/human-in-the-loop-constructs-for-agentic-workflows-in-healthcare-and-life-sciences) (blog de ML).

### Opção C (sugestão minha) · Compromisso em duas fases com desambiguação

- **Constrói:** variante de B com *propose → confirm → commit*: Claude propõe a ação e uma lista de candidatas quando há ambiguidade, o usuário confirma, e só então o commit ocorre com chave de idempotência e *optimistic locking* no DynamoDB. Inclui conjunto de testes adversariais (cancelamento ambíguo, de outro usuário, repetido).
- **AWS:** API Gateway, Lambda, DynamoDB, Step Functions (opcional).
- **Claude:** **4.3, 4.4, 1.4, 5.2, 5.5**.
- **Outra cloud:** Cosmos DB ou Firestore com transações. Alta.
- **Floci:** todos cobertos.
- **Custo em lab:** ~zero.
- **Fonte:** padrão de projeto, sem fonte AWS específica; apoiar nas duas anteriores.

### Recomendação: **B**

Cancelar é a operação em que o custo de um erro do modelo é real, e a lição de arquiteto é que a intenção extraída por LLM é uma **proposta**, nunca uma autorização. B usa serviços 100% cobertos no Floci, exercita três tarefas de peso (1.4, 4.3, 4.4) e aproxima o componente Claude do cenário "agente de suporte ao cliente" da prova. Incorporar de C a idempotência e a desambiguação como requisitos. Atenção: o schema forçado reduz erros de formato, não de significado; a validação semântica contra o estado real é o que protege.

---

## Unidade 04 · Recomendador por preferências, extração, memória em SQLite e resumo/Postgres

Título-base: "recomendador de músicas por preferências", "extração de preferências", "memória em SQLite", "resumo de histórico e persistência em Postgres".

**Confirmar nas legendas/PDF:** o que a memória guarda (preferências, histórico bruto, resumo); o gatilho do resumo (tamanho? turnos?); por que migrar de SQLite para Postgres (concorrência? multiusuário?); se há busca vetorial (o PROGRESSO não indica).

### Opção A · Amazon Bedrock AgentCore Memory

- **Constrói:** agente recomendador com memória de curto prazo (eventos) e longo prazo (registros extraídos por estratégias), organizada em *namespaces* por usuário.
- **AWS:** Bedrock AgentCore (Memory), Lambda, IAM por namespace.
- **Claude:** **5.1, 1.7, 5.6**.
- **Outra cloud:** sem equivalente gerenciado direto: Azure Cosmos DB + Foundry; GCP Vertex AI Agent Engine Memory Bank (a confirmar). Diferença a documentar.
- **Floci:** plano de controle de memórias listado, **plano de dados não** (só `InvokeAgentRuntime` enlatado). Não é testável localmente.
- **Custo em lab:** por uso; a confirmar na página de preços.
- **Fonte:** [AgentCore long-term memory deep dive](https://aws.amazon.com/blogs/machine-learning/building-smarter-ai-agents-agentcore-long-term-memory-deep-dive) e [namespaces em escala](https://aws.amazon.com/blogs/machine-learning/organizing-agents-memory-at-scale-namespace-design-patterns-in-agentcore-memory/) (blog de ML, só resumos).

### Opção B · Memória em DynamoDB (+ S3) com resumo e direito de apagar

- **Constrói:** três camadas — sessão (turnos recentes, com TTL), perfil (preferências extraídas, por usuário) e resumo (compactação periódica do histórico feita por Claude). Persistência durável por passo no estilo do checkpointer do LangGraph. Endpoint de exclusão que apaga tudo de um usuário.
- **AWS:** Lambda, DynamoDB (on-demand, TTL), S3 (histórico bruto), KMS, Bedrock, EventBridge Scheduler (resumos).
- **Claude:** **5.1** (preservar o que importa ao resumir), **5.6** (proveniência: de qual turno saiu cada preferência), **1.7, 4.3**.
- **Outra cloud:** Azure Cosmos DB (TTL) + Blob; GCP Firestore + Cloud Storage. Alta.
- **Floci:** DynamoDB (TTL: a confirmar), S3, KMS, EventBridge Scheduler cobertos.
- **Custo em lab:** ~zero ocioso.
- **Fonte:** [Build durable AI agents with LangGraph and Amazon DynamoDB](https://aws.amazon.com/blogs/database/build-durable-ai-agents-with-langgraph-and-amazon-dynamodb) (AWS Database Blog).

### Opção C (sugestão minha) · Postgres gerenciado como memória relacional

- **Constrói:** espelho direto do curso (SQLite → Postgres) com RDS/Aurora, esquema relacional de preferências e histórico, resumo por job.
- **AWS:** RDS PostgreSQL ou Aurora, Lambda (com RDS Proxy ou Data API), Secrets Manager, Bedrock.
- **Claude:** **5.1, 4.3**.
- **Outra cloud:** Azure Database for PostgreSQL; Cloud SQL. Alta, a mais alta das três.
- **Floci:** RDS com containers reais cobertos.
- **Custo em lab:** **instância ociosa tem custo fixo**; só com ADR e destroy no fim da sessão.
- **Fonte:** padrão de projeto; sem fonte AWS específica.

### Recomendação: **B**

Para um recomendador, o dado de memória é chave-valor por usuário com acesso previsível: DynamoDB é o ajuste natural, não tem piso de custo e é totalmente testável no Floci. A migração SQLite→Postgres ensinada na aula vira um ADR ("quando relacional vale o piso fixo"), com C como alternativa rejeitada para o lab. A é a opção a observar em produção; entra como comparação, e a falta de dados do emulador justifica não escolhê-la agora. Pontos de arquiteto: LGPD (direito de apagar testado), poluição de memória por prompt injection (conecta com a unidade 05) e resumo que perde informação (teste com perguntas sobre fatos antigos).

---

## Unidade 05 · Prompt injection, safeguards, prompt templates e MCP adapters

Título-base: "prompt injection (introdução, ataque na prática, safeguards)", "prompt templates e MCP adapters".

**Confirmar nas legendas/PDF:** quais ataques são demonstrados (direto, indireto, via ferramenta); quais safeguards o curso ensina (delimitadores, validação, filtros); como os templates e os adaptadores MCP aparecem (a unidade 03 da disciplina seguinte é MCP: evitar sobreposição).

### Opção A · Guardrails de prompt attack no Bedrock

- **Constrói:** chatbot com camada de entrada e saída moderada pelo Bedrock Guardrails (filtro de prompt attack), com o `ApplyGuardrail` independente do modelo.
- **AWS:** API Gateway, Lambda, Bedrock Guardrails, CloudWatch, WAF.
- **Claude:** **4.1, 1.5, 5.5**.
- **Outra cloud:** Azure AI Content Safety (Prompt Shields); GCP Model Armor. Alta (a confirmar nomes e recursos).
- **Floci:** WAF e Lambda cobertos; **Guardrails: lacuna provável** (documentação do Runtime diz fora de escopo; o plano de controle lista guardrails), a confirmar na imagem.
- **Custo em lab:** baixo; guardrails cobram por unidade de texto avaliada.
- **Fonte:** [Safeguard your generative AI workloads from prompt injections](https://aws.amazon.com/blogs/security/safeguard-your-generative-ai-workloads-from-prompt-injections) (AWS Security Blog).

### Opção B · Defesa em profundidade para agentes (injeção indireta)

- **Constrói:** agente com ferramentas em que o conteúdo externo (documento, página, retorno de tool) é o vetor; controles: separação de instruções e dados, validação de entrada, privilégio mínimo por ferramenta, confirmação humana para ações sensíveis.
- **AWS:** Bedrock, Lambda, IAM, Guardrails, CloudWatch.
- **Claude:** **2.3** (poucas tools por agente), **1.5, 1.4, 5.5**.
- **Outra cloud:** igual a A. Alta.
- **Floci:** IAM e Lambda cobertos; Guardrails como em A.
- **Custo em lab:** baixo.
- **Fonte:** [Securing Amazon Bedrock Agents against indirect prompt injections](https://aws.amazon.com/blogs/machine-learning/securing-amazon-bedrock-agents-a-guide-to-safeguarding-against-indirect-prompt-injections) (blog de ML) e [Input validation and guardrails for agentic AI systems](https://docs.aws.amazon.com/prescriptive-guidance/latest/agentic-ai-security/best-practices-input-validation.html) (Prescriptive Guidance).

### Opção C (sugestão minha) · Harness de red team contínuo com defesa em camadas

- **Constrói:** uma aplicação-alvo pequena (assistente com duas tools) e um corpus versionado de ataques (direto, indireto, codificado). Defesas em camadas: normalização de entrada, template com dados delimitados, saída por schema, allowlist de tools com IAM mínimo, WAF na borda, Guardrails opcionais. O CI roda o corpus e **mede a taxa de sucesso de ataque**, falhando o build se subir.
- **AWS:** API Gateway + WAF, Lambda, Bedrock (+ Guardrails), S3 (corpus e resultados), Step Functions ou Bedrock batch para rodar em lote, CloudWatch.
- **Claude:** **4.1, 4.6** (revisão multi-instância: um modelo atacante, outro juiz), **1.5, 2.3, 5.5**.
- **Outra cloud:** Azure: Front Door WAF + Prompt Shields; GCP: Cloud Armor + Model Armor. Alta.
- **Floci:** WAF, Lambda, S3, Step Functions, CloudWatch cobertos. As camadas determinísticas ficam 100% testáveis; a camada de guardrail é lacuna a confirmar, e o resultado de "ataque bem-sucedido" depende do modelo real (no stub, nenhum ataque funciona e isso não significa nada: o teste precisa avisar).
- **Custo em lab:** baixo; o corpus roda sob demanda.
- **Fonte:** composição de A e B.

### Recomendação: **C**

A e B descrevem controles; C os trata como hipótese a medir, que é como um arquiteto de segurança trabalha. Mapeia bem para a prova (4.1, 1.5, 2.3). Honestidade de escopo: a eficácia real contra Claude só se mede com o modelo real (poucos centavos por rodada), então o relatório deve separar "camadas determinísticas validadas no Floci" de "eficácia contra o modelo validada na AWS". Ligação com a unidade 04: um dos ataques do corpus envenena a memória.

---

## Unidade 06 · Query planner, Cypher generator, executor, correção de queries e respostas analíticas (Neo4j)

Título-base: "query planner", "Cypher generator com structured outputs", "Cypher executor", "correção de queries e respostas analíticas".

**Confirmar nas legendas/PDF:** o domínio e o esquema do grafo; como o planner decompõe a pergunta; como o executor trata erro e *timeout*; se há controle de escrita (o executor deveria ser somente leitura).

### Opção A · Texto→Cypher com Neptune e Bedrock

- **Constrói:** pergunta em linguagem natural vira consulta openCypher gerada com o esquema do grafo no contexto, executada, e a resposta é sintetizada.
- **AWS:** Neptune Database (ou Serverless), Bedrock, Lambda, VPC.
- **Claude:** **4.3, 4.4, 1.6, 2.2**.
- **Outra cloud:** Azure: Cosmos DB for Gremlin não tem Cypher, então Neo4j em AKS ou Aura; GCP: Spanner Graph (consultas em GQL, mudança de linguagem). Média; documentar o que muda.
- **Floci:** Neptune cobre 14 operações e proxy **Gremlin**; openCypher: **a confirmar** (provável lacuna). Lambda e Bedrock (stub) cobertos.
- **Custo em lab:** **cluster Neptune tem custo mesmo ocioso** (verificar se o Serverless atual escala a zero; não confirmei). Destroy obrigatório.
- **Fonte:** [Using knowledge graphs to build GraphRAG applications with Amazon Bedrock and Amazon Neptune](https://aws.amazon.com/blogs/database/using-knowledge-graphs-to-build-graphrag-applications-with-amazon-bedrock-and-amazon-neptune/) (AWS Database Blog; só li o resumo).

### Opção B · Bedrock Knowledge Bases com GraphRAG (gerenciado)

- **Constrói:** grafo construído automaticamente a partir de documentos e consultado pelo serviço.
- **AWS:** Bedrock Knowledge Bases, Neptune Analytics, S3.
- **Claude:** **5.6** (proveniência por citações). Pouco material para 4.3/4.4: o serviço esconde o planner e o gerador, que é justamente o que a aula ensina.
- **Outra cloud:** sem equivalente gerenciado igual. Baixa-média.
- **Floci:** Knowledge Bases fora de escopo (documentação do Runtime). **Não testável.**
- **Custo em lab:** médio.
- **Fonte:** [Build GraphRAG applications using Amazon Bedrock Knowledge Bases](https://aws.amazon.com/blogs/machine-learning/build-graphrag-applications-using-amazon-bedrock-knowledge-bases) (blog de ML).

### Opção C (sugestão minha) · Pipeline planner → gerador → validador → executor → reparo, com Neo4j sob demanda

- **Constrói:** o pipeline da aula com um **validador entre o gerador e o executor**: só leitura (rejeita `CREATE`, `MERGE`, `DELETE`, `SET`, `CALL` de escrita), rótulos e relações conferidos contra o esquema, `LIMIT` e *timeout* obrigatórios, e execução com usuário de banco somente leitura. Falha vira erro estruturado para o ciclo de correção (máximo de N tentativas). Resposta analítica cita a consulta usada.
- **AWS:** Lambda ou ECS (tarefa on-demand) com Neo4j Community em contêiner (como na aula), Secrets Manager, S3 (esquema e dados sintéticos), CloudWatch, Bedrock. Neptune como alvo opcional via ADR.
- **Claude:** **4.3, 4.4, 2.2, 1.6, 5.3**.
- **Outra cloud:** Neo4j em contêiner no Cloud Run/ACI ou serviço gerenciado. Alta (o banco é o mesmo).
- **Floci:** ECS com containers reais e Lambda cobertos; Neo4j roda como contêiner de teste, **não é serviço AWS**, então não depende do emulador. Gerador de Cypher é testado com fixtures.
- **Custo em lab:** baixo (tarefa efêmera); evita o piso do Neptune.
- **Fonte:** padrão de A (post de Neptune e Bedrock) com troca justificada do armazenamento.

### Recomendação: **A, em versão reduzida (equivale a C)**

O aprendizado do arquiteto está no pipeline e no validador, não no banco gerenciado. Recomendo seguir o padrão da fonte oficial (A) com o grafo em Neo4j efêmero, e registrar em ADR por que o Neptune fica de fora do lab (piso de custo, openCypher não confirmado no Floci). Risco principal: injeção de Cypher via LLM; é o ponto da unidade 05 aplicado a banco de dados. Dados: só sintéticos.

---

## Unidade 07 · Modelos multimodais, monitoramento com Langfuse e evaluation tests

Título-base: "modelos multimodais", "monitoramento com Langfuse e evaluation tests".

**Confirmar nas legendas/PDF:** quais modalidades (imagem? áudio?); o caso de uso do multimodal; quais métricas e rubricas dos *evaluation tests*; se o Langfuse é self-hosted ou cloud; se há *datasets* e LLM-as-judge.

### Opção A · Processamento multimodal com Bedrock Data Automation

- **Constrói:** pipeline que recebe documentos, imagens, áudio e vídeo em S3, extrai campos com *blueprints* e grava em S3 e banco.
- **AWS:** S3, EventBridge, Lambda ou Step Functions, Bedrock Data Automation, DynamoDB ou Aurora.
- **Claude:** pouco central: o serviço faz a extração. Claude entra na validação e no resumo. **4.3, 5.6**.
- **Outra cloud:** Azure AI Content Understanding / Document Intelligence; GCP Document AI. Média (a confirmar).
- **Floci:** S3, EventBridge, Lambda, Step Functions cobertos; Bedrock Data Automation **não aparece** na lista (a confirmar). Textract e Rekognition existem como substitutos.
- **Custo em lab:** por página/minuto processado; baixo em volume de lab.
- **Fonte:** [Guidance for Multimodal Data Processing Using Amazon Bedrock Data Automation](https://docs.aws.amazon.com/solutions/multimodal-data-processing-using-amazon-bedrock-data-automation/) (Solutions Library).

### Opção B · Observabilidade de LLM com Langfuse na AWS

- **Constrói:** Langfuse auto-hospedado recebendo traces, custo e avaliações do app com Bedrock.
- **AWS:** ECS Fargate (Terraform do Langfuse), Postgres, ClickHouse, cache, S3: lista de componentes **a confirmar**.
- **Claude:** **5.6, 4.6, 5.5**.
- **Outra cloud:** Langfuse em AKS ou GKE; ou Azure Monitor/Application Insights e Cloud Trace. Alta.
- **Floci:** ECS, RDS, ElastiCache, S3 cobertos; ClickHouse não é serviço AWS (roda como contêiner).
- **Custo em lab:** **piso fixo relevante** (vários serviços sempre ligados). Em lab, rodar por Docker Compose local e só descrever a versão AWS.
- **Fonte:** [Transform LLM observability with Langfuse](https://aws.amazon.com/blogs/apn/transform-large-language-model-observability-with-langfuse) (APN Blog) e [AgentCore Observability com Langfuse](https://aws.amazon.com/blogs/machine-learning/amazon-bedrock-agentcore-observability-with-langfuse) (blog de ML).

### Opção C (sugestão minha) · Extração multimodal com gate de avaliação no CI

- **Constrói:** função que recebe uma imagem (ex.: recibo ou diagrama sintético) e devolve JSON estruturado via Claude com visão; um **dataset dourado** versionado, LLM-as-judge e métricas de regressão (acurácia de campos, taxa de JSON inválido, custo e latência); um **gate no GitHub Actions** que bloqueia mudança de prompt ou modelo se a métrica cair; execução noturna em lote para reduzir custo; telemetria em CloudWatch e X-Ray (compatível com OpenTelemetry), com Langfuse como destino opcional.
- **AWS:** S3, Lambda, Bedrock (e Bedrock Evaluations/batch inference), Step Functions, CloudWatch, X-Ray, EventBridge Scheduler.
- **Claude:** **4.5** (Message Batches API/lote), **4.6, 4.2, 4.3, 5.5, 5.6**. Aproxima do cenário "extração de dados estruturados" da prova.
- **Outra cloud:** Azure Content Understanding + Azure Monitor; GCP Vertex AI Gen AI evaluation + Cloud Trace. Média-alta (a confirmar).
- **Floci:** S3, Lambda, Step Functions, CloudWatch, X-Ray, EventBridge cobertos; o proxy traduz imagens inline para um modelo de visão local; Bedrock Evaluations não é emulado (plano de controle ausente). Métricas de qualidade com Claude real: validação na AWS.
- **Custo em lab:** baixo; centavos por rodada do dataset pequeno; lote reduz o custo (confirmar desconto do batch na página de preços).
- **Fonte:** [LLM-as-a-judge on Amazon Bedrock Model Evaluation](https://aws.amazon.com/blogs/machine-learning/llm-as-a-judge-on-amazon-bedrock-model-evaluation) (blog de ML) e o guia [Evaluating quality and reliability in generated outputs](https://docs.aws.amazon.com/prescriptive-guidance/latest/gen-ai-lifecycle-operational-excellence/dev-experimenting-quality.html) (Prescriptive Guidance).

### Recomendação: **C**

Última unidade da disciplina: a lição é que "funciona na demo" não é critério. A avaliação como gate de release é o que separa protótipo de produto, e amarra toda a disciplina (prompts de 03 a 06 passam a ter teste de regressão). Langfuse fica como destino opcional e descrito em ADR (custo fixo da versão AWS); o curso o usa, então manter uma versão local por Compose para a prática. O LLM-as-judge tem viés conhecido, portanto o plano inclui calibração com amostra rotulada por humano (**5.5**).

---

## Decisões que dependem de você

1. Escolher uma opção por unidade (sugeridas: 01-C, 02-C, 03-B, 04-B, 05-C, 06-A reduzida, 07-C). A regra é "pelo menos um projeto por módulo"; dá para implementar só algumas e deixar as outras como design.
2. Aceitar Claude via Amazon Bedrock como componente padrão, mantendo adaptador OpenRouter onde o curso o usa.
3. Escolher a cloud comparativa (Azure, GCP ou OCI) por unidade ou uma só para a disciplina. Sugestão: Azure, que tem material oficial de gateway já localizado.
4. Teto mensal de orçamento do lab (só o dono decide; o Infracost e os tokens reais entram no cálculo).
5. Liberar `aws.amazon.com` e `docs.aws.amazon.com` na rede da sessão para eu abrir as fontes na íntegra antes dos ADRs, ou conferi-las você mesmo.

## Pendências antes de implementar

- Ler legendas e PDF da disciplina (blocos "Confirmar" acima).
- Abrir cada fonte AWS e conferir arquitetura, data e preço.
- Rodar `floci aws services` e testar: `ApplyGuardrail`, `waitForTaskToken`, TTL do DynamoDB, openCypher no Neptune, Bedrock Data Automation.
- Verificar preços e disponibilidade de modelos Claude no Bedrock na região escolhida.
