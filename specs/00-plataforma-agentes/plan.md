# Plano: Plataforma de agentes compartilhada na AWS

- **Spec:** `specs/00-plataforma-agentes/spec.md` · **Status:** aprovado pelo dono em 2026-11-19 (D-035). Emenda 1 (2026-11-20) aprovada pelo dono em 2026-11-20 (D-038) e emenda 2 (2026-11-20, só alinhamento de texto) aprovada em 2026-11-20 (D-040), com o hash registrado em `harness/estado.json` (D-033)
- **Data:** 2026-11-19; emenda 1 em 2026-11-20 · **Autor:** arquiteto-aws (Claude Opus 5.5), em plan mode, sem chamada à AWS
- **Decisões do dono aplicadas:** D-021, D-022, D-024, D-028, D-029, D-031, D-033, D-034 (respostas às P00-P3, P00-P4 e P00-P5, repassadas pela orquestração em 2026-11-19 às 23:27 BRT) e D-035 (aprovação da versão anterior)
- **ADRs:** `specs/00-plataforma-agentes/adr/`. O gate SDD (`harness/estado.py checar-arquivos`, hook e `pre-commit`) bloqueia `plataforma/agentes/adr/` antes da fase implementar, então os ADRs nascem junto da spec. A tarefa T000 de implementar os move para `plataforma/agentes/adr/` (seção "Trabalho que o plano cria").

## Resumo
- **Dois states.** O stack da plataforma (`plataforma-agentes-lab`) guarda só o que é compartilhado:
  - gateway MCP único com IAM de entrada e motor de política em `ENFORCE`;
  - chave KMS, logs, traces, alarmes, tópico SNS, Budgets diário e o contrato `comum` no SSM.
- **O que é do produto vem por um módulo da plataforma, no state do produto** (`modules/registro-produto`, ADR-0006): alvos, políticas Cedar geradas, guardrail, perfil de inferência, roles e o contrato do produto. Assim:
  - a tag `project` de cada recurso é a do stack que o destrói;
  - o destroy do produto limpa o que ele registrou no gateway;
  - a política Cedar só é criada depois da tool, como o serviço exige.
- **Controle fora do modelo.** O módulo gera o Cedar a partir do catálogo do produto. A validação de plan recusa:
  - a tríade letal num mesmo principal;
  - `permit` de tool `sensivel` para a role do agente;
  - alvo com prefixo de outro produto.
- **Ordem de destroy pelo harness** (ADR-0007): o prazo do produto fica pelo menos 1 hora antes do da plataforma, e a plataforma espera os consumidores.
- **Teto diário:** US$ 1,20, sobre uma estimativa de US$ 1,08 (emenda 1), com as fontes de preço abaixo. A avaliação sob demanda é 69% do valor. O dono manteve US$ 1,20 (P00-P8, D-038).

## Verificação da constituição
| Artigo | Como o plano cumpre | Risco |
|---|---|---|
| I · SDD | Spec esclarecida e este plano. `tasks.md` só depois da aprovação do plano (D-033). Os ADRs ficam em `specs/` até a fase implementar, porque o gate bloqueia a pasta do projeto | nenhum; o gate funcionou como esperado |
| II · Decisões do dono | P00-P3 a P00-P5 aplicadas como respondidas (D-034); nenhuma escolha do dono assumida. O teto é calculado aqui e só vale com a aprovação do plano | D-034 ainda não aparecia no `DECISOES.md` na leitura de 2026-11-19; a orquestração registra |
| III · Testes primeiro | Matriz regra → teste abaixo, com 100% de cobertura dos aceites. TT com mock provider, RG para o agente de exemplo, FL só com o projeto completo e DM para o que só a AWS real prova | Lacunas do Floci (ADR-0009) concentram a prova de política e guardrail em TT, RG e DM |
| IV · Segurança por padrão | Gateway só com `AWS_IAM` (ADR-0003); KMS do cliente nos logs, no SNS, no gateway e no motor de política (ADR-0001); TLS obrigatório no SNS por `aws:SecureTransport`; roles por produto com menor privilégio e guardrail imposto por IAM (`bedrock:GuardrailIdentifier`); nenhum segredo no contrato (ADR-0002) | Role de deploy única na conta (D-029): risco residual descrito no modelo de ameaças |
| V · Custo consciente | Só cobrança por uso; nenhum NAT, endpoint de interface ou cluster; KMS cobrado por hora e de graça em exclusão. Teto de um dia calculado (US$ 1,20), no Budgets diário, no README e no `estado.json`. Destroy com prazo, `confirm_stack` e verificação de sobras (workflows existentes), e ordem entre produto e plataforma (ADR-0007) | Indexação de tools cobrada por mês sem rateio documentado: entra no dia como mês cheio |
| VI · Operável e replicável | Tags pelo `default_tags` e `local.tags` (D-031), testadas a partir do `tags.tftest.hcl`; nomes com prefixo da chave, salvo onde a API exige letra inicial (ADR-0006); 5 alarmes no stack da plataforma e 1 por produto, logs com retenção de 7 dias; state remoto com lock (backend dos workflows); README com 5 passos | O nome do motor de política e das políticas não aceita hífen nem dígito inicial: prefixo `p00_` e `pNN_` (ADR-0006) |
| VII · Lente da certificação | Agente de exemplo com respostas gravadas exercita 1.1, 1.4, 2.1, 2.2, 2.4, 5.2, 5.3; avaliação sob demanda e revisão do relatório exercitam 4.6 e 5.5; cada ADR traz os ids e o curso | nenhum |
| VIII · Proveniência e privacidade | Seção de fontes com data de consulta; demonstração só com dados sintéticos versionados, porque os logs do gateway gravam corpo e o trace do guardrail não mascara | Dado real colado na demonstração por engano: mitigado por guardrail, retenção curta e revisão do relatório |

## Arquitetura

### Visão geral
```
                         GitHub Actions (OIDC, role de deploy)
                 apply/destroy da plataforma        apply/destroy do produto (D03)
                           |                                   |
  +------------------------v------------------+   +------------v-------------------------------+
  | state 00-plataforma-agentes (lab)         |   | state 03-mcp-regras-cdb                     |
  |  KMS (chave do cliente)                   |   |  servidor MCP da D03 (SigV4 na entrada)     |
  |  AgentCore Gateway (MCP, AWS_IAM) --------+---+-> alvo 03-mcp-regras-cdb-*  (módulo)        |
  |  AgentCore Policy engine (ENFORCE) <------+---+-- políticas Cedar geradas  (módulo)         |
  |  logs do gateway + traces (aws/spans)     |   |  guardrail do produto (STANDARD)  (módulo)  |
  |  5 alarmes -> SNS (KMS) -> e-mails conta  |   |  perfil de inferência de aplicação (módulo) |
  |  Budgets diário                           |   |  roles agente e aprovação         (módulo)  |
  |  SSM /00-plataforma-agentes/contrato/v1/  |   |  SSM .../contrato/v1/produtos/03-... (mód.) |
  |      comum  ---------------------------- lido pelo módulo e pelo agente do produto -------->|
  +-------------------------------------------+   +---------------------------------------------+
          ^ SigV4 (role do agente)                         |
          |                                                v
     agente do produto --Converse + guardrail--> Bedrock (Claude, perfil do produto)
```
**Ordem do dia:** apply da plataforma, depois apply do produto (que registra os alvos e as políticas), depois o roteiro, a gravação, a avaliação sob demanda e o relatório. O destroy roda ao contrário: primeiro o produto, depois a plataforma.

