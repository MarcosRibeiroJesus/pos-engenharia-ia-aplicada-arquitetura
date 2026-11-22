# ADR-0002: Gateway de LLM próprio, com o Claude pelo `bedrock-runtime`, perfil de inferência e guardrail

- **Status:** proposto (vai com o plano para a aprovação do dono). A parte que depende do consumo da plataforma segue o ADR-0003 (pendente, D02-P3)
- **Data:** 2026-11-21 · **Autor:** arquiteto-aws (Claude Opus 5.5)

## Contexto
O código atual (`src/lib/gateway/provedor-bedrock.ts`) chama o Claude pelo endpoint `bedrock-mantle`, com o cliente `AnthropicBedrockMantle` e a permissão `bedrock-mantle:CreateInference` em `project/*` (DV-07). As fichas dos modelos na documentação do Bedrock, consultadas em 2026-11-21, dizem para o Claude Haiku 5.5 e o Claude Sonnet 5.5:
- no `bedrock-runtime`: Guardrails, perfis de inferência de aplicação, chamada de tool do lado do cliente e saída estruturada são suportados;
- no `bedrock-mantle`: Guardrails e perfis de inferência de aplicação **não** são suportados;
- a AWS recomenda o `bedrock-runtime` para aplicações novas.

A plataforma entrega a cada produto um guardrail e um perfil de inferência, com a role do agente limitada a invocar só o próprio perfil e com o guardrail imposto por IAM (`bedrock:GuardrailIdentifier`). Pelo `bedrock-mantle`, nada disso se aplica.

## Decisão
1. **O gateway de LLM continua próprio** e continua o único com permissão de invocar o modelo. Ele mantém o contrato atual: pedido sem `model`, cadeia em ordem, circuit breaker, cota diária por cliente, ledger de custo e erros por categoria (RF-003 a RF-006).
2. **O provedor passa a ser o `bedrock-runtime`, pela Messages API do Claude (`InvokeModel`)**, com:
   - o `modelId` igual ao ARN do perfil de inferência de aplicação de cada modelo da cadeia;
   - o guardrail do produto em toda chamada (identificador e versão);
   - o conteúdo do paciente e dos anexos marcado como conteúdo protegido do guardrail, para o filtro de ataque de prompt olhar o dado não confiável e não o prompt do sistema;
   - o mesmo corpo de hoje (tools com `strict: true`, `tool_choice: auto`), que a ficha do Sonnet 5.5 confirma (forçar tool não é aceito).
3. **A permissão de invocação** fica só nos ARNs dos perfis e dos modelos de origem deles, com a condição de guardrail; nenhum curinga em recurso.
4. **O preço do ledger** vem da tabela do plano, conferida na Price List da AWS (`us-east-1`), e não da tabela da API da Anthropic.
5. **O cliente exato do SDK** (`AnthropicBedrock` da `@anthropic-ai/bedrock-sdk` com cabeçalhos de guardrail por requisição, ou o `BedrockRuntimeClient` da AWS com o mesmo corpo) é escolhido na tarefa, por um teste vermelho que prova três coisas com respostas gravadas: o ARN do perfil no caminho, os cabeçalhos do guardrail e a classificação de erro do RF-005 sem mudança. A decisão de arquitetura é o endpoint e os controles, não a biblioteca.

## Alternativas rejeitadas
- **Manter o `bedrock-mantle`.** Rejeitada: impede guardrail e perfil por produto, que dão o controle de injeção na camada do modelo e o custo por tag (D-030).
- **Trocar para a Converse API.** Rejeitada: muda o formato de tool e de resposta que os 14 casos gravados, o validador e o canário usam; o ganho (formato comum entre provedores) não vale o retrabalho, porque o projeto só usa o Claude.
- **Gateway gerenciado de terceiros ou a *Guidance for Multi-Provider Generative AI Gateway on AWS*** (LiteLLM em ECS ou EKS, com ALB, ElastiCache e RDS). Rejeitada no lab: custo fixo de balanceador, contêineres e banco, incompatível com um dia de demonstração. Seria avaliada num cenário multi-time.

## Trade-offs
- Ganho: guardrail e custo por produto sem perder a política própria de fallback.
- Perda: a cadeia de dois modelos precisa de dois perfis. O módulo `registro-produto` da plataforma cria um perfil por produto; o plano pede uma versão menor do contrato com um perfil por modelo da cadeia (risco R2 do plano).
- O guardrail soma latência e um custo por unidade de texto, medido na demonstração.

## Custo
Guardrail: cerca de US$ 0,11 no dia, pelas premissas do plano (filtros de conteúdo e de ataque de prompt a US$ 0,15 e informação sensível a US$ 0,10 por 1.000 unidades de texto). Tokens: tabela do plano.

## Risco
- O perfil de inferência de aplicação copiado de um perfil global pode ter preço diferente do regional (US$ 0,10 contra US$ 0,11 por milhão de tokens de entrada do Haiku 5.5). O plano usa o maior.
- O filtro de ataque de prompt pode dar falso positivo nas mensagens legítimas. A bateria red team roda uma vez com o modelo real na demonstração e conta os falsos positivos (DM).

## Tarefas da prova exercitadas
2.2 (erros estruturados e retentáveis), 2.3 (`tool_choice` e poucas tools), 4.3 (saída estruturada via tool_use), 5.3 (propagação de erro).

## Curso Skilljar relacionado
*Claude with Amazon Bedrock*.

## O que um arquiteto sênior faria em produção
Manteria a política de fallback no próprio gateway, com circuit breaker por modelo e por região, usaria perfis de inferência entre regiões para disponibilidade, separaria cota por cliente real (não só pelo orquestrador) e acompanharia o custo pelo perfil no Cost Explorer.
