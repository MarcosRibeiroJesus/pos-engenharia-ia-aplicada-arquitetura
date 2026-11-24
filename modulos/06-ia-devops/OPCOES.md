# Disciplina 06 · Ferramentas de IA para DevOps — opções de projeto

Status: **proposta, nada implementado.** Data da pesquisa: 2026-11-18. Aguarda a sua escolha por grupo.

## 0. Como ler este documento

**Limites do que sei.** Não tenho acesso às aulas, às legendas nem ao PDF da disciplina. Tudo o que digo sobre o conteúdo vem só dos títulos em `docs/curso/PROGRESSO.md`. Cada grupo termina com **"A confirmar"**: o que as legendas e o PDF precisam validar antes de eu fechar o escopo. Se uma aula usar uma ferramenta diferente da que proponho, o projeto se adapta à aula.

**Como pesquisei.** As fontes são as da AWS (Prescriptive Guidance, AWS Blogs, documentação, Solutions Library) e a página de serviços do Floci. Onde o resultado da busca era de terceiros (Medium, DEV Community, AWS Builder Center), marquei como **comunidade** e não usei como base de recomendação. Não abri todas as páginas citadas: li os resumos devolvidos pela busca. Os links valem como ponto de partida e precisam de leitura integral quando o projeto for escolhido. Preços não foram verificados; os custos abaixo são **estimativas de ordem de grandeza** para validar com Infracost e a calculadora da AWS.

**Convenções.**
- Ids de tarefas CCAR-F são os do `CLAUDE.md` (ex.: 1.4 = workflows com gates programáticos e handoff humano).
- "Outra cloud" é equivalência de design por conhecimento prévio, sem pesquisa nas docs de Azure e GCP nesta rodada. Os nomes de produto precisam ser confirmados antes do post comparativo.
- Custo de lab assume a menor escala, `terraform destroy` ao fim de cada sessão e nenhum custo fixo ocioso (regra do `CLAUDE.md`).

## 1. Três restrições que valem para todos os grupos

1. **O Claude não roda de verdade no Floci.** Segundo a página de serviços do Floci, *Bedrock Runtime* é um stub de 2 operações e o streaming devolve 501. Isso é lacuna do emulador, comprovada pela documentação dele. Consequência: o componente Claude de cada projeto fica atrás de uma interface fina (um adaptador), com resposta gravada/fake nos testes de integração no Floci e um smoke test opcional contra o Bedrock real (centavos). Cada projeto terá um ADR sobre isso. Regra do `CLAUDE.md` mantida: nunca alterar código correto para agradar o emulador.
2. **A prova não cobre Bedrock nem cloud específica.** O componente Claude precisa exercitar tarefas da prova (loop por `stop_reason`, tools, saída estruturada, escalonamento). Por isso, onde a AWS oferece um produto pronto (AWS DevOps Agent, CloudWatch investigations, FinOps Agent), ele serve como **referência de arquitetura e comparação**, não como o que construímos: usar o produto gerenciado não exercita nenhuma tarefa da prova.
3. **Disciplina de custo.** Nada com custo fixo ocioso: sem NAT Gateway, sem cluster ligado, sem OpenSearch. Quando uma fonte oficial usa vetor/OpenSearch (Knowledge Bases), proponho trocar por S3 + busca simples ou DynamoDB e registrar em ADR.

## 2. Floci x LocalStack (relevante para a unidade 13)

