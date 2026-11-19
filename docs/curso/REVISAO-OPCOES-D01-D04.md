# Revisão das opções de arquitetura · disciplinas 01 a 04

Data: 2026-11-18. Base: os resumos próprios das aulas, as legendas e os PDFs das disciplinas (materiais fora do repositório), comparados com os `OPCOES.md` de cada disciplina (branches `modulo/NN-slug/opcoes`). Os `OPCOES.md` foram escritos só a partir dos títulos das unidades; esta revisão confere cada premissa com o conteúdo real e responde às listas "Confirmar".

Legenda: ✅ mantida · ✏️ mantida com ajuste · ❌ premissa errada, substituída.

## Veredito por disciplina

| Disc. | Veredito | O que muda |
|---|---|---|
| 01 · Fundamentos de IA e LLMs | ✏️ 7 de 8 unidades fiéis; **unidade 04 tinha premissa errada** | A unidade 04 ensina detecção de objetos (YOLO em TensorFlow.js, inferência num Web Worker) para jogar sozinho um jogo de tiro no navegador, e não aprendizado por reforço. As opções D2/D2+ (ViZDoom + PPO) saem; entram opções de visão computacional (abaixo) |
| 02 · APIs de IA generativa | ✅ todas as unidades conferem | Só ajustes de ADR (bancos usados na aula × bancos propostos) |
| 03 · MCP | ✏️ unidades conferem; **sua decisão redefine o projeto** | As unidades 04 a 08 viram um único produto: **MCP de regras de negócio de um produto bancário** (opções abaixo). Os itens "Confirmar" foram respondidos |
| 04 · Agentes autônomos | ✅ todas as unidades conferem | A disciplina constrói um único produto (um agente de plantão de incidentes) unidade a unidade; proponho o mesmo formato "um produto, várias camadas" na arquitetura AWS |

## Disciplina 01

