# Disciplina 05 · Ferramentas de IA para UX e UI — opções de projeto

Status: **proposta, nada implementado.** Data: 2026-11-18. Aguarda a sua escolha por unidade.

## Como ler este documento

- **Base da pesquisa:** títulos das aulas no `docs/curso/PROGRESSO.md` e fontes públicas da AWS. Não tive acesso às legendas nem ao PDF da disciplina. Tudo que depende deles está marcado com **[confirmar]** e consolidado na seção "O que confirmar nas legendas e no PDF".
- **Tese da disciplina:** UX/UI com IA vira arquitetura quando o artefato de design (token, componente, copy, prompt) passa a ser **dado versionado e testável**, com um pipeline que o produz, valida e publica. Cada opção abaixo trata um desses artefatos como produto de plataforma.
- **Componente com Claude:** em todas as opções ele roda via Amazon Bedrock (ou API da Anthropic) e exercita ids de tarefa da prova CCAR-F (lista no CLAUDE.md). Fora do escopo da prova: deploy de servidores MCP e embeddings. Por isso, quando uma opção usa MCP, ele roda como cliente ou processo local/CI, não como serviço implantado.
- **Custo em lab:** estimativa de arquiteto, **sem calculadora**. Os valores assumem a menor escala que demonstra o padrão, destroy ao fim de cada sessão e poucas centenas de chamadas ao modelo. Confirmar com Infracost e preços de Bedrock da região antes de fixar o teto. O que domina o custo é sempre a inferência, não a infraestrutura.
- **Outra cloud:** proponho **GCP** como comparativa padrão, porque a disciplina ensina ferramentas Google (AI Studio, Genkit, Stitch, Jules) e o mapeamento fica quase 1:1. Você decide (pergunta nº 1 no fim).
- **Links:** os marcados com ✔ foram abertos e lidos nesta sessão. Os sem marca vieram de busca (título e trecho) e devem ser abertos antes de virarem ADR.

## Cobertura no Floci (verificada nesta sessão)

Subi `floci/floci:latest` (versão 2.5.0, edição community) e consultei o endpoint de saúde e algumas APIs.

| Achado | Evidência | Consequência |
|---|---|---|
| 127 nomes de serviço ativos, incluindo `bedrock`, `bedrock-runtime`, `bedrock-agentcore`, `bedrock-agentcore-control`, `apigateway`, `apigatewayv2`, `appsync`, `cognito-idp`, `cloudfront`, `codeartifact`, `codebuild`, `codepipeline`, `dynamodb`, `events`, `scheduler`, `lambda`, `s3`, `sns`, `sqs`, `states`, `ssm`, `secretsmanager`, `kms`, `wafv2`, `translate`, `comprehend`, `rekognition`, `textract`, `budgets`, `ecs`, `logs`, `monitoring` | `GET /_floci/health` | Quase toda a infraestrutura das opções é testável local. |
| **Bedrock Runtime responde com stub fixo**: `Converse` devolveu `"Floci stub response for model=amazon.nova-micro-v1:0"` | chamada `bedrock-runtime converse` | **Lacuna do emulador, esperada:** o Floci não executa Claude. A lógica do componente Claude precisa ser testada por contrato (fixtures de resposta, `stop_reason`, `tool_use` simulados) e por uma execução real e curta, opcional e fora do CI. |
| **Bedrock Prompt Management indisponível**: `bedrock-agent list-prompts` → `UnknownOperationException` | chamada `bedrock-agent list-prompts` | Opções de prompt versionado usam S3 + SSM como registro (ADR), com Prompt Management como equivalente de produção. |
| `codeartifact list-domains`, `bedrock list-guardrails`, `bedrock-agentcore-control list-gateways` respondem (listas vazias) | chamadas na sessão | A API existe. **Profundidade da implementação não verificada**; testar com `apply` real na hora de implementar. |
| **Amplify e Nova Act não constam** na lista de serviços | health + floci.io/aws | Opções que dependem de Nova Act ou Amplify trocam por equivalente (ADR). |
| Batch inference do Bedrock (`CreateModelInvocationJob`) | não testado | **[confirmar]** no Floci antes de escolher a opção 1B. |

Regra do CLAUDE.md mantida: só marco lacuna do emulador com evidência. Os itens acima têm evidência (chamada ou lista); o resto fica "não verificado".

---

## Unidade 01 — requisitos, fluxos, UX writing, datasets, structured prompts, prompt as code

**Temas de maior valor para sênior (de 1 a 3):** (a) prompt como artefato versionado com gate de qualidade; (b) saída estruturada como contrato entre IA e produto; (c) datasets sintéticos de edge cases para avaliar. **[confirmar]** nas legendas quais ferramentas as aulas usam (AI Studio é citado no título) e se há exercício de dataset reaproveitável.