| Ponto | Floci | LocalStack |
|---|---|---|
| Licença e acesso | MIT, sem cadastro, token ou plano pago, segundo a [página do próprio Floci](https://floci.io/) | Segundo o [blog oficial](https://blog.localstack.cloud/the-road-ahead-for-localstack/) (li só o resumo da busca; o host não abriu nesta sessão), desde 23/03/2026 há uma imagem unificada que exige auth token, e a edição Community deixou de ser mantida. Termos do plano gratuito (uso não comercial, preço do plano pago): só fontes de terceiros; **confirmar na página oficial de preços** |
| Serviços relevantes aqui | Bedrock (18 ops, plano de controle), Bedrock Runtime (stub), CloudWatch Metrics (11) e Logs (17), EventBridge (41) + Scheduler + Pipes, Step Functions (32), SNS, SQS, Lambda (55, containers reais), EKS (7, k3s por cluster), ECS (59), SSM (22), Secrets Manager, Cost Explorer (20), Budgets (26), Config (36), GuardDuty (28), Security Hub (34), Inspector, X-Ray, CloudTrail, CloudFormation, CodeBuild (20), CodePipeline (44), API Gateway v1/v2, Kinesis, Athena, Glue ([lista](https://floci.io/floci/services/)) | A comparar item a item na unidade 13 |
| Ausentes na lista do Floci | Chatbot, DevOps Guru; CloudWatch Alarms sem linha própria (confirmar se `PutMetricAlarm` está nas 11 ops de Metrics); SSM Automation (22 ops sugerem só parte da API: **confirmar**) | n/a |
| Em Kubernetes | EKS emula criando k3s em container; rodar o Floci *dentro* do Minikube exigiria acesso ao Docker socket para Lambda/ECS: **não verificado** | A aula usa "LocalStack no Kubernetes"; versão/imagem usada na aula: **confirmar nas legendas** |
| Afirmações de desempenho | "138x mais rápido, 91% menos memória" são números do próprio Floci, não verificados | n/a |

**Recomendação.** O repositório continua no Floci (sem token, sem dependência de conta de terceiros no CI). Na unidade 13 sigo a aula com LocalStack para ser fiel ao que foi ensinado, **só se** o plano gratuito cobrir uso de estudo sem expor token no repositório (token vai em secret, nunca no código), e faço o mesmo teste nos dois emuladores como evidência de lacuna: a regra do `CLAUDE.md` só aceita marcar lacuna com evidência, e "passa em um, falha no outro" é evidência.

## 3. Mapa: unidades → grupos

| Grupo | Unidades | Tema | Conteúdo técnico? |
|---|---|---|---|
| A | 01 + 02 | Da automação ao agente: gerar, auditar e curar IaC | 01 é conceitual (aula de abertura, a confirmar); 02 é técnica |
| B | 03 | Orquestração e SRE assistida | sim |
| C | 04 + 05 | Detecção preditiva → investigação (MTTR) | sim |
| D | 06 + 12 | Bot de ChatOps seguro (Slack/Teams) e bot full-stack | sim |
| E | 07 | Priorização de vulnerabilidades | sim |
| F | 08 | Eficiência do ciclo de entrega (CI/CD) | sim |
| G | 09 | FinOps com IA | sim |
| H | 10 + 11 | Conhecimento vivo, auto-remediação e segurança operacional | sim |
| I | 13 | Docker, Kubernetes local, LocalStack, Streamlit, Ollama | sim (laboratório) |

**Por que agrupar assim.** Cada grupo compartilha o mesmo núcleo de arquitetura, então um projeto bem feito cobre as duas unidades sem diluir. Separei MTTR (04) de auto-remediação (10) de propósito: o primeiro é *leitura* (investigar, só IAM de leitura); o segundo é *escrita* (agir em produção, onde mora o risco). Juntar as duas no mesmo projeto obrigaria a pôr permissão de escrita no agente de investigação. O grupo H consome a saída do grupo C como entrada.

**Pelo regime do `CLAUDE.md` ("pelo menos um projeto por módulo"):** minha sugestão é implementar **C, F e H** (ver seção 14), que cobrem os domínios 3 e 5 da prova que você citou. Os outros ficam como proposta.

## 4. Grupo A · Unidades 01 + 02 — Automação → agente; IaC gerado, auditado e com self-healing

Tema para sênior: o que separa automação de agente é **quem decide o próximo passo**. Em IaC, o gate programático (plan, checkov, policy) tem que valer mais que a opinião do modelo.

### A1 · Pipeline de IaC com gate de política e resumo do plano por LLM (base AWS)
- **Constrói:** CodePipeline + Terraform; o estágio `Validate-Plan` manda os logs do plan para o modelo, que gera um resumo para o aprovador; aprovação manual antes do apply; checkov e tflint como gates.
- **Serviços AWS:** CodePipeline, CodeBuild, S3 (state), DynamoDB (lock), Bedrock, SNS, IAM.
- **Componente Claude:** resumo estruturado do plan (campos: recursos criados/alterados/destruídos, risco, recomendação), via `tool_use` com schema; falha de schema → retentativa. **Tarefas:** 1.4, 4.3, 4.4, 4.1.
- **Outra cloud:** Azure: Azure Pipelines/GitHub Actions + `terraform plan` + Azure OpenAI/Claude via Foundry, com Environment approvals. GCP: Cloud Build + Gemini/Claude no Vertex AI, com Cloud Deploy approvals.
- **Floci:** CodePipeline (44 ops), CodeBuild (20), S3, DynamoDB, SNS, IAM: sim. Bedrock Runtime: stub (restrição 1). Execução real do CodeBuild no emulador: **confirmar**.
- **Custo de lab:** ~US$ 0–2 por rodada (CodeBuild por minuto + tokens); sem custo fixo.
- **Fonte:** [Gerir políticas do AWS Organizations como código com CodePipeline e Bedrock](https://docs.aws.amazon.com/prescriptive-guidance/latest/patterns/manage-organizations-policies-as-code.html); [checkov centralizado](https://docs.aws.amazon.com/prescriptive-guidance/latest/patterns/centralized-custom-checkov-scanning.html); [CI/CD para validar Terraform](https://docs.aws.amazon.com/prescriptive-guidance/latest/patterns/create-a-ci-cd-pipeline-to-validate-terraform-configurations-by-using-aws-codepipeline.html).

### A2 · Auditoria de conformidade com agente + AWS Config (base AWS)
- **Constrói:** regras do AWS Config detectam desvio; um agente explica a não conformidade e propõe a correção, com aprovação.
- **Serviços AWS:** Config, Bedrock Agents (ou Lambda + Converse), Lambda, EventBridge, SSM, S3.
- **Componente Claude:** loop de agente por `stop_reason`, com 3–4 tools de leitura. **Tarefas:** 1.1, 2.1, 2.3, 5.2.
- **Outra cloud:** Azure Policy + Defender for Cloud com agente sobre Resource Graph. GCP: Security Command Center + Cloud Asset Inventory.
- **Floci:** Config (36 ops), EventBridge, Lambda, SSM: sim; avaliação real das regras gerenciadas do Config: **confirmar**.
- **Custo de lab:** ~US$ 1–3 (Config cobra por item de configuração; manter poucas regras e destruir ao fim).
- **Fonte:** [Gerenciamento de conformidade EC2 com agentes Bedrock e AWS Config](https://docs.aws.amazon.com/prescriptive-guidance/latest/patterns/streamline-amazon-ec2-compliance-management-with-amazon-bedrock-agents-and-aws-config.html).

### A3 · Minha sugestão: "Terraform Doctor", agente que gera, audita e corrige IaC com gates (próprio)
- **Constrói:** um loop em que o modelo propõe um módulo Terraform; o pipeline roda `terraform validate`, tflint, checkov e `terraform test`; o resultado volta ao modelo como **erro estruturado** (`isError`, categoria, retentável) até passar ou escalar para humano depois de N tentativas. É exatamente o ciclo vermelho→verde do TDD que este repositório já usa, virado agente.
- **Serviços AWS:** Lambda (orquestrador), Step Functions (loop com teto), Bedrock, S3, SNS (escalonamento), CodeBuild opcional para rodar as ferramentas.
- **Componente Claude:** o loop, as tools de validação, a classificação de erro e o handoff. **Tarefas:** 1.1, 1.4, 2.2, 2.3, 4.4, 5.2, 5.3.
- **Outra cloud:** o loop é agnóstico: Azure Durable Functions ou Logic Apps; GCP Workflows + Cloud Run Jobs. Mudam só orquestrador e invocação do modelo.
- **Floci:** Step Functions (32), Lambda, S3, SNS: sim. Bedrock Runtime: stub. Terraform CLI roda no container do job, não no emulador.
- **Custo de lab:** ~US$ 1–3 (tokens dominam).
- **Fonte:** composição própria; referência de pipeline em A1 e [padrões de workflow de orquestração](https://docs.aws.amazon.com/prescriptive-guidance/latest/agentic-ai-patterns/workflow-orchestration-agents.html).

**Recomendação do grupo A: A3.** Razão: é o único que fecha o ciclo "gerar → auditar → curar" que as duas aulas anunciam, e usa os mesmos gates que já são regra do repositório, então testo o agente com os testes que já existem. A1 vira a camada de pipeline dentro de A3 (o resumo do plan para o aprovador entra como etapa final). Risco: sem limite de tentativas o loop gasta token; o teto vai em ADR e em teste.

**A confirmar:** a unidade 01 é só conceitual? A aula de "self-healing" fala de IaC, de infraestrutura em execução ou de pipelines? Qual ferramenta de geração a aula usa (Copilot, Claude, Q)? O que o PDF diz sobre "inteligência agêntica" como definição.

## 5. Grupo B · Unidade 03 — Orquestração e SRE assistida

Tema para sênior: onde termina o código determinístico e começa o raciocínio do modelo; handoff para humano como parte do desenho, não exceção.

### B1 · Fluxo de incidente em Step Functions com agente e gate humano (base AWS)
- **Constrói:** alarme → EventBridge → Step Functions → agente coleta evidências (leitura) → proposta de ação → pausa com `waitForTaskToken` até aprovação humana → execução da ação → verificação.
- **Serviços AWS:** CloudWatch, EventBridge, Step Functions, Lambda, Bedrock, SNS, DynamoDB.
- **Componente Claude:** agente de triagem com tools de leitura e saída estruturada; o gate é código, não prompt. **Tarefas:** 1.1, 1.4, 1.6, 4.3.
- **Outra cloud:** Azure Logic Apps/Durable Functions com aprovação por Teams; GCP Workflows com callback.
- **Floci:** Step Functions, EventBridge, Lambda, SNS, DynamoDB, CloudWatch: sim; `waitForTaskToken` no emulador: **confirmar**.
- **Custo de lab:** ~US$ 0–1.
- **Fonte:** [Agentes de orquestração de workflow](https://docs.aws.amazon.com/prescriptive-guidance/latest/agentic-ai-patterns/workflow-orchestration-agents.html); [padrão de orquestração agêntica com Bedrock](https://docs.aws.amazon.com/prescriptive-guidance/latest/agentic-ai-serverless/pattern-agentic-ai-orchestration.html). O fluxo com callback para revisão humana aparece em material de comunidade, não em guia oficial; trato como ideia a validar.

### B2 · Coordenador + subagentes especialistas (base AWS)
- **Constrói:** um coordenador delega para subagentes (logs, métricas, deploys recentes) e consolida o relatório.
- **Serviços AWS:** Bedrock (multi-agent collaboration) ou Lambda + Converse, CloudWatch Logs, CloudTrail, SSM.
- **Componente Claude:** coordenador/subagentes com contexto explícito em cada delegação. **Tarefas:** 1.2, 1.3, 5.1, 5.3, 5.6.
- **Outra cloud:** Azure AI Foundry Agent Service; GCP Vertex AI Agent Engine.
- **Floci:** Lambda, CloudWatch Logs, CloudTrail (14 ops): sim; Bedrock Agents data plane: apenas stub canned (AgentCore 71 ops de controle + 1 de dados). Logo, subagentes seriam código meu, não o serviço.
- **Custo de lab:** ~US$ 1–3 (vários subagentes multiplicam tokens).
- **Fonte:** [Multi-agent collaboration](https://docs.aws.amazon.com/prescriptive-guidance/latest/agentic-ai-patterns/multi-agent-collaboration.html).

### B3 · Minha sugestão: SRE copilot com *runbook como código* (próprio)
- **Constrói:** o agente só pode escolher entre ações de um catálogo versionado (runbooks como funções Lambda tipadas); cada ação declara risco e se exige aprovação; o agente propõe e o orquestrador decide.
- **Serviços AWS:** Lambda, Step Functions, DynamoDB (catálogo e auditoria), Bedrock, SNS.
- **Componente Claude:** escolha de tool com `tool_choice` e poucas tools. **Tarefas:** 2.1, 2.3, 1.4, 5.2.
- **Outra cloud:** Azure Automation runbooks; GCP Workflows/Cloud Run jobs.
- **Floci:** todos sim; Bedrock Runtime stub.
- **Custo de lab:** ~US$ 0–2.

**Recomendação do grupo B: B1, com o catálogo de ações de B3 dentro.** O gate humano em Step Functions é o artefato de maior valor de arquitetura e dá a base de que o grupo H precisa. B2 exige mais token e o serviço gerenciado não é testável no Floci. **Atenção:** a aula de "SRE assistida" pode ser sobre prática de SRE (SLO, error budget) e não sobre fluxo de incidente. **A confirmar** nas legendas; se for, B vira "SLO/error budget com alerta por burn rate + resumo do modelo".

## 6. Grupo C · Unidades 04 + 05 — Reduzir MTTR; observabilidade preditiva

Tema para sênior: reduzir MTTR é mais sobre *tempo até a hipótese certa* do que sobre automação; e previsão sem calibração vira ruído de alerta.

### C1 · Investigação automática a partir de alarme (base AWS)
- **Constrói:** alarme dispara investigação; o agente consulta métricas, logs e mudanças recentes (deploys, CloudTrail) e entrega hipóteses ranqueadas com evidência e grau de confiança.
- **Serviços AWS:** CloudWatch (métricas, logs, alarmes, anomaly detection), EventBridge, Lambda, Bedrock, CloudTrail, X-Ray, SNS.
- **Componente Claude:** relatório de causa provável com campos de **proveniência** (qual evidência sustenta qual hipótese) e incerteza; tools só de leitura. **Tarefas:** 1.1, 2.3, 4.3, 5.6, 5.3.
- **Outra cloud:** Azure: Azure Monitor + SRE Agent (confirmar nome/GA); GCP: Cloud Monitoring + Gemini Cloud Assist investigations (confirmar).
- **Floci:** CloudWatch Metrics/Logs, X-Ray (11), CloudTrail, EventBridge, Lambda: sim; anomaly detection como feature do CloudWatch: **confirmar**; Bedrock Runtime stub.
- **Custo de lab:** ~US$ 1–2.
- **Fonte:** [CloudWatch investigations](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/Investigations.html); [Alarm Context Tool](https://aws.amazon.com/blogs/mt/alarm-context-tool) (resumo e causas prováveis com Bedrock); [Q Developer operational investigations](https://aws.amazon.com/blogs/aws/investigate-and-remediate-operational-issues-with-amazon-q-developer). Referência de produto, não de construção: [AWS DevOps Agent](https://docs.aws.amazon.com/devopsagent/latest/userguide/about-aws-devops-agent.html) e [boas práticas em produção](https://aws.amazon.com/blogs/devops/best-practices-for-deploying-aws-devops-agent-in-production).

### C2 · RCA por webhook de ferramenta externa (base AWS)
- **Constrói:** um evento de observabilidade externa dispara a investigação; é o padrão do blog de integração do DevOps Agent com Splunk.
- **Serviços AWS:** API Gateway, Lambda, Bedrock, SQS, EventBridge.
- **Componente Claude:** igual a C1, com entrada normalizada por schema. **Tarefas:** 4.2, 4.3, 5.1.
- **Outra cloud:** Azure Event Grid + Functions; GCP Pub/Sub + Cloud Run.
- **Floci:** API Gateway v1/v2, SQS, Lambda: sim.
- **Custo de lab:** ~US$ 0–1.
- **Fonte:** [Reduzir MTTR com RCA por IA, DevOps Agent e Splunk](https://aws.amazon.com/blogs/mt/reduce-mttr-with-ai-driven-rca-using-aws-devops-agent-and-splunk/). A AWS cita redução "de horas a minutos" e um caso com 77% de ganho (WGU); são números do fabricante, **não os uso como meta**.

### C3 · Minha sugestão: detecção preditiva calibrada + investigação, com avaliação (próprio)
- **Constrói:** métricas sintéticas com falhas injetadas (dados sintéticos, regra de privacidade); detector estatístico por baseline sazonal (sem ML pesado) gera alerta *antes* do limiar fixo; a investigação de C1 roda sobre o alerta; um conjunto de avaliação mede precisão do alerta e acerto da hipótese.
- **Serviços AWS:** CloudWatch, Lambda, EventBridge Scheduler, S3, Athena (avaliação), Bedrock.
- **Componente Claude:** só a explicação do alerta; a decisão de alertar é determinística. **Tarefas:** 5.5, 5.6, 4.1, 4.6.
- **Outra cloud:** Azure Monitor dynamic thresholds; GCP Cloud Monitoring forecast/anomaly alerts (confirmar).
- **Floci:** Metrics, Logs, Scheduler, Athena (27), S3: sim.
- **Custo de lab:** ~US$ 0–1.
- **Fonte:** própria; detecção por CloudWatch anomaly detection descrita no [blog de monitoramento de apps de IA generativa](https://aws.amazon.com/blogs/mt/monitoring-generative-ai-applications-using-amazon-bedrock-and-amazon-cloudwatch-integration) e [anomalias em logs do Session Manager com Bedrock](https://aws.amazon.com/blogs/mt/ai-powered-anomaly-detection-for-aws-systems-manager-session-manager-logs-using-amazon-bedrock/).

**Recomendação do grupo C: C1 + o conjunto de avaliação de C3 (escopo único).** Justificativa: investigação com proveniência e incerteza é onde a prova (5.6) e o valor real de MTTR se encontram; e a avaliação com falhas injetadas é o que um arquiteto exige antes de confiar em "prevê o incidente". **Risco/honestidade:** sem avaliação, qualquer demo de "observabilidade preditiva" é anedota. C2 vira variante de entrada. **A confirmar:** se a unidade 05 usa ML de séries temporais (Prophet, Lookout-like) ou só features da ferramenta; qual stack de observabilidade as aulas usam (Prometheus/Grafana?). Se for Prometheus/Grafana, o equivalente AWS passa a ser Amazon Managed Service for Prometheus/Grafana (não testados no Floci: não aparecem na lista).

## 7. Grupo D · Unidades 06 + 12 — IA com segurança no Slack/Teams; bot full-stack

Tema para sênior: um bot de chat é uma **superfície de ataque** (verificação de assinatura, injeção por mensagem, vazamento de dado, escalonamento de privilégio), não só uma interface.

### D1 · Slack com agente em AgentCore, filas e verificação de assinatura (base AWS)
- **Constrói:** Slack → API Gateway → Lambda que valida a assinatura e responde rápido → SQS → Lambda de processamento → agente → resposta no Slack.
- **Serviços AWS:** API Gateway, Lambda, SQS, Secrets Manager, DynamoDB (sessão), Bedrock/AgentCore, CloudWatch.
- **Componente Claude:** agente com memória de sessão e tools restritas por usuário. **Tarefas:** 1.7, 2.3, 5.1, 5.2.
- **Outra cloud:** Azure Bot Service + Teams + Functions; GCP Google Chat + Cloud Run + Pub/Sub.
- **Floci:** API Gateway, Lambda, SQS, Secrets Manager, DynamoDB: sim; AgentCore data plane: stub.
- **Custo de lab:** ~US$ 0–1.
- **Fonte:** [Integrando Bedrock AgentCore com Slack](https://aws.amazon.com/blogs/machine-learning/integrating-amazon-bedrock-agentcore-with-slack); [Integrar Bedrock Agents com Slack](https://aws.amazon.com/blogs/machine-learning/integrate-amazon-bedrock-agents-with-slack).

### D2 · Slack/Teams via AWS Chatbot com Bedrock Agents (base AWS)
- **Constrói:** o AWS Chatbot liga canais do Slack/Teams a agentes do Bedrock sem escrever a camada de chat.
- **Serviços AWS:** AWS Chatbot, Bedrock Agents, IAM (guardrail policies do canal), SNS.
- **Componente Claude:** o agente; o controle de acesso é do canal. **Tarefas:** 2.1, 2.3.
- **Outra cloud:** Azure Bot/Copilot Studio em Teams; GCP Chat apps.
- **Floci:** **Chatbot não aparece na lista**; só o lado SNS/IAM seria testável.
- **Custo de lab:** ~US$ 0 (sem custo adicional do Chatbot nas regiões onde existe, segundo o anúncio).
- **Fonte:** [AWS Chatbot e agentes Bedrock em Teams e Slack (2024)](https://aws.amazon.com/de/about-aws/whats-new/2024/09/aws-chatbot-amazon-bedrock-agent-microsoft-teams-slack/). Limitação: baixa cobertura de teste local e pouco a construir; serve de comparação.

### D3 · Minha sugestão: bot ChatOps com *gate de aprovação por botão* e frontend web (próprio)
- **Constrói:** D1 mais: comandos classificados por risco; ações de escrita geram um cartão de aprovação (botão) assinado e com expiração; trilha de auditoria; um painel web simples (full-stack da unidade 12) lista conversas, ações e aprovações.
- **Serviços AWS:** D1 + DynamoDB (auditoria), S3 + CloudFront opcional (painel estático; CloudFront no Floci só aparece em atualização de ago/2026, **confirmar**) ou API Gateway servindo o painel.
- **Componente Claude:** tools com escopo por usuário, detecção de pedido fora de escopo e escalonamento. **Tarefas:** 1.4, 1.5, 2.2, 5.2.
- **Outra cloud:** Azure Bot + Adaptive Cards; GCP Chat cards.
- **Floci:** como D1.
- **Custo de lab:** ~US$ 0–1.
- **Fonte:** composição própria; padrão de aprovação humana com Slack descrito em material de **comunidade** (AWS Builder Center), não em guia oficial.

**Recomendação do grupo D: D3 sobre a base de D1.** A unidade 06 pede segurança e a 12 pede full-stack: D3 é o único que entrega as duas. Segurança concreta e testável: assinatura inválida rejeitada, replay bloqueado por timestamp, ação de escrita sem aprovação nunca executa, segredo só em Secrets Manager. **A confirmar:** a aula usa Slack, Teams ou os dois? Qual linguagem/framework do "bot full-stack" (Node, Python, Angular?). Para Teams, o equivalente muda (Azure Bot Service) e o post comparativo ganha peso.

## 8. Grupo E · Unidade 07 — Priorização de vulnerabilidades

Tema para sênior: severidade (CVSS) não é prioridade; prioridade é **severidade × exposição × explorabilidade × criticidade do ativo**. O modelo só explica; o score é determinístico e auditável.

### E1 · Exposure findings do Security Hub + contexto (base AWS)
- **Constrói:** findings do Inspector e do Security Hub são enriquecidos com exposição (internet, permissão) e viram uma fila priorizada.
- **Serviços AWS:** Inspector, Security Hub, EventBridge, Lambda, DynamoDB, SNS, Bedrock.
- **Componente Claude:** justificativa estruturada por finding e proposta de correção. **Tarefas:** 4.1, 4.3, 5.5, 5.6.
- **Outra cloud:** Azure Defender for Cloud (attack paths); GCP Security Command Center (attack exposure).
- **Floci:** Inspector (8 ops), Security Hub (34), EventBridge, Lambda: sim; **findings reais** dependem de o emulador gerar achados: **confirmar**; senão injetamos achados sintéticos no formato ASFF (dado sintético, sem violar privacidade).
- **Custo de lab:** ~US$ 1–5 (Inspector cobra por recurso escaneado).
- **Fonte:** [Priorizar riscos com exposure findings do Security Hub](https://aws.amazon.com/blogs/security/how-to-prioritize-security-risks-using-aws-security-hub-exposure-findings/); [AI vulnerability harness, parte 1](https://aws.amazon.com/blogs/security/building-your-ai-vulnerability-harness-part-1/) (triagem com contexto de infraestrutura).

### E2 · CVE no pipeline com PR de correção gerado (base AWS)
- **Constrói:** o Inspector detecta CVE na imagem; o modelo gera um PR de patch; os testes do pipeline validam.
- **Serviços AWS:** Inspector, ECR, CodeBuild/CodePipeline, Bedrock, EventBridge.
- **Componente Claude:** geração de patch com validação e retentativa. **Tarefas:** 4.4, 3.6, 1.4.
- **Outra cloud:** Azure Defender for Containers + GitHub Dependabot/Copilot; GCP Artifact Analysis + Cloud Build.
- **Floci:** ECR/Inspector/CodeBuild: parcial, **confirmar ECR**.
- **Custo de lab:** ~US$ 1–3.
- **Fonte:** [IA generativa para remediação de CVE em CI](https://aws.amazon.com/blogs/containers/applying-generative-ai-to-cve-remediation-early-vulnerability-patching-in-continuous-integration-pipelines).

### E3 · Minha sugestão: motor de score determinístico + LLM só para explicação, com Batch (próprio)
- **Constrói:** fórmula de prioridade versionada em código (EPSS/KEV como entradas sintéticas ou públicas), testada por propriedades; o LLM gera o texto para o time dono e é avaliado contra o score; processamento em lote noturno.
- **Serviços AWS:** Lambda, Step Functions, S3, DynamoDB, Bedrock (Message Batches equivalente na API da Anthropic).
- **Componente Claude:** explicação em lote. **Tarefas:** 4.5, 4.3, 5.5, 4.6.
- **Outra cloud:** Azure/GCP: mesmo desenho, com Defender/SCC como fonte de achados.
- **Floci:** sim, tudo exceto o modelo.
- **Custo de lab:** ~US$ 0–1.
- **Fonte:** própria.

**Recomendação do grupo E: E3 alimentado por achados no formato de E1.** Razão: é o ponto em que um sênior discorda de "pedir ao LLM que priorize": prioridade precisa ser reproduzível e auditável. Custa quase nada e é 100% testável no Floci. E1 e E2 entram como fonte e como etapa posterior. **A confirmar:** quais ferramentas a aula usa (Trivy, Snyk, Dependabot?) e se há conceito de "priorização por contexto" a seguir.

## 9. Grupo F · Unidade 08 — Eficiência no ciclo de entrega (4 partes)

Este é o grupo com maior ligação com o **domínio 3 da prova** (Claude Code em CI com `-p` e `--json-schema`, tarefa 3.6) e com 4.6 (revisão multi-instância).

### F1 · Revisão de PR com Bedrock disparada por CodeBuild (base AWS)
- **Constrói:** evento de PR → CodeBuild → extrai o diff → modelo comenta → resultado volta ao PR.
- **Serviços AWS:** CodeBuild, EventBridge, Lambda, Bedrock, Secrets Manager.
- **Componente Claude:** revisão com critérios explícitos e saída estruturada. **Tarefas:** 4.1, 4.3, 3.6.
- **Outra cloud:** Azure Pipelines + PR comments; GCP Cloud Build + Gemini Code Assist.
- **Floci:** CodeBuild (20), EventBridge, Lambda: sim.
- **Custo de lab:** ~US$ 0–1 por PR.
- **Fonte:** [Revisão e aprovação de código com IA generativa no Bedrock](https://aws.amazon.com/blogs/machine-learning/enhance-code-review-and-approval-efficiency-with-generative-ai-using-amazon-bedrock); [revisão automática de PR com CodeCommit e CodeBuild](https://aws.amazon.com/blogs/devops/automated-code-review-on-pull-requests-using-aws-codecommit-and-aws-codebuild) (base sem LLM). Observação: segundo meu conhecimento prévio (não reverificado), a AWS fechou o CodeCommit a novos clientes; o fluxo vale para GitHub. Confirmar.

### F2 · Claude Code headless no GitHub Actions com OIDC e Bedrock (próprio, alinhado à prova)
- **Constrói:** workflow que roda `claude -p` com `--json-schema` para produzir um relatório estruturado de revisão; **a CI valida o schema e falha o job** se o JSON não bater; usa OIDC para assumir um papel AWS com permissão só de `bedrock:InvokeModel`, sem chave estática; gera métricas DORA do repositório e um resumo de PR.
- **Serviços AWS:** IAM (OIDC), Bedrock, S3 (relatórios), CloudWatch (métricas de entrega).
- **Componente Claude:** Claude Code não interativo, sessão por PR. **Tarefas:** 3.6, 3.1, 3.3, 4.3, 4.4, 4.6 (segunda instância independente revisa a primeira), 1.7.
- **Outra cloud:** o workflow é igual; muda o provedor do modelo (Claude no Vertex AI ou Azure Foundry) e a federação de identidade (Workload Identity Federation no GCP, OIDC no Entra).
- **Floci:** IAM, S3, CloudWatch: sim (testa o papel e a política de menor privilégio). O Bedrock fica real só no smoke test. O comportamento do `claude -p` testamos com fake de binário para determinismo.
- **Custo de lab:** ~US$ 0–2/mês no volume de estudo.
- **Fonte:** composição própria alinhada ao guia do exame (tarefa 3.6, lente do `CLAUDE.md`). Para a camada AWS: [OIDC/IAM](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_providers_create_oidc.html) (link da documentação padrão da AWS; não abri nesta sessão). O guia do exame exige login e não foi consultado aqui: **confirmar os ids 3.6 e 4.6 no guia**.

### F3 · Quality gate com revisão em duas instâncias e Batch (próprio)
- **Constrói:** uma instância gera, outra revisa sem ver o raciocínio da primeira; PRs antigos reprocessados em lote (Message Batches API).
- **Serviços AWS:** Lambda, S3, Step Functions, Bedrock.
- **Componente Claude:** revisão multi-instância e lote. **Tarefas:** 4.6, 4.5.
- **Outra cloud:** equivalentes de fila e função.
- **Floci:** sim.
- **Custo de lab:** ~US$ 1–2.

**Recomendação do grupo F: F2, absorvendo F1 como "versão sem Claude Code" e F3 como o passo de revisão independente.** É o único projeto da disciplina que **é** a tarefa da prova: o repositório já usa GitHub Actions com OIDC (regra do `CLAUDE.md`), então o projeto também melhora o próprio repositório (o CLAUDE.md pede coerência com o domínio 3). Um sênior adota o *gate por schema* porque trata a saída do modelo como entrada não confiável. **A confirmar:** as quatro partes da aula (provavelmente CI/CD, testes, revisão, release); quais ferramentas (Copilot, Cursor, CodeRabbit?) e a métrica de "eficiência" usada.

## 10. Grupo G · Unidade 09 — FinOps com IA (2 partes)

Tema para sênior: o modelo **não calcula custo**; ele explica uma variação já calculada por consulta. E o próprio uso de IA precisa de FinOps (tokens, teto, alerta).

### G1 · Agente de custo sobre Cost Explorer e Anomaly Detection (base AWS)
- **Constrói:** um evento de anomalia de custo dispara a investigação: consulta Cost Explorer, identifica o serviço/tag responsável, e pergunta ao CloudTrail qual mudança coincide.
- **Serviços AWS:** Cost Explorer, Cost Anomaly Detection, Budgets, CloudTrail, EventBridge, Lambda, Bedrock, SNS.
- **Componente Claude:** tools de leitura (`ce:Get*`) com poucas ferramentas; relatório estruturado. **Tarefas:** 2.1, 2.3, 4.3, 5.6.
- **Outra cloud:** Azure Cost Management + Anomaly alerts; GCP Billing + Recommender.
- **Floci:** Cost Explorer (20), Budgets (26), CloudTrail (14), EventBridge: sim; Cost Anomaly Detection: **não está na lista**.
- **Custo de lab:** ~US$ 0–1; **atenção:** a API do Cost Explorer cobra por requisição (US$ 0,01 por chamada pela documentação da AWS: confirmar); o emulador evita isso.
- **Fonte:** [AWS FinOps Agent, FAQ](https://aws.amazon.com/finops-agent/faqs/) (produto em preview, referência); [InfoQ sobre o FinOps Agent](https://infoq.com/news/2026/06/aws-finops-agent); [MCP servers com Bedrock Agents (exemplo com Cost Explorer)](https://aws.amazon.com/blogs/machine-learning/harness-the-power-of-mcp-servers-with-amazon-bedrock-agents).

### G2 · Custo do próprio uso de IA (base AWS)
- **Constrói:** log de invocação do Bedrock → CloudWatch Logs → custo por feature/equipe com tags e teto.
- **Serviços AWS:** Bedrock invocation logging, CloudWatch Logs, Athena, Budgets.
- **Componente Claude:** análise em lote de padrões de gasto. **Tarefas:** 4.5, 5.5.
- **Outra cloud:** Azure OpenAI diagnostics + Cost Management; GCP Vertex AI logging + Billing export.
- **Floci:** Logs, Athena, Budgets: sim; invocation logging do Bedrock: **confirmar** (plano de controle tem 18 ops).
- **Custo de lab:** ~US$ 0–1.
- **Fonte:** [Monitoramento de apps de IA generativa com Bedrock e CloudWatch](https://aws.amazon.com/blogs/mt/monitoring-generative-ai-applications-using-amazon-bedrock-and-amazon-cloudwatch-integration).

### G3 · Minha sugestão: "FinOps no PR" com Infracost + LLM, ligado ao próprio repositório (próprio)
- **Constrói:** o diff do Infracost (que o `CLAUDE.md` já exige no PR) é explicado pelo modelo em linguagem de decisão ("este PR adiciona US$ X/mês fixo; alternativa Y custa Z") e bloqueia se violar a regra "nenhum custo fixo ocioso sem ADR".
- **Serviços AWS:** Budgets, Cost Explorer (opcional), S3, Lambda ou GitHub Actions, Bedrock.
- **Componente Claude:** análise com critérios explícitos e saída estruturada. **Tarefas:** 4.1, 4.3, 3.6.
- **Outra cloud:** Infracost cobre Azure e GCP; o desenho é idêntico.
- **Floci:** Budgets, S3: sim.
- **Custo de lab:** ~US$ 0.
- **Fonte:** própria; regra de custo do `CLAUDE.md`.

**Recomendação do grupo G: G3 + G1 em versão enxuta.** G3 evita custo, prova valor no próprio repositório e é a leitura de FinOps que um arquiteto usa (*shift-left*); G1 mostra a investigação pós-fato. Risco: o FinOps Agent da AWS já cobre G1 como produto; vale o contraste no post ("quando construir, quando comprar"). **A confirmar:** o foco da aula (previsão, rightsizing, anomalia?) e se usa dados da AWS ou planilhas.

## 11. Grupo H · Unidades 10 + 11 — Conhecimento vivo, auto-remediação e segurança operacional

Tema para sênior: auto-remediação é **escrita em produção decidida por um modelo**. O desenho é um problema de *blast radius*: catálogo fechado, dry-run, aprovação por risco, verificação pós-ação, rollback e limite de taxa.

### H1 · Agente de operações com runbooks em Knowledge Base e Systems Manager (base AWS)
- **Constrói:** agente de Bedrock com base de conhecimento de runbooks gera/executa um documento do SSM Automation para remediar (padrão do blog de Security Hub).
- **Serviços AWS:** Bedrock Agents + Knowledge Bases, Systems Manager Automation, Security Hub, Lambda, S3 (+ vetor).
- **Componente Claude:** recuperação de runbooks e geração de ação. **Tarefas:** 2.1, 1.4, 5.1, 5.6.
- **Outra cloud:** Azure Automation runbooks + AI Search; GCP Workflows + Vertex AI Search (confirmar).
- **Floci:** SSM (22 ops: **Automation provavelmente não coberta; confirmar**), Security Hub, Lambda, S3: parcial. A base vetorial deve ser trocada (restrição 3).
- **Custo de lab:** ~US$ 1–3 (+ vetor/OpenSearch, que não usaremos).
- **Fonte:** [Automações para remediar controles do Security Hub com Bedrock e Systems Manager](https://aws.amazon.com/blogs/machine-learning/building-automations-to-accelerate-remediation-of-aws-security-hub-control-findings-using-amazon-bedrock-and-aws-systems-manager); [Automatizar operações de TI com Bedrock Agents](https://aws.amazon.com/blogs/machine-learning/automate-it-operations-with-amazon-bedrock-agents/).

### H2 · Alarme → EventBridge → SSM Automation com gate e verificação (base AWS)
- **Constrói:** a parte determinística de H1, sem modelo na decisão de executar: o modelo só classifica e justifica.
- **Serviços AWS:** CloudWatch Alarms, EventBridge, SSM Automation, SNS, Step Functions.
- **Componente Claude:** classificação do incidente para escolher entre ações do catálogo. **Tarefas:** 1.4, 2.3, 5.2, 5.3.
- **Outra cloud:** Azure Monitor action groups + Automation; GCP Cloud Monitoring alert policies + Cloud Functions.
- **Floci:** EventBridge, SNS, Step Functions, CloudWatch: sim; SSM Automation: confirmar.
- **Custo de lab:** ~US$ 0–1 (execução de runbook de investigação tem custo próprio, conforme a documentação do CloudWatch).
- **Fonte:** [EventBridge para rodar SSM Automation em resposta a alarmes](https://aws.amazon.com/blogs/mt/use-amazon-eventbridge-rules-to-run-aws-systems-manager-automation-in-response-to-cloudwatch-alarms); [ações de runbook sugeridas pelas investigações do CloudWatch](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/suggested-investigation-actions.html).

### H3 · Minha sugestão: "knowledge loop" com pós-mortem estruturado alimentando a base (próprio, com apoio no Well-Architected)
- **Constrói:** todo incidente fechado gera um pós-mortem em template estruturado que é indexado e passa a ser consultado pelo agente da próxima vez; o histórico de ações automáticas é auditado e mede taxa de acerto; ação que falha na verificação reverte e escala.
- **Serviços AWS:** S3 (documentos), DynamoDB (índice simples por serviço/sintoma, no lugar de vetor), Step Functions, Lambda, SSM, Bedrock.
- **Componente Claude:** recuperação com proveniência, escalonamento e propagação de erro. **Tarefas:** 5.1, 5.2, 5.3, 5.6, 4.4.
- **Outra cloud:** o desenho é igual; troque S3/DynamoDB por Blob/Cosmos ou GCS/Firestore.
- **Floci:** S3, DynamoDB, Step Functions, Lambda: sim.
- **Custo de lab:** ~US$ 0–2.
- **Fonte:** [Well-Architected Agentic AI Lens, AGENTOPS07-BP02](https://docs.aws.amazon.com/wellarchitected/latest/agentic-ai-lens/agentops07-bp02.html) (alimentar a base com revisões pós-incidente); [Guidance for Agentic Live Ops](https://docs.aws.amazon.com/solutions/agentic-live-ops-on-aws/) (três bases, uma com playbooks de remediação; domínio de jogos, padrão adaptável). Isso é **inferência** minha sobre como combinar; as fontes não descrevem este desenho exato.

**Recomendação do grupo H: H3 sobre H2.** Duas unidades, um projeto: H2 é o lado "segurança operacional" (catálogo fechado, verificação e rollback), H3 o "conhecimento vivo". Evito a Knowledge Base com vetor porque a prova a deixa fora de escopo e porque o custo fixo contraria a regra de FinOps; DynamoDB com índice por serviço/sintoma resolve o tamanho do laboratório. O ganho de arquitetura: o agente **nunca** executa nada fora do catálogo, o que é testável por propriedade. **A confirmar:** a aula usa "RAG" explicitamente? Qual ferramenta de auto-remediação (StackStorm, Ansible, Argo)? A unidade 11 é sobre approvals/RBAC ou sobre sandbox?

## 12. Grupo I · Unidade 13 — Docker, Kubernetes local (Minikube), LocalStack, Streamlit, Ollama, IA em DevOps (3 partes)

Tema para sênior: **LLM self-hosted num cluster** como alternativa à API gerenciada, com o custo, a latência e o risco que isso traz; e o próprio ambiente de teste (emulador) como decisão de arquitetura.

### I1 · LLM no EKS com vLLM (base AWS)
- **Constrói:** servir um modelo aberto no EKS e consumir por endpoint compatível com OpenAI.
- **Serviços AWS:** EKS (GPU), vLLM DLC, ECR, ALB.
- **Componente Claude:** o Claude entra como **modelo de comparação/fallback** via Bedrock. **Tarefas:** 2.3, 4.1, 5.2 (fallback).
- **Outra cloud:** AKS + GPU; GKE + GPU.
- **Floci:** EKS (7 ops, k3s). GPU: **não testável**.
- **Custo de lab:** **alto**: instância GPU custa de dezenas de centavos a vários dólares por hora; aceitável só por minutos e com destroy automático. Violaria a regra sem ADR.
- **Fonte:** [Servir LLM no EKS](https://docs.aws.amazon.com/eks/latest/userguide/ml-inference-load-serve-model.html); [vLLM Deep Learning Containers no EKS](https://aws.amazon.com/ko/blogs/architecture/deploy-llms-on-amazon-eks-using-vllm-deep-learning-containers/). Para Streamlit, só há post de **comunidade**; não achei guia oficial AWS com **Ollama no EKS**.

### I2 · Laboratório local reproduzível: Minikube + emulador + Ollama + Streamlit (próprio, fiel à aula)
- **Constrói:** manifests/Helm para Minikube com um emulador AWS, um modelo pequeno no Ollama e um front Streamlit; o Terraform aponta para o endpoint do emulador; mesma suíte rodando contra **LocalStack e Floci** com um relatório de compatibilidade.
- **Serviços AWS:** os que o app usar (S3, SQS, Lambda, DynamoDB), emulados.
- **Componente Claude:** o app pode alternar entre Ollama (local) e Claude (Bedrock) por configuração; avaliação comparando as duas respostas. **Tarefas:** 4.1, 4.6, 5.5.
- **Outra cloud:** Kubernetes é portátil: AKS/GKE; mesmo manifest com outro StorageClass e Ingress.
- **Floci:** é a comparação central; veja seção 2. Rodar o Floci dentro do Minikube: **não verificado**.
- **Custo de lab:** US$ 0 (tudo local); AWS só no smoke test.
- **Fonte:** própria, a partir da seção 2 e da lista de serviços do [Floci](https://floci.io/floci/services/).

### I3 · Versão enxuta do I1: **EKS Auto Mode ou ECS com CPU e modelo pequeno** (própria, sobre base AWS)
- **Constrói:** o mesmo desenho do I1 com um modelo quantizado em CPU, por poucos minutos, e destroy garantido.
- **Serviços AWS:** EKS ou ECS (Fargate), ECR, ALB opcional.
- **Componente Claude:** igual a I2. **Tarefas:** 2.3, 5.2.
- **Outra cloud:** AKS/GKE Autopilot.
- **Floci:** EKS (7 ops, k3s), ECS (59, containers reais): sim.
- **Custo de lab:** ~US$ 0,5–2 por sessão (plano de controle do EKS ~US$ 0,10/h: **confirmar**); destroy obrigatório.
- **Fonte:** [Servir LLM no EKS](https://docs.aws.amazon.com/eks/latest/userguide/ml-inference-load-serve-model.html), adaptada.

**Recomendação do grupo I: I2, com I3 só como teste final opcional.** É a unidade mais voltada a laboratório, o custo é zero, e a comparação LocalStack x Floci é um entregável de arquitetura que alimenta todo o repositório. I1 não cabe na disciplina de custo. **A confirmar:** versão e licença do LocalStack usadas na aula, modelo do Ollama, e o que "IA em DevOps (pt 1 a 3)" cobre. Ponto de honestidade: um modelo pequeno em CPU não substitui o Claude na qualidade; o projeto documenta isso em vez de esconder.

## 13. Recomendações consolidadas

| Grupo | Unidades | Recomendada | Domínios da prova | Custo de lab (est.) | Teste local |
|---|---|---|---|---|---|
| A | 01+02 | A3 Terraform Doctor (+ A1 como etapa) | 1, 2, 4, 5 | US$ 1–3 | alto (sem o modelo) |
| B | 03 | B1 (+ catálogo de B3) | 1, 2 | US$ 0–2 | alto |
| C | 04+05 | C1 + avaliação de C3 | 1, 2, 4, 5 | US$ 1–2 | alto |
| D | 06+12 | D3 sobre D1 | 1, 2, 5 | US$ 0–1 | alto |
| E | 07 | E3 (+ fonte de E1) | 4, 5 | US$ 0–1 | alto |
| F | 08 | F2 (+ F1, F3) | **3**, 4, 1 | US$ 0–2 | médio |
| G | 09 | G3 + G1 enxuto | 2, 4, 5 | US$ 0–1 | alto |
| H | 10+11 | H3 sobre H2 | 1, **5**, 2, 4 | US$ 0–2 | alto |
| I | 13 | I2 (+ I3 opcional) | 4, 5 | US$ 0 | alto |

Cenários da prova mais próximos: **suporte ao cliente** (D3), **pesquisa multiagente** (B2/C1), **Claude Code em CI** (F2), **extração estruturada** (E3, A1), **produtividade de devs** (A3, F2). O cenário "geração de código com Claude Code" fica coberto em A3 e F2.

## 14. Sugestão de ordem e de escopo

Pelo `CLAUDE.md`, desenvolvemos **pelo menos uma opção por disciplina** e a pós-graduação está atrasada, então sugiro:

1. **Obrigatório:** F2 (domínio 3, reutilizável pelo próprio repositório) e H3 (domínio 5).
2. **Em seguida:** C1 + avaliação (reaproveita a infra de H3: o agente de investigação alimenta a base).
3. **Opcional por tempo:** A3, B1, D3, E3, G3, I2. Cada um pode virar só post + ADR se a escolha for "documentar sem implementar".

Perguntas que dependem de você (não suponho):
1. Quais grupos você quer implementar, e quais só como proposta documentada?
2. Aceita Claude via **Bedrock** (restrito pelo stub do Floci, com fakes nos testes) ou prefere a API da Anthropic direta nos smoke tests?
3. Cloud comparativa por grupo: Azure, GCP ou OCI? Minha sugestão: **Azure** nos grupos D e I (Teams/AKS), **GCP** em A, C e H.
4. Teto mensal de orçamento para esta disciplina (sugiro US$ 10 de lab no total, com alerta no AWS Budgets).
5. Pode me dar acesso às legendas e ao PDF da disciplina 06 para eu fechar as listas "A confirmar"?

## 15. Pendências desta proposta

- Nenhuma legenda, PDF ou página da plataforma do curso foi lida; os escopos por unidade derivam só dos títulos do PROGRESSO.md.
- Não consultei o guia oficial do exame (exige login); os ids de tarefa vêm do `CLAUDE.md`.
- As equivalências em Azure e GCP não foram pesquisadas na documentação destas clouds.
- Os custos não foram calculados com Infracost nem com a calculadora da AWS.
- A página dos termos atuais do LocalStack não foi lida (o host não abriu nesta sessão); o resumo vem do resultado da busca.
- Os números de vendor (MTTR, 94% de acurácia, 77% no caso WGU) foram citados só como contexto, nunca como meta de projeto.