### Serviços
Fontes consultadas em 2026-11-19. Floci: documentação de [Bedrock AgentCore](https://floci.io/floci/services/bedrock-agentcore/), [Bedrock Runtime](https://floci.io/floci/services/bedrock-runtime/), [lista de serviços](https://floci.io/floci/services/) e [CloudWatch](https://floci.io/floci/services/cloudwatch/). A CLI `floci` não está disponível nesta sessão.

| Serviço | Papel | Por que este | Alternativa rejeitada | Fonte oficial da AWS | Floci |
|---|---|---|---|---|---|
| Bedrock AgentCore Gateway | ponto único MCP para as tools de todos os produtos (RF-001) | gateway MCP gerenciado, cobrado por chamada, com política e identidade integradas; tradução entre versões de MCP | API Gateway + Lambda proxy próprio: reimplementa MCP, política e descoberta de tools | [Gateway com Policy](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/use-gateway-with-policy.html); [alvos servidor MCP](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/gateway-target-MCPservers.html) | plano de controle (gateway e alvos); sem invocação MCP |
| Bedrock AgentCore Policy | Cedar com negação por padrão, `forbid` vence `permit`, checagens de guardrail na camada de tools (RF-002, RF-010, RF-012) | o controle fica fora do modelo e é avaliado pelo serviço; métricas de decisão prontas | autorização no código de cada tool: espalha a regra e a injeção pode contorná-la | [Core concepts](https://docs.aws.amazon.com/de_de/bedrock-agentcore/latest/devguide/policy-core-concepts.html); [Guardrails in policies](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/policy-guardrails-in-policies.html); [validação](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/policy-create-update-validation.html) | não documentado: TT e DM (ADR-0009) |
| Bedrock AgentCore Identity | credencial de saída para alvo fora da AWS (RF-003) | sem custo quando usado pelo Gateway; segredo fora do Terraform | segredo no Secrets Manager lido pela tool: mais uma peça com custo fixo por segredo | [preços do AgentCore](https://aws.amazon.com/bedrock/agentcore/pricing/) | emulado (provedores de credencial) |
| Bedrock Guardrails | guardrail do produto na camada do modelo (RF-004) | filtros de conteúdo, ataque de prompt, informação sensível e camada `STANDARD` com português | filtro próprio com regex ou outro LLM: mais caro e não auditável | [componentes](https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails-components.html); [camadas](https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails-tiers.html); [idiomas](https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails-supported-languages.html) | fora de escopo: TT e DM |
| Bedrock (perfil de inferência de aplicação) | custo por produto pela tag (RF-005) | etiqueta de custo sem mudar o modelo; a role invoca só o próprio perfil | uma conta por produto: Organizations está fora (D-029) | [criar perfil](https://docs.aws.amazon.com/bedrock/latest/userguide/inference-profiles-create.html) | não documentado: TT |
| AWS KMS | chave do cliente para logs, SNS, gateway e motor (ADR-0001) | o CloudWatch não publica em tópico SNS cifrado com a chave gerenciada `aws/sns`; cobrada por hora | chave gerenciada pela AWS: não serve para o alarme publicar no SNS | [preços do KMS](https://aws.amazon.com/kms/pricing/) | emulado |
| SSM Parameter Store (padrão) | contrato v1 (RF-007, ADR-0002) | sem custo, até 4 KB, leitura por data source sem ler o state | `terraform_remote_state`: a role do produto leria o state inteiro | [camadas de parâmetro](https://docs.aws.amazon.com/systems-manager/latest/userguide/parameter-store-advanced-parameters.html) | emulado |
| CloudWatch Logs (entrega de logs) | logs de aplicação do gateway, retenção de 7 dias (RF-006) | logs vendidos por GB, sem custo fixo | bucket S3 com Athena: mais peças para um volume de MB | [métricas e logs do gateway](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/observability-gateway-metrics.html) | `PutDeliverySource`/`CreateDelivery` guardam a configuração, sem entrega |
| CloudWatch Transaction Search (X-Ray) | spans do gateway em `aws/spans`, base da avaliação | exigido pelo tracing do AgentCore e pelo Evaluations | Langfuse hospedado: custo fixo (fora de escopo na spec) | [observabilidade](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/observability-configure.html) | X-Ray emulado (11 operações); configuração em `infra/conta` |
| CloudWatch alarmes | 6 alarmes do RNF-003 (5 na plataforma, 1 por produto) | contagem absoluta por 5 minutos, por hora de uso | dashboard sem alarme: ninguém olha | [preços do CloudWatch](https://aws.amazon.com/cloudwatch/pricing/) | emulado (`PutMetricAlarm`, avaliação de métrica única) |
| Amazon SNS | tópico cifrado dos alarmes, com os e-mails do `infra/conta` (ADR-0008) | cobrança por requisição e entrega | e-mail direto do alarme: o CloudWatch exige SNS | [preços do SNS](https://aws.amazon.com/sns/pricing/) | emulado |
| AgentCore Evaluations | avaliação sob demanda depois da demonstração (RF-006) | avaliadores nativos cobrados por token, sem taxa fixa | avaliação online: amostragem contínua sem ganho num dia | [GA do Evaluations](https://aws.amazon.com/about-aws/whats-new/2026/03/agentcore-evaluations-generally-available); [sob demanda](https://docs.amazonaws.cn/bedrock-agentcore/latest/devguide/getting-started-on-demand.html) | não documentado: DM |
| AWS Budgets | orçamento diário com o teto (Art. V) | orçamento de monitoramento é gratuito | só o mensal da conta: avisa tarde demais | [preços do Budgets](https://aws.amazon.com/aws-cost-management/aws-budgets/pricing/) | emulado |
| IAM | roles por produto com ABAC e condições (RNF-001) | sem custo; principal aceito pelo Cedar | JWT com Cognito: mais um provedor (E5) | [autorização de entrada](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/gateway-inbound-auth.html) | emulado; avaliação de política existe em modo de enforcement, sem menção a `bedrock-agentcore` |

**Provider Terraform:** `hashicorp/aws` com `aws_bedrockagentcore_gateway` (tem `authorizer_type`, `kms_key_arn`, `policy_engine_configuration { arn, mode }` e `protocol_configuration { mcp { supported_versions } }`), `aws_bedrockagentcore_policy` (`definition { cedar { statement } }`, `validation_mode`), `aws_bedrockagentcore_policy_engine` e `aws_bedrock_guardrail` (`tier_config`, `cross_region_config`). Fontes: [doc do gateway](https://github.com/hashicorp/terraform-provider-aws/blob/main/website/docs/r/bedrockagentcore_gateway.html.markdown), [doc da política](https://github.com/hashicorp/terraform-provider-aws/blob/main/website/docs/r/bedrockagentcore_policy.html.markdown), [doc do guardrail](https://github.com/hashicorp/terraform-provider-aws/blob/main/website/docs/r/bedrock_guardrail.html.markdown) e a [issue 48501](https://github.com/hashicorp/terraform-provider-aws/issues/48501), que cita a v6.51 com "a maior parte" dos recursos do AgentCore. A versão mínima é fixada em `versions.tf` na primeira tarefa de implementar, depois de `terraform init` confirmar os recursos.

### Stack da plataforma (`plataforma/agentes/infra/terraform/`)
Módulos internos: `nucleo` (KMS, SNS e Budgets), `gateway` (gateway, role de execução e role de fumaça), `politica` (motor), `observabilidade` (entrega de logs e traces, alarmes e role de evidências) e `contrato` (parâmetro `comum` e output `contrato_v1`).
- **Id e ARN do motor de política:** entram no `gateway` como entrada anulável e no `observabilidade` e no `contrato` como entradas obrigatórias (ADR-0011, emenda 2). No root real, vêm sempre das saídas do módulo `politica`, e o TT-P01 reprova nulo. No root do Floci, que não tem o motor, o gateway compõe sem ele e os outros dois recebem valores sintéticos fixos (Estratégia de testes, emenda 1).
- **Gateway:**
  - `protocol_type = "MCP"` e `authorizer_type = "AWS_IAM"`;
  - `kms_key_arn` da chave da plataforma;
  - `policy_engine_configuration.mode = var.modo_politica`, com padrão `ENFORCE` (ADR-0005);
  - `supported_versions = var.versoes_mcp`, com padrão `["2025-11-25", "2026-07-28"]` (ADR-0010);
  - sem `search_type = "SEMANTIC"`, porque a busca é cobrada à parte e cada produto tem poucas tools;
  - sem `exception_level = "DEBUG"`, porque o detalhe de erro iria para o cliente.
- **Role de execução do gateway:** sem permissão de invocar alvos. Cada produto concede a invocação pela política de recurso da própria função ou runtime (`aws:SourceArn` = ARN do gateway), criada pelo módulo. Assim, o gateway não ganha acesso a todos os produtos. A role tem `bedrock:InvokeGuardrailChecks`, exigida pelas checagens de guardrail no Policy, com o recurso mais estreito que a documentação aceitar (risco R4).
- **Motor de política:** `p00_plataforma_agentes`, cifrado com a chave da plataforma. A API exige `^[A-Za-z][A-Za-z0-9_]*$`.
- **Role de fumaça** `00-plataforma-agentes-fumaca`:
  - confiada pela role de deploy;
  - só tem `bedrock-agentcore:InvokeGateway` no ARN do gateway;
  - não tem nenhum `permit` no Cedar, então o teste de fumaça prova duas coisas sem chamar o Claude (RNF-002): o `tools/list` vem vazio e um `tools/call` é negado (`DenyDecisions` ≥ 1);
  - não tem `bedrock:ApplyGuardrail`, e o teste de fumaça não chama o guardrail (emenda 1). A plataforma não tem guardrail próprio, porque o RF-004 cria um por produto. Na demonstração, a chamada direta ao guardrail sem o Claude, que o RNF-002 pede, é o DM-05: o agente do produto chama `ApplyGuardrail` no guardrail do produto, com a role dele (que já tem a permissão, T032). O custo vai no teto do produto.
- **Role de evidências** `00-plataforma-agentes-evidencias` (módulo `observabilidade`, emenda 1):
  - confiada só pela role de deploy, como a de fumaça;
  - só leitura e avaliação:
    - `cloudwatch:GetMetricData`;
    - `logs:StartQuery` nos grupos `aws/spans` e de logs do gateway;
    - `logs:GetQueryResults`;
    - `ssm:GetParameter` no `comum` e em `produtos/*`;
    - `bedrock-agentcore:Evaluate`;
  - recurso por ARN onde a referência de autorização aceitar; onde só aceitar `*` (`GetMetricData`, `GetQueryResults` e, pela página de pré-requisitos, `Evaluate`), a ação continua nomeada, nunca `*` com `*` (TT-S03), e a exceção do checkov vai com ADR de implementação (R9);
  - sem `bedrock:InvokeModel` e sem `iam:PassRole`: a página de pré-requisitos só exige invocação de modelo para avaliador personalizado, e o `Evaluate` recebe os spans no corpo, sem role de serviço (R9).
- **Workflow de evidências** `.github/workflows/00-plataforma-agentes-evidencias.yml` (emenda 1):
  - só `workflow_dispatch`, com o input `produto`;
  - ambiente `aws-lab`, que já existe e tem aprovação, então nenhum ambiente novo;
  - OIDC na role de deploy, que assume a role de evidências;
  - roda `scripts/evidencias.py --produto <chave>` (T067) antes do destroy do produto;
  - o relatório sai como artefato do workflow com retenção de 1 dia, nunca em commit, porque ele passa pela revisão humana (T088) antes de entrar no repositório;
  - é workflow de operação, como o apply e o destroy, e por isso fica fora da regra do RNF-005, que vale para o CI de código (TH-11 estendido, TH-13).
- **Contrato `comum`:** detalhe abaixo.
- **Observabilidade:**
  - entrega dos logs de aplicação do gateway para `/aws/vendedlogs/bedrock-agentcore/gateway/APPLICATION_LOGS/{gateway_id}`, com retenção de 7 dias e KMS;
  - entrega de traces para o X-Ray / `aws/spans`;
  - 5 alarmes: `SystemErrors`, `Throttles` e `UserErrors` do gateway, `SystemErrors` do motor e `DenyDecisions` com `Mode=ENFORCE`;
  - tópico SNS `00-plataforma-agentes-alarmes` (ADR-0008);
  - `aws_budgets_budget` com `time_unit = "DAILY"`, `limit_amount = var.teto_diario_usd` e filtro pela tag `user:project` igual a `00-plataforma-agentes`.

### Módulo `registro-produto` (no state de cada produto)
**Entrada (o catálogo do produto)**, declarada no Terraform do produto e revisada no mesmo PR:
- a chave do produto;
- o modelo de origem do perfil;
- os tópicos negados do guardrail (da spec do produto, E3);
- os agentes, cada um com o serviço que assume a role;
- a role de aprovação e quem a assume;
- os alvos, cada um com:
  - tipo `lambda` ou `mcp_server`;
  - ARN da função ou endpoint;
  - schema estático das tools;
  - para cada tool, as classes (`dado_privado`, `conteudo_nao_confiavel`, `canal_saida`, `sensivel`) e os agentes que podem chamá-la.

**Validações de plan** (variáveis e `precondition`):
- a chave é igual à tag `project` do provider (`data.aws_default_tags`), então um produto não se registra com o nome de outro;
- todo alvo começa pela chave;
- toda tool tem pelo menos uma classe;
- nenhum principal cobre as três pernas da tríade (RF-009), e a mensagem cita o principal e as tools;
- nenhuma tool `sensivel` tem o agente como chamador (RF-012).

**Cria:**
- **Roles:**
  - `<chave>-agente-<nome>` com:
    - `InvokeGateway` só no ARN do gateway;
    - `bedrock:InvokeModel`/`Converse` só no próprio perfil e nos modelos de origem dele, com condição `bedrock:InferenceProfileArn` e imposição do guardrail por `bedrock:GuardrailIdentifier`;
    - `bedrock:ApplyGuardrail` no próprio guardrail;
    - `ssm:GetParameter` no `comum` e no próprio parâmetro;
  - `<chave>-aprovacao`, assumida só pelo principal de aprovação declarado.
- **Guardrail `<chave>-guardrail` (RF-004):**
  - cinco categorias em `HIGH` nos dois sentidos;
  - `PROMPT_ATTACK` em `HIGH` na entrada e `NONE` na saída;
  - `AWS_ACCESS_KEY`, `AWS_SECRET_KEY`, `PASSWORD`, `PIN` e `CREDIT_DEBIT_CARD_CVV` com `BLOCK` nos dois sentidos, conforme o [catálogo de entidades](https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails-sensitive-filters.html);
  - regex de CPF e CNPJ com `ANONYMIZE` na saída;
  - `tier_config.tier_name = "STANDARD"`;
  - `cross_region_config` com o perfil de guardrail dos EUA da [página de regiões](https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails-cross-region-support.html);
  - mensagens fixas em português;
  - `aws_bedrock_guardrail_version` numerada.
- **Perfil `<chave>-perfil`:** perfil de inferência de aplicação, com a tag `project` do produto.
- **Alvos `<chave>-<alvo>`:**
  - credencial de saída `GATEWAY_IAM_ROLE` para Lambda;
  - SigV4 ou provedor do Identity para servidor MCP;
  - schema estático (ADR-0006);
  - a política de recurso da função ou runtime que libera o gateway.
- **Políticas Cedar** `p<NN>_<slug>_<regra>`, depois dos alvos (`depends_on`), porque a política é validada contra o schema das tools do gateway:
  - um `permit` por agente com a lista de ações `<alvo>___<tool>` permitidas, principal `AgentCore::IamEntity` com o ARN da role e recurso igual ao gateway;
  - um `permit` da role de aprovação para as tools `sensivel`;
  - `forbid` com `BedrockGuardrails::PromptAttack` (JAILBREAK, PROMPT_INJECTION, PROMPT_LEAKAGE) acima de 0,4 na entrada de toda tool do produto;
  - `forbid` com `BedrockGuardrails::SensitiveInformation` acima de 0,2 na entrada das tools `canal_saida`.
- **Alarme de intervenção** do guardrail do produto: `AWS/Bedrock/Guardrails` `InvocationsIntervened` ≥ 5, com as dimensões `GuardrailArn` e `GuardrailVersion`, publicando no tópico do contrato.
- **Parâmetro** `/00-plataforma-agentes/contrato/v1/produtos/<chave>`.

Quem chama o módulo é o Terraform do produto, por caminho relativo no monorepo. O gate do harness proíbe `aws_bedrockagentcore_gateway_target`, `aws_bedrockagentcore_policy`, `aws_bedrockagentcore_gateway` e `aws_bedrockagentcore_policy_engine` fora de `plataforma/agentes/infra/terraform/` (ADR-0006).

### Contrato v1 (RF-007)
| Parâmetro | Campos | Quem escreve |
|---|---|---|
| `/00-plataforma-agentes/contrato/v1/comum` | `versao_contrato` (`1.0.0`), `regiao`, `gateway_arn`, `gateway_url`, `gateway_id`, `motor_politica_id`, `motor_politica_arn`, `versoes_mcp`, `grupo_log_gateway`, `grupo_spans` (`aws/spans`), `topico_alarmes_arn`, `chave_kms_arn`, `mapa_erros` (tabela do RF-011) | stack da plataforma |
| `/00-plataforma-agentes/contrato/v1/produtos/<chave>` | `versao_contrato`, `perfil_inferencia_arn`, `guardrail_id`, `guardrail_versao`, `alvos` (nome e tools com classes), `roles` (agentes e aprovação) | módulo, no state do produto |

O tipo é `String`, na camada padrão (ADR-0002). O JSON Schema fica em `plataforma/agentes/contrato/v1.schema.json`. O módulo lê o `comum` por `aws_ssm_parameter`, e o produto não escreve nenhum ARN da plataforma à mão (critério de sucesso 1).

### Agente de exemplo (componente Claude, só respostas gravadas, D-006)
`plataforma/agentes/src/agente_exemplo/`, em Python.
- **Loop pelo `stopReason` (1.1):** limite de 10 turnos de tool.
- **Cliente MCP:** assina com SigV4 e envia o cabeçalho `MCP-Protocol-Version`.
- **Classificador do RF-011 (2.2, 5.3):**
  - retentativa exponencial de 1, 2 e 4 segundos só para as categorias retentáveis;
  - falha fechada em `erro_desconhecido`.
- **Parada com `requer_aprovacao_humana` (1.4, 5.2).**
- **Conteúdo não confiável:** passa por `ApplyGuardrail` com `source=INPUT` no guardrail do produto antes de entrar no contexto (ADR-0004).
- **Sem log do trace do guardrail.**

Os produtos copiam o padrão; a plataforma não publica biblioteca no v1.

### Prazo e ordem de destroy (RF-008, ADR-0007)
- **Dependência:** `harness/estado.json` ganha `consome: ["00-plataforma-agentes"]` nos produtos que usam a plataforma.
- **`infra.py registrar` de um consumidor:**
  - recusa se a plataforma não está no ar;
  - limita o prazo a `expira_em(plataforma) − 1 h`.
- **`infra.py estender`:** o consumidor tem o mesmo limite.
- **`vencidos`:**
  - põe a plataforma em `aguardando` enquanto houver consumidor registrado;
  - manda destruir todo consumidor quando a plataforma vence.
- **Novo comando `dependentes <chave>`:**
  - o modelo de destroy o chama antes do `terraform destroy` e falha se houver consumidor no ar;
  - para um produto, a lista é vazia, então o mesmo modelo serve a todos.
- **Novo comando `requisitos <chave>`:**
  - o modelo de apply o chama antes do apply e falha se o provedor não está no ar.

### Configuração da conta (D-034, resposta à P00-P4): item de trabalho da plataforma em `infra/conta`, aplicado pelo dono
- **`aws_ce_cost_allocation_tag`:**
  - ativa `project` como tag de alocação de custo;
  - a chave só aparece depois que um recurso cobrado com essa tag existir (até 24 h), e a ativação leva até mais 24 h ([ativação de tags](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/activating-tags.html));
  - **ativação única na conta (D-039, emenda 2):** o dono a faz assim que a chave aparecer no Billing, bem antes da primeira demonstração. Ela vale para todos os projetos, e nenhuma demonstração espera 48 h.
- **Transaction Search:**
  - destino de segmentos do X-Ray no CloudWatch Logs e política de recurso do Logs;
  - ligado uma vez, sem custo fixo; os spans são cobrados por GB.
- **Parâmetro `String` `/00-conta/alertas/emails`:**
  - o valor é `emails_alerta`, a mesma lista do Budgets mensal;
  - a plataforma lê esse parâmetro (ADR-0008), sem variável nova.
- **Caso de uso da Anthropic:** à mão, no console, pelo dono, se o modelo da D03 for anterior ao Claude Opus 4.7 ([acesso a modelos](https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html)).

## Decisões técnicas (ADRs)
- [ADR-0001](adr/0001-chave-kms-do-cliente.md): uma chave KMS do cliente por stack da plataforma (fora do escopo da prova; Art. IV)
- [ADR-0002](adr/0002-contrato-ssm-string-padrao.md): contrato em parâmetro SSM `String` da camada padrão (2.1, 2.2)
- [ADR-0003](adr/0003-iam-sigv4-na-entrada.md): IAM/SigV4 como autenticação de entrada do gateway (1.4, 2.2, 2.4)
- [ADR-0004](adr/0004-guardrail-em-duas-camadas.md): guardrail em duas camadas e conteúdo não confiável (1.4, 2.2, 5.2, 5.6)
- [ADR-0005](adr/0005-politica-em-enforce.md): motor de política em `ENFORCE` (1.4, 5.5)
- [ADR-0006](adr/0006-registro-de-alvos-por-modulo.md): registro de alvos e políticas por módulo da plataforma no state do produto (1.4, 2.1, 2.3, 2.4)
- [ADR-0007](adr/0007-prazo-e-ordem-de-destroy.md): prazo e ordem de destroy entre produto e plataforma (1.4, 5.3)
- [ADR-0008](adr/0008-destino-dos-alarmes.md): tópico da plataforma com os e-mails do `infra/conta` (5.2)
- [ADR-0009](adr/0009-cobertura-do-floci.md): cobertura do Floci e lacunas (3.6, 5.6)
- [ADR-0010](adr/0010-versoes-mcp-do-gateway.md): versões de MCP do gateway e a lane da D03 (2.4, 5.6)

Depois do T000, o conteúdo dos ADRs fica em `plataforma/agentes/adr/`. Os links acima continuam valendo pelos arquivos de redirecionamento em `specs/00-plataforma-agentes/adr/` (emenda 1).

## Modelo de ameaças

### Fluxo de dados e fronteiras
| id | Fronteira | Atores e dados |
|---|---|---|
| F1 | GitHub Actions → plano de controle da AWS | role de deploy por OIDC; Terraform; state |
| F2 | agente do produto → gateway | role do agente (SigV4); argumentos de tool, possivelmente contaminados por injeção |
| F3 | gateway → alvo | role do gateway ou credencial do Identity; chamada da tool |
| F4 | alvo → conteúdo externo | resultado de tool `conteudo_nao_confiavel` (não confiável) |
| F5 | agente ↔ Bedrock | prompt, resposta, trace do guardrail (sem máscara) |
| F6 | gateway, guardrail e agente → CloudWatch | corpo MCP nos logs e spans (dados sintéticos) |
| F7 | humano → role de aprovação | aprovação de ação `sensivel`, fora do modelo |

### STRIDE
| Ameaça | Fronteira | Mitigação | Teste que prova |
|---|---|---|---|
| S: chamada anônima ao gateway | F2 | `authorizer_type = AWS_IAM`; `NONE` e `AUTHENTICATE_ONLY` reprovam | TT-G01; DM-03 |
| S: produto A se passa por produto B | F2 | principal Cedar pelo ARN da role; módulo exige chave igual à tag do provider | TT-R02; RG-02; DM-02 |
| T: produto cria, altera ou remove alvo ou política de outro | F1 | alvos e políticas só pelo módulo, no state do próprio produto; gate do harness para recursos brutos; prefixo validado | TT-R01, TT-R02, TH-04 |
| T: descrição de tool MCP maliciosa ou alterada no servidor | F3 | schema estático das tools no catálogo, revisado no PR; tool fora do catálogo não tem `permit` e some do `tools/list` | TT-R03; DM-05 |
| R: negação sem registro | F2 | métricas `AllowDecisions`/`DenyDecisions` por `Mode`; spans; logs do gateway | TT-O01; DM-04 |
| I: dado sensível em log ou trace | F5, F6 | dados sintéticos versionados; KMS; retenção de 7 dias; agente não loga o trace do guardrail | TT-O02; RG-07; revisão do relatório (5.5) |
| I: exfiltração por tool de saída | F2, F4 | `forbid` de informação sensível > 0,2 na entrada de `canal_saida`; tríade letal recusada no plan | TT-R05, TT-R06; DM-02 |
| I: credencial no contrato ou no prompt | F1, F5 | contrato sem segredo; Identity para credencial de saída; guardrail bloqueia chaves e senhas | TT-C02; gitleaks; TT-R08 |
| D: loop do agente consome custo | F2, F5 | limite de 10 turnos; alarmes de `Throttles` e `DenyDecisions`; Budgets diário; prazo de 24 h | RG-01; TT-O03; TT-K01; TH-01 |
| E: injeção leva a ação sensível | F2, F7 | tool `sensivel` negada ao agente; só a role de aprovação tem `permit`; campo de aprovação no argumento não vale | TT-R07; RG-06 |
| E: role de produto com privilégio amplo | F2 | nenhuma ação `*` em recurso `*`; recursos por ARN; condições de perfil e de guardrail | TT-S03; checkov |
| I: role de evidências lê spans e métricas de todos os produtos (emenda 1) | F6 | só leitura e `Evaluate`; assumida só pela role de deploy no ambiente `aws-lab`, com aprovação; relatório como artefato de 1 dia, revisado antes de publicar; dados sintéticos | TT-O05; TH-13; revisão do relatório (5.5) |
| E: role de deploy única altera qualquer produto | F1 | risco residual da conta única (D-029); ambientes protegidos, apply com aprovação, gate do harness | aceito com ADR-0006; em produção, contas por produto |

### Fronteiras específicas de LLM
- **Injeção direta:**
  - `PROMPT_ATTACK` em `HIGH` no guardrail do modelo, com a entrada do usuário marcada como conteúdo protegido;
  - o RG-04 e o passo 4 do roteiro provam o bloqueio.
- **Injeção indireta (resultado de tool):**
  - **Camadas de detecção:** `ApplyGuardrail` no agente e o `forbid` de ataque de prompt na entrada da próxima tool. As duas são de eficácia incerta para este caso (seção de incertezas).
  - **Contenção:** é estrutural. A tríade letal é recusada no plan, e a ação sensível exige um humano.
- **Tool com efeito colateral sem aprovação:** RF-012 (1.4).
- **Descrição de tool maliciosa:** schema estático revisado (ADR-0006).

### Tríade letal
A regra está no módulo, então vale para todo produto:
- **Recusa no plan:** um principal com `permit` que some `dado_privado`, `conteudo_nao_confiavel` e `canal_saida`.
- **Produto que precisa das três:** se divide em dois agentes com roles distintas, por exemplo, um leitor de conteúdo externo sem canal de saída e um executor sem conteúdo não confiável. Ele passa o resultado por dado estruturado validado.
- **D03:** as classes de cada tool vêm da spec da D03. A plataforma só garante a regra.

## Incertezas da spec e como o plano as resolve
| Incerteza | O que a pesquisa mostrou (2026-11-19) | Como o plano resolve |
|---|---|---|
| Ataque de prompt sobre `context.output` | A página de [Guardrails in policies](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/policy-guardrails-in-policies.html) só restringe por efeito (`suppressOutput` lê `context.output.*`) e não mostra `PromptAttack` na saída. A página de [ataque de prompt](https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails-prompt-attack.html) não fala de `ApplyGuardrail` nem de injeção indireta | **Desenho que não depende dela:** a contenção é a tríade letal recusada no plan e o handoff de ação sensível (RF-009, RF-012). **Mecanismo do v1:** `ApplyGuardrail` com `source=INPUT` no agente, para resultados de `conteudo_nao_confiavel` (RG-05); intervenção vira `guardrail_entrada`. **Teste na demonstração (DM-05):** um resultado de tool sintético com injeção mede se `ApplyGuardrail` detecta. `suppressOutput` com `PromptAttack` fica fora do v1 e entra como versão menor se o DM ou a documentação confirmarem (ADR-0004) |
| Camada `STANDARD` em português | A página de [idiomas](https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails-supported-languages.html) lista português como "Optimized and supported" na `STANDARD` para filtros de conteúdo e ataque de prompt, tópicos negados e informação sensível; a tabela de informação sensível não é separada por camada | **Pesquisa com fonte:** confirmado. **Teste na demonstração:** o passo 4 usa injeção em português (DM-04) |
| Métrica de intervenção do Guardrails | [Métricas do Guardrails](https://docs.aws.amazon.com/bedrock/latest/userguide/monitoring-guardrails-cw-metrics.html): `InvocationsIntervened`, namespace `AWS/Bedrock/Guardrails`, dimensões `GuardrailArn` e `GuardrailVersion`; a dimensão `Operation` só cita `ApplyGuardrail` | **Pesquisa com fonte:** o alarme usa essa métrica (TT-O04). **Teste na demonstração:** o DM-04 confere que o bloqueio pelo `Converse` também conta; se não contar, o relatório registra a lacuna e o alarme passa a um filtro de métrica do log do agente (versão menor, com ADR) |
| Avaliadores nativos | [Sob demanda](https://docs.amazonaws.cn/bedrock-agentcore/latest/devguide/getting-started-on-demand.html) cita `Builtin.Helpfulness` e `Builtin.Correctness` (trace), `Builtin.GoalSuccessRate` e `Builtin.ToolSelectionAccuracy` (chamada de tool); a avaliação lê `aws/spans` e exige Transaction Search | **Escolha:** `Builtin.Helpfulness`, `Builtin.GoalSuccessRate` e `Builtin.ToolSelectionAccuracy`. Eles cobrem a resposta, o objetivo e a escolha de tool (1.1, 2.1, 4.6). `Correctness` fica fora porque pede referência, e o roteiro não tem gabarito |
| Versões de MCP aceitas pelo gateway | [Blog da AWS de 2026-07-28](https://aws.amazon.com/blogs/machine-learning/how-agentcore-gateway-supports-the-mcp-2026-07-28-spec/) e [alvos MCP](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/gateway-target-MCPservers.html): 2025-03-26, 2025-06-18, 2025-11-25 e 2026-07-28. O gateway serve várias ao mesmo tempo pelo cabeçalho `MCP-Protocol-Version`; pedido sem cabeçalho vale 2025-03-26 e é recusado se ela não estiver na lista; a tradução entre versões não cobre elicitation nem sampling | **Pesquisa com fonte:** `versoes_mcp = ["2025-11-25", "2026-07-28"]`, publicado no contrato. O agente sempre envia o cabeçalho (RG-08). O risco contra a lane da D03 está no ADR-0010 e em R1 |

## Estratégia de testes
- **Unitários (TT):**
  - `terraform test` com `mock_provider "aws"` e `command = plan`;
  - `plataforma/agentes/infra/terraform/tests/*.tftest.hcl` e `modules/registro-produto/tests/*.tftest.hcl`;
  - checkov e tflint sem achado alto ou crítico;
  - o teste de tags começa pelo `harness/modelos/tags.tftest.hcl`.
- **Schema do contrato (TS):**
  - teste Python sobre `terraform show -json` do plan com mock;
  - valida o output `contrato_v1` contra `v1.schema.json`, o tamanho de até 4 KB por parâmetro e a ausência de nome ou valor de segredo.
- **Componente Claude (RG):**
  - `unittest` do agente de exemplo com respostas gravadas em `plataforma/agentes/tests/gravacoes/`;
  - uma por linha do RF-011 e uma por passo do roteiro;
  - as respostas sem formato publicado ficam marcadas `proveniencia: sintetica`.
- **Harness (TH):** `harness/test_harness.py`, para prazo, ordem, `dependentes`, `requisitos`, o gate de recursos brutos e os workflows.
- **Integração (FL):**
  - só com o projeto completo;
  - um root de teste em `plataforma/agentes/tests/floci/` aplica os módulos `nucleo`, `gateway`, `observabilidade` e `contrato`, mais um produto sintético que lê o contrato do SSM;
  - ficam fora, com evidência (ADR-0009): o módulo `politica` e a parte não emulada do `registro-produto` (guardrail, perfil e políticas Cedar);
  - o gateway recebe o motor como entrada de composição, e o TT-P01 garante que o root real sempre o passa;
  - **campos do motor no root do Floci (emenda 1):**
    - o root de teste passa ao `observabilidade` e ao `contrato` um id e um ARN sintéticos fixos do motor, no formato que o mock do TT-P01 usa, declarados no próprio root de teste;
    - o gateway continua composto sem o motor;
    - o `v1.schema.json` continua exigindo `motor_politica_id` e `motor_politica_arn`;
    - os dois alarmes do motor nascem com a dimensão sintética, e o FL-01 afirma só a configuração deles;
    - o FL-03 lê os dois campos do SSM, e o relatório os marca como sintéticos, com o link da lacuna (ADR-0009);
  - relatório em `testing/reports/`.
- **Demonstração (DM):**
  - evidência da AWS real, tirada antes do destroy pelo workflow de evidências (emenda 1);
  - vai no relatório da fase verificar, revisado pelo dono (5.5).

### Matriz regra → teste
Ids de teste: TT-* (`terraform test`), TS-* (schema), RG-* (gravadas), TH-* (harness), FL-* (Floci), DM-* (demonstração), ES (esteira `seguranca.yml`). O `matriz.md` com a coluna de tarefa nasce na fase tarefas, a partir desta tabela.

| Regra | Teste(s) | O que o teste afirma |
|---|---|---|
| Art. I · código só depois de implementar | TH (existente: `gate_sdd`, `pre-commit`) | arquivo em `plataforma/agentes/` bloqueado antes de implementar |
| Art. III · cobertura | TH-07 | todo RF e RNF da spec aparece em `matriz.md` com pelo menos um teste |
| Art. IV · nada público | TT-G01, TT-S01 | `authorizer_type == "AWS_IAM"`; nenhuma política de recurso com `Principal "*"`, nem com condição; valores de condição de conta sem curinga |
| Art. IV · criptografia em repouso | TT-S02 | KMS em log groups, tópico SNS, gateway (`kms_key_arn`) e motor (`encryption_key_arn`); chave com rotação |
| Art. IV · criptografia em trânsito | TT-S04 | política do tópico nega `aws:SecureTransport = false` |
| Art. IV · menor privilégio | TT-S03, TT-R09, TT-O05 | nenhuma declaração com ação `*` e recurso `*`; role de fumaça só com `InvokeGateway` no ARN do gateway; role de evidências só com as ações de leitura e `Evaluate` listadas, confiada só pela role de deploy |
| Art. IV · segredos fora | TS-02, ES (gitleaks) | contrato sem campo ou valor de segredo |
| Art. IV · achado alto bloqueia | ES | checkov, tflint, Trivy e Semgrep sem alto ou crítico |
| Art. V · sem custo fixo ocioso | TT-K02 | plan sem `aws_nat_gateway`, `aws_vpc_endpoint` de interface, cluster ou instância |
| Art. V · Budgets diário com o teto | TT-K01 | `aws_budgets_budget` com `time_unit = "DAILY"` e `limit_amount == var.teto_diario_usd`; o padrão da variável é igual a `teto_diario_usd` do `estado.json` (TH-06) |
| Art. V · Infracost ≤ teto | ES (Infracost) | custo de 24 h do PR ≤ US$ 1,20 |
| Art. V · destroy com prazo e `confirm_stack` | TH (existente), `estado.py validar` | workflows completos |
| Art. V · destroy sem sobras | DM-06, FL-04 | Tagging API sem recurso com `project=00-plataforma-agentes`; nada sob `/00-plataforma-agentes/` |
| Art. VI · tags | TT-T01 | todo recurso tagueável com `project`, `module` em kebab e `managed-by=terraform` |
| Art. VI · isolamento e prefixo | TT-R01, TT-T02 | nomes com o prefixo da chave (exceções da API no ADR-0006) |
| Art. VI · logs, métricas e alarmes | TT-O01 a TT-O04 | ver RF-006 e RNF-003 |
| Art. VI · state remoto com lock | TH-08 | `versions.tf` com backend `s3` parcial e `use_lockfile` |
| Art. VI · README com até 5 passos | TH-09 | `plataforma/agentes/README.md` com no máximo 5 passos numerados |
| Art. VII · componente Claude | RG-01 a RG-08 | ver RF-010 a RF-012 |
| Art. VIII · dados sintéticos | RG-09; revisão | o arquivo do roteiro declara `sintetico: true`; o relatório passa por revisão humana antes de publicar |
| RF-001 · um gateway | TT-G02 | exatamente um `aws_bedrockagentcore_gateway`, com `protocol_type = "MCP"` |
| RF-001 · alvos com prefixo e classe | TT-R01, TT-R03 | dois produtos sintéticos: todo alvo começa pela chave; toda tool tem classe; schema estático presente |
| RF-001 · um produto não mexe no alvo de outro | TT-R02, TH-04 | chave diferente da tag do provider falha (`expect_failures`); recurso bruto fora do módulo reprova o harness |
| RF-001 · servidor MCP e Lambda | TT-R04; FL-02 | os dois tipos de alvo no plan; produto sintético registra alvo no Floci |
| RF-002 · nega por padrão e entre produtos | TT-R10; RG-02; DM-02 | `permit` só com principal e ações do próprio produto; resposta gravada de `AuthorizeActionException`; negação real com `DenyDecisions` ≥ 1 |
| RF-002 · `ENFORCE` por padrão; apply recusa `LOG_ONLY` | TT-P01, TT-P02, TH-05 | padrão `ENFORCE`; `LOG_ONLY` só com `calibracao = true`; o workflow de apply da plataforma recusa `TF_VAR_modo_politica=LOG_ONLY` |
| RF-002 · `tools/list` filtrado | DM-01 | a role de fumaça vê lista vazia; a do agente vê só as próprias tools |
| RF-003 · IAM na entrada | TT-G01 | `NONE` e `AUTHENTICATE_ONLY` reprovam (`expect_failures` na validação da variável) |
| RF-003 · sem credencial no plan | TS-02, TT-S05, ES | nenhuma credencial em variável, output, tag ou SSM |
| RF-003 · role sem `InvokeGateway` recebe erro | DM-03 | Floci não emula a invocação MCP (ADR-0009) |
| RF-004 · base do guardrail | TT-R08 | 5 categorias `HIGH` nos dois sentidos; `PROMPT_ATTACK` `HIGH`/`NONE`; credenciais `BLOCK`; regex de CPF e CNPJ `ANONYMIZE`; `STANDARD` com `cross_region_config`; versão numerada no contrato |
| RF-004 · injeção bloqueada pelo modelo | RG-04; DM-04 | `stopReason = guardrail_intervened` → `guardrail_entrada` |
| RF-005 · perfil por produto | TT-R11 | um perfil por produto com `project` = chave; a role invoca só o próprio perfil |
| RF-005 · custo por tag | DM-07 | Cost Explorer agrupado por `project` no dia seguinte (depende da tag ativa, D-034) |
| RF-006 · logs e traces com retenção | TT-O01, TT-O02 | entregas de logs e traces no plan; retenção de 7 dias; KMS |
| RF-006 · relatório por produto | DM-04, DM-08 | `AllowDecisions`, `DenyDecisions`, intervenções, id de trace e notas dos 3 avaliadores, tirados antes do destroy |
| RF-006 · executor da coleta e da avaliação (emenda 1) | TT-O05, TH-13 | role de evidências no plan; workflow de evidências só com `workflow_dispatch`, ambiente `aws-lab`, OIDC, `permissions` mínimas e relatório como artefato de 1 dia |
| RF-007 · contrato válido | TS-01, TS-02, TT-C01 | `contrato_v1` passa no schema; cada parâmetro ≤ 4 KB; tipo `String` |
| RF-007 · motor no contrato e nos alarmes (emenda 1) | TT-P01, FL-01, FL-03 | no root real, id e ARN do motor vêm do módulo `politica`; no Floci, os valores sintéticos fixos passam no schema e aparecem no relatório como sintéticos |
| RF-007 · consumo sem valor à mão | FL-03; TH-10 | produto sintético monta a chamada só pelo SSM do Floci; busca por `arn:aws:bedrock` fora de testes gravados devolve zero |
| RF-008 · workflows | TH (existente), `estado.py validar` | apply e destroy iguais aos modelos |
| RF-008 · prazo e ordem | TH-01, TH-02, TH-03 | prazo do consumidor ≤ plataforma − 1 h; plataforma aguarda consumidor; `dependentes` falha com consumidor no ar |
| RF-008 · sobras em zero | DM-06 | verificação de sobras do workflow |
| RF-009 · tríade letal | TT-R05 | catálogo com principal que cobre as três classes faz o plan falhar com o principal e as tools na mensagem |
| RF-010 · cláusulas `forbid` | TT-R06 | `PromptAttack` > 0,4 em toda tool; `SensitiveInformation` > 0,2 em `canal_saida` |
| RF-010 · roteiro de 4 passos | RG-03; DM-01 a DM-04 | permitido, negado por política, negado pelo guardrail de tools, bloqueado pelo guardrail do modelo |
| RF-010 · conteúdo não confiável checado | RG-05; DM-05 | `ApplyGuardrail` antes de entrar no contexto; medição real da detecção |
| RF-011 · mapa de erros | RG-06 | uma gravação por linha; texto inédito → `erro_desconhecido`; retentativa 1, 2 e 4 s só nas retentáveis |
| RF-011 · trace sem máscara fora do log | RG-07 | o agente não grava o trace do guardrail |
| RF-012 · `sensivel` negada ao agente | TT-R07; RG-06 | nenhum `permit` de tool `sensivel` para role de agente; o agente para e devolve `requer_aprovacao_humana` |
| RNF-001 | TT-S01 a TT-S05; ES | itens do Art. IV acima |
| RNF-002 | TT-K01, TT-K02; ES; TH-11 | Budgets diário; nada fixo; nenhum teste de fumaça chama `Converse` nem `ApplyGuardrail` (emenda 1; a chamada direta ao guardrail é o DM-05, no produto) |
| RNF-003 · tags, state, README | TT-T01, TH-08, TH-09 | acima |
| RNF-003 · seis alarmes | TT-O03 (5 na plataforma), TT-O04 (1 no módulo); FL-01 | período 300 s, 1 avaliação, `Sum`, `notBreaching`, limiares da spec |
| RNF-004 · sem Organizations | TT-K03 | nenhum `aws_organizations_*` ou `aws_controltower_*` |
| RNF-005 · CI de código sem Bedrock | TH-11 | nenhum workflow fora dos de operação (apply, destroy e, pela emenda 1, evidências, todos sem gatilho `pull_request` ou `push`) referencia `bedrock` ou `Converse` |
| RNF-006 · região | TT-T03 | `var.regiao` com padrão `us-east-1`; disponibilidade regional rechecada antes do primeiro apply real (tarefa de verificação) |
| RNF-007 · lacunas com evidência | FL (relatório) | cada lacuna com link da documentação do Floci |
| RNF-008 · dados sintéticos | RG-09; revisão | acima |

## Cloud comparativa
Não se aplica a esta spec. O tipo do projeto é `plataforma`, com `cloud: null` no `harness/estado.json`, e a spec não pede comparativa. A comparativa de cada disciplina fica com o produto (D-009). Se o dono quiser uma comparativa da plataforma, isso é escopo novo e entra como pergunta.

## Custo do lab (um dia de execução)
Premissas do dia de demonstração:
- até 1.000 chamadas ao gateway (o roteiro tem cerca de 10; o resto é margem para ensaios, e um loop dispara alarme antes disso);
- até 100 tools indexadas;
- nenhuma chamada de `ApplyGuardrail` da plataforma (emenda 1: o teste de fumaça não chama o guardrail; o DM-05 é do produto);
- até 10 MB de logs e 10 MB de spans;
- avaliação sob demanda com 3 avaliadores sobre 10 traces, 2 sessões e 10 chamadas de tool, rodada até duas vezes;
- coleta de evidências (emenda 1): até duas execuções do workflow, cada uma com algumas dezenas de métricas lidas e consultas do Logs Insights sobre menos de 20 MB.

Região `us-east-1`. Preços consultados em 2026-11-19; a emenda 1 refez a conta em 2026-11-20 com as mesmas fontes.

| Componente | Custo de 24 h (US$) | Fonte da estimativa |
|---|---|---|
| KMS: 1 chave do cliente | 1 × 1,00/mês × 24/730 = **0,033** | [KMS](https://aws.amazon.com/kms/pricing/): US$ 1/mês, rateado por hora |
| KMS: requisições | 10.000 × 0,03/10.000 = **0,030** (sem contar a camada gratuita de 20.000/mês, que é da conta) | mesma página; valor do exemplo da página |
| CloudWatch: 5 alarmes da plataforma | 5 × 0,10 × 24/730 = **0,016** (sem contar os 10 gratuitos) | [CloudWatch](https://aws.amazon.com/cloudwatch/pricing/): US$ 0,10 por métrica de alarme, rateado por hora |
| Gateway: invocações | 1.000 × 0,005/1.000 = **0,005** | [AgentCore](https://aws.amazon.com/bedrock/agentcore/pricing/) |
| Gateway: indexação de tools | 100 tools × 0,02/100 = **0,020**, como mês cheio | mesma página: "por 100 tools indexadas por mês", sem rateio documentado |
| Policy: autorizações | 1.000 × 0,000025 = **0,025** | mesma página |
| Guardrails no Policy: ataque de prompt | 1.000 × 1 unidade de texto × 0,08/1.000 = **0,080** | [Bedrock](https://aws.amazon.com/bedrock/pricing/), tabela `InvokeGuardrailChecks` |
| Guardrails no Policy: informação sensível | 1.000 × 1 × 0,10/1.000 = **0,100** (pior caso: toda chamada em `canal_saida`) | mesma tabela |
| Teste de fumaça: `ApplyGuardrail` | **0,000** (emenda 1: a linha de US$ 0,025 saiu; o `ApplyGuardrail` do DM-05 vai no teto do produto) | [Bedrock](https://aws.amazon.com/bedrock/pricing/): filtro de conteúdo US$ 0,15 e PII US$ 0,10 por 1.000 unidades; regex gratuita |
| Logs do gateway (entregues) | 0,01 GB × 0,50 = **0,005** | [CloudWatch](https://aws.amazon.com/cloudwatch/pricing/): logs entregues, US$ 0,50/GB na primeira faixa |
| Spans (Transaction Search) | 0,01 GB × 0,35 = **0,004** | mesma página: US$ 0,35/GB; 1% indexado incluso |
| SNS: até 50 publicações e entregas por e-mail | **0,010** (reserva) | [SNS](https://aws.amazon.com/sns/pricing/): cobra por requisição e entrega; a página não mostrou o valor unitário, e o Infracost confirma no PR |
| Coleta de evidências: `GetMetricData` e Logs Insights (emenda 1) | **0,010** (reserva) | [CloudWatch](https://aws.amazon.com/cloudwatch/pricing/): a página diz que `GetMetricData` é sempre cobrado e que o Logs Insights cobra por dado lido, mas a leitura de 2026-11-20 não mostrou os valores unitários. O T073 confirma pelo Infracost, e o T087 pelo custo real |
| Evaluations sob demanda | entrada (10 × 4k + 2 × 20k + 10 × 4k = 120k tokens) × 0,0024/1k = 0,288; saída (7k tokens) × 0,012/1k = 0,084; × 2 rodadas = **0,744** | [AgentCore](https://aws.amazon.com/bedrock/agentcore/pricing/): avaliadores nativos por token |
| Identity via Gateway | **0,000** | mesma página: sem custo quando usado pelo Gateway |
| SSM (camada padrão) | **0,000** | [SSM](https://docs.aws.amazon.com/systems-manager/latest/userguide/parameter-store-advanced-parameters.html) |
| Budgets diário (sem ações) | **0,000** | [Budgets](https://aws.amazon.com/aws-cost-management/aws-budgets/pricing/) |
| **Total estimado** | **1,082** (emenda 1; a soma original das linhas dava 1,097, e não 1,103 como estava escrito) | |

- **Teto diário: US$ 1,20, aprovado na D-035 e mantido pelo dono na emenda 1 (P00-P8, D-038).**
  - A estimativa caiu para US$ 1,082. Com US$ 1,20, a margem passa de 8% para 11%.
  - A regra original (o total arredondado para cima até a dezena de centavo seguinte) daria US$ 1,10 sobre a nova estimativa, com margem de 2%.
  - A recomendação é manter US$ 1,20: os volumes são premissas, e uma margem de 2% faria o Budgets diário avisar por ruído.
  - Manter ou baixar era decisão de orçamento do dono: ele manteve 1,2 (P00-P8, D-038).
  - O valor entra no README e no Budgets diário na implementação, e só vale com a nova aprovação deste plano.
- **Fora do teto da plataforma (vai no teto do produto):** o que o módulo cria no state do produto e as chamadas do agente do produto:
  - inferência do Claude no perfil do produto;
  - guardrail no `Converse`;
  - `ApplyGuardrail` no guardrail do produto, incluindo o DM-05 (emenda 1);
  - o 6º alarme;
  - o servidor MCP.
- **Dia do ensaio da plataforma (emenda 1):** cerca de US$ 0,09, num dia separado e abaixo do teto diário.
  - Itens: chave KMS (0,033), requisições do KMS (até 0,030), 5 alarmes (0,016), reserva do SNS (0,010), e chamadas de fumaça e logs abaixo de 0,002.
  - Não há indexação, porque nenhum produto se registra no ensaio. Também não há avaliação.
- **Efeito da indexação mensal:** ela é a única cobrança com unidade mensal sem rateio documentado.
  - O dia a conta como mês cheio.
  - Se cada apply reindexar, o pior caso é US$ 0,02 por 100 tools por demonstração. Com 10 demonstrações no mês, isso dá US$ 0,20, ou 1% do limite mensal da conta.
- **Peso no mês:** uma demonstração com o ensaio consome cerca de 6% do limite mensal de US$ 20 (D-022), sem contar o produto.
- **O que fica cobrando depois do destroy:**
  - chave KMS em exclusão: US$ 0, porque a página do KMS diz que não há cobrança por chave agendada para exclusão;
  - log groups criados pela plataforma: são removidos no destroy;
  - spans no `aws/spans`: o grupo é da conta (`infra/conta`), não da plataforma; até 10 MB, com armazenamento abaixo de US$ 0,01;
  - objeto de state no bucket compartilhado: alguns KB, com custo abaixo de US$ 0,01 por mês;
  - assinaturas de e-mail pendentes: somem com o tópico;
  - leitura do Cost Explorer para o critério 2: pelo console, sem custo de API.
- **Workflow de destroy:** `.github/workflows/00-plataforma-agentes-destroy.yml`, stack `plataforma-agentes-lab` (input `confirm_stack`).

## Riscos e lacunas do emulador
| id | Risco | Probabilidade e impacto | O que fazer |
|---|---|---|---|
| R1 | Versão de MCP do gateway diferente da lane de compatibilidade da D03 (D-034) | média; o cliente da D03 recebe `-32022`, ou elicitation e sampling falham na tradução | `versoes_mcp` é variável e campo do contrato. A spec da D03 declara as versões do servidor e do cliente, e o plano da D03 confere com este contrato. Se a lane for 2025-06-18, ela entra na lista (versão menor). A D03 não usa elicitation nem sampling pelo gateway (ADR-0010) |
| R2 | Ativação da tag `project` atrasada | média; o custo por produto não aparece (H3) | Ativação única na conta, feita pelo dono assim que a chave aparecer no Billing (D-039, emenda 2). Se `aws_ce_cost_allocation_tag` falhar porque a chave não apareceu, roda de novo no dia seguinte. **Emenda 1:** o ensaio é só da plataforma (apply, fumaça, DM-03 e destroy automático), sem produto sintético na AWS real. Isso basta para o R2, porque a chave KMS já é recurso cobrado com a tag `project` |
| R3 | `PromptAttack` não detecta injeção indireta em resultado de tool | média; a detecção falha | A contenção é estrutural (tríade letal e RF-012); o DM-05 mede e o resultado vai ao ADR-0004 |
| R4 | `bedrock:InvokeGuardrailChecks` exige recurso amplo | baixa; o privilégio da role do gateway fica maior | Usar o ARN mais estreito que a documentação mostrar; se exigir `*`, usar a condição `aws:SourceAccount` e uma exceção do checkov com ADR |
| R5 | Provider sem `mcpToolSchema` estático para alvo servidor MCP | média | O fallback é a sincronização da descoberta, com o DM-05 comparando `tools/list` com o catálogo. Tool fora do catálogo continua negada por padrão |
| R6 | `InvocationsIntervened` não conta o guardrail usado pelo `Converse` | baixa | O DM-04 confere; se não contar, a alternativa é um filtro de métrica do log do agente (incertezas) |
| R7 | Role de deploy única na conta (D-029) | baixa no lab; alta em produção | Ambientes protegidos, apply com aprovação, gate do harness e revisão no PR. Em produção: conta ou role de deploy por produto e SCP |
| R8 | Política em `CREATE_FAILED` (validação assíncrona) | média na primeira demonstração | O módulo cria a política depois do alvo; o recurso do provider espera o estado final, então o apply do produto falha cedo, antes da gravação. **Emenda 1:** o produto sintético na AWS real saiu do plano, porque não tinha root, chave, workflow nem custo. A primeira prova real é o apply da D03: no dia do ensaio, se a D03 já estiver em `verificar` (opção de operação do dono na T084, com custo no teto da D03), ou no dia da demonstração, antes do roteiro. O TT-R10 e o `validation_mode = "FAIL_ON_ANY_FINDINGS"` reduzem a chance antes disso |
| R9 | Permissões do `Evaluate` sob demanda (emenda 1) | baixa; a coleta falha com `AccessDenied` na primeira demonstração | A página de pré-requisitos lista `bedrock-agentcore:Evaluate` com recurso `*` e só exige invocação de modelo para avaliador personalizado. A ausência de role de serviço no sob demanda é **inferida**, porque o `Evaluate` recebe os spans no corpo e não tem campo de role. O T082 confirma na referência de autorização; se faltar permissão, ela entra na role de evidências com ADR de implementação, sem mudar o restante |

**Lacunas do Floci (ADR-0009), com evidência na documentação consultada em 2026-11-19:**
- **Invocação MCP do gateway:** a página do AgentCore lista só o plano de controle do Gateway e diz que não há execução real de tool. A prova fica em RG e DM.
- **Motor de política e políticas:** não aparecem na página do AgentCore. A prova fica em TT e DM.
- **Guardrails:** fora de escopo na página do Bedrock Runtime. A prova fica em TT e DM.
- **`CreateInferenceProfile`:** não descrito. A prova fica em TT.
- **Evaluations:** não citado. A prova fica em DM.
- **Entrega de logs:** só guarda a configuração. O FL afirma a configuração, e o DM, a entrega.

## Trabalho que o plano cria (entra em `tasks.md` depois da aprovação)
- **T000:** mover os ADRs de `specs/00-plataforma-agentes/adr/` para `plataforma/agentes/adr/`, já na fase implementar.
- **Harness:**
  - campo `consome` no `estado.json`;
  - `infra.py` com limite de prazo, espera e os comandos `dependentes` e `requisitos`;
  - passos novos nos modelos de apply e destroy e nos workflows existentes;
  - gate de recursos brutos do AgentCore fora da plataforma;
  - testes TH-01 a TH-11.
- **`infra/conta` (aplicado pelo dono, D-034):** tag de alocação de custo, Transaction Search e parâmetro `/00-conta/alertas/emails`.
- **Plataforma:** stack, módulos, contrato com schema, agente de exemplo e gravações, integração no Floci, README e relatório da demonstração.
- **Emenda 1:** role de evidências (módulo `observabilidade`), workflow manual de evidências e TH-13.

## Perguntas ao dono
P00-P3, P00-P4 e P00-P5 estão respondidas (D-034) e aplicadas acima. A nova aprovação deste plano, depois da emenda 1 (D-033), é pedida pela orquestração.

| id | pergunta | bloqueia | opções | recomendação |
|---|---|---|---|---|
| P00-P8 | ~~O teto fica em US$ 1,20 ou baixa para US$ 1,10?~~ **Respondida (D-038):** manter US$ 1,20. | — | — | — |

## Fontes (consulta em 2026-11-19)
Além das fontes da spec (seção "Proveniência"):

| Afirmação | Fonte | Data da fonte | Certeza |
|---|---|---|---|
| Preços do Gateway, Policy, Identity e Evaluations; indexação "por mês" | [AgentCore pricing](https://aws.amazon.com/bedrock/agentcore/pricing/) | sem data | confirmado; rateio da indexação não documentado |
| Preços do Guardrails, incluindo a tabela `InvokeGuardrailChecks`; unidade de texto de até 1.000 caracteres; mesmo preço nas camadas | [Bedrock pricing](https://aws.amazon.com/bedrock/pricing/) | sem data | confirmado |
| Chave do cliente US$ 1/mês rateado por hora; sem cobrança em exclusão | [KMS pricing](https://aws.amazon.com/kms/pricing/) | sem data | confirmado |
| Alarme US$ 0,10 por métrica; logs entregues US$ 0,50/GB; spans US$ 0,35/GB | [CloudWatch pricing](https://aws.amazon.com/cloudwatch/pricing/) | sem data | confirmado pelos exemplos da página |
| Orçamento de monitoramento gratuito | [Budgets pricing](https://aws.amazon.com/aws-cost-management/aws-budgets/pricing/) | sem data | confirmado |
| Política validada contra o schema das tools dos gateways associados; falha assíncrona `CREATE_FAILED` | [Policy validation](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/policy-create-update-validation.html) | sem data | confirmado |
| Guardrails no Policy: tipos, limiares padrão, `suppressOutput` e `InvokeGuardrailChecks`; regiões, incluindo us-east-1 | [Guardrails in policies](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/policy-guardrails-in-policies.html) | sem data | confirmado |
| Versões de MCP do gateway e comportamento sem cabeçalho | [Blog da AWS](https://aws.amazon.com/blogs/machine-learning/how-agentcore-gateway-supports-the-mcp-2026-07-28-spec/) | 2026-07-28 | confirmado |
| Alvo servidor MCP: descoberta na criação, `SynchronizeGatewayTargets`, schema estático, saída por SigV4 | [MCP server targets](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/gateway-target-MCPservers.html) | sem data | confirmado |
| Português "Optimized and supported" na `STANDARD` | [Supported languages](https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails-supported-languages.html) | sem data | confirmado |
| `STANDARD` usa inferência entre regiões; o provider exige `cross_region_config` | [Tiers](https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails-tiers.html); [doc do provider](https://github.com/hashicorp/terraform-provider-aws/blob/main/website/docs/r/bedrock_guardrail.html.markdown) | sem data | confirmado |
| `InvocationsIntervened` em `AWS/Bedrock/Guardrails` | [Guardrails CloudWatch metrics](https://docs.aws.amazon.com/bedrock/latest/userguide/monitoring-guardrails-cw-metrics.html) | sem data | confirmado |
| Imposição de guardrail por IAM (`bedrock:GuardrailIdentifier`) | [anúncio](https://aws.amazon.com/about-aws/whats-new/2025/03/amazon-bedrock-guardrails-policy-based-enforcement-responsible-ai) | 2025-03 | confirmado |
| Entidades de credencial do filtro de informação sensível | [Sensitive information filters](https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails-sensitive-filters.html) | sem data | confirmado |
| Avaliadores nativos citados; leitura de `aws/spans` | [On-demand evaluation](https://docs.amazonaws.cn/bedrock-agentcore/latest/devguide/getting-started-on-demand.html) | sem data | confirmado para os quatro citados |
| Motor de política: nome `^[A-Za-z][A-Za-z0-9_]*$`, chave KMS opcional | [Pulumi (ponte do provider Terraform)](https://www.pulumi.com/registry/packages/aws/api-docs/bedrock/agentcorepolicyengine/); [doc da política](https://github.com/hashicorp/terraform-provider-aws/blob/main/website/docs/r/bedrockagentcore_policy.html.markdown) | sem data | confirmado |
| Floci: cobertura por serviço | [Floci services](https://floci.io/floci/services/) e páginas citadas | sem data | confirmado; avaliação de IAM para `bedrock-agentcore` não citada |
| Permissões de quem chama o Evaluations, incluindo `bedrock-agentcore:Evaluate` com recurso `*`; invocação de modelo só para avaliador personalizado; role de serviço descrita para avaliadores e avaliação online | [Evaluations prerequisites](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/evaluations-prerequisites.html) | sem data; consulta em 2026-11-20 | confirmado; ausência de role no sob demanda inferida (R9) |
| `Evaluate` recebe os spans no corpo (`evaluationInput`), sem campo de role | [Evaluate (API)](https://docs.aws.amazon.com/bedrock-agentcore/latest/APIReference/API_Evaluate.html) | sem data; consulta em 2026-11-20 | confirmado |
| O sob demanda lê os spans de `aws/spans` com o Logs Insights (`StartQuery`, `GetQueryResults`) antes de chamar o `Evaluate` | [On-demand evaluation](https://docs.amazonaws.cn/bedrock-agentcore/latest/devguide/getting-started-on-demand.html) | sem data; consulta em 2026-11-20 | confirmado |

## Emenda 1 (2026-11-20)
Autorizada pelo dono no chat em 2026-11-20 00:38 BRT ("Corrigir agora"). Ela fecha só os furos F1 a F5 do `tasks.md`. A aprovação anterior (D-035) caiu; a nova foi dada pelo dono em 2026-11-20 (D-038). Cada linha diz o que mudou, a boa prática que guia a mudança, o que o arquiteto faz e o erro comum que ela evita (D-036).

| Furo | O que mudou | Por quê |
|---|---|---|
| F1 · fumaça com `ApplyGuardrail` sem guardrail nem permissão | O teste de fumaça da plataforma ficou só com o gateway: `tools/list` vazio e `tools/call` negado. A chamada direta ao guardrail sem o Claude, que o RNF-002 pede na demonstração, é o DM-05, feito pelo agente do produto no guardrail dele. A linha de US$ 0,025 saiu da tabela de custo e foi para o teto do produto | **Teste só do que o stack possui.** O arquiteto testa em cada stack o que esse stack cria e destrói. O erro comum é dar à plataforma um guardrail só para a fumaça, ou permissão sobre o guardrail de um produto, o que quebra o isolamento entre states e cria um recurso sem função no produto (1.4, 2.3) |
| F2 · ensaio com produto sintético sem root, chave, workflow nem custo | O ensaio de 48 h antes ficou só com a plataforma: apply, fumaça, DM-03 e destroy automático, com cerca de US$ 0,09 num dia separado. Isso basta para o R2. O R8 passa a ser provado no primeiro apply da D03: no ensaio, se ela já estiver pronta (opção de operação do dono na T084), ou no dia, antes do roteiro, com o apply falhando cedo | **Não planejar trabalho sem dono.** O arquiteto só põe no plano o que tem artefato, executor e custo, e usa a falha cedo do apply como gate antes do passo caro, que é a gravação. O erro comum é prometer um ensaio que ninguém consegue rodar e descobrir o problema no dia (1.4, 1.6) |
| F3 · root do Floci sem motor, mas contrato e alarmes dependem dele | O id e o ARN do motor viraram entradas de composição do `observabilidade` e do `contrato`. No root real, vêm do módulo `politica` (TT-P01). No root do Floci, vêm de valores sintéticos fixos, marcados como sintéticos no relatório. O schema continua exigindo os dois campos. O ADR-0009 ganhou essa regra | **Injetar a dependência na composição, sem mexer em código correto.** O arquiteto deixa o teste fornecer o que o emulador não tem e registra a lacuna com evidência. O erro comum é tornar campos do contrato opcionais ou criar um "modo emulador", o que enfraquece o contrato que os produtos usam e esconde a lacuna (2.1, 3.6, 5.6) |
| F4 · avaliação e coleta sem executor nem role | Entraram a role `00-plataforma-agentes-evidencias` (só leitura e `Evaluate`, confiada só pela role de deploy) e um workflow manual no ambiente `aws-lab`, que já existe. O relatório sai como artefato de 1 dia e passa pela revisão humana antes de entrar no repositório. Também entraram a linha de STRIDE, os testes TT-O05 e TH-13, o R9 e uma reserva de US$ 0,010 no custo | **Uma role por função, executor explícito e revisão humana antes de publicar.** O arquiteto separa quem implanta de quem lê e avalia e mantém a avaliação fora do destroy. O erro comum é rodar a avaliação com a role de deploy, ampla demais, ou como passo do destroy, que passaria a depender dela (1.4, 4.6, 5.5) |
| F5 · cabeçalho dizia "rascunho" | O cabeçalho diz "aprovado (D-035), emenda 1 com nova aprovação pendente". A seção de ADRs explica que, depois do T000, os links chegam aos ADRs pelos redirecionamentos | **Estado do documento igual ao registro.** O arquiteto mantém o status do plano igual ao do `estado.json`. O erro comum é o leitor não saber qual versão vale e trabalhar sobre a errada (5.1) |
| Custo refeito | Total de US$ 1,082. A soma original das linhas dava 1,097, e não 1,103 como estava escrito: um erro de soma de US$ 0,006, corrigido aqui. O teto fica em US$ 1,20 até a resposta à P00-P8 | **Calcular não é decidir.** O arquiteto refaz a conta com as mesmas fontes e leva a mudança de teto ao dono. O erro comum é ajustar o teto sozinho, para cima ou para baixo (Art. V; 5.6) |

Fora da emenda, nada mudou: arquitetura, ADRs 0001 a 0008 e 0010, matriz dos demais requisitos e demais riscos. A D-037 (página e post da plataforma) muda só a T089 do `tasks.md`, não este plano.

## Emenda 2 (2026-11-20)
Aprovada pelo dono no chat em 2026-11-20 (D-040). Só alinha três trechos a decisões já tomadas, sem decisão nova, sem mudança de arquitetura e sem mudança de custo:

| Trecho | O que mudou | Boa prática e erro comum |
|---|---|---|
| Stack da plataforma, entrada do motor | "obrigatória" passa a valer só para `observabilidade` e `contrato`. No `gateway` a entrada é anulável, como no ADR-0011 | **Uma fonte de verdade por decisão.** O arquiteto mantém o plano igual ao ADR que decidiu. O erro comum é o implementador seguir o trecho velho e o revisor reprovar o certo (5.1) |
| Configuração da conta, pré-requisito da tag | "tag ativa 48 h antes da demonstração" vira a ativação única na conta, assim que a chave aparecer | **Decisão nova do dono substitui a antiga em todo lugar.** O erro comum é deixar duas regras valendo e planejar uma espera que não existe (D-039; 5.1) |
| Risco R2, mitigação | a mitigação "ensaio 48 h antes e `infra/conta` depois do ensaio" vira a ativação única, pela D-039 | idem |