| Unid. | Tema real (resumo próprio) | Recomendação anterior | Veredito |
|---|---|---|---|
| 02 | ML, DL, redes neurais, Teachable Machine | 02-S triagem com gate de confiança | ✅ |
| 03 | Sistemas de recomendação | (seu exemplo-01, PR #1) | ✅ |
| 04 | Visão computacional num jogo do navegador: YOLO convertido para TF.js, worker com inferência, pós-processamento por confiança e classe, mira e disparo | D2+ treino RL em Spot | ❌ ver abaixo |
| 05 | Algoritmos genéticos; como LLMs funcionam; Web AI (Prompt API, multimodal no navegador) | 05-A inferência híbrida | ✏️ a 05-S (evolução de prompts por algoritmo genético) fica mais fiel, porque a unidade abre com algoritmos genéticos; sugiro trocar a recomendação para 05-S ou fazer 05-A + 05-S |
| 06 | Prompts em blocos, JSON e TOON | 06-B extração JSON × TOON | ✅ fiel |
| 07 | Editores com IA e riscos; agentes e decisões em etapas | 07-A loop com gates | ✅ (07-B continua a melhor para cobrir o domínio 3) |
| 08 | MCP: Playwright para testes, navegação, documentação atualizada, telemetria com Grafana | 08-C MCP de telemetria somente leitura | ✅ fiel |
| 09 | Modelos abertos × fechados, Ollama, OpenRouter | 09-C roteador por sensibilidade | ✅ |
| 10 | RAG, embeddings, projeto com Neo4j | 10-C RAG com proveniência em S3 Vectors | ✏️ a aula usa Neo4j como grafo e índice vetorial; trocar por S3 Vectors exige ADR explícito (ou manter Neo4j em contêiner sob demanda) |

### Unidade 04 revisada · visão computacional (o projeto de IA aplicada continua sendo Doom)

Fiel à aula: o Doom roda no navegador (WebAssembly), um detector YOLO em TF.js num Web Worker encontra os inimigos e a página mira e dispara. O passo que a própria aula propõe como desafio é estender o YOLO para classes novas, o que aqui significa treinar o detector com quadros do Doom, já que as classes padrão não incluem os inimigos do jogo.

| Opção | O que constrói | Serviços AWS | Componente Claude (prova) | Fonte oficial |
|---|---|---|---|---|
| **V1** · Pipeline de fine-tuning de YOLO com rotulagem | Quadros do jogo em S3 → rotulagem de caixas (Ground Truth) → fine-tuning em SageMaker Training com Spot → avaliação (mAP por classe) → exportação para TF.js → CloudFront serve o modelo para a demo | S3, SageMaker Ground Truth, SageMaker Training (Spot), Model Registry, Step Functions, CloudFront | Revisor de promoção: lê as métricas e emite parecer estruturado; o gate numérico decide, e o caso duvidoso vai para humano (1.4, 4.3, 4.4, 5.5) | [Fine-tune YOLOv8 com SageMaker](https://aws.amazon.com/blogs/machine-learning/train-optimize-and-deploy-models-on-edge-devices-using-amazon-sagemaker-and-qualcomm-ai-hub) · [Rotulagem para YOLO no Ground Truth](https://aws.amazon.com/blogs/machine-learning/streamlining-data-labeling-for-yolo-object-detection-in-amazon-sagemaker-ground-truth) |
| V2 · Pipeline de imagens e treino com busca de dados | Catálogo de quadros com metadados, seleção dos quadros úteis, job de rotulagem e treino por transfer learning | S3, Glue/Athena, Ground Truth, SageMaker | Seleção de quadros explicada por Claude (fraco para a prova) | [Field Notes: pipeline de imagens e treino](https://aws.amazon.com/blogs/architecture/field-notes-building-an-automated-image-processing-and-model-training-pipeline-for-autonomous-driving) |
| **V3** (minha) · Pré-rotulagem com Claude e revisão humana por confiança | Claude (visão) propõe rótulos por quadro via `tool_use` com schema (classe, caixa aproximada, confiança); validador descarta caixas impossíveis; baixa confiança vai para fila de revisão humana; o conjunto revisado treina o YOLO da V1 | V1 + Bedrock (ou API da Anthropic), SQS, DynamoDB | 4.3, 4.4, 4.5 (lote), 5.5 (calibração por amostra), 5.6 | Desenho meu sobre as fontes da V1. Precisão de caixas do Claude é hipótese a medir, não premissa |

**Recomendação: V1 com o revisor de promoção, e V3 como experimento medido.** Por quê: o que a unidade ensina é inferência no cliente; o que falta para virar produto é o ciclo de dados (rotular, treinar, avaliar, publicar o modelo). A inferência continua no navegador, então o custo de produção é só CDN. Floci: S3, Step Functions e CloudFront cobertos; SageMaker e Ground Truth precisam ser confirmados no `floci aws services` (se faltarem, o treino roda em contêiner local com ADR).

## Disciplina 02

Todas as unidades conferem com as recomendações (C, C, B, B, C, A reduzida, C). Ajustes:

- **Unidade 03**: a aula usa marcação e cancelamento de consultas médicas. Se quiser o tema bancário, a mesma arquitetura (extração estruturada → gate determinístico → aprovação humana) serve para **cancelar um agendamento de pagamento** a partir de texto livre, com dados sintéticos.
- **Unidade 04**: a aula combina SQLite e Postgres para memória; a recomendação B troca por DynamoDB. Manter com ADR (custo ocioso zero × fidelidade).
- **Unidade 05**: a aula ataca via servidor MCP de sistema de arquivos; o harness de red team (C) deve incluir injeção indireta por conteúdo de arquivo.
- **Unidade 06**: a aula usa Neo4j; a recomendação A reduzida já mantém o grafo em contêiner. ✅

## Disciplina 03 · MCP de regras de negócio de um produto bancário

### O que as aulas confirmaram (itens "Confirmar")

- O legado é uma API REST de clientes com banco próprio. O servidor MCP é organizado em camadas e não converte cada rota REST numa tool.
- Segurança: JWT com dois papéis (leitura e administração); o cargo vem sempre do servidor. Service tokens sem expiração, revogáveis. Limite de requisições por token, com IP quando não há token. A aula sugere combinar IP e token.
- O servidor MCP devolve três tipos de erro (token inválido, acesso negado, limite excedido) como conteúdo estruturado com a flag de erro. É a tarefa 2.2 da prova.
- Distribuição por npm público e registry privado (Verdaccio); transporte padrão STDIO, com HTTP e SSE apresentados. Isso indica a versão do protocolo anterior à revisão sem estado de 2026-07-28 (inferência minha).
- O agente final usa um nó único com todas as tools e falha em perguntas de acompanhamento por não ter memória. Esse defeito é bom material de ADR.

### Proposta: as unidades 04 a 08 viram um produto só

| Unid. | Camada do produto |
|---|---|
| 04 | Servidor MCP do zero: tools de consulta, catálogo de regras como resources, prompts prontos ("explicar regra ao cliente") |
| 05 | Fachada sobre o "motor de regras legado" sintético do produto (API REST), em camadas |
| 06 | Identidade e autorização por tool; rate limit por token e IP |
| 07 | Distribuição governada (pacote privado para STDIO e endpoint remoto) |
| 08 | Agente de atendimento interno que consulta as regras e cita a fonte |

O produto é sintético, por exemplo crédito consignado, CDB com liquidez diária ou conta remunerada. As regras cobrem elegibilidade, limites, tarifas, prazos e vigência.

Decisão de arquiteto que atravessa todas as opções: **o modelo não calcula regra**. Tools determinísticas avaliam elegibilidade e limites e devolvem o id e a versão da regra aplicada; o Claude só interpreta, explica e cita. Regras são dados versionados, com vigência e dono, e não texto solto num prompt.

| Opção | O que constrói | Serviços AWS | Componente Claude (prova) | Floci | Fonte oficial |
|---|---|---|---|---|---|
| **R1** · Servidor MCP remoto com OAuth | Servidor MCP em contêiner (ECS) ou Lambda, autenticação OAuth via Cognito, regras em DynamoDB com histórico em S3 | ECS/Lambda, Cognito, DynamoDB, S3, CloudWatch | Agente consulta regras e cita id/versão (2.1, 2.2, 5.6) | ✅ Lambda/ECS/DynamoDB/S3; 🟡 fluxos OAuth do Cognito | [Guidance for Deploying MCP Servers on AWS](https://aws.amazon.com/solutions/guidance/deploying-model-context-protocol-servers-on-aws) |
| R2 · Plataforma central com MCP por linha de negócio | A conta do time do produto publica o MCP de regras; uma conta de plataforma roda o agente, o AgentCore Gateway, Identity e Policy (Cedar por tool) | AgentCore Gateway/Identity/Policy/Runtime, Cognito, IAM entre contas | 2.3 (tools por papel), 5.2 | 🟡 só plano de controle do AgentCore | [Multi-account agent com AgentCore Gateway e MCP](https://aws.amazon.com/blogs/machine-learning/build-a-multi-account-ai-agent-with-agentcore-gateway-and-mcp/) · [Cedar por tool em analytics de crédito](https://aws.amazon.com/blogs/industries/ai-credit-analytics-across-amazon-s3-and-snowflake-with-amazon-bedrock-agentcore/) |
| R3 · Agente de risco de crédito com políticas do banco | Agente combina documentos de política do banco (base de conhecimento) com dados de clientes, com OAuth ponta a ponta | AgentCore Gateway/Identity, Bedrock Knowledge Bases, S3 | 5.6, 4.1 | ❌ Knowledge Bases fora do Floci | [OAuth seguro com AgentCore (crédito)](https://aws.amazon.com/blogs/machine-learning/secure-oauth-patterns-for-snowflake-cortex-ai-through-amazon-bedrock-agentcore/) |
| **R4** (minha) · Registro de regras com proveniência + MCP somente leitura + extração assistida | (a) Ingestão: o manual sintético do produto vira regras estruturadas por Claude via `tool_use` com schema, validação, retentativa e aprovação humana antes de publicar. (b) Registro: regras versionadas em DynamoDB, original em S3 com versionamento. (c) MCP serverless (API Gateway + Lambda) com poucas tools: `buscar_regras(produto, tema, data)`, `obter_regra(id, versao)`, `avaliar_elegibilidade(perfil)` determinística; catálogo como resource. (d) Autorização por tool com Verified Permissions (Cedar), throttling por token e WAF por IP. (e) Pacote STDIO no CodeArtifact. (f) Agente interno que responde com citação e incerteza e escala quando a regra é ambígua | API Gateway, Lambda, DynamoDB, S3, Cognito, Verified Permissions, WAF, CodeArtifact, KMS, CloudWatch, CloudTrail | 2.1, 2.2, 2.3, 2.4, 4.3, 4.4, 4.5, 5.2, 5.5, 5.6. Cenários: extração de dados estruturados + suporte ao cliente | ✅ quase tudo; 🟡 Cognito OAuth, CloudTrail a confirmar | Desenho meu sobre R1 + [MCP strategies (Prescriptive Guidance)](https://docs.aws.amazon.com/prescriptive-guidance/latest/mcp-strategies/mcp-strategies.pdf) + [segurança de tools](https://docs.aws.amazon.com/prescriptive-guidance/latest/agentic-ai-frameworks/security-best-practices-for-tool-integration.html) |

**Recomendação: R4, com a topologia serverless da R1 e a R2 como "caminho de produção" no ADR e no post.** Por quê: banco precisa responder "qual regra, qual versão, vigente desde quando e quem aprovou", e é isso que a R4 constrói. O teste local cobre a infraestrutura inteira e o servidor MCP; só o plano de dados do AgentCore (R2) ficaria sem teste no Floci.

Casos públicos para o post (a ler por inteiro antes de citar): a AWS descreve a CTBC Bank migrando a engenharia reversa de COBOL para um pipeline multiagente no AgentCore, e a Thought Machine com a AWS extraindo regras de produto (juros, tarifas, amortização) de sistemas legados. São referências de "regras de negócio presas no legado", não da arquitetura proposta.

## Disciplina 04

As recomendações (1A, 2A, 3C, 4C, 5B, 6B, 7C, 8B, 9C) conferem com as aulas, e várias aparecem quase literalmente:

- 3C: a aula ensina que falha de tool vira observação, e não exceção, com timeout, retentativas e validação da resposta.
- 7C: a matriz de autonomia da aula (decide sozinho, decide e registra, pede aprovação, proibido) é a tarefa 1.4.
- 9C/9A: a aula monta supervisor + analista + planejador + executor, com handoffs registrados, blackboard e consenso com juiz.

Ajustes:

- **Um produto, várias camadas**: o agente de plantão da aula atravessa as nove unidades. Proponho fazer o mesmo na AWS, um "agente de plantão" enterprise que ganha uma camada por unidade, em vez de nove projetos soltos.
- **Tema bancário (opcional)**: plantão de uma plataforma de pagamentos sintética (incidentes de latência, filas de liquidação, provedor externo fora do ar), sem dados nem detalhes de empresas reais.
- **Unidade 08**: a aula publica a War Room no GitHub Pages com túnel para o backend local. Na versão AWS, isso vira ADR de segurança (CORS, autenticação, túnel nunca aberto por padrão).
- **Unidade 04**: memória vetorial está fora do escopo da prova; o valor para a prova está na proveniência e validade das lições (4C). ✅

## O que preciso de você para orquestrar

1. **D01**: aceita a unidade 04 revisada (V1 + revisor, V3 como experimento)? E 05-S no lugar de 05-A?
2. **D03**: R4 como produto das unidades 04 a 08? Qual produto bancário sintético? Unidades 02 e 03 seguem com projetos próprios (02-S e 03-S) ou entram no mesmo produto?
3. **D02 e D04**: mantém as recomendações? Quer o tema bancário onde ele couber?
4. **Cloud comparativa** por disciplina (Azure, GCP ou OCI).
