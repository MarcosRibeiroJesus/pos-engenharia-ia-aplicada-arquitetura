# Disciplina 01 · Opções de projeto por unidade

Proposta de projetos para as unidades 02 e 04 a 10 de **Fundamentos de IA e LLMs para Programadores**. Nada foi implementado. A unidade 03 (recomendação) tem sessão própria (PR #1) e fica fora deste documento; a unidade 01 é introdução e não tem conteúdo técnico.

Data da pesquisa: 2026-11-18.

## Como ler este documento

**Limites desta proposta (leia antes de escolher):**
- Não tive acesso às aulas, às legendas nem ao PDF da disciplina. As unidades foram lidas só pelos títulos do `PROGRESSO.md`. Cada unidade tem um bloco **"Confirmar nas legendas e no PDF"**. Nenhuma opção é definitiva antes dessa confirmação.
- A "lente CCAR-F" usa os ids de tarefa do `CLAUDE.md`. O guia oficial do exame exige login e eu não o li. O mapeamento é meu, a partir dos ids e nomes do `CLAUDE.md`, e precisa de conferência contra o guia.
- **Custo em lab** é uma faixa qualitativa minha, não um preço consultado: `$` = menos de ~US$ 5 por ciclo de lab (subir, testar, destruir); `$$` = ~US$ 5 a 25; `$$$` = passa de US$ 25 se algo ficar ligado. É estimativa a validar com Infracost e o AWS Pricing Calculator na fase de implementação.
- **Datas das fontes**: indico o ano só quando a própria página ou a busca mostrou. As demais ficam como "data a confirmar" e entram datadas nos posts.
- **Equivalente em outra cloud** é mapeamento meu, sem pesquisa em fontes da Google ou da Microsoft. Valide no post. Sugiro **GCP** como padrão porque a Vertex AI oferece Claude, o que deixa o componente Claude igual nas duas nuvens (curso oficial relacionado: *Claude on Google Cloud*). A escolha da nuvem comparativa é sua.
- Nas opções, "Claude" significa Claude via Amazon Bedrock ou API da Anthropic. Configuração de cloud, servidores MCP em nuvem, embeddings e bancos vetoriais estão **fora do escopo da prova** (`CLAUDE.md`); por isso, em cada opção, o que conta para a prova é o componente Claude, e a AWS é a base.

## Cobertura do Floci (base para todas as opções)

Fonte: [floci.io/floci/services](https://floci.io/floci/services/) (matriz de serviços, consultada em 2026-11-18) e [README do Floci](https://github.com/floci-io/floci). A própria busca notou que a contagem de serviços varia entre páginas do projeto; a versão do Floci deve ser fixada no setup e a lista reconferida com `floci aws services`, que não rodei aqui (sem Docker do Floci nesta sessão).

| Serviço | Situação na matriz | Consequência para o projeto |
|---|---|---|
| S3, SQS, SNS, DynamoDB, Lambda, EventBridge, Step Functions, Secrets Manager, SSM, KMS, IAM, CloudWatch (Logs/Metrics), X-Ray, Budgets, Cognito, API Gateway v1/v2, CloudFront | Listados, com dezenas de operações | Núcleo testável. Lambda e ECS executam contêineres Docker reais |
| ECS, ECR, EKS, EC2, ELB v2 | Listados; ECS roda contêineres reais | Dá para rodar até um modelo pequeno em contêiner |
| **Bedrock Runtime** | **Stub**: só `Converse` e `Invoke`, resposta pronta; streaming devolve 501 | Nenhum teste valida qualidade de resposta do Claude. Testar o *contrato*: loop, schema, retentativa, com respostas roteirizadas (fixtures) |
| Bedrock (control plane) | 18 operações (guardrails, modelos, perfis de inferência) | Guardrails testáveis na criação, não no efeito |
| Bedrock AgentCore | Control plane com 71 operações; `InvokeAgentRuntime` é resposta pronta | Infra declarativa testável; comportamento não |
| **Bedrock Agent, Bedrock Knowledge Bases, Bedrock Prompt Management** | **Não listados** | Lacuna do emulador (evidência: matriz do Floci). Opções que dependem deles precisam de equivalente próprio, com ADR |
| SageMaker | 20 operações + `InvokeEndpoint` do Runtime | **A confirmar** se Pipelines e Model Registry estão entre as 20 |
| AWS Batch | 10 operações (env., filas, definições, jobs) | **A confirmar** se os jobs executam de verdade ou só mudam de estado |
| OpenSearch | 24 operações; modo real sobe contêiner | Testável |
| S3 Vectors | 16 operações | Testável (substrato de vetores, fora do escopo da prova) |
| Neptune | 14 operações; Gremlin/openCypher em contêiner | **Neptune Analytics** (usado pelo GraphRAG gerenciado) não aparece: lacuna a confirmar |
| Comprehend | 5 operações | **A confirmar** se inclui detecção de PII |
| Rekognition, Textract, Transcribe, Translate | Listados | Respostas simuladas |
| Kendra, Personalize, Polly | Não listados | Evitar |

Regra do repositório: só marco "lacuna do emulador" com evidência (matriz acima ou teste em outro emulador), e nunca altero código correto para agradar o emulador.

## Resumo e recomendações

| Unid. | Tema | Recomendação | Nuvem comparativa sugerida | Custo lab | Principais tarefas CCAR-F |
|---|---|---|---|---|---|
| 02 | ML, DL e IA | **02-S** · Triagem com classificador próprio e escalonamento para Claude com gate de confiança | GCP | `$` | 5.2, 1.4, 4.3, 5.5 |
| 04 | Vencer jogos (Doom) | **D2+** · treino em Spot com promoção por avaliação e agente revisor de promoção (D2 do PROGRESSO + componente Claude) | GCP | `$`–`$$` | 1.4, 4.3, 4.4, 5.5 |
| 05 | Web AI e LLMs | **05-A** · Inferência híbrida: navegador primeiro, Claude multimodal como fallback | GCP | `$` | 2.3, 4.3, 4.4 |
| 06 | Prompts | **06-B** · Serviço de extração estruturada (JSON vs TOON) com validação e retentativa | GCP | `$` | 4.1, 4.2, 4.3, 4.4, 2.2 |
| 07 | Ferramentas e agentes | **07-A** · Agente com loop por `stop_reason`, gates programáticos e aprovação humana | GCP | `$` | 1.1, 1.4, 1.5, 1.6, 2.2, 5.2 |
| 08 | MCP na prática | **08-C** · Servidor MCP de telemetria somente leitura com erros estruturados | GCP | `$` | 2.1, 2.2, 2.3, 2.4, 5.3 |
| 09 | Modelos | **09-C** · Roteador por sensibilidade de dados (modelo aberto local vs. Claude) sobre um gateway fino | GCP | `$` | 5.2, 4.1, 2.2, 5.3 |
| 10 | RAG | **10-C** · RAG agêntico com proveniência e incerteza sobre S3 Vectors | GCP | `$` | 5.6, 5.3, 2.1, 4.1 |

Cobertura por domínio das recomendações (pesos do exame): Domínio 1 (27%) nas unidades 02, 04 e 07; Domínio 2 (18%) em 08 e 09; Domínio 4 (20%) em 04, 05 e 06; Domínio 5 (15%) em 02, 09 e 10. **O Domínio 3 (20%, Claude Code, CLAUDE.md, CI) não é coberto por nenhuma recomendação.** A opção **07-B** o cobre; a lista de perguntas no fim sugere fazê-la como segundo projeto da disciplina ou tratá-la como prática do próprio repositório.

Coerência entre unidades: a 04 já traz o ciclo treinar → avaliar → promover, então a 02 não repete MLOps e foca inferência e decisão sob incerteza. A unidade 08 deve ser alinhada com o projeto escolhido na 03 (MCP), que não li: se o da 03 já for um servidor MCP, a 08-C complementa (telemetria, resources); se for outra coisa, também serve.

---

## Unidade 02 · ML, DL e IA

**Títulos usados:** ML, DL e IA · Teachable Machine · redes neurais e como aprendem · primeira rede neural para categorizar alunos (pt 1 e 2).

**Tema de alto valor para sênior:** o salto de "treinei uma rede" para "operar uma decisão automatizada": servir o modelo barato, medir confiança e saber quando não decidir.

**Confirmar nas legendas e no PDF:** linguagem e biblioteca do exercício dos alunos (TensorFlow.js? Python?); se os dados são tabulares ou texto; as métricas ensinadas; o formato de exportação do modelo (isso decide se o Lambda carrega ONNX, SavedModel ou TF.js).

### 02-A · Ciclo MLOps em SageMaker com promoção por aprovação
| Campo | Conteúdo |
|---|---|
| O que constrói | Pipeline que pré-processa, treina, avalia e registra o modelo só se passar de um limiar; aprovação humana dispara o deploy via evento |
| Serviços AWS | SageMaker Pipelines e Model Registry, S3, EventBridge, Lambda, KMS, CloudWatch |
| Componente Claude | "Agente de model card": lê as métricas e devolve recomendação de promoção em JSON validado; a decisão final é um gate programático. **Prova:** 1.4, 4.3, 4.4 |
| Outra cloud | Vertex AI Pipelines + Model Registry (GCP); Azure Machine Learning pipelines + registry |
| Floci | Médio: SageMaker listado (20 operações), mas Pipelines e Registry a confirmar; S3, EventBridge, Lambda cobertos |
| Custo lab | `$`–`$$` (treino curto em tabela pequena; endpoint nunca fica ligado) |
| Fonte | [Build an end-to-end MLOps pipeline using Amazon SageMaker Pipelines, GitHub, and GitHub Actions](https://aws.amazon.com/blogs/machine-learning/build-an-end-to-end-mlops-pipeline-using-amazon-sagemaker-pipelines-github-and-github-actions/) (AWS ML Blog, data a confirmar) · [MLOps Workload Orchestrator](https://docs.aws.amazon.com/solutions/latest/mlops-workload-orchestrator/architecture-overview.html) (Solutions Library, multi-conta; pesado para lab) |

### 02-B · Inferência serverless de rede neural com captura de dados
| Campo | Conteúdo |
|---|---|
| O que constrói | A rede treinada vira imagem de contêiner no Lambda atrás de API; cada predição e confiança vão para DynamoDB; um job compara a distribuição atual com a do treino (drift simples) |
| Serviços AWS | ECR, Lambda (imagem de contêiner), API Gateway HTTP, DynamoDB, EventBridge Scheduler, CloudWatch |
| Componente Claude | Extrai atributos de texto livre do aluno (ex.: relato de rotina) para o schema que a rede consome, via `tool_use` com few-shot. **Prova:** 4.2, 4.3 |
| Outra cloud | Cloud Run + Firestore + Cloud Scheduler (GCP); Azure Functions em contêiner + Cosmos DB |
| Floci | Alto: Lambda com Docker real, ECR, API Gateway, DynamoDB |
| Custo lab | `$` |
| Fonte | [Machine learning inference at scale using AWS serverless](https://aws.amazon.com/blogs/machine-learning/machine-learning-inference-at-scale-using-aws-serverless/) (2021, resultado da busca) · [Choosing between storage mechanisms for ML inferencing with AWS Lambda](https://aws.amazon.com/blogs/compute/choosing-between-storage-mechanisms-for-ml-inferencing-with-aws-lambda/) (2021; modelo dentro da imagem tem a menor latência) · [Deploy a machine learning inference data capture solution on AWS Lambda](https://aws.amazon.com/blogs/machine-learning/deploy-a-machine-learning-inference-data-capture-solution-on-aws-lambda/) |

### 02-S · Triagem com gate de confiança e escalonamento para Claude (sugestão minha)
| Campo | Conteúdo |
|---|---|
| O que constrói | Base é a 02-B (classificador de alunos servido no Lambda). Acima de um limiar de confiança, a decisão sai direto. Abaixo, o caso vai para uma fila e para o Claude, com critérios explícitos de escalonamento; casos que ele também não resolve vão para fila de revisão humana, com o contexto preservado |
| Serviços AWS | Lambda (imagem), API Gateway, SQS + DLQ, DynamoDB, Step Functions (gate e espera por humano com task token), CloudWatch |
| Componente Claude | Segundo avaliador com critérios escritos (quando escalar, quando decidir), saída estruturada com `confidence` e `reason`, e handoff com resumo para o humano. **Prova:** 5.2, 1.4, 4.1, 4.3, 5.5. **Cenário:** agente de suporte ao cliente. **Curso:** *Building with the Claude API* |
| Outra cloud | Cloud Run + Workflows + Pub/Sub + Firestore + Claude na Vertex AI (GCP) |
| Floci | Alto na infra (Lambda, SFN com task token, SQS, DynamoDB). Bedrock Runtime é stub: testar o roteamento por limiar com respostas roteirizadas |
| Custo lab | `$` |
| Fonte | Composição das fontes da 02-B (inferência) e do gate com humano em [Human-in-the-loop constructs for agentic workflows](https://aws.amazon.com/blogs/machine-learning/human-in-the-loop-constructs-for-agentic-workflows-in-healthcare-and-life-sciences/) (AWS ML Blog, data a confirmar) |

**Recomendação: 02-S.** Como arquiteta, eu a escolheria por três motivos. (1) O que separa um sênior de quem só treinou uma rede é decidir *quando não confiar nela*; o gate de confiança é essa decisão tornada código e testável (limiar em `terraform test` e asserts no plano). (2) A 04 já cobre o ciclo de promoção de modelo, então a 02-A seria repetição. (3) É a que mais pontua no exame sem depender de recurso que o Floci não emula. Risco: calibrar o limiar exige dados reais do exercício; usar dados sintéticos e dizer isso no post. Se você preferir ficar só em fontes oficiais, a 02-B é a base e a 02-S nasce dela.

---

## Unidade 04 · Como vencer qualquer jogo (Doom)

**Títulos usados:** só a pt 1 assistida; pt 2 a 5 pendentes, com o módulo 05 (algoritmos genéticos e Web AI) como complemento.

**Revisão das variantes D1 a D3 do PROGRESSO.md com a lente CCAR-F.** As variantes originais são boas arquiteturas de ML, mas nenhuma tem um componente Claude que exercite a prova, exceto a D3, que o tem de forma frágil. A tabela mostra o que muda.

| Variante | Veredito CCAR-F | Ajuste proposto |
|---|---|---|
| D1 · navegador (TF.js + Doom em WASM) | Sem Claude; só ML clássico. Boa para "Web ML", fraca para a prova | Manter como *camada de demo* da D2, não como projeto isolado |
| **D2 · treino em Spot + MLOps + demo no navegador** | Sem Claude. Domínio de MLOps é forte para arquitetura, mas só 1.4 (gate) entra por analogia | **Adicionar um agente revisor de promoção** (ver D2+ abaixo) |
| D3 · agente com LLM multimodal joga | Tem Claude, mas latência de segundos por quadro inviabiliza tempo real; exercita pouco além de 2.3 e 4.3. Custo cresce por token a cada partida | Rebaixar para *experimento de comparação* (turno a turno, no cenário `basic`): baseline de custo e latência contra a política treinada, útil para o post |

**Confirmar nas legendas e no PDF (críticos aqui):** qual técnica a pt 1 e as pt 2 a 5 ensinam (algoritmo genético, neuroevolução, RL com DQN/PPO, busca em árvore?). **A D2 assume RL com PPO**; se o curso ensina neuroevolução, a função de aptidão e o paralelismo mudam, e o Step Functions com Distributed Map passa a ser melhor que Batch para gerações. Confirmar também o ambiente usado no curso (ViZDoom? outro jogo?) e a licença dos assets.

### D2 (revisada) · Treino em Spot na nuvem, promoção por avaliação, demo no navegador
| Campo | Conteúdo |
|---|---|
| O que constrói | Step Functions orquestra: treino do agente (ViZDoom + PPO) em contêiner → avaliação por cenário (`basic` → `defend_the_center` → `deadly_corridor`) → promoção condicional → exportação para TF.js e replays no site. Checkpoints no S3 para tolerar interrupção de Spot |
| Serviços AWS | Step Functions, AWS Batch (ou SageMaker Training com Managed Spot), S3, ECR, CloudWatch, CloudFront, EventBridge. Evitar NAT Gateway: contêiner de treino em sub-rede pública com egress restrito por SG, ou endpoints sob demanda (ADR) |
| Componente Claude | Ver D2+ |
| Outra cloud | Vertex AI custom training com Spot VMs + Vertex AI Pipelines (GCP); Azure ML com Spot + pipelines |
| Floci | Médio: Step Functions, S3, CloudFront, EventBridge, ECS, ECR cobertos; Batch tem 10 operações (execução real a confirmar); treino real roda no Docker local |
| Custo lab | `$`–`$$`, só durante o treino (CPU Spot; GPU só se a técnica pedir) |
| Fontes | [How to train procedurally generated game-like environments at scale with Amazon SageMaker RL](https://aws.amazon.com/blogs/machine-learning/winning-neurips-2020-procgen-benchmark-competition-with-amazon-sagemaker-reinforcement-learning/) (2020; PPO e Spot em ambientes de jogo, com economia de ~70% reportada em GPU). [Scale Reinforcement Learning with AWS Batch Multi-Node Parallel Jobs](https://aws.amazon.com/blogs/hpc/scale-reinforcement-learning-with-aws-batch-multi-node-parallel-jobs/) (AWS HPC Blog, 2025; orquestração em Batch, checkpoints em EFS). [Managed Spot Training](https://docs.aws.amazon.com/sagemaker/latest/dg/model-managed-spot-training.html) e [Checkpoints](https://docs.aws.amazon.com/sagemaker/latest/dg/model-checkpoints.html) (documentação). [Scaling MoE reinforcement learning on Amazon EKS](https://aws.amazon.com/blogs/machine-learning/scaling-moe-reinforcement-learning-on-amazon-eks-with-efa-and-deepep-with-40-more-throughput/) (padrão de pôr Spot só nos *rollouts*, não no aprendiz) |

Decisão a registrar em ADR: **Batch vs. SageMaker Training**. SageMaker Training com Managed Spot dá checkpoint e retomada prontos (mais simples, menos controle); Batch dá controle de imagem, filas e custo, e é mais fácil de rodar no Docker local. Minha inclinação é Batch pelo controle, mas isso depende da confirmação do Floci.

### D2+ · D2 com agente revisor de promoção (recomendada)
| Campo | Conteúdo |
|---|---|
| O que acrescenta | Depois da avaliação numérica, um agente Claude lê o relatório (recompensa por cenário, taxa de morte, variância entre sementes, comparação com o modelo promovido) e produz um parecer estruturado: `promover`, `rejeitar` ou `revisão humana`, com evidências por cenário. **Nunca promove sozinho**: o gate programático (limiar numérico) decide o mínimo, o agente só pode *bloquear* ou *pedir humano* |
| Componente Claude / prova | **1.4** workflow com gates e handoff; **4.3** parecer via `tool_use` com schema; **4.4** validação e retentativa; **5.5** calibração (amostra de pareceres revisada por humano); **4.5** análise dos replays em lote, se fizer sentido (aqui é o Message Batches da API da Anthropic; no Bedrock o equivalente é inferência em lote). **Cenário:** produtividade de devs / extração estruturada. **Curso:** *Building with the Claude API* |
| Floci | Bedrock Runtime é stub: testar o gate e o schema com pareceres roteirizados |
| Custo extra | Poucos centavos por avaliação |

### D4 · Sugestão minha: Claude narra e depura, a política joga
| Campo | Conteúdo |
|---|---|
| O que constrói | A política treinada joga; um agente Claude, com tools de leitura (`list_replays`, `get_episode_metrics`), responde perguntas do tipo "por que o agente morre no corredor?" sobre telemetria, com resposta rastreável a episódios |
| Prova | 2.1, 2.2, 5.6 |
| Por que não é a principal | Não exercita o ciclo de arquitetura (treino, promoção, custo) que a unidade destaca; funciona melhor como *módulo extra* da D2+ |

**Recomendação: D2+.** O porquê, como arquiteto: a unidade pede dominar "como vencer", e o que se leva para a vida profissional é *treinar barato, medir com honestidade e promover com critério*. D2 entrega isso (Spot com checkpoint, avaliação por degrau, separação treino/inferência), a demo no navegador aproveita o módulo 05, e o agente revisor dá a D2 a ponte com a prova sem violar a regra de que o gate crítico é código e não opinião de modelo. Riscos: (1) **fidelidade de observação** entre ViZDoom e o navegador, mitigada começando por replays; (2) ViZDoom e Doom em WASM têm licenças próprias, e os assets devem ser Freedoom, nunca WADs comerciais; (3) custo de GPU se o curso exigir rede profunda (tratar com ADR e teto de horas Spot).

---

## Unidade 05 · Web AI e LLMs

**Títulos usados:** algoritmos genéticos · transformers, embeddings e attention · IA na web com Web AI (assistida) · demo Web AI multimodal.

**Tema de alto valor:** *onde roda a inferência* (navegador, borda ou nuvem) é decisão de arquitetura de produto: privacidade, latência, custo e capacidade.

**Confirmar nas legendas e no PDF:** a biblioteca da aula (TensorFlow.js, MediaPipe, Transformers.js, WebLLM?); o modelo do demo multimodal; quais algoritmos genéticos são mostrados e para quê; se a demo usa a API do Chrome (Prompt API/Gemini Nano), que **não existe no ecossistema AWS**.

### 05-A · Inferência híbrida: navegador primeiro, nuvem como fallback
| Campo | Conteúdo |
|---|---|
| O que constrói | Página estática carrega um modelo pequeno no navegador (pesos hospedados no próprio S3, sem CDN de terceiros). Se o dispositivo não tem capacidade, o conteúdo é sensível demais, ou a confiança é baixa, a requisição vai para a nuvem (Claude multimodal) por uma API. Política de roteamento em código, com telemetria de qual caminho foi usado |
| Serviços AWS | S3 + CloudFront (site e pesos), API Gateway + Lambda, Bedrock (Claude), DynamoDB (telemetria de roteamento), CloudWatch, WAF opcional |
| Componente Claude | Fallback multimodal com saída estruturada e `tool_choice` forçado para o schema; validação com retentativa limitada. **Prova:** 2.3, 4.3, 4.4. **Curso:** *Claude with Amazon Bedrock* |
| Outra cloud | Cloud Storage + Cloud CDN + Cloud Run + Claude na Vertex AI (GCP); Blob + Front Door + Functions (Azure) |
| Floci | Alto para infra (S3, CloudFront com 61 operações, API Gateway, Lambda, DynamoDB); Bedrock Runtime stub. Teste do modelo no navegador com Playwright (já disponível), fora do Floci |
| Custo lab | `$` |
| Fontes | [Edge AI and global inference distribution](https://docs.aws.amazon.com/prescriptive-guidance/latest/agentic-ai-serverless/edge-ai.html) (Prescriptive Guidance; data a confirmar) · [Architecting offline-first generative AI applications for edge deployments](https://aws.amazon.com/blogs/architecture/architecting-offline-first-generative-ai-applications-for-edge-deployments-using-aws-services/) (AWS Architecture Blog, jul/2026, segundo a busca) · [Read graphs, diagrams, tables, and scanned pages using multimodal prompts in Amazon Bedrock](https://aws.amazon.com/blogs/machine-learning/read-graphs-diagrams-tables-and-scanned-pages-using-multimodal-prompts-in-amazon-bedrock/) (data a confirmar). **Lacuna:** não achei post da AWS sobre WebGPU/Transformers.js; a parte "no navegador" é do curso, e a AWS cobre borda e nuvem |

### 05-B · Pipeline multimodal de documentos e imagens
| Campo | Conteúdo |
|---|---|
| O que constrói | Upload no S3 dispara Step Functions, que chama Claude com imagem para extrair dados e grava no DynamoDB; casos de baixa confiança vão para revisão |
| Serviços AWS | S3, EventBridge, Step Functions, Lambda, Bedrock, DynamoDB, SQS |
| Componente Claude | Extração de imagem/PDF para JSON, com campo de incerteza e proveniência (de qual região/página veio). **Prova:** 4.3, 4.4, 5.5, 5.6. **Cenário:** extração de dados estruturados |
| Outra cloud | Document AI ou Claude na Vertex AI + Workflows (GCP) |
| Floci | Alto na infra; Textract listado; Bedrock stub |
| Custo lab | `$` |
| Fonte | [Intelligent document processing using Amazon Bedrock and Anthropic Claude](https://aws.amazon.com/blogs/machine-learning/intelligent-document-processing-using-amazon-bedrock-and-anthropic-claude/) (AWS ML Blog, data a confirmar; a página cita modelos antigos, revalidar). Sobrepõe-se à 06-B: se esta for escolhida, não faça as duas |

### 05-S · Evolução de prompts por algoritmo genético (sugestão minha)
| Campo | Conteúdo |
|---|---|
| O que constrói | Liga a aula de algoritmos genéticos aos LLMs: população de variantes de prompt, aptidão medida em um conjunto de casos, mutação e cruzamento por Lambda, gerações em paralelo com Step Functions Distributed Map |
| Prova | 4.1, 4.6 (o julgamento deve ser feito por instância separada da que gerou) |
| Ressalva | Sobreposição com a unidade 06 e custo por token alto por geração. Citar a literatura de otimização evolutiva de prompts só depois de confirmar a fonte; não a incluí aqui por não ter verificado |

**Recomendação: 05-A.** É a opção que transforma a aula "IA na web" em decisão de arquiteto: política de roteamento entre navegador e nuvem, com os trade-offs de privacidade (dado não sai do dispositivo), custo (inferência no cliente é de graça para você), e confiabilidade (fallback). O servidor fica fino e barato. O risco real é de teste: WebGPU não roda em CI sem GPU, então o ADR deve definir testes de contrato do roteador no Floci e um smoke test com Playwright e modelo mínimo. Observação: a unidade 04 também exporta um modelo para TF.js; se ambas avançarem, compartilhar a página de demo e o módulo Terraform do site.

---

## Unidade 06 · Prompts

**Títulos usados:** prompts que geram boas respostas · padrão TOON e JSON para prompts.

**Tema de alto valor:** prompt como artefato de engenharia (versionado, testado, com custo medido), e formato de entrada e saída como decisão de custo e confiabilidade.

**Confirmar nas legendas e no PDF:** o que a aula chama de "padrão TOON" (**não verifiquei a especificação**; tratarei como formato compacto de serialização para reduzir tokens, mas é hipótese); critérios de "boa resposta" ensinados; se há exemplo de few-shot e de delimitadores.

### 06-A · Registro de prompts com porta de avaliação no CI
| Campo | Conteúdo |
|---|---|
| O que constrói | Prompts como arquivos versionados com casos de ouro; pipeline roda a suíte (promptfoo ou Bedrock Evaluations com juiz LLM) e **bloqueia o merge** se a qualidade regredir |
| Serviços AWS | CodeBuild/GitHub Actions (OIDC), S3 (registro e relatórios), DynamoDB (versões), Bedrock, CloudWatch |
| Componente Claude | Gerador e **juiz de outra família de modelo ou instância separada**; critérios explícitos de nota. **Prova:** 4.1, 4.2, 4.6, 5.5, 3.6 (CI) |
| Outra cloud | Vertex AI evaluation + Cloud Build (GCP) |
| Floci | Médio: S3, DynamoDB, CodeBuild listados. **Bedrock Prompt Management não está no Floci**: usar registro próprio em S3/DynamoDB com ADR |
| Custo lab | `$`–`$$` (tokens por rodada) |
| Fontes | [CI/CD and automation for serverless AI](https://docs.aws.amazon.com/prescriptive-guidance/latest/agentic-ai-serverless/cicd-and-automation.html) · [Prompt, agent, and model lifecycle management](https://docs.aws.amazon.com/prescriptive-guidance/latest/agentic-ai-serverless/prompt-agent-and-model.html) (ambos Prescriptive Guidance, ~16 meses segundo a busca) · [Guidance for Evaluating Generative AI Applications using OSS on AWS](https://aws.amazon.com/solutions/guidance/evaluating-generative-ai-applications-using-oss-on-aws/) (Solutions Library, promptfoo) · [Generative AI Lifecycle Operational Excellence](https://docs.aws.amazon.com/pdfs/prescriptive-guidance/latest/gen-ai-lifecycle-operational-excellence/gen-ai-lifecycle-operational-excellence.pdf) (juiz validado contra rótulos humanos) |

### 06-B · Serviço de extração estruturada: JSON vs TOON, com validação e retentativa
| Campo | Conteúdo |
|---|---|
| O que constrói | API que recebe texto livre e devolve JSON no schema, via `tool_use`. Loop de validação: se o schema falha, reenvia com o erro específico, com teto de tentativas e DLQ. Mede tokens e acerto por formato (JSON vs TOON) num conjunto de casos |
| Serviços AWS | API Gateway, Lambda, Bedrock (Converse com tool use), SQS DLQ, DynamoDB, CloudWatch (métricas de tokens e taxa de retentativa) |
| Componente Claude | **Prova:** 4.1 critérios explícitos, 4.2 few-shot, 4.3 saída via `tool_use`, 4.4 validação e retentativa, 2.2 erro estruturado e retentável. **Cenário:** extração de dados estruturados. **Cursos:** *Building with the Claude API*, *Claude with Amazon Bedrock* |
| Outra cloud | Cloud Run + Claude na Vertex AI + Pub/Sub DLQ (GCP) |
| Floci | Alto na infra; Bedrock stub, então o teste da retentativa usa respostas roteirizadas (inválida → inválida → válida). **Limitação a dizer no relatório:** não mede acerto real do modelo |
| Custo lab | `$` |
| Fontes | [Effective cost optimization strategies for Amazon Bedrock](https://aws.amazon.com/blogs/machine-learning/effective-cost-optimization-strategies-for-amazon-bedrock/) (definir formato e restrições explicitamente reduz tokens) · [Intelligent document processing using Amazon Bedrock and Anthropic Claude](https://aws.amazon.com/blogs/machine-learning/intelligent-document-processing-using-amazon-bedrock-and-anthropic-claude/) · [Four Amazon Bedrock inference choices that affect cost](https://aws.amazon.com/blogs/machine-learning/four-amazon-bedrock-inference-choices-that-affect-cost/) (datas a confirmar) |

### 06-C · Extração em lote com revisão multi-instância (sugestão minha)
| Campo | Conteúdo |
|---|---|
| O que constrói | S3 → Step Functions → processamento em lote barato → **segunda instância do Claude revisa** a primeira sem ver o raciocínio dela → divergências vão para amostra humana |
| Prova | 4.5, 4.6, 5.5 |
| Detalhe de arquitetura | Message Batches é da API da Anthropic; no Bedrock o equivalente é inferência em lote, e a busca indicou que **prompt caching não funciona junto com inferência em lote**. Para exercitar 4.5 de fato, o Lambda chamaria a API da Anthropic (chave no Secrets Manager), fugindo do Bedrock: ADR com o trade-off (assimetria de governança vs fidelidade ao exame) |

**Recomendação: 06-B.** Casa direto com um dos seis cenários da prova (extração estruturada), exercita cinco tarefas do Domínio 4 (20%) de uma vez, é barata e testa bem no Floci (o que importa é o *contrato*: schema, retentativa, teto, DLQ). A comparação JSON vs TOON vira dado medido para o post, em vez de opinião. Incorporar, em pequeno, a ideia da 06-A: um conjunto de casos de ouro roda como teste de regressão no CI. Risco: sem o modelo real no Floci, a métrica de acerto só sai numa execução real e paga; planejar uma rodada única e pequena e declarar isso.

---

## Unidade 07 · Ferramentas e agentes

**Títulos usados:** Cursor vs. VS Code vs. Windsurf · agentes de IA e decisões em etapas.

**Tema de alto valor:** o agente como *loop com controles*, não como mágica; e a escolha de ferramenta de desenvolvimento como decisão de governança.

**Confirmar nas legendas e no PDF:** critérios da comparação Cursor/VS Code/Windsurf (o PROGRESSO não indica); o framework de agente da aula (LangChain? loop próprio?); se há exemplo de decisões em etapas com humano no meio.

### 07-A · Agente com loop por `stop_reason`, gates programáticos e aprovação humana
| Campo | Conteúdo |
|---|---|
| O que constrói | Um agente (loop próprio ou Strands) executa tarefas em etapas com ferramentas. O loop continua enquanto `stop_reason` for `tool_use` e termina em `end_turn`. Step Functions envolve o agente: antes de ações com efeito, um gate programático bloqueia; ações críticas esperam aprovação humana (task token via SNS) |
| Serviços AWS | Lambda ou AgentCore Runtime, Step Functions, SNS, SQS, DynamoDB (estado e trilha de auditoria), CloudWatch |
| Componente Claude | **Prova:** 1.1 loop, 1.4 gates e handoff, 1.5 hooks (no Strands, o análogo é o mecanismo de hooks), 1.6 decomposição, 2.2 erros estruturados, 5.2 escalonamento. **Cenário:** agente de suporte ao cliente. **Cursos:** *Building with the Claude API*, *Claude with Amazon Bedrock* |
| Outra cloud | Cloud Run + Workflows + Claude na Vertex AI (GCP); Durable Functions (Azure) |
| Floci | Alto na orquestração (SFN com task tokens, SNS, SQS, DynamoDB). AgentCore: control plane sim, `InvokeAgentRuntime` é resposta pronta. O loop se testa com sequência roteirizada: `tool_use` → `tool_use` → `end_turn` |
| Custo lab | `$` |
| Fontes | [Automate medical coding with Step Functions and Amazon Bedrock AgentCore](https://aws.amazon.com/blogs/architecture/automate-medical-coding-with-step-functions-and-amazon-bedrock-agentcore/) (AWS Architecture Blog, data a confirmar; Step Functions cuida de sequência e limiar, o agente cuida de um passo limitado) · [Human-in-the-loop claims processing with Amazon Bedrock AgentCore](https://aws.amazon.com/blogs/publicsector/human-in-the-loop-claims-processing-with-amazon-bedrock-agentcore/) · [AWS Step Functions adds AgentCore-powered agentic reasoning step](https://aws.amazon.com/about-aws/whats-new/2026/06/aws-step-functions-agentcore/) (jun/2026, **em preview**; só como nota, não como dependência) |

### 07-B · Claude Code em CI com saída estruturada
| Campo | Conteúdo |
|---|---|
| O que constrói | Revisão de PR por agente headless em CI (`claude -p` com `--json-schema`), em runner efêmero com credenciais por OIDC, sem chaves estáticas. O agente comenta, **nunca faz merge** |
| Serviços AWS | GitHub Actions + OIDC, CodeBuild ou ECS, Bedrock (credencial por papel IAM), S3 (artefatos), CloudWatch |
| Componente Claude | **Prova:** 3.6, 3.1, 3.3, 1.5, 4.6, 5.5. **Cenários:** Claude Code em CI, geração de código. **Curso:** *Claude Code in Action* |
| Outra cloud | Cloud Build + Workload Identity + Claude na Vertex AI (GCP) |
| Floci | Baixo-médio: ECS, ECR, CodeBuild, IAM cobertos; o CLI do Claude não roda no Floci, então testar o contrato com um binário falso |
| Custo lab | `$` |
| Fontes | [Extend Claude Code to remote sessions on Amazon Bedrock AgentCore with security controls](https://aws.amazon.com/blogs/machine-learning/extend-claude-code-to-remote-sessions-on-amazon-bedrock-agentcore-with-security-controls/) · [It's safe to close your laptop now: Hosting coding agents on AgentCore](https://aws.amazon.com/blogs/machine-learning/its-safe-to-close-your-laptop-now-hosting-coding-agents-on-amazon-bedrock-agentcore/) · [Supercharge regulated workloads with Claude Code and Amazon Bedrock](https://aws.amazon.com/blogs/machine-learning/supercharge-regulated-workloads-with-claude-code-and-amazon-bedrock/) (datas a confirmar) |

### 07-S · Coordenador e subagentes de pesquisa com contexto isolado (sugestão minha)
| Campo | Conteúdo |
|---|---|
| O que constrói | Coordenador divide uma pergunta em subtarefas; dois subagentes com tools mínimas e contexto isolado pesquisam em fontes distintas; o coordenador consolida e mantém a origem de cada afirmação |
| Prova | 1.2, 1.3, 1.6, 5.1, 5.6. **Cenário:** sistema de pesquisa multiagente |
| Ressalva | A disciplina 04 do curso (agentes autônomos, multiagentes) é o lugar natural; aqui seria antecipação |

**Recomendação: 07-A.** O Domínio 1 é o de maior peso (27%) e o loop por `stop_reason` com gates e humano é o alicerce dele. Do ponto de vista de arquitetura, a lição é que **o agente fica dentro de um fluxo determinístico**: Step Functions impõe a ordem e os limites; o modelo decide só dentro do passo. Isso é o que um sênior defende em produção e é testável no Floci. A 07-B é excelente para o Domínio 3, mas combina melhor com a disciplina 06 do curso (DevOps) e com o uso que este repositório já faz de Claude Code; sugiro tratá-la como projeto adicional ou como prática do repositório.

---

## Unidade 08 · MCP na prática

**Títulos usados:** o que são MCPs · gerar testes · navegar em sites · consultar documentação · telemetria de apps.

**Cuidados:** a disciplina 03 do curso é inteira sobre MCP e a unidade 03 desta disciplina tem sessão própria; escolher aqui algo que **não duplique** o que for escolhido lá. E lembrar que o exame cobre *design de tools e configuração de cliente*, não deploy de servidor MCP em nuvem.

**Confirmar nas legendas e no PDF:** quais MCPs são usados em cada aula (Playwright? documentação via Context7? outro?); se "telemetria" é de OpenTelemetry ou de um produto específico; o cliente MCP usado (IDE ou código próprio).

### 08-A · Agente com MCPs governados: navegador, documentação e telemetria
| Campo | Conteúdo |
|---|---|
| O que constrói | Agente que consome MCPs de navegador e de documentação com `.mcp.json` versionado, lista de ferramentas permitidas por papel e trilha de chamadas; AWS entra como hospedagem de navegador gerenciado e gateway |
| Serviços AWS | Bedrock AgentCore (Browser, Gateway), IAM, CloudWatch, S3 |
| Componente Claude | **Prova:** 2.3, 2.4, 2.5, 5.3. **Cenário:** produtividade de devs |
| Outra cloud | Cloud Run + MCP gateway próprio (GCP); não há equivalente gerenciado direto de navegador: dizer isso no post |
| Floci | Baixo: AgentCore só no control plane |
| Custo lab | `$`–`$$` (sessões de navegador gerenciado são cobradas por uso; validar) |
| Fontes | [MCP strategies](https://docs.aws.amazon.com/prescriptive-guidance/latest/mcp-strategies/mcp-strategies.pdf) (Prescriptive Guidance) · [Introducing Amazon Bedrock AgentCore Browser Tool](https://aws.amazon.com/blogs/machine-learning/introducing-amazon-bedrock-agentcore-browser-tool/) (AWS ML Blog, data a confirmar) |

### 08-B · Servidor MCP com OAuth em contêiner
| Campo | Conteúdo |
|---|---|
| O que constrói | Servidor MCP em ECS Fargate atrás de ALB, com Cognito para OAuth, cliente de exemplo |
| Serviços AWS | ECS Fargate, ALB, Cognito, CloudFront/WAF, Secrets Manager |
| Componente Claude | 2.1, 2.4 (a tool em si é o foco; o deploy está fora do escopo da prova) |
| Outra cloud | Cloud Run + Identity Platform (GCP) |
| Floci | Alto: ECS com contêiner real, Cognito (91 operações), ELB v2, WAF |
| Custo lab | `$$`: **ALB e tarefas Fargate têm custo fixo enquanto existirem**; regra do repositório pede ADR ou variante com API Gateway + Lambda |
| Fonte | [Guidance for Deploying Model Context Protocol Servers on AWS](https://docs.aws.amazon.com/solutions/deploying-model-context-protocol-servers-on-aws/) (Solutions Library; amostra em CDK, com Cognito segundo um fork, **não confirmado na página oficial**) · [Deploying MCP servers on Amazon ECS](https://aws.amazon.com/blogs/containers/deploying-model-context-protocol-mcp-servers-on-amazon-ecs/) |

### 08-C · Servidor MCP de telemetria somente leitura com erros estruturados (sugestão minha)
| Campo | Conteúdo |
|---|---|
| O que constrói | Servidor MCP (pode rodar em Lambda ou local) que expõe métricas, logs e traces de um app de exemplo como *resources* e como poucas tools de leitura (`query_metrics`, `get_trace`, `search_logs`), com descrições escritas para o modelo escolher bem, erros estruturados (`isError`, categoria, retentável) e limites de volume. Um agente SRE responde "por que a latência subiu?" a partir disso |
| Serviços AWS | CloudWatch Logs/Metrics, X-Ray, Lambda, IAM somente leitura, API Gateway ou execução local |
| Componente Claude | **Prova:** 2.1, 2.2, 2.3 (poucas tools), 2.4 (`.mcp.json` e resources), 5.3 (propagação de erro com contexto). **Cenário:** produtividade de devs. **Curso:** *Introduction to Model Context Protocol* |
| Outra cloud | Cloud Monitoring + Cloud Trace + Cloud Run (GCP); Azure Monitor + Application Insights |
| Floci | Alto: CloudWatch Logs e Metrics e X-Ray listados |
| Custo lab | `$` |
| Fonte | Parte da AWS: [The AWS API MCP Server is now available on AWS Marketplace](https://aws.amazon.com/about-aws/whats-new/2025/11/the-aws-api-mcp-server-aws-marketplace) (nov/2025; a AWS publica seus servidores MCP; este projeto escreve um próprio, enxuto, para exercitar o *design* da tool) e as [MCP strategies](https://docs.aws.amazon.com/prescriptive-guidance/latest/mcp-strategies/mcp-strategies.pdf) |

**Recomendação: 08-C.** A unidade fala de "telemetria de apps" e o exame dá peso de 18% a design de tools; o erro mais comum de times é expor uma tool por endpoint e devolver erro como texto. Aqui o aprendizado é do que um sênior cobra em revisão: poucas ferramentas, boas descrições, erros que dizem se vale tentar de novo, e permissão de leitura mínima. É barata, testável no Floci e não depende de nenhum serviço fora da matriz. A 08-B fica como ADR de produção (OAuth, ALB, rate limit), sem implementar, por causa do custo fixo. Se na unidade 03 já houver um servidor MCP completo, a 08-C aproveita o que existir.

---

## Unidade 09 · Modelos

**Títulos usados:** abertos vs. fechados · Ollama local · OpenRouter.

**Tema de alto valor:** escolha de modelo como política (custo, privacidade, latência, qualidade, lock-in), e roteamento com fallback.

**Confirmar nas legendas e no PDF:** quais modelos são comparados; como o OpenRouter é usado (roteamento? fallback?); se o Ollama roda em CPU ou GPU na aula.

### 09-A · Gateway multi-provedor
| Campo | Conteúdo |
|---|---|
| O que constrói | Endpoint único compatível com a API da OpenAI que roteia para Bedrock e outros provedores, com chaves virtuais, orçamentos por equipe, fallback e métricas |
| Serviços AWS | ECS Fargate (LiteLLM), ALB, RDS/PostgreSQL, ElastiCache, Secrets Manager, WAF/CloudFront opcional, CloudWatch |
| Componente Claude | Claude como um dos provedores, com fallback e classificação de erro retentável vs. definitivo. **Prova:** 2.2, 5.3. **Curso:** *Claude with Amazon Bedrock* |
| Outra cloud | LiteLLM em Cloud Run + Cloud SQL (GCP) |
| Floci | Alto: ECS, RDS, ElastiCache e ELB v2 listados; Bedrock stub |
| Custo lab | `$$`–`$$$`: **a referência traz ALB, banco e cache, todos com custo fixo**. No lab usar uma versão mínima (Lambda + API Gateway, sem banco), com ADR |
| Fonte | [Guidance for Multi-Provider Generative AI Gateway on AWS](https://docs.aws.amazon.com/solutions/multi-provider-generative-ai-gateway-on-aws/) (Solutions Library) · [Streamline AI operations with the Multi-Provider Generative AI Gateway reference architecture](https://aws.amazon.com/blogs/machine-learning/streamline-ai-operations-with-the-multi-provider-generative-ai-gateway-reference-architecture) (AWS ML Blog, 21/11/2025 segundo o índice da busca) |

### 09-B · Modelo aberto próprio versus modelo fechado, com avaliação
| Campo | Conteúdo |
|---|---|
| O que constrói | Mesmo conjunto de tarefas executado em um modelo aberto hospedado por você e no Claude, com métricas de qualidade, latência e custo por mil chamadas; resultado alimenta uma política de cascata (barato primeiro, Claude nos casos difíceis) |
| Serviços AWS | ECS (vLLM ou Ollama em contêiner) ou Bedrock Custom Model Import; S3 (pesos); ECR; CloudWatch |
| Componente Claude | Claude como referência e juiz independente, e como destino da cascata. **Prova:** 4.6, 5.5, 5.2 |
| Outra cloud | Cloud Run com GPU ou GKE + vLLM; Vertex AI Model Garden (GCP) |
| Floci | Médio: ECS roda contêiner real, o que permite rodar um modelo pequeno em CPU no teste; Custom Model Import não aparece na matriz |
| Custo lab | `$$`–`$$$` se usar GPU; `$` com modelo pequeno em CPU, mas a comparação perde representatividade (dizer isso) |
| Fontes | [Deploy LLMs on Amazon EKS using vLLM Deep Learning Containers](https://aws.amazon.com/blogs/architecture/deploy-llms-on-amazon-eks-using-vllm-deep-learning-containers/) (AWS Architecture Blog, data a confirmar) · [Import a pre-trained model into Amazon Bedrock](https://docs.aws.amazon.com/bedrock/latest/userguide/import-pre-trained-model.html) · [Choosing a generative AI service](https://docs.aws.amazon.com/decision-guides/latest/decision-guides/genai-guide.html) (Decision Guide). **Lacuna:** não achei guia da AWS sobre Ollama; a parte do Ollama é da aula |

### 09-C · Roteador por sensibilidade de dados: modelo aberto local ou Claude (sugestão minha)
| Campo | Conteúdo |
|---|---|
| O que constrói | Gateway fino que classifica cada requisição por sensibilidade (detecção de PII e regra de tenant). Dado sensível fica no modelo aberto, no ambiente do cliente; o resto vai para o Claude; falha de um provedor aciona fallback **só dentro da mesma classe de sensibilidade** |
| Serviços AWS | API Gateway, Lambda, Comprehend (PII), ECS (Ollama em contêiner), Bedrock, DynamoDB (política e trilha), CloudWatch |
| Componente Claude | **Prova:** 5.2 (critérios de escalonamento), 4.1 (critérios explícitos), 2.2, 5.3. **Cenário:** agente de suporte ao cliente |
| Outra cloud | Sensitive Data Protection (DLP) + Cloud Run + Claude na Vertex AI (GCP) |
| Floci | Alto: ECS com contêiner real (Ollama real é viável), Lambda, DynamoDB, Comprehend (listado, 5 operações; detecção de PII a confirmar) |
| Custo lab | `$` com modelo pequeno em CPU |
| Fonte | Composição da 09-A (gateway) com os princípios de entrada segura em [Capability 2: secure access to generative AI RAG techniques](https://docs.aws.amazon.com/prescriptive-guidance/latest/security-reference-architecture/gen-ai-rag.html) (Prescriptive Guidance, mesmo uso de filtragem e controle de dados); a regra de residência é decisão minha |

**Recomendação: 09-C.** "Aberto vs. fechado" na vida real raramente é questão de benchmark; é questão de *que dados podem sair*. A 09-C faz a aula virar política executável e testável: dado sensível nunca chega ao provedor externo, mesmo no fallback, e isso é uma propriedade verificável por teste. Usa o Ollama da aula de verdade (o ECS do Floci roda contêiner) e o OpenRouter vira a discussão de ADR (gateway pronto vs. código próprio). A 09-A é a referência oficial e fica como alternativa; adoto só a versão mínima por causa do custo fixo (ALB, banco, cache). Se você quiser mais fidelidade às fontes oficiais que à prova, escolha a 09-A.

---

## Unidade 10 · RAG

**Títulos usados:** o que é RAG (assistida) · embeddings e vector databases · primeiro RAG com JavaScript e Neo4j.

**Tema de alto valor:** RAG como problema de *confiança na resposta* (proveniência, citação, "não sei") mais do que de recuperação.

**Confirmar nas legendas e no PDF:** o corpus usado; por que Neo4j (busca vetorial do Neo4j ou grafo?); como a aula chunkeia e avalia. **Aviso do exame:** embeddings e bancos vetoriais estão fora do escopo, então a retenção da prova mora no componente Claude, não no índice.

### 10-A · RAG gerenciado com Bedrock Knowledge Bases
| Campo | Conteúdo |
|---|---|
| O que constrói | Documentos no S3 sincronizados com uma base de conhecimento; a API `Retrieve`/`RetrieveAndGenerate` devolve respostas com citações; Guardrails e filtros por metadado |
| Serviços AWS | Bedrock Knowledge Bases, S3 Vectors ou OpenSearch Serverless, Bedrock Guardrails, KMS, CloudWatch |
| Componente Claude | Geração com citações. **Prova:** 5.6, 4.1. **Curso:** *Claude with Amazon Bedrock* |
| Outra cloud | Vertex AI RAG Engine (GCP); Azure AI Search + Azure OpenAI/Claude (Azure) |
| Floci | **Baixo: Bedrock Knowledge Bases e Agent não estão na matriz do Floci** (lacuna do emulador, com evidência na matriz). S3 Vectors e OpenSearch estão |
| Custo lab | `$` com S3 Vectors; **`$$$` com OpenSearch Serverless** se houver capacidade mínima cobrada (validar) |
| Fontes | [Vector database options](https://docs.aws.amazon.com/prescriptive-guidance/latest/choosing-an-aws-vector-database-for-rag-use-cases/vector-db-options.html) (Prescriptive Guidance; S3 Vectors para baixo custo e baixa frequência, OpenSearch para latência) · [Retrieval Augmented Generation options and architectures on AWS](https://docs.aws.amazon.com/pdfs/prescriptive-guidance/latest/retrieval-augmented-generation-options/retrieval-augmented-generation-options.pdf) · [Capability 2: RAG security](https://docs.aws.amazon.com/prescriptive-guidance/latest/security-reference-architecture/gen-ai-rag.html) (filtros de metadado, CMK, validação na ingestão contra injeção indireta) |

### 10-B · GraphRAG com Neptune (o equivalente do Neo4j)
| Campo | Conteúdo |
|---|---|
| O que constrói | Extração de entidades e relações do corpus para um grafo, com busca vetorial e expansão pelo grafo; consultas multi-salto |
| Serviços AWS | Bedrock Knowledge Bases com Neptune Analytics (ou Neptune + OpenSearch), S3, Lambda |
| Componente Claude | Extração de entidades com schema (4.3), resposta com origem (5.6) |
| Outra cloud | Neo4j Aura em GCP ou Azure (mesmo produto da aula), ou Cosmos DB Gremlin (Azure): validar no post |
| Floci | Médio-baixo: Neptune em contêiner (Gremlin/openCypher), mas **Neptune Analytics não aparece na matriz**; KB também não |
| Custo lab | `$$`–`$$$`: capacidade de grafo provisionada tem custo contínuo (valor a confirmar); destruir logo |
| Fontes | [Combat financial fraud with GraphRAG on Amazon Bedrock Knowledge Bases](https://aws.amazon.com/blogs/machine-learning/combat-financial-fraud-with-graphrag-on-amazon-bedrock-knowledge-bases/) (AWS ML Blog) · [Build a knowledge base with Amazon Neptune Analytics graphs](https://docs.aws.amazon.com/bedrock/latest/userguide/knowledge-base-build-graphs.html) (a documentação diz que só aceita S3 como fonte e não tem autoescala) · [Unified Knowledge Graph RAG on AWS](https://aws.amazon.com/blogs/opensource/unified-knowledge-graph-rag-on-aws-graphrag-and-lightrag-on-one-stack/) (amostra open source; os autores dizem que não é pronta para produção) |

### 10-C · RAG agêntico com proveniência e incerteza (sugestão minha)
| Campo | Conteúdo |
|---|---|
| O que constrói | Retriever como **tool** (`search_docs`, `get_passage`) sobre S3 Vectors, chamado pelo agente. O Claude responde com mapa afirmação → trecho de origem, marca o que não está nos documentos como "sem evidência", e registra conflito entre fontes. Resposta sem citação válida é rejeitada por um validador e retentada; a falha de busca é devolvida como erro estruturado, não como "sem resultados" |
| Serviços AWS | S3 Vectors, Lambda (retriever e validador), API Gateway, DynamoDB (trilha de proveniência), Bedrock (embeddings e Claude), CloudWatch |
| Componente Claude | **Prova:** 5.6 proveniência e incerteza, 5.3 propagação de erro, 5.1 preservação de contexto, 2.1 descrição de tools, 4.1 critérios, 4.4 validação. **Cenário:** sistema de pesquisa multiagente. **Curso:** *Building with the Claude API* |
| Outra cloud | Vertex AI Vector Search ou RAG Engine + Cloud Run + Claude na Vertex AI (GCP) |
| Floci | Alto na infra: S3 Vectors (16 operações), Lambda, DynamoDB. **Embeddings:** Bedrock Runtime é stub, então os testes usam vetores sintéticos determinísticos (ADR); recall real só numa rodada paga |
| Custo lab | `$` |
| Fontes | Mesmas fontes de custo e segurança da 10-A, mais [Core services: knowledge bases](https://docs.aws.amazon.com/prescriptive-guidance/latest/govern-architect-agentic-ai/core-services-knowledge-bases.html) (Prescriptive Guidance). A camada de proveniência é desenho meu |

**Recomendação: 10-C.** O índice é commodity e está fora do escopo da prova; o que faz um RAG ser aceitável em empresa é poder responder "de onde veio isso?" e "o sistema sabe que não sabe?". A 10-C testa essas propriedades (toda afirmação cita um trecho existente; busca que falha não vira "não encontrei") e roda inteira no Floci, o que a 10-A não consegue. As escolhas da 10-A (S3 Vectors por custo, Knowledge Bases como caminho de produção) e da 10-B (grafo ou não, em relação ao Neo4j da aula) viram **ADRs comparativos**, sem implementação. Risco: o Neo4j da aula pode ser o ponto central do exercício; se for, 10-B passa a ser a opção natural e eu a reavalio depois de ler as legendas.

---

## Pendências e perguntas para você

1. **Escolha por unidade.** Uma opção em cada unidade 02 e 04 a 10 (ou só nas que você quiser agora; o `CLAUDE.md` pede ao menos uma por disciplina).
2. **Nuvem comparativa.** GCP (Claude na Vertex AI, mais fiel) ou Azure/OCI?
3. **Teto de orçamento por módulo.** Com o teto definido, desenho o AWS Budgets e a escala do lab. Não assumi nenhum valor.
4. **Execução real paga.** Opções que dependem de Claude (todas) só validam o contrato no Floci. Autoriza **uma rodada real e pequena** por projeto (Bedrock ou API da Anthropic) para medir acerto e custo reais? Se sim, com qual credencial (papel IAM com OIDC, sem chaves estáticas)?
5. **Domínio 3.** Fazer a 07-B como projeto adicional, ou tratar o uso de Claude Code neste repositório como a prática do Domínio 3?
6. **Fontes das aulas.** Para fechar cada opção preciso das legendas e do PDF da disciplina, pelo navegador integrado e com você logado na Platos. Sugiro começar pela unidade 04, que tem a variante mais dependente da técnica ensinada.
7. **Guia do exame.** Posso conferir os ids de tarefa contra o guia oficial (exige login) antes de escrever os ADRs?

**Verificações que ficaram pendentes por falta de ambiente:** `floci aws services` (lista completa de operações e versão), existência de Pipelines e Model Registry no SageMaker do Floci, execução real de jobs no Batch do Floci, detecção de PII no Comprehend do Floci, preços atuais (Infracost). Todas entram no início da implementação, antes de qualquer teste.

## Fontes principais (consultadas em 2026-11-18)

- Floci: [matriz de serviços](https://floci.io/floci/services/) · [repositório](https://github.com/floci-io/floci)
- AWS Prescriptive Guidance: [CI/CD and automation for serverless AI](https://docs.aws.amazon.com/prescriptive-guidance/latest/agentic-ai-serverless/cicd-and-automation.html) · [Edge AI](https://docs.aws.amazon.com/prescriptive-guidance/latest/agentic-ai-serverless/edge-ai.html) · [MCP strategies](https://docs.aws.amazon.com/prescriptive-guidance/latest/mcp-strategies/mcp-strategies.pdf) · [Vector database options](https://docs.aws.amazon.com/prescriptive-guidance/latest/choosing-an-aws-vector-database-for-rag-use-cases/vector-db-options.html)
- AWS Solutions Library: [Multi-Provider Generative AI Gateway](https://docs.aws.amazon.com/solutions/multi-provider-generative-ai-gateway-on-aws/) · [MCP Servers on AWS](https://docs.aws.amazon.com/solutions/deploying-model-context-protocol-servers-on-aws/) · [MLOps Workload Orchestrator](https://docs.aws.amazon.com/solutions/latest/mlops-workload-orchestrator/architecture-overview.html) · [Evaluating GenAI apps with OSS](https://aws.amazon.com/solutions/guidance/evaluating-generative-ai-applications-using-oss-on-aws/)
- Blogs oficiais da AWS: ver os links em cada opção.
