# Disciplina 07 · Ferramentas de IA para Gestão de projetos — opções de projeto

Status: **proposta, sem implementação.** Data: 2026-11-18. Cobre as unidades 01 a 10.
Quem escolhe é você; este documento só recomenda.

## 0. Como ler e o que ainda não está confirmado

- **Não tive acesso às aulas, às legendas nem ao PDF da disciplina.** Tudo parte dos títulos das unidades em `docs/curso/PROGRESSO.md` (seção 07). Cada bloco termina com **"Confirmar"**: o que checar nas legendas e no PDF antes de decidir.
- **Fontes oficiais da AWS: pouco material específico de gestão de projetos.** A única referência temática direta que encontrei é o Prescriptive Guidance [Generative AI use cases for project management](https://docs.aws.amazon.com/prescriptive-guidance/latest/strategy-accelerate-software-dev-lifecycle-gen-ai/generative-ai-capabilities-proj-mgmt.html). Ela lista casos de uso (priorização de backlog, estimativa, distribuição de tarefas, relatórios de status), mas não traz arquitetura de referência. O restante são **padrões AWS genéricos (extração, lote, aprovação humana, anomalia, BI) que adaptei ao tema**. Marco em cada opção o que é "padrão da fonte" e o que é "adaptação minha". Nenhuma opção é uma arquitetura publicada da AWS para gestão de projetos.
- **Nada aqui é afirmação sobre empresas**; não há caso FAANG/banco nesta proposta. Se quiser, adiciono na fase de pesquisa da unidade escolhida.
- **Custos em lab são estimativas minhas**, não cotação. Presumem região única, poucas centenas de invocações por teste, tudo destruído no fim. Validar com Infracost e AWS Pricing Calculator antes de aplicar. A maior parcela é sempre tokens do Claude; o resto fica perto de zero em serverless.
- **IDs das tarefas** (1.1 a 5.6) são os do CLAUDE.md (CCAR-F v1.0).

### 0.1 Fatos que mudam o desenho (verificados)

| Fato | Impacto | Fonte |
|---|---|---|
| Bedrock batch inference dá 50% de desconto, exige no mínimo 100 requisições por job, é assíncrono (S3 → S3) e **não aceita tool calling em jobs `Converse`** (`toolConfig` falha com 400; use `InvokeModel`). Saída estruturada por JSON schema é suportada nos dois tipos. | A tarefa **4.5** na AWS é batch inference do Bedrock; a Message Batches API é da API da Anthropic. Decidir em ADR qual usar (ver Perguntas). Relatórios em lote não devem depender de tools. | [Batch inference](https://docs.aws.amazon.com/bedrock/latest/userguide/batch-inference.html) |
| Saída estruturada no Bedrock: `outputConfig.textFormat` (Converse) / `output_config.format` (InvokeModel Claude) e `strict: true` em tools. Schema é um subconjunto do JSON Schema 2020-12; primeira compilação leva até ~90 s e fica em cache 24 h. | **4.3** pode usar tool_use (como a prova cobra) ou JSON schema nativo; ADR compara. A validação semântica (**4.4**) continua sendo nossa: o schema garante forma, não verdade. | [Structured output](https://docs.aws.amazon.com/bedrock/latest/userguide/structured-output.html) |
| Step Functions tem padrão de callback com `waitForTaskToken` (pausa até um humano aprovar). | Base do handoff humano (**1.4**, **5.2**). | [Service integration patterns](https://docs.aws.amazon.com/step-functions/latest/dg/connect-to-resource.html), [exemplo de aprovação](https://aws.amazon.com/blogs/compute/orchestrating-a-security-incident-response-with-aws-step-functions/) |
| Eventos de job do Bedrock chegam no EventBridge (`aws.bedrock`, `Batch Inference Job State Change`). | Disparar pós-processamento sem polling. | [EventBridge for Bedrock](https://docs.aws.amazon.com/bedrock/latest/userguide/monitoring-eventbridge-how-it-works.html) |
| Amazon Q Developer in chat applications (antigo AWS Chatbot) conecta Bedrock Agents a Slack/Teams. | Opção de canal na unidade 09. | [Doc](https://docs.aws.amazon.com/chatbot/latest/adminguide/connect-bedrock-agents.html) |

### 0.2 Cobertura no Floci (o que dá para afirmar hoje)

O `floci` **não está instalado nesta sessão** (`which floci` vazio), então não rodei `floci aws services`. A tabela vem das páginas [floci.io/aws](https://floci.io/aws/) e [floci.io/floci/services](https://floci.io/floci/services/), lidas por resumo; **tratar como "a confirmar com `floci aws services` na versão fixada"**. Fontes divergem na contagem de serviços (a home diz 135; resultados de busca antigos citam 45 a 82), então a versão importa.

| Serviço | O que as páginas dizem | Nível |
|---|---|---|
| S3, SQS, SNS, DynamoDB, Lambda, KMS, Secrets Manager, CloudWatch (Logs/Métricas), Kinesis, Config, Budgets | Listados; Lambda roda em contêiner Docker real | Alto |
| Step Functions | 32 operações listadas; **task token, Map e integrações com Bedrock não aparecem na página** | Médio (testar `waitForTaskToken` cedo) |
| EventBridge + Scheduler + Pipes | Listados (Scheduler: 12 operações) | Alto |
| API Gateway REST e v2 | Listados | Alto |
| SES / SES v2 | Listados | Alto |
| Textract, Transcribe, Comprehend | Listados (6, 8 e 5 operações) | Médio (provável resposta simulada; confirmar) |
| Athena + Glue | Athena roda em sidecar DuckDB; Glue catalogando tabela sobre S3 | Médio |
| **Bedrock / Bedrock Runtime** | Bedrock: 18 operações (guardrails, modelos, perfis de inferência, tags). Runtime: rotas `converse` e `invoke` como **stub; streaming retorna 501**. Nada sobre invocação real | **Baixo**: só contrato; resposta é mock |
| Bedrock batch (`CreateModelInvocationJob`) | **Não encontrei evidência** | Desconhecido, assumir ausente |
| Bedrock Agents | Não listado (existe um stub canned de AgentCore) | Ausente |
| QuickSight | "Somente metadados" | Baixo |
| SageMaker, Forecast, Q Business | Não confirmados | Ausente/desconhecido |
| S3 notifications | Não confirmado na página | Desconhecido |

Consequências que valem para todas as opções (virariam ADR):
1. **O Claude é sempre atrás de uma porta** (interface `ModelClient`) com implementação Bedrock real e implementação fake no Floci. Os testes de integração verificam contrato, schema, orquestração, retentativa e escalonamento, **não a qualidade do modelo**. Isso é lacuna do emulador, não falha do projeto.
2. **Um teste de fumaça real contra o Bedrock**, fora do Floci, manual e com teto de tokens, para provar que a porta funciona. Pede sua aprovação de custo.
3. **Evitar Bedrock Agents**: o loop de agente por `stop_reason` (1.1) fica no nosso código (Lambda/Step Functions), o que também é mais fiel à prova.
4. Para batch, no Floci simulamos com Step Functions + SQS + Lambda; a API real só no teste de fumaça.

---

## 1. Visão geral e recomendação

Recomendo **8 projetos** que cobrem as 10 unidades (03+04 e 06+07 são agrupadas; as demais são individuais). A cobertura da prova está na seção 12.

| Projeto | Unidade(s) | Opção recomendada | Tarefas da prova (principais) | Floci | Custo lab (est.) |
|---|---|---|---|---|---|
| P1 | 01 · planejamento e escopo | 01-A Decompositor de escopo com gate humano | 1.2 1.3 1.4 1.6 4.3 4.4 | Médio | ~US$ 2–5 |
| P2 | 02 · priorização de backlog | 02-A Triagem e ranking com critérios explícitos e calibração | 4.1 4.2 4.3 4.6 5.5 | Alto (lógica) | ~US$ 3–8 |
| P3 | 03+04 · cronograma, capacidade, estimativas | 03-C Forecast estatístico + Claude como extrator e narrador | 4.3 5.5 5.6 2.1 2.2 | Alto | ~US$ 2–5 |
| P4 | 05 · riscos e AIOps de projeto | 05-C Motor de escalonamento de riscos | 1.4 5.2 4.3 5.3 | Alto | ~US$ 2–5 |
| P5 | 06+07 · reuniões e status reports | 06-C Pipeline ata → status → resumo executivo, com aprovação | 4.1–4.5 1.4 5.2 5.6 | Médio | ~US$ 4–10 |
| P6 | 08 · governança, compliance, qualidade | 08-C Gate de qualidade com Claude Code em CI + trilha de auditoria | 3.6 4.6 4.1 5.5 | Alto | ~US$ 2–5 |
| P7 | 09 · automação de boards e comunicação | 09-C Camada de tools do board + agente com validação | 2.1 2.2 2.3 2.4 1.5 | Alto | ~US$ 2–5 |
| P8 | 10 · portfólio e OKRs | 10-C Consolidação multiagente de OKRs com proveniência | 1.2 1.3 5.1 5.6 | Médio | ~US$ 3–8 |

O CLAUDE.md exige "pelo menos um por módulo". Se quiser reduzir esforço, a **ordem de prioridade** que sugiro é P5, P4, P1, P2; os demais ficariam como design doc.

Raciocínio de arquiteto: a disciplina é, na essência, **LLM como camada de decisão assistida sobre dados de projeto**. O que muda entre as unidades é o *grau de autonomia* e o *custo do erro*. Por isso as recomendações priorizam, em cada unidade, o ponto fraco clássico: extração confiável (06), calibração do ranking (02), incerteza do forecast (03/04), quando escalar para humano (05), conteúdo que sai da empresa (07), e escrita em sistemas de registro (09). É aí que um engenheiro sênior se diferencia, não em "chamar o modelo".

---

## 2. Unidade 01 · Planejamento e escopo (aulas pt 1 a 3)

Tema: transformar requisitos/pedido em plano estruturado (escopo, entregáveis, WBS, premissas, riscos iniciais).

### 01-A (recomendada) · Decompositor de escopo com gate humano

- **Constrói:** entrada de requisitos em texto → coordenador decompõe em épicos; subagentes (um por épico, contexto isolado) geram histórias, critérios de aceite e premissas; gates programáticos validam (cobertura dos requisitos, IDs únicos, sem épico órfão); um humano aprova o plano antes de gravar.
- **Serviços AWS:** Step Functions (Map + `waitForTaskToken`), Lambda, Bedrock (Claude), S3, DynamoDB, SNS, CloudWatch, KMS.
- **Claude / prova:** 1.2 coordenador e subagentes · 1.3 passagem de contexto explícita · 1.6 decomposição · 1.4 gate e handoff · 4.3 saída estruturada · 4.4 validação e retentativa.
- **Outra cloud:** GCP: Cloud Workflows (callbacks), Cloud Run, Claude na Vertex AI, Firestore, Cloud Storage, Pub/Sub. Equivalência direta; a diferença é o callback (Workflows usa callback endpoints em vez de task token).
- **Floci:** Médio. Step Functions, Lambda, DynamoDB, S3, SNS ok; **validar `waitForTaskToken` e Map** logo no início; Bedrock é fake.
- **Custo lab:** ~US$ 2–5 (tokens).
- **Fonte:** padrão de decomposição agêntica em [Agentic AI patterns and workflows](https://docs.aws.amazon.com/prescriptive-guidance/latest/agentic-ai-patterns/introduction.html) e [Agentic workflow patterns](https://docs.aws.amazon.com/prescriptive-guidance/latest/agentic-ai-patterns/agentic-workflow-patterns.html); caso de uso em [Generative AI use cases for project management](https://docs.aws.amazon.com/prescriptive-guidance/latest/strategy-accelerate-software-dev-lifecycle-gen-ai/generative-ai-capabilities-proj-mgmt.html); callback em [Step Functions](https://docs.aws.amazon.com/step-functions/latest/dg/connect-to-resource.html). Adaptação minha: a composição para escopo.

### 01-B · Ingestão de SOW/RFP com extração estruturada

- **Constrói:** documentos de escopo (PDF/DOCX) → extração de entregáveis, prazos, restrições e exclusões em JSON com proveniência (página/trecho) → revisão humana por amostragem.
- **Serviços AWS:** S3, Bedrock Data Automation ou Textract + Bedrock, Step Functions, DynamoDB, EventBridge.
- **Claude / prova:** 4.3 · 4.1 · 5.6 proveniência e incerteza · 5.5 revisão humana por amostragem. Menos domínio 1.
- **Outra cloud:** GCP: Document AI + Claude na Vertex AI. Direto.
- **Floci:** Médio (Textract listado; Bedrock Data Automation **não** aparece, então no Floci só via Textract/mock).
- **Custo lab:** ~US$ 2–6; BDA cobra por página (validar).
- **Fonte:** [Guidance for Multimodal Data Processing Using Amazon Bedrock Data Automation](https://docs.aws.amazon.com/solutions/multimodal-data-processing-using-amazon-bedrock-data-automation/) e [IDP at scale with generative AI and BDA](https://aws.amazon.com/blogs/machine-learning/intelligent-document-processing-at-scale-with-generative-ai-and-amazon-bedrock-data-automation/). Adaptação minha: aplicar a SOW em vez de formulários.

### 01-C (sugestão minha) · Agente de "grooming" que faz perguntas antes de planejar

- **Constrói:** loop de agente que lê o pedido, lista lacunas e ambiguidades, pergunta ao solicitante (pausa) e só então gera o plano; as respostas voltam ao registro.
- **Serviços AWS:** Lambda (loop por `stop_reason`), Step Functions (espera), DynamoDB, SNS/SES, Bedrock.
- **Claude / prova:** 1.1 loop por `stop_reason` · 1.4 · 5.2 · 2.1.
- **Outra cloud:** GCP, equivalente ao 01-A.
- **Floci:** Médio.
- **Custo lab:** ~US$ 2–4.
- **Fonte:** inspirada no grooming agent de [AI-SDLC on Bedrock AgentCore](https://aws.amazon.com/blogs/industries/reinventing-software-delivery-with-ai-sdlc-on-amazon-bedrock-agentcore/) (usa AgentCore; nós replicaríamos o padrão sem AgentCore).

**Recomendação: 01-A.** Entrega o conjunto mais denso do domínio 1 (27% da prova) com baixo risco: decomposição + gate são determinísticos e testáveis no Floci, e a pausa humana vira uma decisão arquitetural defensável (ADR sobre onde o humano entra). 01-C pode virar variante do mesmo projeto.

**Confirmar nas legendas/PDF:** qual método de escopo foi ensinado (WBS, user story mapping, MoSCoW?); se as aulas usam alguma ferramenta específica (Jira, Notion, ChatGPT) que devamos espelhar; se há template de documento de escopo no PDF.

---

## 3. Unidade 02 · Priorização de backlog (aulas pt 1 a 3)

Tema: ordenar itens por valor, esforço, risco e dependências.

### 02-A (recomendada) · Triagem e ranking com critérios explícitos e calibração

- **Constrói:** tickets sintéticos chegam; Claude classifica (duplicata, tipo, urgência) e pontua por critérios explícitos (RICE ou o que o curso ensinar) com few-shot; saída estruturada com justificativa curta e campo de confiança; um conjunto "ouro" rotulado mede concordância; itens de baixa confiança vão para fila humana.
- **Serviços AWS:** Step Functions (Distributed Map ou Map), Lambda, Bedrock, DynamoDB, SQS (fila de revisão), CloudWatch (métrica de concordância e alarme), S3.
- **Claude / prova:** 4.1 critérios explícitos · 4.2 few-shot · 4.3 saída estruturada · 4.6 revisão multi-instância (duas passagens independentes) · 5.5 calibração · 5.2 escalonamento. Cenário da prova: extração de dados estruturados.
- **Outra cloud:** GCP: Cloud Workflows + Cloud Run Jobs, Claude na Vertex AI, Firestore, Pub/Sub, Cloud Monitoring. Direto.
- **Floci:** Alto na lógica (DynamoDB, SQS, Step Functions, CloudWatch); Bedrock fake, então a **métrica de qualidade do ranking só é medida no teste de fumaça real**.
- **Custo lab:** ~US$ 3–8 (centenas de tickets, duas passagens).
- **Fonte:** casos de uso de backlog e duplicatas em [Generative AI use cases for project management](https://docs.aws.amazon.com/prescriptive-guidance/latest/strategy-accelerate-software-dev-lifecycle-gen-ai/generative-ai-capabilities-proj-mgmt.html); orquestração de lote em [Bedrock batch orchestration with Step Functions](https://aws.amazon.com/blogs/machine-learning/build-a-serverless-amazon-bedrock-batch-job-orchestration-workflow-using-aws-step-functions/); saída estruturada em [doc](https://docs.aws.amazon.com/bedrock/latest/userguide/structured-output.html). Adaptação minha: a calibração contra conjunto ouro.

### 02-B · Grooming agent sobre tickets reais (Jira/GitHub Issues)

- **Constrói:** agente que lê o ticket, identifica lacunas, pergunta ao autor, reescreve a descrição e propõe prioridade, gravando de volta no sistema de registro.
- **Serviços AWS:** Lambda, API Gateway, Secrets Manager, Bedrock, DynamoDB, EventBridge.
- **Claude / prova:** 1.1 · 1.4 · 2.1 · 2.2 (tool de escrita com erro estruturado) · 5.2.
- **Outra cloud:** GCP: Cloud Run + Secret Manager + Claude na Vertex AI.
- **Floci:** Médio (a integração com Jira é mock).
- **Custo lab:** ~US$ 2–4.
- **Fonte:** padrão do grooming agent em [AI-SDLC on Bedrock AgentCore](https://aws.amazon.com/blogs/industries/reinventing-software-delivery-with-ai-sdlc-on-amazon-bedrock-agentcore/) (conferir a data de publicação antes de citar em post).

### 02-C (sugestão minha) · Priorização *explicável*: Claude extrai fatores, a fórmula decide

- **Constrói:** Claude só extrai fatores (alcance, impacto, esforço, dependências) em JSON; **a pontuação final é código determinístico**; qualquer mudança de ranking gera um diff explicável.
- **Serviços AWS:** Lambda, Bedrock, DynamoDB, EventBridge.
- **Claude / prova:** 4.3 · 4.1 · 5.6 · 5.5.
- **Outra cloud:** GCP, equivalente.
- **Floci:** Alto.
- **Custo lab:** ~US$ 1–3.
- **Fonte:** decisão minha, motivada pelo risco de deixar o LLM calcular ordenações; sem fonte AWS específica.

**Recomendação: 02-A**, absorvendo a ideia de 02-C (a fórmula fica no código; o Claude extrai fatores e explica). Por quê: prioridade é decisão com consequência política; o desenho precisa de critérios auditáveis, medida de concordância e porta para o humano. Isso é exatamente o que o domínio 4 e 5.5 cobram.

**Confirmar:** quais frameworks de priorização o curso ensina (RICE, WSJF, MoSCoW, Kano); se há conjunto de dados de exemplo no PDF; se as aulas esperam integração com alguma ferramenta.

---

## 4. Unidades 03 e 04 · Cronograma/capacidade/alocação e estimativas/previsões (agrupadas; aulas 03 pt 1–2, 04 pt 1–2)

Tema: transformar histórico em previsão de prazo, capacidade e alocação, com incerteza. **Cada opção cobre as duas unidades**; deixo claro o que cai em cada uma.

### 03-A · Forecast com modelo de série temporal (Chronos-Bolt/AutoGluon) + Claude narrador

- **Constrói:** velocity/throughput histórico (sintético) → previsão probabilística de entrega com Chronos-Bolt (zero-shot); Claude gera cenários e o plano de alocação a partir dos números.
- **Serviços AWS:** SageMaker (endpoint serverless ou batch transform), S3, Lambda, Step Functions, Bedrock, DynamoDB, CloudWatch.
- **Claude / prova:** 5.6 proveniência e incerteza · 2.1 · 4.3. O componente ML não é da prova.
- **Outra cloud:** GCP: Vertex AI (Chronos via Model Garden ou TimesFM) + BigQuery ML. Equivalente aproximado; modelo muda.
- **Floci:** **Baixo** (SageMaker não confirmado); o modelo teria de rodar em contêiner Lambda ou ser mockado.
- **Custo lab:** ~US$ 3–10; endpoint ocioso seria custo fixo, então só batch ou Lambda em contêiner.
- **Fonte:** [Chronos-Bolt e AutoGluon](https://aws.amazon.com/blogs/machine-learning/fast-and-accurate-zero-shot-forecasting-with-chronos-bolt-and-autogluon/) e [AutoGluon-TimeSeries](https://aws.amazon.com/blogs/machine-learning/easy-and-accurate-forecasting-with-autogluon-timeseries/). Adaptação minha: aplicar a throughput de projeto.

### 03-B · Agente de capacidade com tools sobre calendário, alocação e férias

- **Constrói:** agente com 3–4 tools (consultar capacidade da pessoa, calendário, alocações atuais, propor alocação) que monta o cronograma e explica conflitos; tools devolvem erro estruturado e retentável.
- **Serviços AWS:** Lambda (tools), API Gateway, DynamoDB, Bedrock, Step Functions, CloudWatch.
- **Claude / prova:** 1.1 · 2.1 · 2.2 · 2.3 poucas tools · 5.3 propagação de erros. Cenário: produtividade de devs.
- **Outra cloud:** GCP: Cloud Run + Firestore + Vertex AI (Claude).
- **Floci:** Alto.
- **Custo lab:** ~US$ 2–5.
- **Fonte:** [Agentic workflow patterns](https://docs.aws.amazon.com/prescriptive-guidance/latest/agentic-ai-patterns/agentic-workflow-patterns.html) e o caso de uso de distribuição de tarefas em [Generative AI use cases for project management](https://docs.aws.amazon.com/prescriptive-guidance/latest/strategy-accelerate-software-dev-lifecycle-gen-ai/generative-ai-capabilities-proj-mgmt.html).

### 03-C (recomendada, sugestão minha) · Forecast estatístico (Monte Carlo) + Claude extrator e narrador

- **Constrói:** (04) Claude extrai atributos dos tickets (tamanho relativo, tipo, dependências) em JSON, com confiança; (03) uma Lambda determinística roda simulação de Monte Carlo sobre throughput histórico e produz datas P50/P85/P95; Claude narra o resultado **sem inventar números** (todo valor citado precisa existir no JSON do forecast; validador rejeita o resto); baixa confiança vai para revisão humana.
- **Serviços AWS:** Lambda, Step Functions, DynamoDB, S3, Bedrock, EventBridge Scheduler (recalcula semanalmente), CloudWatch.
- **Claude / prova:** 4.3 · 4.4 (validar números narrados) · 5.5 · 5.6 · 2.1 · 2.2.
- **Outra cloud:** GCP: Cloud Run + BigQuery + Claude na Vertex AI. Direto.
- **Floci:** Alto (nenhum serviço fora da lista estável).
- **Custo lab:** ~US$ 2–5.
- **Fonte:** a própria nota do AutoGluon-TimeSeries diz que métodos simples/estatísticos já são baselines fortes e difíceis de bater ([blog](https://aws.amazon.com/blogs/machine-learning/easy-and-accurate-forecasting-with-autogluon-timeseries/)); o desenho combina isso com o uso de LLM só onde ele agrega (extração e linguagem). Adaptação minha.

**Recomendação: 03-C.** Com histórico pequeno de um time, ML pesado raramente supera simulação por throughput, custa mais, e é pouco testável localmente. O Claude fica onde é bom (ler tickets, explicar) e fora de onde é ruim (aritmética). 03-A pode virar "extensão opcional" comparando o baseline contra Chronos.

**Confirmar:** quais técnicas de estimativa o curso ensina (pontos, PERT, três pontos, Monte Carlo, EVM); se 03 e 04 usam as mesmas ferramentas; se há exercício com dataset no PDF. Se o curso for centrado em ferramentas SaaS, o projeto continua válido como "o que haveria por trás".

---

## 5. Unidade 05 · Riscos e AIOps de projeto (aulas pt 1 e 2)

Tema: detectar, pontuar e escalar riscos de projeto com sinais contínuos (AIOps de projeto = aplicar práticas de operações a sinais de entrega).

### 05-A · Registro de riscos contínuo com baseline por projeto

- **Constrói:** sinais sintéticos (atrasos, escopo mudando, bloqueios) chegam por agenda/evento; Claude avalia probabilidade e impacto com evidência citada, em JSON, comparando ao baseline daquele projeto; o registro de riscos é atualizado.
- **Serviços AWS:** EventBridge Scheduler, Lambda, Bedrock, DynamoDB, CloudWatch (anomaly detection nos números), SNS.
- **Claude / prova:** 4.3 · 4.1 · 5.6 · 5.3 (fail-open: falha do analisador não bloqueia o fluxo).
- **Outra cloud:** GCP: Cloud Scheduler + Cloud Run + Firestore + Cloud Monitoring.
- **Floci:** Alto.
- **Custo lab:** ~US$ 2–4.
- **Fonte:** padrão de baseline por usuário, saída estruturada e fail-open em [Build intelligent security for healthcare APIs with Amazon Bedrock](https://aws.amazon.com/blogs/machine-learning/build-intelligent-security-for-healthcare-apis-with-amazon-bedrock/) (aplicação em segurança; adaptação minha para risco de projeto); métrica/alarme em [CloudWatch anomaly detection](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch_Anomaly_Detection.html).

### 05-B · Telemetria de entrega com alarmes e resumo

- **Constrói:** métricas de entrega (lead time, WIP, itens bloqueados) publicadas no CloudWatch com detecção de anomalia; alarme dispara Lambda que pede ao Claude um resumo acionável e notifica.
- **Serviços AWS:** CloudWatch Metrics + Alarms, EventBridge, Lambda, Bedrock, SNS, DynamoDB.
- **Claude / prova:** 4.3 · 5.3 · 5.6.
- **Outra cloud:** GCP: Cloud Monitoring + Pub/Sub + Cloud Run.
- **Floci:** Médio (alarmes/anomaly detection no CloudWatch emulado: confirmar; senão, threshold fixo).
- **Custo lab:** ~US$ 1–3.
- **Fonte:** [CloudWatch anomaly detection](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch_Anomaly_Detection.html) e alarmes de tokens em [Analyze Bedrock cost spikes with AWS DevOps Agent](https://repost.aws/articles/AR_gbMkpbaTJOwRyCpqGf6uA/analyze-amazon-bedrock-cost-spikes-with-aws-devops-agent) (artigo re:Post, não doc oficial de produto).

### 05-C (recomendada, sugestão minha) · Motor de escalonamento de riscos (Claude classifica, política decide)

- **Constrói:** Claude classifica cada sinal (categoria, severidade proposta, evidência); uma **política determinística** (por severidade, patrocinador, janela, risco financeiro) decide: registrar, notificar o gerente, ou **escalar para humano com pausa** (callback). Inclui regras explícitas de quando o agente *não decide*: dado ausente, confiança baixa, pedido do cliente por humano.
- **Serviços AWS:** Step Functions (`waitForTaskToken`), Lambda, DynamoDB, SNS/SES, EventBridge, Bedrock, CloudWatch.
- **Claude / prova:** 1.4 gates e handoff · 5.2 escalonamento · 4.3 · 5.3 · 1.5 (equivalente de hook: validação antes de ação). Cenário: agente de suporte ao cliente (mesma lógica de escalonamento).
- **Outra cloud:** GCP: Workflows + callback endpoints + Pub/Sub + Cloud Run. Direto.
- **Floci:** Alto, condicionado a `waitForTaskToken` (ver 0.2).
- **Custo lab:** ~US$ 2–5.
- **Fonte:** callback e aprovação humana em [Step Functions](https://docs.aws.amazon.com/step-functions/latest/dg/connect-to-resource.html) e [Orchestrating a security incident response](https://aws.amazon.com/blogs/compute/orchestrating-a-security-incident-response-with-aws-step-functions/); padrão de sinais em 05-A. Composição minha.

**Recomendação: 05-C**, consumindo as pontuações de 05-A como entrada. Escalonamento bom é o que mais separa protótipo de sistema confiável, e é onde mais se erra: ou escala tudo (ninguém lê) ou nada (risco silencioso). Fica totalmente testável por tabela de decisão (TDD natural).

**Confirmar:** como o curso define "AIOps de projeto" (pode ser só detecção de anomalia em métricas); quais ferramentas de risco são mostradas.

---

## 6. Unidades 06 e 07 · Reuniões e status reports/executive summaries (agrupadas; aulas 06 pt 1–2, 07 pt 1–2)

Tema: ata → ações e follow-ups (06); relatórios de status e resumos executivos (07). São um único fluxo de dados, por isso agrupo.

### 06-A · Ata e ações a partir de áudio/transcrição

- **Constrói:** (06) transcrição de reunião (sintética) → ata estruturada: decisões, ações (dono, prazo, confiança), perguntas em aberto, com trecho de origem; ação sem dono claro vai para humano; follow-ups agendados.
- **Serviços AWS:** S3, Transcribe, Step Functions, Lambda, Bedrock, DynamoDB, EventBridge Scheduler, SES/SNS.
- **Claude / prova:** 4.1 · 4.2 few-shot · 4.3 · 4.4 validação e retentativa (data inválida, dono inexistente) · 5.6 · 5.2. Cenário: extração de dados estruturados.
- **Outra cloud:** GCP: Speech-to-Text + Cloud Run + Claude na Vertex AI + Firestore + Cloud Scheduler.
- **Floci:** Médio (Transcribe e Textract listados como exclusivos do Floci; comportamento a confirmar; podemos começar direto da transcrição).
- **Custo lab:** ~US$ 2–6; Transcribe cobra por minuto de áudio (validar).
- **Fonte:** [Meeting summarization and action item extraction with Amazon Nova](https://aws.amazon.com/blogs/machine-learning/meeting-summarization-and-action-item-extraction-with-amazon-nova/), [Build an AI-powered summarization system with Bedrock and Transcribe using Terraform](https://aws.amazon.com/blogs/machine-learning/build-an-ai-powered-automated-summarization-system-with-amazon-bedrock-and-amazon-transcribe-using-terraform/) e [Guidance for Live Meeting Assistant on AWS](https://docs.aws.amazon.com/solutions/live-meeting-assistant-on-aws/). Os blogs usam modelos Nova; a troca por Claude é adaptação minha (benchmarks deles não valem para o Claude).

### 06-B · Relatórios de status em lote (batch)

- **Constrói:** (07) a cada semana, N projetos geram relatório por batch inference: Step Functions monta o JSONL, submete, ouve o evento do EventBridge, valida cada saída e republica; custo 50% menor, latência de horas.
- **Serviços AWS:** Step Functions, S3, Bedrock batch inference, EventBridge, Lambda, DynamoDB, SES.
- **Claude / prova:** **4.5 lote** · 4.3 · 4.4 · 5.6. Sem tools (batch Converse não aceita).
- **Outra cloud:** GCP: Vertex AI batch prediction + Workflows + BigQuery.
- **Floci:** Baixo no batch real (assumir ausente); **simulável com SQS + Lambda**, mantendo a mesma interface; ADR explicando.
- **Custo lab:** ~US$ 3–8 (mínimo de 100 requisições por job).
- **Fonte:** [Orchestrating large-scale document processing with Step Functions and Bedrock batch inference](https://aws.amazon.com/blogs/compute/orchestrating-large-scale-document-processing-with-aws-step-functions-and-amazon-bedrock-batch-inference/), [Bedrock batch orchestration workflow](https://aws.amazon.com/blogs/machine-learning/build-a-serverless-amazon-bedrock-batch-job-orchestration-workflow-using-aws-step-functions/), [doc de batch](https://docs.aws.amazon.com/bedrock/latest/userguide/batch-inference.html).

### 06-C (recomendada, sugestão minha) · Pipeline integrado: ata → status → resumo executivo, com aprovação antes de enviar

- **Constrói:** junta 06-A e 06-B: as atas e os eventos do board alimentam o relatório semanal por projeto (lote), com **proveniência** (cada afirmação referencia ata ou ticket); resumo executivo consolidado; **gate de aprovação humana** antes de qualquer e-mail sair; modelo único de dados (reunião → ação → ticket → relatório) com trilha de linhagem.
- **Serviços AWS:** Transcribe (opcional), Step Functions (Map + callback), Lambda, Bedrock (síncrono para atas, lote para relatórios), S3, DynamoDB, EventBridge, SES, CloudWatch, KMS.
- **Claude / prova:** 4.1 · 4.2 · 4.3 · 4.4 · 4.5 · 1.4 · 5.2 · 5.6 · 5.1 (preservar fatos entre etapas). Cenários: extração estruturada e pesquisa multiagente (síntese com fontes).
- **Outra cloud:** GCP completo (ver 06-A e 06-B). A única diferença relevante é o batch (Vertex) e o callback (Workflows).
- **Floci:** Médio (ver 0.2; batch simulado).
- **Custo lab:** ~US$ 4–10 (maior das propostas).
- **Fonte:** composição minha dos padrões acima; síntese executiva e alternativa de BI em [Generative BI with Quick Sight](https://docs.aws.amazon.com/quick/latest/userguide/quicksight-gen-bi.html) (descartada para este projeto: QuickSight no Floci é só metadados).

**Recomendação: 06-C**, construída em duas fases: (1) extração da ata, que é o núcleo do domínio 4 e o encaixe mais claro com a prova; (2) relatório em lote + gate de envio. Se o esforço apertar, entrega só a fase 1 e deixa a 2 como design doc. Por quê: relatório que sai da empresa é a saída de maior risco da disciplina; o gate humano e a proveniência são o que torna o uso aceitável.

**Confirmar:** formato de ata/ações e de relatório ensinado; se o curso usa ferramentas de transcrição específicas; público-alvo do resumo executivo (patrocinador? comitê?).

---

## 7. Unidade 08 · Governança, compliance e qualidade (aulas pt 1 e 2)

Tema: controlar o que a IA produz e usa no projeto: políticas, auditoria, qualidade dos entregáveis.

### 08-A · Verificação de artefatos contra política com Guardrails e Automated Reasoning

- **Constrói:** política escrita (ex.: regras de aprovação, retenção) vira política formal; saídas do Claude são checadas contra ela; o resultado (válido, inválido, ambíguo) decide publicar, reescrever ou escalar.
- **Serviços AWS:** Bedrock Guardrails (inclui Automated Reasoning checks), Lambda, Step Functions, DynamoDB, CloudWatch.
- **Claude / prova:** 5.5 · 4.4 · 1.4. A feature em si é específica de AWS (fora do escopo da prova); o padrão "validar antes de liberar" é o que conta.
- **Outra cloud:** GCP: Model Armor ou validação própria; **não há equivalente direto de Automated Reasoning** (diferença a documentar).
- **Floci:** Baixo (Bedrock lista guardrails, mas Automated Reasoning não confirmado).
- **Custo lab:** ~US$ 3–8 (Guardrails cobra por unidade de texto; validar).
- **Fonte:** [Automated Reasoning checks in Bedrock Guardrails](https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails-automated-reasoning-checks.html); a doc diz que opera em **modo detect** (retorna achados, não bloqueia), então o bloqueio é nosso.

### 08-B · Evidência de conformidade e trilha de auditoria

- **Constrói:** toda decisão assistida por IA (entrada, versão do prompt, modelo, saída, aprovador) grava um registro imutável; regras do AWS Config verificam a configuração dos próprios recursos; Claude resume desvios para o comitê.
- **Serviços AWS:** DynamoDB (+ streams), S3 com Object Lock, CloudTrail, AWS Config, Bedrock, EventBridge, KMS, Athena.
- **Claude / prova:** 5.6 · 5.5 · 4.3.
- **Outra cloud:** GCP: Cloud Audit Logs + Security Command Center + BigQuery.
- **Floci:** Médio (Config, Athena, S3 e DynamoDB listados; CloudTrail e Object Lock a confirmar).
- **Custo lab:** ~US$ 1–3.
- **Fonte:** camadas de governança e conformidade em [Achieve operational excellence with well-architected generative AI solutions using Amazon Bedrock](https://aws.amazon.com/blogs/machine-learning/achieve-operational-excellence-with-well-architected-generative-ai-solutions-using-amazon-bedrock/).

### 08-C (recomendada, sugestão minha) · Gate de qualidade com Claude Code em CI + trilha de auditoria

- **Constrói:** um workflow de PR que roda Claude Code em modo não interativo (`-p`, `--json-schema`) para revisar documentos de projeto (escopo, plano, ata) contra um checklist; **duas instâncias independentes** (autor e revisor) reduzem viés; o resultado vira comentário estruturado; a trilha de auditoria de 08-B guarda decisões. É o repositório praticando o domínio 3.
- **Serviços AWS:** GitHub Actions + OIDC, Lambda, DynamoDB, S3, Bedrock, CloudWatch.
- **Claude / prova:** 3.6 CI/CD com `-p` e `--json-schema` · 4.6 revisão multi-instância · 4.1 · 5.5. Cenário: Claude Code em CI.
- **Outra cloud:** o gate é independente de cloud (GitHub Actions); a trilha equivale a GCP/BigQuery.
- **Floci:** Alto na parte de trilha; o passo do Claude Code é fumaça manual.
- **Custo lab:** ~US$ 2–5.
- **Fonte:** padrão de revisão por checklist e governança em [Well-architected generative AI](https://aws.amazon.com/blogs/machine-learning/achieve-operational-excellence-with-well-architected-generative-ai-solutions-using-amazon-bedrock/); componente de CI é do guia do exame, não de fonte AWS. Composição minha.

**Recomendação: 08-C.** Maior alinhamento com o domínio 3 (20%), que as outras unidades quase não tocam, e é barato. 08-A fica como ADR: "por que não usar Automated Reasoning agora" (modo detect, dependência de formalizar a política, sem emulação).

**Confirmar:** se o curso trata governança como política organizacional, regulatória (LGPD, ISO) ou qualidade de entregáveis; quais frameworks cita.

---

## 8. Unidade 09 · Automação de boards e comunicação (aulas pt 1 e 2)

Tema: integrar IA a quadros de tarefas e canais (Slack/Teams/e-mail) para atualizar, notificar e responder.

### 09-A · Agente no Slack/Teams que lê e atualiza o board

- **Constrói:** bot no canal recebe pergunta ou comando, consulta e atualiza tarefas via tools, responde no canal.
- **Serviços AWS:** API Gateway, Lambda, Bedrock (Agents ou Converse), Secrets Manager, DynamoDB, EventBridge. Alternativa gerenciada: Amazon Q Developer in chat applications ligando um Bedrock Agent.
- **Claude / prova:** 1.1 · 2.1 · 2.2 · 5.2.
- **Outra cloud:** GCP: Cloud Run + Google Chat + Claude na Vertex AI.
- **Floci:** Médio (Slack externo é mock; Bedrock Agents ausente).
- **Custo lab:** ~US$ 2–4.
- **Fonte:** [Integrate Amazon Bedrock Agents with Slack](https://aws.amazon.com/blogs/machine-learning/integrate-amazon-bedrock-agents-with-slack/) e [Q Developer in chat applications com Bedrock Agents](https://docs.aws.amazon.com/chatbot/latest/adminguide/connect-bedrock-agents.html).

### 09-B · Automação orientada a eventos do board

- **Constrói:** eventos do board (card movido, atrasado) acionam EventBridge → Lambda → Claude classifica e redige a mensagem; envio idempotente com DLQ e limitação de taxa.
- **Serviços AWS:** EventBridge, SQS (DLQ), Lambda, Bedrock, SNS/SES, DynamoDB (idempotência), CloudWatch.
- **Claude / prova:** 4.3 · 5.3 · 4.4 · 5.2.
- **Outra cloud:** GCP: Pub/Sub + Eventarc + Cloud Run.
- **Floci:** Alto.
- **Custo lab:** ~US$ 1–3.
- **Fonte:** padrão de orquestração por eventos e interface conversacional em [Domain 6: Organizational readiness, part 2](https://repost.aws/articles/ARWjY93F_8SkmwRg8y8TisXA/domain-6-organizational-readiness-part-2) (artigo re:Post).

### 09-C (recomendada, sugestão minha) · Camada de tools do board com contrato MCP e agente com validação de escrita

- **Constrói:** o board vira um conjunto de **poucas tools bem descritas** (`buscar_tarefas`, `atualizar_tarefa`, `comentar`), com descrições que dizem *quando usar e quando não*, erros estruturados (`isError`, categoria, retentável); todo write passa por uma **validação antes da ação** (limite de alterações por execução, campos permitidos, confirmação para ações destrutivas); o contrato segue a especificação MCP. Dois adaptadores: Slack (mock) e e-mail.
- **Serviços AWS:** Lambda (tools), API Gateway, DynamoDB, Bedrock, Secrets Manager, EventBridge, SQS, CloudWatch.
- **Claude / prova:** 2.1 · 2.2 · 2.3 · 2.4 (`.mcp.json` e resources) · 1.5 hooks (validação pré-ação) · 1.1 · 5.3. Cenário: produtividade de devs.
- **Outra cloud:** GCP: Cloud Run + Firestore + Claude na Vertex AI. Direto.
- **Floci:** Alto.
- **Custo lab:** ~US$ 2–5.
- **Fonte:** padrões de integração em [Integrate Bedrock Agents with Slack](https://aws.amazon.com/blogs/machine-learning/integrate-amazon-bedrock-agents-with-slack/) e [Domain 6 part 2](https://repost.aws/articles/ARWjY93F_8SkmwRg8y8TisXA/domain-6-organizational-readiness-part-2); o desenho de tools é do guia do exame. Composição minha. **Nota de escopo:** implantar servidor MCP em produção está fora da prova (CLAUDE.md); aqui o foco é o desenho das tools e do contrato.

**Recomendação: 09-C.** Escrever em sistema de registro é onde agentes fazem estrago. Poucas tools, descrições claras e validação antes da escrita são o que um arquiteto sênior exigiria, e dá o maior retorno no domínio 2 (18%).

**Confirmar:** qual board e canal o curso usa (Trello, Jira, monday, Asana, Teams?); se pede integração real com alguma ferramenta; se há automação de e-mail.

---

## 9. Unidade 10 · Portfólio e OKRs (aulas pt 1 a 3)

Tema: consolidar projetos em visão de portfólio e acompanhar OKRs.

### 10-A · Dados de portfólio no data lake + BI generativo

- **Constrói:** status e métricas de vários projetos em S3/Glue/Athena; dashboard no QuickSight com resumo executivo e perguntas em linguagem natural.
- **Serviços AWS:** S3, Glue, Athena, QuickSight (Generative BI), Lambda, EventBridge Scheduler.
- **Claude / prova:** quase nenhuma (a camada de IA é o QuickSight/Amazon Q, não Claude). Só entraria com um passo extra de narrativa.
- **Outra cloud:** GCP: BigQuery + Looker (Gemini). Direto, mas sem Claude.
- **Floci:** Médio na camada de dados (Athena em DuckDB); **QuickSight só metadados**, então dashboard não é testável.
- **Custo lab:** QuickSight tem licença por usuário (validar; é custo recorrente, exige ADR e destroy).
- **Fonte:** [Generative BI with Quick Sight](https://docs.aws.amazon.com/quick/latest/userguide/quicksight-gen-bi.html) e [Amazon Q Business e QuickSight](https://aws.amazon.com/blogs/machine-learning/amazon-q-business-and-amazon-q-in-quicksight-empowers-employees-to-be-more-data-driven-and-make-better-faster-decisions-using-company-knowledge/).

### 10-B · Perguntas e respostas sobre documentos do portfólio (RAG gerenciado)

- **Constrói:** documentos de projeto indexados em Knowledge Base; perguntas sobre OKRs e riscos respondidas com citações.
- **Serviços AWS:** Bedrock Knowledge Bases, S3, Lambda, (índice vetorial gerenciado).
- **Claude / prova:** 5.6 (citar fonte). Embeddings e bancos vetoriais **estão fora da prova** (CLAUDE.md).
- **Outra cloud:** GCP: Vertex AI Search/RAG Engine.
- **Floci:** Baixo (Knowledge Bases não confirmado).
- **Custo lab:** índice vetorial pode gerar custo fixo ocioso (violaria a regra de custo sem ADR; validar).
- **Fonte:** [Domain 6: Organizational readiness, part 1](https://repost.aws/articles/ARHJDnSPoQRX2h-3MXF2AIZQ/domain-6-organizational-readiness-part-1) sobre começar por casos baseados em modelo (artigo re:Post). Sem arquitetura de referência de portfólio.

### 10-C (recomendada, sugestão minha) · Consolidação multiagente de OKRs com proveniência

- **Constrói:** um coordenador dispara **um subagente por projeto** (contexto isolado, em paralelo) que lê os dados do projeto (Athena sobre S3) e devolve progresso de KRs, riscos e confiança; o coordenador sintetiza o portfólio, **separa fato de inferência** e referencia a origem de cada afirmação; conflitos entre projetos e dados ausentes sobem explicitamente, sem serem "preenchidos".
- **Serviços AWS:** Step Functions (Map paralelo), Lambda, Athena + Glue, S3, DynamoDB, Bedrock, SES, CloudWatch.
- **Claude / prova:** 1.2 · 1.3 · 5.1 preservação de contexto · 5.6 proveniência e incerteza · 5.3 · 4.3. Cenário: sistema de pesquisa multiagente.
- **Outra cloud:** GCP: Workflows (paralelo) + BigQuery + Cloud Run + Claude na Vertex AI. Direto.
- **Floci:** Médio (Athena/Glue sobre DuckDB; confirmar suporte às consultas usadas).
- **Custo lab:** ~US$ 3–8.
- **Fonte:** padrões multiagente e orquestração em [Agentic AI patterns and workflows](https://docs.aws.amazon.com/prescriptive-guidance/latest/agentic-ai-patterns/introduction.html); dados em Athena/Glue conforme 10-A. Composição minha.

**Recomendação: 10-C**, usando a camada de dados de 10-A (sem QuickSight). Fecha a disciplina com o cenário de pesquisa multiagente e o domínio 5, e evita as duas armadilhas de custo/teste (licença do QuickSight e índice vetorial ocioso). Dashboard visual pode ficar no post como design da camada comparativa.

**Confirmar:** como o curso trata OKR (ferramentas, formato de KR); se a unidade pede dashboards visuais ou só consolidação; se há dataset no PDF.

---

## 10. Equivalente em outra cloud: visão geral

Proponho **GCP** como cloud comparativa padrão (decisão sua; o CLAUDE.md pede confirmação): o curso oficial "Claude on Google Cloud" está na lista da prova, e o Claude está disponível na Vertex AI (confirmar disponibilidade de modelo/região e de batch na Vertex antes de afirmar). Mapeamento comum:

| AWS | GCP | Diferença a documentar |
|---|---|---|
| Bedrock (Claude) | Vertex AI (Claude) | API e quotas distintas; batch e saída estruturada: confirmar |
| Step Functions | Cloud Workflows | Callback por endpoint, não por task token |
| Lambda | Cloud Run / Cloud Functions | Contêiner como unidade padrão |
| EventBridge (+Scheduler) | Eventarc + Cloud Scheduler | |
| SQS/SNS | Pub/Sub | Um serviço cobre os dois |
| DynamoDB | Firestore | Modelo de consulta diferente |
| S3 | Cloud Storage | |
| Transcribe / Textract | Speech-to-Text / Document AI | |
| Athena + Glue | BigQuery | BigQuery substitui os dois |
| CloudWatch | Cloud Monitoring + Logging | |
| Config / CloudTrail | Cloud Audit Logs + Security Command Center | |
| Automated Reasoning (Guardrails) | sem equivalente direto | |

Azure é alternativa se preferir (confirmar disponibilidade do Claude no Azure na documentação da Microsoft antes de propor).

---

## 11. Ordem sugerida de execução e paralelismo

Como o CLAUDE.md prevê uma sessão por unidade, cada uma no seu branch, e subagentes só após sua aprovação do plano:

1. **P5 (06+07)** primeiro: define a `ModelClient` fake, o esquema de dados e o harness de validação/retentativa que os demais reutilizam. Tem a maior chance de revelar limites do Floci.
2. **P2 (02)** e **P1 (01)** em paralelo: independentes entre si.
3. **P4 (05)** depois de validar `waitForTaskToken` no Floci (aproveita o gate de P1).
4. **P3 (03+04)**, **P7 (09)**, **P6 (08)** em paralelo.
5. **P8 (10)** por último: consome dados dos anteriores (sintéticos).

Módulo Terraform compartilhado sugerido (sem custo fixo): bucket + KMS + tags `project`, `module`, `managed-by` + `ModelClient` + tabela de auditoria.

## 12. Cobertura da prova com a recomendação

| Domínio | Tarefas cobertas pelos projetos recomendados |
|---|---|
| 1 · Arquitetura agêntica | 1.1 (09-C) · 1.2 1.3 1.6 (01-A, 10-C) · 1.4 (01-A, 05-C, 06-C) · 1.5 (09-C) · **1.7 sessões: sem projeto** |
| 2 · Tools e MCP | 2.1 2.2 2.3 2.4 (09-C, 03-C) · **2.5 tools nativas: sem projeto** |
| 3 · Claude Code | 3.6 (08-C) · 3.1–3.5 cobertos pela prática do próprio repositório, não pelos projetos |
| 4 · Prompts e saída estruturada | 4.1 4.2 4.3 4.4 (02-A, 06-C) · 4.5 (06-C) · 4.6 (02-A, 08-C) |
| 5 · Contexto e confiabilidade | 5.1 (10-C) · 5.2 (05-C) · 5.3 · 5.5 (02-A) · 5.6 (03-C, 10-C) · **5.4 exploração de codebase grande: sem projeto** |

Lacunas: 1.7, 2.5 e 5.4 não aparecem nesta disciplina; seguem para outras disciplinas do curso (módulo 04 de agentes autônomos, por exemplo).

## 13. Perguntas para você decidir

1. **Escolha** por unidade ou grupo (aceita a recomendação de P1 a P8 ou quer trocar?). Ver ordem de corte na seção 1.
2. **Cloud comparativa:** GCP (recomendada) ou Azure?
3. **Batch (4.5):** usar Bedrock batch inference (AWS-native, 50% mais barato, sem tools) ou a Message Batches API da Anthropic direto (exige chave da Anthropic fora da AWS)? Recomendo Bedrock, com ADR explicando a diferença para a prova.
4. **Teto de orçamento mensal** para o teste de fumaça real com Claude no Bedrock (sugiro US$ 20 para a disciplina inteira) e **autorização** para eu usar credenciais AWS reais nessa etapa (hoje o ambiente de nuvem não tem).
5. **Versão do Floci** a fixar; posso rodar `floci aws services` numa sessão de implementação e atualizar a tabela 0.2.
6. **Publicação:** esta proposta é só para você; nada vai ao site ainda.