### Opção 1A · Registro de prompts com gate de avaliação (prompt as code)
- **Constrói:** repositório de prompts (YAML com variáveis e schema de saída) → pipeline que empacota uma versão imutável, roda um conjunto de casos (requisitos e edge cases) e só promove a versão "ativa" se passar nos limiares. Rollback é trocar o ponteiro.
- **Serviços AWS:** CodePipeline + CodeBuild, S3 (versões imutáveis, versionamento ligado, SSE-KMS), SSM Parameter Store (ponteiro da versão ativa), Lambda (runner de avaliação), DynamoDB (resultados), CloudWatch (métricas e alarme de regressão), Bedrock.
- **Componente Claude:** extrator de requisitos e edge cases com saída estruturada por `tool_use`, few-shot, validação com retentativa e relatório de calibração.
- **Tarefas CCAR-F:** 4.1, 4.2, 4.3, 4.4, 3.6 (execução em CI com `-p` e `--json-schema`).
- **Outra cloud (GCP):** Cloud Build + Artifact Registry/GCS + Secret Manager ou Parameter Manager + Cloud Run Jobs + Firestore + Vertex AI (Gemini/Claude). O Vertex AI Prompt Management faz o papel do registro; **[confirmar]** no site da GCP.
- **Floci:** S3, SSM, Lambda, DynamoDB, CodeBuild, CodePipeline, CloudWatch cobertos. Prompt Management não existe (testado), então o registro é S3+SSM por ADR. Bedrock é stub: o gate é testado com respostas gravadas.
- **Custo em lab:** cerca de US$ 1–3/mês de infra mais inferência (poucas centenas de chamadas com modelo pequeno). Sem custo fixo ocioso.
- **Fonte:** ✔ [AWS Prescriptive Guidance — Prompt, agent, and model lifecycle management](https://docs.aws.amazon.com/prescriptive-guidance/latest/agentic-ai-serverless/prompt-agent-and-model.html) (versionar prompts, templates com variáveis, casos de teste, shadow mode). Complemento: [Well-Architected Agentic AI Lens, AGENTOPS02-BP01](https://docs.aws.amazon.com/wellarchitected/latest/agentic-ai-lens/agentops02-bp01.html) (CodePipeline bloqueando promoção sem aprovação e limiar de avaliação).

### Opção 1B · Fábrica de datasets sintéticos em lote
- **Constrói:** pipeline que gera milhares de histórias de usuário, variações de persona e edge cases com Claude em **batch inference**, valida o schema, remove duplicatas e publica um dataset versionado para avaliar os prompts da 1A.
- **Serviços AWS:** S3 (JSONL de entrada e saída), Bedrock batch inference, Step Functions, Lambda (preparo e validação), Glue/Athena (qualidade e deduplicação), EventBridge.
- **Componente Claude:** geração em lote com saída estruturada; amostra revisada por outra instância (revisão multi-instância) e por humano.
- **Tarefas CCAR-F:** 4.5 (Message Batches), 4.3, 4.6, 5.5.
- **Outra cloud (GCP):** Vertex AI batch prediction + GCS + Workflows + BigQuery.
- **Floci:** S3, Step Functions, Lambda, Glue, Athena cobertos. **Batch inference do Bedrock não testado [confirmar].** Se faltar, a etapa vira mock com ADR e o lote real roda só no lab.
- **Custo em lab:** US$ 1–5 por rodada. O batch custa menos que o on-demand (a AWS anuncia 50% para o Claude Sonnet 4, ver fonte), mas o job tem mínimo de registros; **[confirmar]** o mínimo atual na documentação.
- **Fonte:** ✔ [Bedrock — Create a batch inference job](https://docs.aws.amazon.com/bedrock/latest/userguide/batch-inference-create.html). Caso de pipeline com dados sintéticos e batch: [AWS ML Blog — Classify call center conversations with Amazon Bedrock batch inference](https://aws.amazon.com/blogs/machine-learning/classify-call-center-conversations-with-amazon-bedrock-batch-inference). A tabela de preço do batch vem do comunicado [What's New — batch para Claude Sonnet 4](https://aws.amazon.com/about-aws/whats-new/2025/08/amazon-bedrock-batch-inference-anthropic-claude-sonnet-4-openai-gpt-oss-models/) (só trecho de busca).

### Opção 1C · Pipeline de UX writing e localização com guardas de marca
- **Constrói:** microcopy da interface (chaves i18n) passa por tradução automática com glossário, pós-edição por Claude com guia de voz da marca, e um segundo Claude revisa. Strings reprovadas vão para fila de revisão humana.
- **Serviços AWS:** S3, Amazon Translate (terminologia customizada), Step Functions, Lambda, SQS (fila de revisão), DynamoDB (estado por string), Bedrock.
- **Componente Claude:** pós-edição e revisão independente.
- **Tarefas CCAR-F:** 4.1 (critérios explícitos de voz), 4.2, 4.6, 5.5 (calibração do revisor humano).
- **Outra cloud (GCP):** Cloud Translation (glossário) + Vertex AI + Workflows + Pub/Sub.
- **Floci:** Translate, Step Functions, SQS, Lambda cobertos. Tradução é stub, então o teste valida orquestração, não qualidade.
- **Custo em lab:** menos de US$ 2 em centenas de strings.
- **Fonte:** ✔ [Amazon Translate — Custom terminology](https://docs.aws.amazon.com/translate/latest/dg/how-custom-terminology.html) (a doc avisa que a terminologia não é garantida em toda tradução, ponto de projeto). Pós-edição com LLM: [AWS ML Blog — How TransPerfect improved translation quality using Amazon Bedrock](https://aws.amazon.com/blogs/machine-learning/how-transperfect-improved-translation-quality-and-efficiency-using-amazon-bedrock/) (só trecho de busca).

### Opção 1D · (sugestão minha) Gate de requisitos com handoff humano
- **Constrói:** Claude transforma um briefing em requisitos, matriz de edge cases e fluxo em Mermaid. Gates programáticos (schema, cobertura mínima de edge cases, diagrama válido) decidem se avança. Falhou o gate duas vezes, ou confiança baixa: o workflow pausa e pede decisão humana.
- **Serviços AWS:** Step Functions com callback por task token, Lambda, SNS (aviso), API Gateway (aprovar/rejeitar), DynamoDB (decisões e trilha de auditoria), Bedrock.
- **Componente Claude:** loop de agente com `stop_reason`, saída estruturada e escalonamento.
- **Tarefas CCAR-F:** 1.1, 1.4, 4.3, 4.4, 5.2, 5.5.
- **Outra cloud (GCP):** Workflows com callbacks + Cloud Run + Pub/Sub + Firestore.
- **Floci:** Step Functions, API Gateway, SNS, Lambda, DynamoDB cobertos. Task token no emulador **não verificado**.
- **Custo em lab:** menos de US$ 1.
- **Fonte:** ✔ [Step Functions — Wait for a callback with task token](https://docs.aws.amazon.com/step-functions/latest/dg/connect-to-resource.html) (cita aprovação humana; token só entre principais da mesma conta).

### Recomendação da Unidade 01: **1A**
Como arquiteto: é a única que transforma o título "prompt as code" em engenharia verificável, e é a **fundação das outras quatro unidades**, porque todo componente Claude dos demais projetos passa a nascer como prompt versionado com avaliação. Cobre o domínio 4 (20% da prova) quase inteiro e custa quase nada. A lacuna do Prompt Management no Floci é conhecida e tratada por ADR (S3 + SSM no lab, Prompt Management em produção). 1D é a melhor alternativa se você quiser mais peso no domínio 1; 1B vale como complemento barato.

---

## Unidade 02 — Angular e MCP, tokens, componentes acessíveis, Stitch, Figma, correção de interface com IA

**Temas de maior valor (de 1 a 3):** (a) design tokens como fonte única entre Figma, código e IA; (b) acessibilidade como verificação automatizada com revisão humana; (c) IA corrigindo interface com guardrails (patch pequeno, testado). **[confirmar]** nas legendas como Angular consome o MCP (servidor próprio ou existente) e qual a origem dos tokens (Figma, Stitch, arquivo).

### Opção 2A · Tokens como contrato: pipeline de publicação
- **Constrói:** tokens (JSON) viram pacote npm versionado (CSS variables, tipos), publicado em repositório privado, e um catálogo de componentes (Storybook estático) servido por CDN. Mudança de token abre PR com relatório de impacto.
- **Serviços AWS:** CodePipeline/CodeBuild, CodeArtifact (pacote npm), S3 + CloudFront com OAC (catálogo), WAF opcional, CloudWatch, Budgets.
- **Componente Claude:** cliente MCP local (somente leitura) com tools de consulta de tokens e componentes, e revisão de PR quanto à aderência a tokens. Descrições de tools bem escritas e erros estruturados.
- **Tarefas CCAR-F:** 2.1, 2.2, 2.4, 3.1, 3.3 (regras por caminho para `tokens/` e `components/`), 4.3.
- **Outra cloud (GCP):** Cloud Build + Artifact Registry (npm) + Cloud Storage + Cloud CDN/Load Balancer.
- **Floci:** CodeArtifact (API responde), CloudFront, S3, CodeBuild cobertos. Profundidade do CodeArtifact e do CloudFront **[confirmar]** com apply real.
- **Custo em lab:** US$ 1–3/mês (CloudFront e S3 com pouco tráfego; CodeArtifact cobra por armazenamento e requisições).
- **Fonte:** ✔ [AWS Architecture Blog — Micro-frontend Architectures on AWS](https://aws.amazon.com/blogs/architecture/micro-frontend-architectures-on-aws) (a menção a CodeArtifact vem de trecho de busca do mesmo post, **[confirmar]** lendo a página inteira) e [AWS Prescriptive Guidance — Understanding and implementing micro-frontends on AWS](https://docs.aws.amazon.com/prescriptive-guidance/latest/micro-frontends-aws/introduction.html) (design system como abordagem "compartilhar algo", seção cujo conteúdo li apenas pelo título).

### Opção 2B · Remediação de acessibilidade com revisão humana
- **Constrói:** pipeline que recebe HTML/telas, audita contra WCAG 2.1 AA, propõe correções (alt text, rótulos, ARIA, contraste via token), valida com verificador determinístico (axe) e só aplica o que passa. O que Claude não sabe decidir vai para revisão humana.
- **Serviços AWS:** S3, Step Functions, Lambda ou ECS Fargate (verificador), Bedrock, Rekognition (apoio a imagem), DynamoDB (achados e decisões), SNS.
- **Componente Claude:** auditor com critérios explícitos mapeados a critérios WCAG, saída estruturada, laço de validação e retentativa, rastreio de proveniência (qual regra, qual evidência).
- **Tarefas CCAR-F:** 4.1, 4.3, 4.4, 5.5, 5.6.
- **Outra cloud (GCP):** Cloud Run Jobs + Workflows + Vertex AI + Cloud Storage + Firestore.
- **Floci:** S3, Step Functions, Lambda, ECS, Rekognition, DynamoDB cobertos. Bedrock stub: validação por fixtures; axe roda de verdade (não depende da AWS).
- **Custo em lab:** US$ 1–4.
- **Fonte:** ✔ busca: [awslabs/content-accessibility-utility-on-aws](https://awslabs.github.io/content-accessibility-utility-on-aws/accessibility_remediation) (audita HTML contra WCAG 2.1 e remedia com modelos do Bedrock; li só o trecho de busca). Arquitetura de descrição de imagem: [AWS ML Blog — Build a generative AI image description application with Claude 3.5 Sonnet on Amazon Bedrock and AWS CDK](https://aws.amazon.com/blogs/machine-learning/build-a-generative-ai-image-description-application-with-anthropics-claude-3-5-sonnet-on-amazon-bedrock-and-aws-cdk) (AppSync + Lambda + Bedrock; só trecho).

### Opção 2C · (sugestão minha) Agente de correção de UI com ferramentas mínimas
- **Constrói:** agente que recebe um defeito de UI (screenshot, trecho de DOM, violação), consulta tokens, propõe um patch e roda checagens. Hooks bloqueiam patches fora do escopo (só arquivos de UI, tamanho máximo) e pedem aprovação humana para mudanças em token.
- **Serviços AWS:** Lambda (loop do agente), Step Functions (limites de iteração), Bedrock Converse, S3 (artefatos), DynamoDB (sessões), CloudWatch.
- **Componente Claude:** loop do agente guiado por `stop_reason`, 3 a 4 tools, `tool_choice`, hooks pré e pós execução.
- **Tarefas CCAR-F:** 1.1, 1.5, 2.1, 2.2, 2.3, 1.7.
- **Outra cloud (GCP):** Cloud Run + Vertex AI + Workflows.
- **Floci:** Lambda, Step Functions, S3, DynamoDB cobertos; Bedrock stub (o loop é testado com sequências simuladas de `tool_use` e `end_turn`).
- **Custo em lab:** menos de US$ 2.
- **Fonte:** sem arquitetura oficial da AWS que reúna os itens; é composição minha sobre o padrão de orquestração do Prescriptive Guidance ([Pattern 2: Agentic AI orchestration with Amazon Bedrock](https://docs.aws.amazon.com/prescriptive-guidance/latest/agentic-ai-serverless/pattern-agentic-ai-orchestration.html), só título e trecho).

### Recomendação da Unidade 02: **2B**
Como arquiteto: acessibilidade é o caso em que "IA propõe, regra determinística valida, humano decide" fica mais nítido e mais defensável em um enterprise (risco legal real). Cobre "componentes acessíveis" e "correção de interface com IA" juntos, exercita os domínios 4 e 5 sem exigir MCP implantado, e testa bem local (axe é determinístico). Os tokens (2A) entram como insumo para sugerir contraste; fico com 2A como candidata à Unidade 05 se você preferir concentrar design system lá.

---

## Unidade 03 — Nx monorepo e MCP, OpenSpec, orquestração paralela, code review, Google Jules

**Temas de maior valor (de 1 a 3):** (a) monorepo com CI que roda só o afetado; (b) spec como entrada do trabalho dos agentes; (c) revisão de código em paralelo com calibração. **[confirmar]** nas legendas: como o Nx expõe o MCP, qual formato de spec do OpenSpec, e o que o Jules faz na aula (agente assíncrono em branch).

### Opção 3A · CI de monorepo "afetado" com Claude Code em CI
- **Constrói:** detecção de projetos afetados (Nx) disparando pipelines por projeto, com etapa de Claude Code headless que valida mudanças contra o CLAUDE.md do projeto afetado e devolve JSON.
- **Serviços AWS:** CodeConnections (GitHub) + CodePipeline + CodeBuild, Lambda (roteador de mudanças), S3 (cache e artefatos), CloudWatch. O pipeline da própria AWS usa CodeCommit; aqui o repositório é GitHub, então **[confirmar]** o gatilho via CodeConnections.
- **Componente Claude:** `claude -p` com `--json-schema`, hierarquia de CLAUDE.md por projeto Nx, regras por caminho.
- **Tarefas CCAR-F:** 3.1, 3.3, 3.6, 4.3.
- **Outra cloud (GCP):** Cloud Build triggers por caminho + Artifact Registry.
- **Floci:** CodeBuild, CodePipeline, Lambda, S3 cobertos.
- **Custo em lab:** US$ 1–3 (minutos de build; a maior parte do afetado roda no GitHub Actions do próprio repositório, o que o CLAUDE.md já prevê).
- **Fonte:** ✔ busca: [AWS Prescriptive Guidance — Automatically detect changes and initiate different CodePipeline pipelines for a monorepo in CodeCommit](https://docs.aws.amazon.com/prescriptive-guidance/latest/patterns/automatically-detect-changes-and-initiate-different-codepipeline-pipelines-for-a-monorepo-in-codecommit.html) (o padrão detecta mudança por caminho, **não** analisa dependências entre projetos; o grafo do Nx cobre essa lacuna) e [AWS DevOps Blog — Integrate GitHub monorepo with AWS CodePipeline](https://aws.amazon.com/blogs/devops/integrate-github-monorepo-with-aws-codepipeline-to-run-project-specific-ci-cd-pipelines).
- **Ressalva:** este pipeline duplica o que o GitHub Actions já faz neste repositório; o valor didático é menor que o das outras opções.

### Opção 3B · Revisão de PR paralela com coordenador e subagentes
- **Constrói:** webhook de PR → API Gateway → Lambda coordenadora decompõe o diff por arquivo ou por preocupação (segurança, acessibilidade, aderência à spec, estilo) → fila → revisores em paralelo → agregador consolida, deduplica e posta comentário. Achados de baixa confiança viram "pergunta", não "bloqueio".
- **Serviços AWS:** API Gateway, Lambda, SQS (com DLQ), DynamoDB (progresso e achados), S3 (diffs e resultados), Secrets Manager (token do GitHub), Bedrock, CloudWatch com alarme de DLQ.
- **Componente Claude:** coordenador e revisores especializados com contexto explícito por subagente, instância independente de revisão, calibração de falsos positivos com amostra rotulada por humano.
- **Tarefas CCAR-F:** 1.2, 1.3, 1.6, 4.6, 5.3, 5.5. Cenário da prova mais próximo: Claude Code em CI / produtividade de devs.
- **Outra cloud (GCP):** Cloud Run + Pub/Sub + Firestore + Vertex AI + Secret Manager.
- **Floci:** API Gateway, Lambda, SQS, DynamoDB, S3, Secrets Manager cobertos. Bedrock stub (o fan-out, a DLQ e a agregação são testáveis de verdade; a qualidade do review não).
- **Custo em lab:** US$ 1–3 (depende do tamanho do diff; teto por PR no código).
- **Fonte:** ✔ busca: [AWS China Blog — GenAI practice of the Pacvue R&D team](https://aws.amazon.com/cn/blogs/china/genai-practice-of-pacvue-rd-and-operation-team) (Lambda em VPC, SQS para fan-out por arquivo, S3 e DynamoDB; **em chinês, li só o trecho**, **[confirmar]** a arquitetura completa), [AWS ML Blog — Enhance code review and approval efficiency with generative AI using Amazon Bedrock](https://aws.amazon.com/blogs/machine-learning/enhance-code-review-and-approval-efficiency-with-generative-ai-using-amazon-bedrock) (2024, Lambda + DynamoDB Streams + InvokeModel) e [AWS Public Sector Blog — SoftwareOne](https://aws.amazon.com/blogs/publicsector/softwareone-boosts-developer-efficiency-and-streamlines-code-reviews-using-amazon-bedrock) (resumo de PR serverless).

### Opção 3C · (sugestão minha) Pipeline spec-driven com agentes paralelos e gates
- **Constrói:** uma spec aprovada (formato OpenSpec **[confirmar]**) é decomposta em tarefas independentes; um `Map` do Step Functions as executa em paralelo, cada uma em seu espaço isolado e com orçamento de tokens; gates programáticos (testes, lint, escopo do diff) e aprovação humana antes do merge. Sessões retomáveis e ramificáveis.
- **Serviços AWS:** Step Functions (Map, callback), CodeBuild (executa testes por tarefa), Lambda, S3, DynamoDB, SNS, Bedrock.
- **Componente Claude:** agentes de implementação por tarefa com contexto passado explicitamente, resumo de handoff, retomada e fork de sessão.
- **Tarefas CCAR-F:** 1.2, 1.3, 1.4, 1.6, 1.7, 5.1.
- **Outra cloud (GCP):** Workflows (paralelo) + Cloud Build + Cloud Run Jobs + Vertex AI.
- **Floci:** Step Functions, CodeBuild, Lambda, S3, DynamoDB cobertos; estado `Map` e callback no emulador **não verificados**.
- **Custo em lab:** US$ 2–6 por rodada (várias execuções de modelo em paralelo).
- **Fonte:** composição minha, apoiada em ✔ [Step Functions — callback com task token](https://docs.aws.amazon.com/step-functions/latest/dg/connect-to-resource.html) e no [Pattern 2 do Prescriptive Guidance](https://docs.aws.amazon.com/prescriptive-guidance/latest/agentic-ai-serverless/pattern-agentic-ai-orchestration.html).

### Recomendação da Unidade 03: **3B**
Como arquiteto: cobre os dois títulos mais "de arquitetura" da unidade, orquestração paralela e code review, com fontes oficiais e casos reais de fan-out por SQS, e atinge o domínio 1 (27%, o maior peso) mais 4.6 e 5.5. A spec do OpenSpec entra como um dos revisores ("o PR cumpre a spec?"), o que liga a unidade sem construir a 3C inteira. É a opção que melhor testa a parte não-LLM no Floci (fila, DLQ, idempotência, agregação). 3C é mais ambiciosa e mais cara; 3A pouco acrescenta além do que o GitHub Actions deste repositório já faz.

---

## Unidade 04 — QA com Nx e Cypress, asserções semânticas, agente de QA com Playwright MCP

**Temas de maior valor (de 1 a 3):** (a) asserção semântica sem aumentar a flakiness (limiar, cache, escopo); (b) agente de QA com ferramentas mínimas e humano no circuito; (c) escolha de onde a IA entra no pipeline de testes (geração versus julgamento). **[confirmar]** nas legendas: o critério de "asserção semântica" ensinado, o que o agente com Playwright MCP gera, e como o Nx orquestra Cypress.

### Opção 4A · QA agêntico em browser gerenciado
- **Constrói:** suíte de cenários em linguagem natural executada por agente em browser isolado na nuvem, com gravação de sessão, em paralelo, integrada ao pipeline.
- **Serviços AWS:** Bedrock AgentCore Browser, S3 (gravações e relatórios), Step Functions, CodeBuild, CloudWatch, IAM. O post original usa Amazon Nova Act; aqui o agente seria Claude com Playwright.
- **Componente Claude:** agente de QA (observa a tela, decide a ação) com poucas tools e erros estruturados retornados ao modelo.
- **Tarefas CCAR-F:** 1.1, 2.1, 2.2, 2.3, 5.3.
- **Outra cloud (GCP):** Cloud Run Jobs com Playwright + Vertex AI (não há browser gerenciado equivalente que eu tenha confirmado; **[confirmar]**).
- **Floci:** o nome `bedrock-agentcore` existe, mas **sessões de browser não foram testadas**; Nova Act não consta. Sem evidência, não marco como lacuna: testar na hora. Plano B: Playwright em container ECS local.
- **Custo em lab:** não estimado com segurança; AgentCore cobra por consumo e **[confirmar]** a tabela atual. Pode ser a opção mais cara das cinco.
- **Fonte:** ✔ [AWS ML Blog — Agentic QA automation using Amazon Bedrock AgentCore Browser and Amazon Nova Act](https://aws.amazon.com/blogs/machine-learning/agentic-qa-automation-using-amazon-bedrock-agentcore-browser-and-amazon-nova-act) (sessão isolada, live view, CloudTrail, replay). Também: [AWS ML Blog — Building intent-driven UI testing with Amazon Nova Act](https://aws.amazon.com/blogs/machine-learning/building-intent-driven-ui-testing-with-amazon-nova-act/), que relata que o Playwright seguiu como espinha dorsal da regressão (trecho de busca).

### Opção 4B · Validação de conteúdo "última milha" com juiz visual
- **Constrói:** capturas de tela agendadas das telas críticas → redação de dados sensíveis → Claude julga estruturalmente (bloco vazio, estado de erro, gráfico ausente) com critérios explícitos → alerta ao dono da seção com screenshot e confiança. Aprendizado central do post: projetar contra falso positivo primeiro e **manter o LLM longe de aritmética** (números conferidos por código).
- **Serviços AWS:** EventBridge Scheduler, Step Functions, Lambda/ECS (captura com browser headless), Rekognition (redação), S3, Bedrock, SNS, DynamoDB (registro de seções e limiares), CloudWatch.
- **Componente Claude:** asserções semânticas com saída estruturada (veredito, confiança, evidência), calibração com amostra humana, incerteza explícita.
- **Tarefas CCAR-F:** 4.1, 4.3, 4.4, 5.5, 5.6, 5.2.
- **Outra cloud (GCP):** Cloud Scheduler + Workflows + Cloud Run Jobs (Playwright) + Cloud DLP (redação) + Vertex AI + Pub/Sub.
- **Floci:** EventBridge, Scheduler, Step Functions, Lambda, ECS, Rekognition, S3, SNS, DynamoDB cobertos. Bedrock stub (o juiz é testado com fixtures rotuladas; a taxa real de falso positivo só se mede em execução real curta). A captura roda com o Playwright local, que não depende do emulador.
- **Custo em lab:** US$ 1–3 (a AWS destaca arquitetura que escala a zero entre ciclos).
- **Fonte:** ✔ [AWS ML Blog — How an AWS team detects dashboard content failures at scale using Amazon Bedrock](https://aws.amazon.com/blogs/machine-learning/how-an-aws-team-detects-dashboard-content-failures-at-scale-using-amazon-bedrock/) (cinco estágios serverless; o post reporta detecção de 802 falhas em 30 dias e MTTD de até 72 h para menos de 1 h; são números do autor do post, não validados por mim).

### Opção 4C · (sugestão minha) Serviço de asserção semântica para Cypress/Playwright
- **Constrói:** API `POST /assert` que recebe (screenshot ou DOM, critério em linguagem natural) e devolve veredito estruturado. Cache determinístico por hash evita reexecução, limiar de confiança separa "passa", "falha" e "revisar", e casos "revisar" entram numa fila com decisão humana que realimenta a calibração. Um comando `cy.semantic()` e um helper Playwright consomem a API.
- **Serviços AWS:** API Gateway + Cognito (autorização), Lambda, DynamoDB (cache e decisões), SQS (fila de revisão), S3, Bedrock, WAF, CloudWatch.
- **Componente Claude:** juiz com critérios explícitos, few-shot, validação e retentativa, resultados com proveniência.
- **Tarefas CCAR-F:** 4.1, 4.2, 4.3, 4.4, 5.5, 5.6.
- **Outra cloud (GCP):** API Gateway/Cloud Run + Firebase Auth/Identity Platform + Firestore + Pub/Sub + Vertex AI.
- **Floci:** API Gateway, Cognito, Lambda, DynamoDB, SQS, S3, WAF cobertos.
- **Custo em lab:** US$ 1–2.
- **Fonte:** composição minha; o contrato de saída estruturada segue [Bedrock — structured outputs](https://docs.aws.amazon.com/bedrock/latest/userguide/structured-output.html) (só trecho de busca) e a prática de limiar e fallback do Prescriptive Guidance já citado na 1A.

### Recomendação da Unidade 04: **4B, com o contrato de saída da 4C**
Como arquiteto: asserção semântica é o tema da unidade, e a 4B é a única opção com fonte oficial que mostra o padrão funcionando em produção e explica as duas lições que mais importam (falso positivo e aritmética fora do LLM). Escala a zero, custa pouco e testa bem local. O contrato `{veredito, confiança, evidência}` da 4C entra como ADR, o que deixa o Cypress/Playwright consumir o mesmo juiz depois. Evito a 4A como principal: custo incerto, dependência de Nova Act e cobertura do Floci não comprovada; ela vira ADR de "o que eu faria em produção".

---

## Unidade 05 — Genkit (flows, Zod, Google AI), design system, micro-BFF, encerramento

**Temas de maior valor (de 1 a 3):** (a) flows tipados com schema como fronteira entre IA e produto; (b) micro-BFF que pertence ao frontend e agrega, autoriza e transforma; (c) design system como produto com governança de mudança. **[confirmar]** nas legendas: o que o micro-BFF expõe, o design system usado e como o Genkit é publicado. Genkit é Google; na AWS o análogo é Lambda com contrato JSON Schema e validação.

### Opção 5A · BFF orientado a eventos (REST ou GraphQL) com flows de IA tipados
- **Constrói:** BFF por experiência de usuário com projeções prontas para a UI (DynamoDB), atualização por eventos e push ao cliente. Sobre ele, dois "flows" de IA (por exemplo, resumo de um item e sugestão de copy) com entrada e saída validadas por schema e erros estruturados.
- **Serviços AWS:** API Gateway (REST + WebSocket) **ou** AppSync (GraphQL com subscriptions), Cognito, Lambda, DynamoDB com Streams, EventBridge, Bedrock, WAF, CloudWatch.
- **Componente Claude:** flows com saída por `tool_use`, validação e retentativa, tratamento de erro categorizado (retentável ou não) e propagação clara ao cliente.
- **Tarefas CCAR-F:** 4.3, 4.4, 2.1, 2.2, 5.3, 4.1. Cenário da prova mais próximo: extração de dados estruturados / suporte ao cliente.
- **Outra cloud (GCP):** Cloud Run (BFF) ou Apigee + Firebase Auth + Firestore/Eventarc + Pub/Sub + Genkit com Vertex AI; é onde o mapeamento é mais direto, já que Genkit é o que a aula usa.
- **Floci:** API Gateway v1 e v2, AppSync, Cognito, Lambda, DynamoDB Streams, EventBridge, WAF cobertos. É a opção com a melhor cobertura local comprovada pela lista. Bedrock stub (flows testados por contrato).
- **Custo em lab:** US$ 1–3/mês (tudo sob demanda).
- **Fonte:** ✔ [AWS Front-End Web & Mobile Blog — Backends for Frontends pattern](https://aws.amazon.com/blogs/mobile/backends-for-frontends-pattern) (BFF por experiência + pub/sub; componentes DynamoDB, Lambda, Cognito; variantes REST e GraphQL) e ✔ [Prescriptive Guidance — API integration: Backend for frontend](https://docs.aws.amazon.com/prescriptive-guidance/latest/micro-frontends-aws/api-integration-data-fetching.html) (BFF pertence ao micro-frontend, nunca é compartilhado entre contextos; funções: autorização, agregação, transformação).

### Opção 5B · Interface generativa com protocolo AG-UI
- **Constrói:** frontend React que renderiza componentes escolhidos pelo agente em tempo real, via eventos tipados em SSE, com gates de aprovação humana na UI e autenticação Cognito.
- **Serviços AWS:** Bedrock AgentCore Runtime (e Gateway/Identity/Memory conforme o template), Cognito, S3 + CloudFront (frontend), CloudWatch. O post de arquitetura também usa Strands Agents e Nova Act.
- **Componente Claude:** agente com 3 a 4 tools, eventos de UI tipados, estado compartilhado, hooks de aprovação.
- **Tarefas CCAR-F:** 1.1, 1.5, 2.3, 5.1, 1.4.
- **Outra cloud (GCP):** Cloud Run + Vertex AI Agent Engine (**[confirmar]**) + Identity Platform; o AG-UI é um protocolo aberto, então o front é o mesmo.
- **Floci:** `bedrock-agentcore` e `-control` constam; **o runtime em si não foi testado**. Plano B: o agente roda em Lambda ou container local, com o mesmo protocolo SSE.
- **Custo em lab:** incerto (AgentCore cobra por consumo; **[confirmar]**).
- **Fonte:** ✔ [AWS Architecture Blog — Build adaptive AI interfaces with the AG-UI protocol, agent swarms, and Nova Act on AWS](https://aws.amazon.com/blogs/architecture/build-adaptive-ai-interfaces-with-the-ag-ui-protocol-agent-swarms-and-nova-act-on-aws) (AG-UI como eventos tipados sobre SSE; o post indica quando usar UIs dinâmicas e lista anti-padrões) e [AWS ML Blog — Build generative UI for AI agents on Amazon Bedrock AgentCore with the AG-UI protocol](https://aws.amazon.com/blogs/machine-learning/build-generative-ui-for-ai-agents-on-amazon-bedrock-agentcore-with-the-ag-ui-protocol/) (só trecho de busca).

### Opção 5C · Design system como produto em plataforma de micro-frontends
- **Constrói:** biblioteca de componentes versionada (semver), catálogo estático por CDN, shell que compõe micro-frontends consumindo o design system como dependência externa, com gate de regressão visual e notas de versão geradas por Claude.
- **Serviços AWS:** CodeArtifact, S3 + CloudFront (OAC), CodePipeline/CodeBuild, Route 53 (rotas por micro-frontend), CloudWatch RUM (adoção e erros de versão), WAF.
- **Componente Claude:** classificação do impacto de uma mudança (major, minor, patch) com saída estruturada, geração de changelog com proveniência e revisão multi-instância antes de publicar.
- **Tarefas CCAR-F:** 4.1, 4.3, 4.6, 5.5, 5.6, 3.1.
- **Outra cloud (GCP):** Artifact Registry + Cloud Storage + Cloud CDN + Cloud Build.
- **Floci:** CodeArtifact, CloudFront, S3, CodeBuild, Route 53, CloudWatch RUM constam; profundidade **[confirmar]**.
- **Custo em lab:** US$ 1–3/mês.
- **Fonte:** ✔ [AWS Architecture Blog — Micro-frontend Architectures on AWS](https://aws.amazon.com/blogs/architecture/micro-frontend-architectures-on-aws) e [Prescriptive Guidance — micro-frontends on AWS](https://docs.aws.amazon.com/prescriptive-guidance/latest/micro-frontends-aws/introduction.html) (o guia recomenda investir cedo em um design system e começar sem compartilhar nada enquanto ele amadurece, segundo o trecho de busca; **[confirmar]** na página). Módulo para o shell: [padrão Amplify + Angular + Module Federation](https://docs.aws.amazon.com/prescriptive-guidance/latest/patterns/create-amplify-micro-frontend-portal.html). O Amplify não consta no Floci, então o hosting seria S3 + CloudFront.

### Opção 5D · (sugestão minha) Micro-BFF multi-tenant com cota de tokens e degradação controlada
- **Constrói:** o BFF da 5A com três controles de enterprise que o Genkit não resolve sozinho: cota de tokens por tenant (DynamoDB com contadores atômicos), degradação (modelo menor ou resposta em cache quando a cota ou o provedor falha) e métricas de custo por tenant com alarme.
- **Serviços AWS:** os da 5A + DynamoDB (cotas), CloudWatch (métricas customizadas por tenant), SQS (fila de reprocessamento), Budgets.
- **Componente Claude:** flows com orçamento por requisição e escalonamento para fallback.
- **Tarefas CCAR-F:** 5.2, 5.3, 2.2, 4.4, 1.4.
- **Outra cloud (GCP):** Cloud Run + Firestore + Cloud Monitoring + Vertex AI.
- **Floci:** mesma cobertura da 5A.
- **Custo em lab:** igual à 5A.
- **Fonte:** composição minha; o princípio de tenant e controle de recurso vem do [Prescriptive Guidance — Focus area 3: architect for multi-tenancy and control](https://docs.aws.amazon.com/prescriptive-guidance/latest/strategy-operationalizing-agentic-ai/focus-areas-multitenancy.html) (só trecho de busca).

### Recomendação da Unidade 05: **5A, com os controles da 5D como ADRs**
Como arquiteto: micro-BFF é o título que mais separa "usar IA na tela" de "projetar o produto". A 5A tem fonte oficial lida por inteiro, cobertura local mais confiável (API Gateway, AppSync, Cognito, DynamoDB Streams, EventBridge), baixo custo e mapeamento natural para Genkit no GCP. A 5B é a mais moderna, mas tem custo e cobertura incertos; a 5C é boa, porém repete a infraestrutura de publicação da 2A. Se você escolher 2A na Unidade 02, a 5C vira extensão natural em vez de projeto novo.

---

## Visão consolidada das recomendações

| Unidade | Recomendada | Componente Claude | Tarefas CCAR-F | Infra principal | Lab (estimativa) | Maior risco |
|---|---|---|---|---|---|---|
| 01 | 1A Registro de prompts com gate | extração estruturada + avaliação | 4.1 a 4.4, 3.6 | CodePipeline, S3, SSM, Lambda, DynamoDB | US$ 1–3 | Prompt Management ausente no Floci (ADR) |
| 02 | 2B Remediação de acessibilidade | auditor WCAG com validação | 4.1, 4.3, 4.4, 5.5, 5.6 | Step Functions, S3, Lambda/ECS, Rekognition | US$ 1–4 | Qualidade do alt text (humano no circuito) |
| 03 | 3B Revisão de PR paralela | coordenador + subagentes | 1.2, 1.3, 1.6, 4.6, 5.3, 5.5 | API GW, SQS, Lambda, DynamoDB | US$ 1–3 | Falso positivo do revisor (calibração) |
| 04 | 4B Validação visual de conteúdo | juiz semântico estruturado | 4.1, 4.3, 4.4, 5.2, 5.5, 5.6 | Scheduler, Step Functions, Lambda/ECS, Rekognition | US$ 1–3 | Taxa real só se mede com Claude real |
| 05 | 5A Micro-BFF orientado a eventos | flows tipados com erro estruturado | 4.3, 4.4, 2.1, 2.2, 5.3 | API GW/AppSync, Cognito, DynamoDB Streams | US$ 1–3 | Ligação fraca com o design system (mitigar com ADR) |

**Cobertura dos domínios da prova nas cinco recomendadas:** domínio 4 (20%) em todas, 5 (15%) em quatro, 1 (27%) forte na 3B, 2 (18%) na 5A, 3 (20%) na 1A. **Lacuna:** o domínio 3 (Claude Code) fica pouco coberto pelos projetos; ele é praticado neste repositório (CLAUDE.md, regras por caminho, skills, Claude Code em CI) e a 3A é a opção que o reforçaria se você quiser mais peso nele.

**Fio condutor:** a 1A fornece o registro e o gate de prompts que a 2B, 3B, 4B e 5A passam a consumir. Isso permite um ADR único de "prompt como artefato" reaproveitado, em vez de cinco soluções soltas.

**Teto de orçamento:** somando as cinco no cenário "sobe, testa, destrói", a estimativa é de US$ 5–15 por disciplina, sem custo fixo ocioso. Fica abaixo de qualquer teto razoável, mas o valor depende da validação com Infracost e de quantas execuções reais de Claude você autorizar (pergunta nº 3).

## O que confirmar nas legendas e no PDF da disciplina

1. **U01:** ferramentas e exemplos de "structured prompts" no AI Studio; se há dataset ou caso de requisitos a reaproveitar; que critério de qualidade as aulas usam para prompts.
2. **U02:** origem dos tokens (Figma, Stitch ou arquivo), como o Angular consome o MCP, e quais regras de acessibilidade a aula cobre (WCAG 2.1 ou 2.2, nível AA).
3. **U03:** formato de spec do OpenSpec; o que o Nx MCP expõe; o que o Google Jules faz na aula e em que ponto entra o review.
4. **U04:** a definição de "asserção semântica" ensinada; se o agente de Playwright MCP gera ou executa testes; o papel do Cypress e do Nx.
5. **U05:** o que o micro-BFF agrega; qual design system a aula usa; como o Genkit é implantado; o que o "encerramento" pede.
6. **PDF da disciplina (todas):** ver se há referências e boas práticas que mudem as recomendações; as recomendações acima são baseadas em títulos e fontes públicas.
7. **Técnico (antes de implementar):** batch inference, task token, `Map`, CodeArtifact e CloudFront com `apply` real no Floci; preços atuais de Bedrock (inclusive batch) e AgentCore; mínimo de registros do batch; o gatilho GitHub → CodePipeline.

## Perguntas para você (não assumi nada)

1. **Cloud comparativa:** GCP para todas as unidades, como proponho (a disciplina é Google-cêntrica), ou Azure/OCI em alguma?
2. **Escolha:** quais opções por unidade? Se quiser apenas "uma por módulo", sugiro **3B** (maior peso de prova) ou **1A** (fundação das demais). O CLAUDE.md pede pelo menos uma implementada por disciplina.
3. **Orçamento:** teto mensal de lab e quanto de Claude real autorizar por execução (o Floci só devolve stub do Bedrock).
4. **Execução:** uma sessão por unidade em paralelo (como o CLAUDE.md prevê), ou só as que você escolher? Se for em paralelo, preparo o plano e o briefing e espero a sua aprovação antes de disparar.

## Fontes consultadas

AWS: [Bedrock batch inference](https://docs.aws.amazon.com/bedrock/latest/userguide/batch-inference-create.html) ✔ · [Prompt, agent and model lifecycle](https://docs.aws.amazon.com/prescriptive-guidance/latest/agentic-ai-serverless/prompt-agent-and-model.html) ✔ · [Micro-frontend Architectures on AWS](https://aws.amazon.com/blogs/architecture/micro-frontend-architectures-on-aws) ✔ · [Micro-frontends on AWS, Prescriptive Guidance](https://docs.aws.amazon.com/prescriptive-guidance/latest/micro-frontends-aws/introduction.html) · [BFF API integration](https://docs.aws.amazon.com/prescriptive-guidance/latest/micro-frontends-aws/api-integration-data-fetching.html) ✔ · [Backends for Frontends pattern](https://aws.amazon.com/blogs/mobile/backends-for-frontends-pattern) ✔ · [AG-UI, swarms e Nova Act](https://aws.amazon.com/blogs/architecture/build-adaptive-ai-interfaces-with-the-ag-ui-protocol-agent-swarms-and-nova-act-on-aws) ✔ · [Detecção de falhas de conteúdo em dashboards](https://aws.amazon.com/blogs/machine-learning/how-an-aws-team-detects-dashboard-content-failures-at-scale-using-amazon-bedrock/) ✔ · [Agentic QA com AgentCore Browser e Nova Act](https://aws.amazon.com/blogs/machine-learning/agentic-qa-automation-using-amazon-bedrock-agentcore-browser-and-amazon-nova-act) ✔ · [Secure Chat UI for Bedrock](https://aws.amazon.com/solutions/guidance/secure-chat-user-interface-for-amazon-bedrock) ✔ (avaliada, não selecionada) · [Step Functions callback](https://docs.aws.amazon.com/step-functions/latest/dg/connect-to-resource.html) ✔ · [Translate custom terminology](https://docs.aws.amazon.com/translate/latest/dg/how-custom-terminology.html) ✔.
Floci: [floci.io/aws](https://floci.io/aws/) (lista de serviços) e execução local da imagem `floci/floci:latest` v2.5.0 em 2026-11-18.

Observação de acesso: nesta sessão `aws.amazon.com` não resolve pelo `WebFetch` (fora da lista de domínios permitidos); li as páginas da AWS pela ferramenta de documentação da AWS. Para a próxima etapa vale liberar o domínio, se quiser que eu abra os posts marcados "só trecho de busca".
