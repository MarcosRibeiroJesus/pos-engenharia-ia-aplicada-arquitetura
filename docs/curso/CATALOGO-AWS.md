# Catálogo de arquiteturas AWS por unidade

Para escolher a **arquitetura AWS** de cada unidade. As opções e os links vêm dos `OPCOES.md` de cada disciplina (PRs de propostas), escritos sem acesso às aulas e com links encontrados por busca, ainda **não verificados um a um**. Confira o link antes de escolher.

Cada unidade terá dois projetos: o de **IA aplicada** (fiel à aula, como o Doom) e a **arquitetura AWS** escolhida aqui.

## 01 · Fundamentos de IA e LLMs para Programadores

Detalhes completos: [OPCOES.md no PR #8](https://github.com/MarcosRibeiroJesus/pos-engenharia-ia-aplicada-arquitetura/pull/8).

### Unidade 02 · ML, DL e IA

Recomendação da sessão: **02-S**

- **02-A · Ciclo MLOps em SageMaker com promoção por aprovação**
  - [Build an end-to-end MLOps pipeline using Amazon SageMaker Pipelines, GitHub, and GitHub Actions](https://aws.amazon.com/blogs/machine-learning/build-an-end-to-end-mlops-pipeline-using-amazon-sagemaker-pipelines-github-and-github-actions/)
  - [MLOps Workload Orchestrator](https://docs.aws.amazon.com/solutions/latest/mlops-workload-orchestrator/architecture-overview.html)
- **02-B · Inferência serverless de rede neural com captura de dados**
  - [Machine learning inference at scale using AWS serverless](https://aws.amazon.com/blogs/machine-learning/machine-learning-inference-at-scale-using-aws-serverless/)
  - [Choosing between storage mechanisms for ML inferencing with AWS Lambda](https://aws.amazon.com/blogs/compute/choosing-between-storage-mechanisms-for-ml-inferencing-with-aws-lambda/)
  - [Deploy a machine learning inference data capture solution on AWS Lambda](https://aws.amazon.com/blogs/machine-learning/deploy-a-machine-learning-inference-data-capture-solution-on-aws-lambda/)
- **02-S · Triagem com gate de confiança e escalonamento para Claude (sugestão minha)**
  - [Human-in-the-loop constructs for agentic workflows](https://aws.amazon.com/blogs/machine-learning/human-in-the-loop-constructs-for-agentic-workflows-in-healthcare-and-life-sciences/)

### Unidade 04 · Como vencer qualquer jogo (Doom)

Recomendação da sessão: **D2+**

- **D2 (revisada) · Treino em Spot na nuvem, promoção por avaliação, demo no navegador**
  - [How to train procedurally generated game-like environments at scale with Amazon SageMaker RL](https://aws.amazon.com/blogs/machine-learning/winning-neurips-2020-procgen-benchmark-competition-with-amazon-sagemaker-reinforcement-learning/)
  - [Scale Reinforcement Learning with AWS Batch Multi-Node Parallel Jobs](https://aws.amazon.com/blogs/hpc/scale-reinforcement-learning-with-aws-batch-multi-node-parallel-jobs/)
  - [Managed Spot Training](https://docs.aws.amazon.com/sagemaker/latest/dg/model-managed-spot-training.html)
  - [Checkpoints](https://docs.aws.amazon.com/sagemaker/latest/dg/model-checkpoints.html)
  - [Scaling MoE reinforcement learning on Amazon EKS](https://aws.amazon.com/blogs/machine-learning/scaling-moe-reinforcement-learning-on-amazon-eks-with-efa-and-deepep-with-40-more-throughput/)

### Unidade 05 · Web AI e LLMs

Recomendação da sessão: **05-A**

- **05-A · Inferência híbrida: navegador primeiro, nuvem como fallback**
  - [Edge AI and global inference distribution](https://docs.aws.amazon.com/prescriptive-guidance/latest/agentic-ai-serverless/edge-ai.html)
  - [Architecting offline-first generative AI applications for edge deployments](https://aws.amazon.com/blogs/architecture/architecting-offline-first-generative-ai-applications-for-edge-deployments-using-aws-services/)
  - [Read graphs, diagrams, tables, and scanned pages using multimodal prompts in Amazon Bedrock](https://aws.amazon.com/blogs/machine-learning/read-graphs-diagrams-tables-and-scanned-pages-using-multimodal-prompts-in-amazon-bedrock/)
- **05-B · Pipeline multimodal de documentos e imagens**
  - [Intelligent document processing using Amazon Bedrock and Anthropic Claude](https://aws.amazon.com/blogs/machine-learning/intelligent-document-processing-using-amazon-bedrock-and-anthropic-claude/)

### Unidade 06 · Prompts

Recomendação da sessão: **06-B**

- **06-A · Registro de prompts com porta de avaliação no CI**
  - [CI/CD and automation for serverless AI](https://docs.aws.amazon.com/prescriptive-guidance/latest/agentic-ai-serverless/cicd-and-automation.html)
  - [Prompt, agent, and model lifecycle management](https://docs.aws.amazon.com/prescriptive-guidance/latest/agentic-ai-serverless/prompt-agent-and-model.html)
  - [Guidance for Evaluating Generative AI Applications using OSS on AWS](https://aws.amazon.com/solutions/guidance/evaluating-generative-ai-applications-using-oss-on-aws/)
  - [Generative AI Lifecycle Operational Excellence](https://docs.aws.amazon.com/pdfs/prescriptive-guidance/latest/gen-ai-lifecycle-operational-excellence/gen-ai-lifecycle-operational-excellence.pdf)
- **06-B · Serviço de extração estruturada: JSON vs TOON, com validação e retentativa**
  - [Effective cost optimization strategies for Amazon Bedrock](https://aws.amazon.com/blogs/machine-learning/effective-cost-optimization-strategies-for-amazon-bedrock/)
  - [Intelligent document processing using Amazon Bedrock and Anthropic Claude](https://aws.amazon.com/blogs/machine-learning/intelligent-document-processing-using-amazon-bedrock-and-anthropic-claude/)
  - [Four Amazon Bedrock inference choices that affect cost](https://aws.amazon.com/blogs/machine-learning/four-amazon-bedrock-inference-choices-that-affect-cost/)

### Unidade 07 · Ferramentas e agentes

Recomendação da sessão: **07-A**

- **07-A · Agente com loop por stopreason, gates programáticos e aprovação humana**
  - [Automate medical coding with Step Functions and Amazon Bedrock AgentCore](https://aws.amazon.com/blogs/architecture/automate-medical-coding-with-step-functions-and-amazon-bedrock-agentcore/)
  - [Human-in-the-loop claims processing with Amazon Bedrock AgentCore](https://aws.amazon.com/blogs/publicsector/human-in-the-loop-claims-processing-with-amazon-bedrock-agentcore/)
  - [AWS Step Functions adds AgentCore-powered agentic reasoning step](https://aws.amazon.com/about-aws/whats-new/2026/06/aws-step-functions-agentcore/)
- **07-B · Claude Code em CI com saída estruturada**
  - [Extend Claude Code to remote sessions on Amazon Bedrock AgentCore with security controls](https://aws.amazon.com/blogs/machine-learning/extend-claude-code-to-remote-sessions-on-amazon-bedrock-agentcore-with-security-controls/)
  - [It's safe to close your laptop now: Hosting coding agents on AgentCore](https://aws.amazon.com/blogs/machine-learning/its-safe-to-close-your-laptop-now-hosting-coding-agents-on-amazon-bedrock-agentcore/)
  - [Supercharge regulated workloads with Claude Code and Amazon Bedrock](https://aws.amazon.com/blogs/machine-learning/supercharge-regulated-workloads-with-claude-code-and-amazon-bedrock/)

### Unidade 08 · MCP na prática

Recomendação da sessão: **08-C**

- **08-A · Agente com MCPs governados: navegador, documentação e telemetria**
  - [MCP strategies](https://docs.aws.amazon.com/prescriptive-guidance/latest/mcp-strategies/mcp-strategies.pdf)
  - [Introducing Amazon Bedrock AgentCore Browser Tool](https://aws.amazon.com/blogs/machine-learning/introducing-amazon-bedrock-agentcore-browser-tool/)
- **08-B · Servidor MCP com OAuth em contêiner**
  - [Guidance for Deploying Model Context Protocol Servers on AWS](https://docs.aws.amazon.com/solutions/deploying-model-context-protocol-servers-on-aws/)
  - [Deploying MCP servers on Amazon ECS](https://aws.amazon.com/blogs/containers/deploying-model-context-protocol-mcp-servers-on-amazon-ecs/)
- **08-C · Servidor MCP de telemetria somente leitura com erros estruturados (sugestão minha)**
  - [The AWS API MCP Server is now available on AWS Marketplace](https://aws.amazon.com/about-aws/whats-new/2025/11/the-aws-api-mcp-server-aws-marketplace)
  - [MCP strategies](https://docs.aws.amazon.com/prescriptive-guidance/latest/mcp-strategies/mcp-strategies.pdf)

### Unidade 09 · Modelos

Recomendação da sessão: **09-C**

- **09-A · Gateway multi-provedor**
  - [Guidance for Multi-Provider Generative AI Gateway on AWS](https://docs.aws.amazon.com/solutions/multi-provider-generative-ai-gateway-on-aws/)
  - [Streamline AI operations with the Multi-Provider Generative AI Gateway reference architecture](https://aws.amazon.com/blogs/machine-learning/streamline-ai-operations-with-the-multi-provider-generative-ai-gateway-reference-architecture)
- **09-B · Modelo aberto próprio versus modelo fechado, com avaliação**
  - [Deploy LLMs on Amazon EKS using vLLM Deep Learning Containers](https://aws.amazon.com/blogs/architecture/deploy-llms-on-amazon-eks-using-vllm-deep-learning-containers/)
  - [Import a pre-trained model into Amazon Bedrock](https://docs.aws.amazon.com/bedrock/latest/userguide/import-pre-trained-model.html)
  - [Choosing a generative AI service](https://docs.aws.amazon.com/decision-guides/latest/decision-guides/genai-guide.html)
- **09-C · Roteador por sensibilidade de dados: modelo aberto local ou Claude (sugestão minha)**
  - [Capability 2: secure access to generative AI RAG techniques](https://docs.aws.amazon.com/prescriptive-guidance/latest/security-reference-architecture/gen-ai-rag.html)

### Unidade 10 · RAG

Recomendação da sessão: **10-C**

- **10-A · RAG gerenciado com Bedrock Knowledge Bases**
  - [Vector database options](https://docs.aws.amazon.com/prescriptive-guidance/latest/choosing-an-aws-vector-database-for-rag-use-cases/vector-db-options.html)
  - [Retrieval Augmented Generation options and architectures on AWS](https://docs.aws.amazon.com/pdfs/prescriptive-guidance/latest/retrieval-augmented-generation-options/retrieval-augmented-generation-options.pdf)
  - [Capability 2: RAG security](https://docs.aws.amazon.com/prescriptive-guidance/latest/security-reference-architecture/gen-ai-rag.html)
- **10-B · GraphRAG com Neptune (o equivalente do Neo4j)**
  - [Combat financial fraud with GraphRAG on Amazon Bedrock Knowledge Bases](https://aws.amazon.com/blogs/machine-learning/combat-financial-fraud-with-graphrag-on-amazon-bedrock-knowledge-bases/)
  - [Build a knowledge base with Amazon Neptune Analytics graphs](https://docs.aws.amazon.com/bedrock/latest/userguide/knowledge-base-build-graphs.html)
  - [Unified Knowledge Graph RAG on AWS](https://aws.amazon.com/blogs/opensource/unified-knowledge-graph-rag-on-aws-graphrag-and-lightrag-on-one-stack/)
- **10-C · RAG agêntico com proveniência e incerteza (sugestão minha)**
  - [Core services: knowledge bases](https://docs.aws.amazon.com/prescriptive-guidance/latest/govern-architect-agentic-ai/core-services-knowledge-bases.html)

## 02 · APIs de IA Generativa e Prompt Engineering

Detalhes completos: [OPCOES.md no PR #7](https://github.com/MarcosRibeiroJesus/pos-engenharia-ia-aplicada-arquitetura/pull/7).

### Unidade 01 · Mercado de IA como serviço, oportunidades e OpenRouter na prática

Recomendação da sessão: **C**

- **Opção A · Gateway multi-provedor oficial (LiteLLM) em ECS**
  - [Guidance for Multi-Provider Generative AI Gateway on AWS](https://docs.aws.amazon.com/solutions/multi-provider-generative-ai-gateway-on-aws/)
  - [anúncio no blog de ML](https://aws.amazon.com/blogs/machine-learning/streamline-ai-operations-with-the-multi-provider-generative-ai-gateway-reference-architecture)
- **Opção B · Padrões de resiliência com Bedrock e gateway de LLM**
  - [Implementing resilience patterns with Amazon Bedrock and LLM Gateway](https://aws.amazon.com/blogs/machine-learning/implementing-resilience-patterns-with-amazon-bedrock-and-llm-gateway/)
- **Opção C (sugestão minha) · Gateway serverless de LLM com fallback, quotas e custo por chamada**
  - [guia de custo no Bedrock](https://aws.amazon.com/solutions/guidance/tracking-and-managing-costs-on-amazon-bedrock)

### Unidade 02 · LangChain.js, LangGraph, pipeline com testes e node de fallback

Recomendação da sessão: **C**

- **Opção A · Workflows agênticos (Prescriptive Guidance)**
  - [Agentic AI patterns and workflows on AWS](https://docs.aws.amazon.com/prescriptive-guidance/latest/agentic-ai-patterns/introduction.html)
  - [LangChain and LangGraph](https://docs.aws.amazon.com/prescriptive-guidance/latest/agentic-ai-frameworks/langchain-langgraph.html)
- **Opção B · Agente durável com LangGraph e DynamoDB**
  - [Build durable AI agents with LangGraph and Amazon DynamoDB](https://aws.amazon.com/blogs/database/build-durable-ai-agents-with-langgraph-and-amazon-dynamodb)
  - [guia do DynamoDB](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/ddb-langgraph-checkpoint.html)

### Unidade 03 · Intenção de usuários, JSON estruturado e cancelamento a partir de texto livre

Recomendação da sessão: **B**

- **Opção A · Saídas estruturadas do Bedrock para classificação de intenção**
  - [Structured outputs for Anthropic Claude models on Amazon Bedrock](https://aws.amazon.com/blogs/machine-learning/structured-outputs-for-anthropic-claude-models-on-amazon-bedrock/)
  - [documentação](https://docs.aws.amazon.com/bedrock/latest/userguide/structured-output.html)
- **Opção B · Extração estruturada + validação determinística + aprovação humana (cancelamento)**
  - [Validating multi-agent decisions with Step Functions and Bedrock AgentCore](https://aws.amazon.com/blogs/compute/validating-multi-agent-decisions-with-step-functions-and-bedrock-agentcore/)
  - [human-in-the-loop em fluxos agênticos](https://aws.amazon.com/blogs/machine-learning/human-in-the-loop-constructs-for-agentic-workflows-in-healthcare-and-life-sciences)

### Unidade 04 · Recomendador por preferências, extração, memória em SQLite e resumo/Postgres

Recomendação da sessão: **B**

- **Opção A · Amazon Bedrock AgentCore Memory**
  - [AgentCore long-term memory deep dive](https://aws.amazon.com/blogs/machine-learning/building-smarter-ai-agents-agentcore-long-term-memory-deep-dive)
  - [namespaces em escala](https://aws.amazon.com/blogs/machine-learning/organizing-agents-memory-at-scale-namespace-design-patterns-in-agentcore-memory/)
- **Opção B · Memória em DynamoDB (+ S3) com resumo e direito de apagar**
  - [Build durable AI agents with LangGraph and Amazon DynamoDB](https://aws.amazon.com/blogs/database/build-durable-ai-agents-with-langgraph-and-amazon-dynamodb)

### Unidade 05 · Prompt injection, safeguards, prompt templates e MCP adapters

Recomendação da sessão: **C**

- **Opção A · Guardrails de prompt attack no Bedrock**
  - [Safeguard your generative AI workloads from prompt injections](https://aws.amazon.com/blogs/security/safeguard-your-generative-ai-workloads-from-prompt-injections)
- **Opção B · Defesa em profundidade para agentes (injeção indireta)**
  - [Securing Amazon Bedrock Agents against indirect prompt injections](https://aws.amazon.com/blogs/machine-learning/securing-amazon-bedrock-agents-a-guide-to-safeguarding-against-indirect-prompt-injections)
  - [Input validation and guardrails for agentic AI systems](https://docs.aws.amazon.com/prescriptive-guidance/latest/agentic-ai-security/best-practices-input-validation.html)

### Unidade 06 · Query planner, Cypher generator, executor, correção de queries e respostas analíticas (Neo4j)

Recomendação da sessão: **A, em versão reduzida (equivale a C)**

- **Opção A · Texto→Cypher com Neptune e Bedrock**
  - [Using knowledge graphs to build GraphRAG applications with Amazon Bedrock and Amazon Neptune](https://aws.amazon.com/blogs/database/using-knowledge-graphs-to-build-graphrag-applications-with-amazon-bedrock-and-amazon-neptune/)
- **Opção B · Bedrock Knowledge Bases com GraphRAG (gerenciado)**
  - [Build GraphRAG applications using Amazon Bedrock Knowledge Bases](https://aws.amazon.com/blogs/machine-learning/build-graphrag-applications-using-amazon-bedrock-knowledge-bases)

### Unidade 07 · Modelos multimodais, monitoramento com Langfuse e evaluation tests

Recomendação da sessão: **C**

- **Opção A · Processamento multimodal com Bedrock Data Automation**
  - [Guidance for Multimodal Data Processing Using Amazon Bedrock Data Automation](https://docs.aws.amazon.com/solutions/multimodal-data-processing-using-amazon-bedrock-data-automation/)
- **Opção B · Observabilidade de LLM com Langfuse na AWS**
  - [Transform LLM observability with Langfuse](https://aws.amazon.com/blogs/apn/transform-large-language-model-observability-with-langfuse)
  - [AgentCore Observability com Langfuse](https://aws.amazon.com/blogs/machine-learning/amazon-bedrock-agentcore-observability-with-langfuse)
- **Opção C (sugestão minha) · Extração multimodal com gate de avaliação no CI**
  - [LLM-as-a-judge on Amazon Bedrock Model Evaluation](https://aws.amazon.com/blogs/machine-learning/llm-as-a-judge-on-amazon-bedrock-model-evaluation)
  - [Evaluating quality and reliability in generated outputs](https://docs.aws.amazon.com/prescriptive-guidance/latest/gen-ai-lifecycle-operational-excellence/dev-experimenting-quality.html)

## 03 · Model Context Protocol (MCP)

Detalhes completos: [OPCOES.md no PR #6](https://github.com/MarcosRibeiroJesus/pos-engenharia-ia-aplicada-arquitetura/pull/6).

### Unidade 01 · MCP vs. tools/plugins clássicos

Recomendação da sessão: **não abrir projeto Terraform próprio**

- **01-O1**
  - [Unite MCP servers via AgentCore Gateway](https://aws.amazon.com/blogs/machine-learning/transform-your-mcp-architecture-unite-mcp-servers-through-agentcore-gateway/)
  - [Core concepts do Gateway](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/gateway-core-concepts.html)
- **01-O2**
  - [OAuth no AWS MCP Server](https://aws.amazon.com/blogs/security/introducing-oauth-support-for-aws-mcp-server/)
  - [IAM para MCP gerenciados](https://aws.amazon.com/blogs/security/understanding-iam-for-managed-aws-mcp-servers)
- **01-S (minha)**
  - [Protocol-based tools](https://docs.aws.amazon.com/prescriptive-guidance/latest/agentic-ai-frameworks/protocol-based-tools-detailed.html)
  - [Selecting agentic protocols](https://docs.aws.amazon.com/prescriptive-guidance/latest/agentic-ai-frameworks/selecting-agentic-protocols.html)

### Unidade 02 · Template, arquitetura, MongoDB, tool customizada, filesystem, services como tools

Recomendação da sessão: **02-S**

- **02-O1**
  - [Guidance for Deploying MCP Servers on AWS](https://docs.aws.amazon.com/solutions/deploying-model-context-protocol-servers-on-aws/)
  - [MCP em ECS (Containers Blog)](https://aws.amazon.com/blogs/containers/deploying-model-context-protocol-mcp-servers-on-amazon-ecs/)
- **02-O2**
  - [MCP went stateless](https://aws.amazon.com/blogs/architecture/mcp-went-stateless-is-your-aws-mcp-server-deployment-well-architected)
- **02-O3**
  - [Deploy MCP no AgentCore Runtime](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-mcp.html)
  - [Contrato de protocolo](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-mcp-protocol-contract.html)

### Unidade 03 · Agents e instructions · Skills

Recomendação da sessão: **03-S**

- **03-O1**
  - [Move your agents from PoC to production](https://aws.amazon.com/blogs/machine-learning/move-your-ai-agents-from-proof-of-concept-to-production-with-amazon-bedrock-agentcore)
- **03-O2**
  - [Agent Registry GA (ago/2026)](https://aws.amazon.com/about-aws/whats-new/2026/08/aws-agent-registry-generally-available)

### Unidade 04 · MCP do zero (testes via MCP client, tools, inspeção) · resources e prompts, uso no VS Code

Recomendação da sessão: **04-O3, com o harness da 04-S como camada de testes (que o TDD já exige)**

- **04-O1**
  - [Deploy MCP no AgentCore Runtime](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-mcp.html)
- **04-O3**
  - [MCP went stateless (Architecture Blog)](https://aws.amazon.com/blogs/architecture/mcp-went-stateless-is-your-aws-mcp-server-deployment-well-architected)
  - [Contrato de protocolo do Runtime](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-mcp-protocol-contract.html)

### Unidade 05 · Template e boas práticas · MCP conectando IA a sistemas legados · tools de CRUD de clientes

Recomendação da sessão: **05-S, usando a topologia da 05-O3**

- **05-O1**
  - [Modernize with AgentCore Gateway](https://aws.amazon.com/blogs/migration-and-modernization/modernize-your-applications-using-amazon-bedrock-agentcore-gateway-and-kiro-powers)
- **05-O2**
  - [Modernize ASP.NET com Gateway e Strands](https://aws.amazon.com/blogs/migration-and-modernization/modernize-asp-net-apps-with-bedrock-agentcore-gateway-and-strands-agents/)
- **05-O3**
  - [Conectar API Gateway ao AgentCore Gateway](https://aws.amazon.com/blogs/machine-learning/streamline-ai-agent-tool-interactions-connect-api-gateway-to-agentcore-gateway-with-mcp/)
  - [Enabling AI agents to interact with existing applications](https://aws.amazon.com/blogs/migration-and-modernization/enabling-ai-agents-to-interact-with-existing-applications)
- **05-S (minha)**
  - [Well-Architected Agentic AI Lens](https://docs.aws.amazon.com/wellarchitected/latest/agentic-ai-lens/agentrel06-bp01.html)

### Unidade 06 · RBAC e JWT em Web API · service tokens · rate limiting · service tokens no servidor MCP

Recomendação da sessão: **06-O3, com limitação de taxa por API Gateway/WAF e propagação de identidade da 06-S como ADRs**

- **06-O1**
  - [Rate limits no AgentCore Gateway](https://aws.amazon.com/blogs/machine-learning/configure-rate-limits-for-ai-traffic-on-agentcore-gateway/)
  - [Por que Cedar no AgentCore Policy](https://aws.amazon.com/blogs/security/why-policy-in-amazon-bedrock-agentcore-chose-cedar-for-securing-agentic-workflows/)
  - [Policy GA](https://aws.amazon.com/about-aws/whats-new/2026/03/policy-amazon-bedrock-agentcore-generally-available/)
- **06-O2**
  - [Open Protocols, parte 2: autenticação em MCP](https://aws.amazon.com/blogs/opensource/open-protocols-for-agent-interoperability-part-2-authentication-on-mcp)
  - [Guidance MCP com Cognito](https://docs.aws.amazon.com/solutions/deploying-model-context-protocol-servers-on-aws/)
- **06-O3**
  - [Cognito + Verified Permissions (Security Blog)](https://aws.amazon.com/blogs/security/building-secure-b2c-applications-with-fine-grained-access-control-using-amazon-cognito-and-amazon-verified-permissions/)
  - [Cedar no AgentCore](https://aws.amazon.com/blogs/security/why-policy-in-amazon-bedrock-agentcore-chose-cedar-for-securing-agentic-workflows/)

### Unidade 07 · Publicação em npm e Verdaccio · transports e ideias de servidores

Recomendação da sessão: **07-O1, com a decisão de transporte (stdio via npm × Streamable HTTP remoto) registrada como ADR e a dupla distribuição da 07-O3 como extensã**

- **07-O1**
  - [Package group origin controls](https://docs.aws.amazon.com/codeartifact/latest/ug/package-group-origin-controls.html)
  - [Origin control toolkit (DevOps Blog)](https://aws.amazon.com/blogs/devops/tighten-your-package-security-with-codeartifact-package-origin-control-toolkit)
- **07-O2**
  - [Governing AI assets: MCP Gateway & Registry](https://aws.amazon.com/blogs/opensource/governing-ai-assets-at-scale-with-mcp-gateway-and-registry/)
  - [Agent Registry GA](https://aws.amazon.com/about-aws/whats-new/2026/08/aws-agent-registry-generally-available)
- **07-O3**
  - [MCP deployment patterns on AWS](https://docs.aws.amazon.com/prescriptive-guidance/latest/mcp-deployment-patterns-on-aws/what-is-the-model-context-protocol-mcp.html)
  - [Prescriptive Guidance: protocolos](https://docs.aws.amazon.com/prescriptive-guidance/latest/agentic-ai-frameworks/agentic-protocols.html)

### Unidade 08 · Agente de operações de clientes com Customers MCP Server e LangChain.js

Recomendação da sessão: **08-S**

- **08-O1**
  - [PoC to production com AgentCore](https://aws.amazon.com/blogs/machine-learning/move-your-ai-agents-from-proof-of-concept-to-production-with-amazon-bedrock-agentcore)
  - [Swisscom: suporte e vendas com AgentCore](https://aws.amazon.com/blogs/machine-learning/how-swisscom-builds-enterprise-agentic-ai-for-customer-support-and-sales-using-amazon-bedrock-agentcore)
- **08-O2**
  - [AgentCore Identity em ECS](https://aws.amazon.com/blogs/machine-learning/secure-ai-agents-with-amazon-bedrock-agentcore-identity-on-amazon-ecs/)
- **08-S (minha)**
  - [PoC to production](https://aws.amazon.com/blogs/machine-learning/move-your-ai-agents-from-proof-of-concept-to-production-with-amazon-bedrock-agentcore)

## 04 · Criação de Agentes Autônomos

Detalhes completos: [OPCOES.md no PR #2](https://github.com/MarcosRibeiroJesus/pos-engenharia-ia-aplicada-arquitetura/pull/2).

### Unidade 01 · Agente de código por dentro, context engineering, spec-driven, guardrails, revisor e delegação

Recomendação da sessão: **1A**

- **1A**
  - [Guardrails em workflows de geração de código](https://aws.amazon.com/blogs/machine-learning/best-practices-for-applying-amazon-bedrock-guardrails-to-code-generation-workflows/)
- **1B**
  - [Evaluator reflect-refine loop (Prescriptive Guidance)](https://docs.aws.amazon.com/prescriptive-guidance/latest/agentic-ai-patterns/evaluator-reflect-refine-loop-patterns.html)
  - [Workflow orchestration agents](https://docs.aws.amazon.com/prescriptive-guidance/latest/agentic-ai-patterns/workflow-orchestration-agents.html)

### Unidade 02 · Padrões de raciocínio: Spec Kit, ReAct, plan-and-execute, reflection e benchmark, API que também é agente

Recomendação da sessão: **2A, com o harness de métricas de 2C como camada de teste (sem virar escopo extra)**

- **2A**
  - [Evaluator reflect-refine loop patterns](https://docs.aws.amazon.com/prescriptive-guidance/latest/agentic-ai-patterns/evaluator-reflect-refine-loop-patterns.html)
  - [Agentic AI patterns and workflows](https://docs.aws.amazon.com/prescriptive-guidance/latest/agentic-ai-patterns/introduction.html)
- **2B**
  - [Multi-agent SRE (OpenAPI → MCP com AgentCore Gateway)](https://aws.amazon.com/blogs/machine-learning/build-multi-agent-site-reliability-engineering-assistants-with-amazon-bedrock-agentcore)
- **2C (minha)**
  - [Agent patterns](https://docs.aws.amazon.com/prescriptive-guidance/latest/agentic-ai-patterns/agent-patterns.html)

### Unidade 03 · Integração com banco, incidentes, disponibilidade de provedores externos, agente via MCP

Recomendação da sessão: **3C, com a tool runquery somente leitura de 3A como uma das ferramentas do servidor (DynamoDB no lugar de Aurora, para não ter custo ocioso)**

- **3A**
  - [Bedrock Agents + Aurora via Data API (somente leitura recomendado)](https://aws.amazon.com/blogs/database/connect-amazon-bedrock-agents-with-amazon-aurora-postgresql-using-amazon-rds-data-api/)
  - [Federated data access para agentes (MCP no Aurora, set/2026)](https://aws.amazon.com/blogs/big-data/from-silos-to-insights-federated-data-access-patterns-for-ai-agents/)
- **3B**
  - [Multi-agent SRE com AgentCore (set/2025)](https://aws.amazon.com/blogs/machine-learning/build-multi-agent-site-reliability-engineering-assistants-with-amazon-bedrock-agentcore)
- **3C (minha)**
  - [Optimize applications for scale and reliability on Amazon Bedrock (circuit breaker, CRIS)](https://aws.amazon.com/blogs/machine-learning/optimize-your-applications-for-scale-and-reliability-on-amazon-bedrock/)
  - [Planning for failure: generative AI mais resiliente](https://aws.amazon.com/blogs/publicsector/planning-for-failure-how-to-make-generative-ai-workloads-more-resilient/)

### Unidade 04 · Memória episódica e vector store

Recomendação da sessão: **4C**

- **4A**
  - [Agentes que aprendem com experiência: episodic memory](https://aws.amazon.com/blogs/machine-learning/build-agents-to-learn-from-experiences-using-amazon-bedrock-agentcore-episodic-memory/)
  - [Long-term memory deep dive](https://aws.amazon.com/blogs/machine-learning/building-smarter-ai-agents-agentcore-long-term-memory-deep-dive)
- **4B**
  - [Persistent memory for multi-agent systems with S3 Vectors](https://aws.amazon.com/blogs/storage/building-persistent-memory-for-multi-agent-systems-with-amazon-s3-vectors/)

### Unidade 05 · Contexto como orçamento (medição e sumarização) e context stitching

Recomendação da sessão: **5B**

- **5A**
  - [AGENTPERF03-BP02: otimizar uso da janela de contexto](https://docs.aws.amazon.com/wellarchitected/latest/agentic-ai-lens/agentperf03-bp02.html)
  - [AGENTCOST02-BP02: tokens e prompt engineering](https://docs.aws.amazon.com/wellarchitected/latest/agentic-ai-lens/agentcost02-bp02.html)
  - [SummarizingConversationManager em caso AgentCore](https://aws.amazon.com/blogs/machine-learning/powering-agentic-ai-sales-strategy-with-amazon-bedrock-agentcore/)
- **5B**
  - [Do forecast zero-shot à ordem de compra com AgentCore (token budget por agente)](https://aws.amazon.com/blogs/architecture/from-zero-shot-forecast-to-purchase-order-with-amazon-bedrock-agentcore/)
- **5C (minha)**
  - [AGENTSUS02-BP01](https://docs.aws.amazon.com/wellarchitected/latest/agentic-ai-lens/agentsus02-bp01.html)

### Unidade 06 · LangGraph e fallback de modelo

Recomendação da sessão: **6B**

- **6A**
  - [Guidance for Multi-Agent Orchestration on AWS (inclui LangGraph)](https://aws.amazon.com/solutions/guidance/multi-agent-orchestration-on-aws)
  - [AgentCore com LangGraph](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/supported-frameworks-langgraph.html)
- **6B**
  - [Optimize for scale and reliability on Bedrock](https://aws.amazon.com/blogs/machine-learning/optimize-your-applications-for-scale-and-reliability-on-amazon-bedrock/)
  - [Scaling and throughput best practices](https://docs.aws.amazon.com/bedrock/latest/userguide/scaling-throughput-best-practices.html)
- **6C (minha)**
  - [Compute Blog: "agentes propõem, código determinístico valida"](https://aws.amazon.com/blogs/compute/validating-multi-agent-decisions-with-step-functions-and-bedrock-agentcore/)

### Unidade 07 · Estratégias de observabilidade

Recomendação da sessão: **7C, com a instrumentação OTel de 7A como mecanismo**

- **7A**
  - [Observabilidade do AgentCore com LangGraph](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/supported-frameworks-langgraph.html)
  - [CloudWatch generative AI observability](https://aws.amazon.com/blogs/mt/launching-amazon-cloudwatch-generative-ai-observability-preview)
- **7B**
  - [AgentCore Observability com Langfuse](https://aws.amazon.com/blogs/machine-learning/amazon-bedrock-agentcore-observability-with-langfuse)
- **7C (minha)**
  - [AGENTOPS05-BP01: traços de ponta a ponta para operação de agentes](https://docs.aws.amazon.com/wellarchitected/latest/agentic-ai-lens/agentops05-bp01.html)

### Unidade 08 · War Room, memória do agente, publicação no GitHub Pages

Recomendação da sessão: **8B**

- **8A**
  - [Daimler Truck: SRE multiagente com autocura (AWS for Industries, 2026-10-12 segundo agregador; data a confirmar na página)](https://aws.amazon.com/blogs/industries/automating-incident-resolution-with-a-multi-agent-self-healing-sre-solution-on-aws/)
- **8B**
  - [Compute Blog: validando decisões multiagente com Step Functions](https://aws.amazon.com/blogs/compute/validating-multi-agent-decisions-with-step-functions-and-bedrock-agentcore/)

### Unidade 09 · Multiagentes

Recomendação da sessão: **9C, rodando sobre Step Functions e usando o gate de validação de 9B**

- **9A**
  - [Multi-agent SRE](https://aws.amazon.com/blogs/machine-learning/build-multi-agent-site-reliability-engineering-assistants-with-amazon-bedrock-agentcore)
  - [Multi-agent collaboration (Prescriptive Guidance)](https://docs.aws.amazon.com/prescriptive-guidance/latest/agentic-ai-patterns/multi-agent-collaboration.html)
  - [Guidance for Multi-Agent Orchestration](https://aws.amazon.com/solutions/guidance/multi-agent-orchestration-on-aws)
- **9B**
  - [Compute Blog: validando decisões multiagente](https://aws.amazon.com/blogs/compute/validating-multi-agent-decisions-with-step-functions-and-bedrock-agentcore/)
  - [Saga orchestration patterns](https://docs.aws.amazon.com/prescriptive-guidance/latest/agentic-ai-patterns/saga-orchestration-patterns.html)
- **9C (minha)**
  - [Multi-agent collaboration (Prescriptive Guidance)](https://docs.aws.amazon.com/prescriptive-guidance/latest/agentic-ai-patterns/multi-agent-collaboration.html)

## 05 · Ferramentas de IA para UX e UI

Detalhes completos: [OPCOES.md no PR #5](https://github.com/MarcosRibeiroJesus/pos-engenharia-ia-aplicada-arquitetura/pull/5).

### Unidade 01 — requisitos, fluxos, UX writing, datasets, structured prompts, prompt as code

Recomendação da sessão: **1A**

- **Opção 1A · Registro de prompts com gate de avaliação (prompt as code)**
  - [AWS Prescriptive Guidance — Prompt, agent, and model lifecycle management](https://docs.aws.amazon.com/prescriptive-guidance/latest/agentic-ai-serverless/prompt-agent-and-model.html)
  - [Well-Architected Agentic AI Lens, AGENTOPS02-BP01](https://docs.aws.amazon.com/wellarchitected/latest/agentic-ai-lens/agentops02-bp01.html)
- **Opção 1B · Fábrica de datasets sintéticos em lote**
  - [Bedrock — Create a batch inference job](https://docs.aws.amazon.com/bedrock/latest/userguide/batch-inference-create.html)
  - [AWS ML Blog — Classify call center conversations with Amazon Bedrock batch inference](https://aws.amazon.com/blogs/machine-learning/classify-call-center-conversations-with-amazon-bedrock-batch-inference)
  - [What's New — batch para Claude Sonnet 4](https://aws.amazon.com/about-aws/whats-new/2025/08/amazon-bedrock-batch-inference-anthropic-claude-sonnet-4-openai-gpt-oss-models/)
- **Opção 1C · Pipeline de UX writing e localização com guardas de marca**
  - [Amazon Translate — Custom terminology](https://docs.aws.amazon.com/translate/latest/dg/how-custom-terminology.html)
  - [AWS ML Blog — How TransPerfect improved translation quality using Amazon Bedrock](https://aws.amazon.com/blogs/machine-learning/how-transperfect-improved-translation-quality-and-efficiency-using-amazon-bedrock/)
- **Opção 1D · (sugestão minha) Gate de requisitos com handoff humano**
  - [Step Functions — Wait for a callback with task token](https://docs.aws.amazon.com/step-functions/latest/dg/connect-to-resource.html)

### Unidade 02 — Angular e MCP, tokens, componentes acessíveis, Stitch, Figma, correção de interface com IA

Recomendação da sessão: **2B**

- **Opção 2A · Tokens como contrato: pipeline de publicação**
  - [AWS Architecture Blog — Micro-frontend Architectures on AWS](https://aws.amazon.com/blogs/architecture/micro-frontend-architectures-on-aws)
  - [AWS Prescriptive Guidance — Understanding and implementing micro-frontends on AWS](https://docs.aws.amazon.com/prescriptive-guidance/latest/micro-frontends-aws/introduction.html)
- **Opção 2B · Remediação de acessibilidade com revisão humana**
  - [AWS ML Blog — Build a generative AI image description application with Claude 3.5 Sonnet on Amazon Bedrock and AWS CDK](https://aws.amazon.com/blogs/machine-learning/build-a-generative-ai-image-description-application-with-anthropics-claude-3-5-sonnet-on-amazon-bedrock-and-aws-cdk)
- **Opção 2C · (sugestão minha) Agente de correção de UI com ferramentas mínimas**
  - [Pattern 2: Agentic AI orchestration with Amazon Bedrock](https://docs.aws.amazon.com/prescriptive-guidance/latest/agentic-ai-serverless/pattern-agentic-ai-orchestration.html)

### Unidade 03 — Nx monorepo e MCP, OpenSpec, orquestração paralela, code review, Google Jules

Recomendação da sessão: **3B**

- **Opção 3A · CI de monorepo "afetado" com Claude Code em CI**
  - [AWS Prescriptive Guidance — Automatically detect changes and initiate different CodePipeline pipelines for a monorepo in CodeCommit](https://docs.aws.amazon.com/prescriptive-guidance/latest/patterns/automatically-detect-changes-and-initiate-different-codepipeline-pipelines-for-a-monorepo-in-codecommit.html)
  - [AWS DevOps Blog — Integrate GitHub monorepo with AWS CodePipeline](https://aws.amazon.com/blogs/devops/integrate-github-monorepo-with-aws-codepipeline-to-run-project-specific-ci-cd-pipelines)
- **Opção 3B · Revisão de PR paralela com coordenador e subagentes**
  - [AWS China Blog — GenAI practice of the Pacvue R&D team](https://aws.amazon.com/cn/blogs/china/genai-practice-of-pacvue-rd-and-operation-team)
  - [AWS ML Blog — Enhance code review and approval efficiency with generative AI using Amazon Bedrock](https://aws.amazon.com/blogs/machine-learning/enhance-code-review-and-approval-efficiency-with-generative-ai-using-amazon-bedrock)
  - [AWS Public Sector Blog — SoftwareOne](https://aws.amazon.com/blogs/publicsector/softwareone-boosts-developer-efficiency-and-streamlines-code-reviews-using-amazon-bedrock)
- **Opção 3C · (sugestão minha) Pipeline spec-driven com agentes paralelos e gates**
  - [Step Functions — callback com task token](https://docs.aws.amazon.com/step-functions/latest/dg/connect-to-resource.html)
  - [Pattern 2 do Prescriptive Guidance](https://docs.aws.amazon.com/prescriptive-guidance/latest/agentic-ai-serverless/pattern-agentic-ai-orchestration.html)

### Unidade 04 — QA com Nx e Cypress, asserções semânticas, agente de QA com Playwright MCP

Recomendação da sessão: **4B, com o contrato de saída da 4C**

- **Opção 4A · QA agêntico em browser gerenciado**
  - [AWS ML Blog — Agentic QA automation using Amazon Bedrock AgentCore Browser and Amazon Nova Act](https://aws.amazon.com/blogs/machine-learning/agentic-qa-automation-using-amazon-bedrock-agentcore-browser-and-amazon-nova-act)
  - [AWS ML Blog — Building intent-driven UI testing with Amazon Nova Act](https://aws.amazon.com/blogs/machine-learning/building-intent-driven-ui-testing-with-amazon-nova-act/)
- **Opção 4B · Validação de conteúdo "última milha" com juiz visual**
  - [AWS ML Blog — How an AWS team detects dashboard content failures at scale using Amazon Bedrock](https://aws.amazon.com/blogs/machine-learning/how-an-aws-team-detects-dashboard-content-failures-at-scale-using-amazon-bedrock/)
- **Opção 4C · (sugestão minha) Serviço de asserção semântica para Cypress/Playwright**
  - [Bedrock — structured outputs](https://docs.aws.amazon.com/bedrock/latest/userguide/structured-output.html)

### Unidade 05 — Genkit (flows, Zod, Google AI), design system, micro-BFF, encerramento

Recomendação da sessão: **5A, com os controles da 5D como ADRs**

- **Opção 5A · BFF orientado a eventos (REST ou GraphQL) com flows de IA tipados**
  - [AWS Front-End Web & Mobile Blog — Backends for Frontends pattern](https://aws.amazon.com/blogs/mobile/backends-for-frontends-pattern)
  - [Prescriptive Guidance — API integration: Backend for frontend](https://docs.aws.amazon.com/prescriptive-guidance/latest/micro-frontends-aws/api-integration-data-fetching.html)
- **Opção 5B · Interface generativa com protocolo AG-UI**
  - [AWS Architecture Blog — Build adaptive AI interfaces with the AG-UI protocol, agent swarms, and Nova Act on AWS](https://aws.amazon.com/blogs/architecture/build-adaptive-ai-interfaces-with-the-ag-ui-protocol-agent-swarms-and-nova-act-on-aws)
  - [AWS ML Blog — Build generative UI for AI agents on Amazon Bedrock AgentCore with the AG-UI protocol](https://aws.amazon.com/blogs/machine-learning/build-generative-ui-for-ai-agents-on-amazon-bedrock-agentcore-with-the-ag-ui-protocol/)
- **Opção 5C · Design system como produto em plataforma de micro-frontends**
  - [AWS Architecture Blog — Micro-frontend Architectures on AWS](https://aws.amazon.com/blogs/architecture/micro-frontend-architectures-on-aws)
  - [Prescriptive Guidance — micro-frontends on AWS](https://docs.aws.amazon.com/prescriptive-guidance/latest/micro-frontends-aws/introduction.html)
  - [padrão Amplify + Angular + Module Federation](https://docs.aws.amazon.com/prescriptive-guidance/latest/patterns/create-amplify-micro-frontend-portal.html)
- **Opção 5D · (sugestão minha) Micro-BFF multi-tenant com cota de tokens e degradação controlada**
  - [Prescriptive Guidance — Focus area 3: architect for multi-tenancy and control](https://docs.aws.amazon.com/prescriptive-guidance/latest/strategy-operationalizing-agentic-ai/focus-areas-multitenancy.html)

## 06 · Ferramentas de IA para DevOps

Detalhes completos: [OPCOES.md no PR #3](https://github.com/MarcosRibeiroJesus/pos-engenharia-ia-aplicada-arquitetura/pull/3).

### Grupo A · Unidades 01 + 02 — Automação → agente; IaC gerado, auditado e com self-healing

Recomendação da sessão: **A3**

- **A1 · Pipeline de IaC com gate de política e resumo do plano por LLM (base AWS)**
  - [Gerir políticas do AWS Organizations como código com CodePipeline e Bedrock](https://docs.aws.amazon.com/prescriptive-guidance/latest/patterns/manage-organizations-policies-as-code.html)
  - [checkov centralizado](https://docs.aws.amazon.com/prescriptive-guidance/latest/patterns/centralized-custom-checkov-scanning.html)
  - [CI/CD para validar Terraform](https://docs.aws.amazon.com/prescriptive-guidance/latest/patterns/create-a-ci-cd-pipeline-to-validate-terraform-configurations-by-using-aws-codepipeline.html)
- **A2 · Auditoria de conformidade com agente + AWS Config (base AWS)**
  - [Gerenciamento de conformidade EC2 com agentes Bedrock e AWS Config](https://docs.aws.amazon.com/prescriptive-guidance/latest/patterns/streamline-amazon-ec2-compliance-management-with-amazon-bedrock-agents-and-aws-config.html)
- **A3 · Minha sugestão: "Terraform Doctor", agente que gera, audita e corrige IaC com gates (próprio)**
  - [padrões de workflow de orquestração](https://docs.aws.amazon.com/prescriptive-guidance/latest/agentic-ai-patterns/workflow-orchestration-agents.html)

### Grupo B · Unidade 03 — Orquestração e SRE assistida

Recomendação da sessão: **B1, com o catálogo de ações de B3 dentro**

- **B1 · Fluxo de incidente em Step Functions com agente e gate humano (base AWS)**
  - [Agentes de orquestração de workflow](https://docs.aws.amazon.com/prescriptive-guidance/latest/agentic-ai-patterns/workflow-orchestration-agents.html)
  - [padrão de orquestração agêntica com Bedrock](https://docs.aws.amazon.com/prescriptive-guidance/latest/agentic-ai-serverless/pattern-agentic-ai-orchestration.html)
- **B2 · Coordenador + subagentes especialistas (base AWS)**
  - [Multi-agent collaboration](https://docs.aws.amazon.com/prescriptive-guidance/latest/agentic-ai-patterns/multi-agent-collaboration.html)

### Grupo C · Unidades 04 + 05 — Reduzir MTTR; observabilidade preditiva

Recomendação da sessão: **C1 + o conjunto de avaliação de C3 (escopo único)**

- **C1 · Investigação automática a partir de alarme (base AWS)**
  - [CloudWatch investigations](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/Investigations.html)
  - [Alarm Context Tool](https://aws.amazon.com/blogs/mt/alarm-context-tool)
  - [Q Developer operational investigations](https://aws.amazon.com/blogs/aws/investigate-and-remediate-operational-issues-with-amazon-q-developer)
  - [AWS DevOps Agent](https://docs.aws.amazon.com/devopsagent/latest/userguide/about-aws-devops-agent.html)
  - [boas práticas em produção](https://aws.amazon.com/blogs/devops/best-practices-for-deploying-aws-devops-agent-in-production)
- **C2 · RCA por webhook de ferramenta externa (base AWS)**
  - [Reduzir MTTR com RCA por IA, DevOps Agent e Splunk](https://aws.amazon.com/blogs/mt/reduce-mttr-with-ai-driven-rca-using-aws-devops-agent-and-splunk/)
- **C3 · Minha sugestão: detecção preditiva calibrada + investigação, com avaliação (próprio)**
  - [blog de monitoramento de apps de IA generativa](https://aws.amazon.com/blogs/mt/monitoring-generative-ai-applications-using-amazon-bedrock-and-amazon-cloudwatch-integration)
  - [anomalias em logs do Session Manager com Bedrock](https://aws.amazon.com/blogs/mt/ai-powered-anomaly-detection-for-aws-systems-manager-session-manager-logs-using-amazon-bedrock/)

### Grupo D · Unidades 06 + 12 — IA com segurança no Slack/Teams; bot full-stack

Recomendação da sessão: **D3 sobre a base de D1**

- **D1 · Slack com agente em AgentCore, filas e verificação de assinatura (base AWS)**
  - [Integrando Bedrock AgentCore com Slack](https://aws.amazon.com/blogs/machine-learning/integrating-amazon-bedrock-agentcore-with-slack)
  - [Integrar Bedrock Agents com Slack](https://aws.amazon.com/blogs/machine-learning/integrate-amazon-bedrock-agents-with-slack)
- **D2 · Slack/Teams via AWS Chatbot com Bedrock Agents (base AWS)**
  - [AWS Chatbot e agentes Bedrock em Teams e Slack (2024)](https://aws.amazon.com/de/about-aws/whats-new/2024/09/aws-chatbot-amazon-bedrock-agent-microsoft-teams-slack/)

### Grupo E · Unidade 07 — Priorização de vulnerabilidades

Recomendação da sessão: **E3 alimentado por achados no formato de E1**

- **E1 · Exposure findings do Security Hub + contexto (base AWS)**
  - [Priorizar riscos com exposure findings do Security Hub](https://aws.amazon.com/blogs/security/how-to-prioritize-security-risks-using-aws-security-hub-exposure-findings/)
  - [AI vulnerability harness, parte 1](https://aws.amazon.com/blogs/security/building-your-ai-vulnerability-harness-part-1/)
- **E2 · CVE no pipeline com PR de correção gerado (base AWS)**
  - [IA generativa para remediação de CVE em CI](https://aws.amazon.com/blogs/containers/applying-generative-ai-to-cve-remediation-early-vulnerability-patching-in-continuous-integration-pipelines)

### Grupo F · Unidade 08 — Eficiência no ciclo de entrega (4 partes)

Recomendação da sessão: **F2, absorvendo F1 como "versão sem Claude Code" e F3 como o passo de revisão independente**

- **F1 · Revisão de PR com Bedrock disparada por CodeBuild (base AWS)**
  - [Revisão e aprovação de código com IA generativa no Bedrock](https://aws.amazon.com/blogs/machine-learning/enhance-code-review-and-approval-efficiency-with-generative-ai-using-amazon-bedrock)
  - [revisão automática de PR com CodeCommit e CodeBuild](https://aws.amazon.com/blogs/devops/automated-code-review-on-pull-requests-using-aws-codecommit-and-aws-codebuild)
- **F2 · Claude Code headless no GitHub Actions com OIDC e Bedrock (próprio, alinhado à prova)**
  - [OIDC/IAM](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_providers_create_oidc.html)

### Grupo G · Unidade 09 — FinOps com IA (2 partes)

Recomendação da sessão: **G3 + G1 em versão enxuta**

- **G1 · Agente de custo sobre Cost Explorer e Anomaly Detection (base AWS)**
  - [AWS FinOps Agent, FAQ](https://aws.amazon.com/finops-agent/faqs/)
  - [MCP servers com Bedrock Agents (exemplo com Cost Explorer)](https://aws.amazon.com/blogs/machine-learning/harness-the-power-of-mcp-servers-with-amazon-bedrock-agents)
- **G2 · Custo do próprio uso de IA (base AWS)**
  - [Monitoramento de apps de IA generativa com Bedrock e CloudWatch](https://aws.amazon.com/blogs/mt/monitoring-generative-ai-applications-using-amazon-bedrock-and-amazon-cloudwatch-integration)

### Grupo H · Unidades 10 + 11 — Conhecimento vivo, auto-remediação e segurança operacional

Recomendação da sessão: **H3 sobre H2**

- **H1 · Agente de operações com runbooks em Knowledge Base e Systems Manager (base AWS)**
  - [Automações para remediar controles do Security Hub com Bedrock e Systems Manager](https://aws.amazon.com/blogs/machine-learning/building-automations-to-accelerate-remediation-of-aws-security-hub-control-findings-using-amazon-bedrock-and-aws-systems-manager)
  - [Automatizar operações de TI com Bedrock Agents](https://aws.amazon.com/blogs/machine-learning/automate-it-operations-with-amazon-bedrock-agents/)
- **H2 · Alarme → EventBridge → SSM Automation com gate e verificação (base AWS)**
  - [EventBridge para rodar SSM Automation em resposta a alarmes](https://aws.amazon.com/blogs/mt/use-amazon-eventbridge-rules-to-run-aws-systems-manager-automation-in-response-to-cloudwatch-alarms)
  - [ações de runbook sugeridas pelas investigações do CloudWatch](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/suggested-investigation-actions.html)
- **H3 · Minha sugestão: "knowledge loop" com pós-mortem estruturado alimentando a base (próprio, com apoio no Well-Architected)**
  - [Well-Architected Agentic AI Lens, AGENTOPS07-BP02](https://docs.aws.amazon.com/wellarchitected/latest/agentic-ai-lens/agentops07-bp02.html)
  - [Guidance for Agentic Live Ops](https://docs.aws.amazon.com/solutions/agentic-live-ops-on-aws/)

### Grupo I · Unidade 13 — Docker, Kubernetes local (Minikube), LocalStack, Streamlit, Ollama, IA em DevOps (3 partes)

Recomendação da sessão: **I2, com I3 só como teste final opcional**

- **I1 · LLM no EKS com vLLM (base AWS)**
  - [Servir LLM no EKS](https://docs.aws.amazon.com/eks/latest/userguide/ml-inference-load-serve-model.html)
  - [vLLM Deep Learning Containers no EKS](https://aws.amazon.com/ko/blogs/architecture/deploy-llms-on-amazon-eks-using-vllm-deep-learning-containers/)
- **I3 · Versão enxuta do I1: EKS Auto Mode ou ECS com CPU e modelo pequeno (própria, sobre base AWS)**
  - [Servir LLM no EKS](https://docs.aws.amazon.com/eks/latest/userguide/ml-inference-load-serve-model.html)

## 07 · Ferramentas de IA para Gestão de projetos

Detalhes completos: [OPCOES.md no PR #4](https://github.com/MarcosRibeiroJesus/pos-engenharia-ia-aplicada-arquitetura/pull/4).

### Unidade 01 · Planejamento e escopo (aulas pt 1 a 3)

Recomendação da sessão: **01-A**

- **01-A (recomendada) · Decompositor de escopo com gate humano**
  - [Agentic AI patterns and workflows](https://docs.aws.amazon.com/prescriptive-guidance/latest/agentic-ai-patterns/introduction.html)
  - [Agentic workflow patterns](https://docs.aws.amazon.com/prescriptive-guidance/latest/agentic-ai-patterns/agentic-workflow-patterns.html)
  - [Generative AI use cases for project management](https://docs.aws.amazon.com/prescriptive-guidance/latest/strategy-accelerate-software-dev-lifecycle-gen-ai/generative-ai-capabilities-proj-mgmt.html)
  - [Step Functions](https://docs.aws.amazon.com/step-functions/latest/dg/connect-to-resource.html)
- **01-B · Ingestão de SOW/RFP com extração estruturada**
  - [Guidance for Multimodal Data Processing Using Amazon Bedrock Data Automation](https://docs.aws.amazon.com/solutions/multimodal-data-processing-using-amazon-bedrock-data-automation/)
  - [IDP at scale with generative AI and BDA](https://aws.amazon.com/blogs/machine-learning/intelligent-document-processing-at-scale-with-generative-ai-and-amazon-bedrock-data-automation/)
- **01-C (sugestão minha) · Agente de "grooming" que faz perguntas antes de planejar**
  - [AI-SDLC on Bedrock AgentCore](https://aws.amazon.com/blogs/industries/reinventing-software-delivery-with-ai-sdlc-on-amazon-bedrock-agentcore/)

### Unidade 02 · Priorização de backlog (aulas pt 1 a 3)

Recomendação da sessão: **02-A, absorvendo a ideia de 02-C (a fórmula fica no código; o Claude extrai fatores e explica)**

- **02-A (recomendada) · Triagem e ranking com critérios explícitos e calibração**
  - [Generative AI use cases for project management](https://docs.aws.amazon.com/prescriptive-guidance/latest/strategy-accelerate-software-dev-lifecycle-gen-ai/generative-ai-capabilities-proj-mgmt.html)
  - [Bedrock batch orchestration with Step Functions](https://aws.amazon.com/blogs/machine-learning/build-a-serverless-amazon-bedrock-batch-job-orchestration-workflow-using-aws-step-functions/)
  - [doc](https://docs.aws.amazon.com/bedrock/latest/userguide/structured-output.html)
- **02-B · Grooming agent sobre tickets reais (Jira/GitHub Issues)**
  - [AI-SDLC on Bedrock AgentCore](https://aws.amazon.com/blogs/industries/reinventing-software-delivery-with-ai-sdlc-on-amazon-bedrock-agentcore/)

### Unidades 03 e 04 · Cronograma/capacidade/alocação e estimativas/previsões (agrupadas; aulas 03 pt 1–2, 04 pt 1–2)

Recomendação da sessão: **03-C**

- **03-A · Forecast com modelo de série temporal (Chronos-Bolt/AutoGluon) + Claude narrador**
  - [Chronos-Bolt e AutoGluon](https://aws.amazon.com/blogs/machine-learning/fast-and-accurate-zero-shot-forecasting-with-chronos-bolt-and-autogluon/)
  - [AutoGluon-TimeSeries](https://aws.amazon.com/blogs/machine-learning/easy-and-accurate-forecasting-with-autogluon-timeseries/)
- **03-B · Agente de capacidade com tools sobre calendário, alocação e férias**
  - [Agentic workflow patterns](https://docs.aws.amazon.com/prescriptive-guidance/latest/agentic-ai-patterns/agentic-workflow-patterns.html)
  - [Generative AI use cases for project management](https://docs.aws.amazon.com/prescriptive-guidance/latest/strategy-accelerate-software-dev-lifecycle-gen-ai/generative-ai-capabilities-proj-mgmt.html)
- **03-C (recomendada, sugestão minha) · Forecast estatístico (Monte Carlo) + Claude extrator e narrador**
  - [blog](https://aws.amazon.com/blogs/machine-learning/easy-and-accurate-forecasting-with-autogluon-timeseries/)

### Unidade 05 · Riscos e AIOps de projeto (aulas pt 1 e 2)

Recomendação da sessão: **05-C, consumindo as pontuações de 05-A como entrada**

- **05-A · Registro de riscos contínuo com baseline por projeto**
  - [Build intelligent security for healthcare APIs with Amazon Bedrock](https://aws.amazon.com/blogs/machine-learning/build-intelligent-security-for-healthcare-apis-with-amazon-bedrock/)
  - [CloudWatch anomaly detection](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch_Anomaly_Detection.html)
- **05-B · Telemetria de entrega com alarmes e resumo**
  - [CloudWatch anomaly detection](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch_Anomaly_Detection.html)
- **05-C (recomendada, sugestão minha) · Motor de escalonamento de riscos (Claude classifica, política decide)**
  - [Step Functions](https://docs.aws.amazon.com/step-functions/latest/dg/connect-to-resource.html)
  - [Orchestrating a security incident response](https://aws.amazon.com/blogs/compute/orchestrating-a-security-incident-response-with-aws-step-functions/)

### Unidades 06 e 07 · Reuniões e status reports/executive summaries (agrupadas; aulas 06 pt 1–2, 07 pt 1–2)

Recomendação da sessão: **06-C, construída em duas fases: (1) extração da ata, que é o núcleo do domínio 4 e o encaixe mais claro com a prova; (2) relatório em lote +**

- **06-A · Ata e ações a partir de áudio/transcrição**
  - [Meeting summarization and action item extraction with Amazon Nova](https://aws.amazon.com/blogs/machine-learning/meeting-summarization-and-action-item-extraction-with-amazon-nova/)
  - [Build an AI-powered summarization system with Bedrock and Transcribe using Terraform](https://aws.amazon.com/blogs/machine-learning/build-an-ai-powered-automated-summarization-system-with-amazon-bedrock-and-amazon-transcribe-using-terraform/)
  - [Guidance for Live Meeting Assistant on AWS](https://docs.aws.amazon.com/solutions/live-meeting-assistant-on-aws/)
- **06-B · Relatórios de status em lote (batch)**
  - [Orchestrating large-scale document processing with Step Functions and Bedrock batch inference](https://aws.amazon.com/blogs/compute/orchestrating-large-scale-document-processing-with-aws-step-functions-and-amazon-bedrock-batch-inference/)
  - [Bedrock batch orchestration workflow](https://aws.amazon.com/blogs/machine-learning/build-a-serverless-amazon-bedrock-batch-job-orchestration-workflow-using-aws-step-functions/)
  - [doc de batch](https://docs.aws.amazon.com/bedrock/latest/userguide/batch-inference.html)
- **06-C (recomendada, sugestão minha) · Pipeline integrado: ata → status → resumo executivo, com aprovação antes de enviar**
  - [Generative BI with Quick Sight](https://docs.aws.amazon.com/quick/latest/userguide/quicksight-gen-bi.html)

### Unidade 08 · Governança, compliance e qualidade (aulas pt 1 e 2)

Recomendação da sessão: **08-C**

- **08-A · Verificação de artefatos contra política com Guardrails e Automated Reasoning**
  - [Automated Reasoning checks in Bedrock Guardrails](https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails-automated-reasoning-checks.html)
- **08-B · Evidência de conformidade e trilha de auditoria**
  - [Achieve operational excellence with well-architected generative AI solutions using Amazon Bedrock](https://aws.amazon.com/blogs/machine-learning/achieve-operational-excellence-with-well-architected-generative-ai-solutions-using-amazon-bedrock/)
- **08-C (recomendada, sugestão minha) · Gate de qualidade com Claude Code em CI + trilha de auditoria**
  - [Well-architected generative AI](https://aws.amazon.com/blogs/machine-learning/achieve-operational-excellence-with-well-architected-generative-ai-solutions-using-amazon-bedrock/)

### Unidade 09 · Automação de boards e comunicação (aulas pt 1 e 2)

Recomendação da sessão: **09-C**

- **09-A · Agente no Slack/Teams que lê e atualiza o board**
  - [Integrate Amazon Bedrock Agents with Slack](https://aws.amazon.com/blogs/machine-learning/integrate-amazon-bedrock-agents-with-slack/)
  - [Q Developer in chat applications com Bedrock Agents](https://docs.aws.amazon.com/chatbot/latest/adminguide/connect-bedrock-agents.html)
- **09-C (recomendada, sugestão minha) · Camada de tools do board com contrato MCP e agente com validação de escrita**
  - [Integrate Bedrock Agents with Slack](https://aws.amazon.com/blogs/machine-learning/integrate-amazon-bedrock-agents-with-slack/)

### Unidade 10 · Portfólio e OKRs (aulas pt 1 a 3)

Recomendação da sessão: **10-C, usando a camada de dados de 10-A (sem QuickSight)**

- **10-A · Dados de portfólio no data lake + BI generativo**
  - [Generative BI with Quick Sight](https://docs.aws.amazon.com/quick/latest/userguide/quicksight-gen-bi.html)
  - [Amazon Q Business e QuickSight](https://aws.amazon.com/blogs/machine-learning/amazon-q-business-and-amazon-q-in-quicksight-empowers-employees-to-be-more-data-driven-and-make-better-faster-decisions-using-company-knowledge/)
- **10-C (recomendada, sugestão minha) · Consolidação multiagente de OKRs com proveniência**
  - [Agentic AI patterns and workflows](https://docs.aws.amazon.com/prescriptive-guidance/latest/agentic-ai-patterns/introduction.html)
