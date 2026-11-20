# ADR 0004 · Guardrail em duas camadas e conteúdo não confiável

- **Status:** aprovado com o plano (D-035; emenda 1 aprovada na D-038)
- **Data:** 2026-11-19
- **Requisitos:** RF-004, RF-009, RF-010, RF-011, RF-012, E2, E14

## Contexto
- **O guardrail do modelo não vê as tools.** No `Converse`, ele não avalia resultados, definições nem argumentos de tool. O filtro de ataque de prompt só existe na entrada ([Converse com guardrail](https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails-use-converse-api.html), [ataque de prompt](https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails-prompt-attack.html)).
- **O Policy do AgentCore vê as tools.** Ele aplica checagens de guardrail na camada de tools:
  - `ContentFilter`, `PromptAttack` e `SensitiveInformation`;
  - limiares padrão de 0,2, 0,4 e 0,2;
  - efeitos `permit` e `forbid` sobre `context.input`, e `suppressOutput` sobre `context.output` ([Guardrails in policies](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/policy-guardrails-in-policies.html)).
- **Ponto incerto:** nenhuma das duas páginas mostra `PromptAttack` sobre `context.output`, nem o `ApplyGuardrail` detectando injeção indireta em conteúdo arbitrário.
- **Português:** a camada `STANDARD` atende português como "Optimized and supported" ([idiomas](https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails-supported-languages.html)).

## Decisão
**Camada do modelo (RF-004),** um guardrail por produto, criado pelo módulo `registro-produto`:
- `HATE`, `INSULTS`, `SEXUAL`, `VIOLENCE` e `MISCONDUCT` em `HIGH` nos dois sentidos;
- `PROMPT_ATTACK` em `HIGH` na entrada e `NONE` na saída;
- `AWS_ACCESS_KEY`, `AWS_SECRET_KEY`, `PASSWORD`, `PIN` e `CREDIT_DEBIT_CARD_CVV` com `BLOCK` nos dois sentidos ([catálogo](https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails-sensitive-filters.html));
- regex de CPF e CNPJ com `ANONYMIZE` na saída, porque regex não tem custo;
- camada `STANDARD` com `cross_region_config`;
- mensagens fixas em português;
- versão numerada no contrato;
- uso imposto por IAM: a role do agente só invoca o modelo com `bedrock:GuardrailIdentifier` igual ao próprio guardrail ([anúncio de 2025-03](https://aws.amazon.com/about-aws/whats-new/2025/03/amazon-bedrock-guardrails-policy-based-enforcement-responsible-ai)).

**Camada de tools (RF-010),** `forbid` gerado pelo módulo para cada produto:
- `PromptAttack` (`JAILBREAK`, `PROMPT_INJECTION`, `PROMPT_LEAKAGE`) acima de 0,4 na entrada de toda tool;
- `SensitiveInformation` acima de 0,2 na entrada das tools `canal_saida`;
- limiares iguais aos padrões da documentação; mudança só com calibração em `LOG_ONLY` e ADR (ADR-0005).

**Conteúdo de tool `conteudo_nao_confiavel`, mecanismo do v1:**
- o agente passa o resultado por `ApplyGuardrail` (`source=INPUT`) com o guardrail do produto antes de pô-lo no contexto;
- intervenção vira `guardrail_entrada` (RF-011), e o loop para.

**`suppressOutput` com `PromptAttack` em `context.output`:** fica fora do contrato v1. Entra como versão menor se a documentação ou a medição DM-05 confirmar.

**A contenção não depende da detecção:**
- a tríade letal é recusada no plan (RF-009);
- a ação sensível só passa com aprovação humana (RF-012).

Se as duas detecções falharem, a injeção indireta não alcança, no mesmo agente, dado privado e canal de saída, nem uma ação que não se desfaz.

## Alternativas rejeitadas
- **Só a camada do modelo:** não vê argumentos nem resultados de tool, então a exfiltração por argumento passa.
- **Só a camada de tools:** a injeção direta do usuário chega ao modelo sem filtro, e a resposta sai sem mascaramento.
- **`suppressOutput` com `PromptAttack` como mecanismo principal:** não documentado; uma política recusada na validação derrubaria o apply da demonstração.
- **Tópicos negados na base:** são decisão de produto (E3).

## Trade-offs
- **Ganho:** defesa em profundidade com controles fora do modelo; o produto não consegue desligar o guardrail, por causa do IAM.
- **Custo:**
  - duas cobranças por chamada com tool (Guardrails no `Converse` e `InvokeGuardrailChecks` no Policy);
  - falsos positivos possíveis com limiares padrão, que a calibração resolve com dados.

## Custo
- **Plataforma:** até US$ 0,18 por dia nas checagens do Policy (1.000 chamadas). O teste de fumaça não chama o guardrail (emenda 1, D-038), então não tem custo de guardrail.
- **Produto:** o guardrail no `Converse` e o `ApplyGuardrail`, incluindo o do DM-05, são cobrados no teto dele.
- **Fontes:** [preços do Bedrock](https://aws.amazon.com/bedrock/pricing/), tabelas padrão e `InvokeGuardrailChecks`.

## Risco
- **Injeção indireta não detectada (R3):** contida pela tríade e pelo RF-012; o DM-05 mede.
- **`InvocationsIntervened` não conta o `Converse` (R6):** o DM-04 confere.
- **Falso positivo em português:** o roteiro do DM-04 usa texto em português; a calibração entra por ADR.

## Tarefas da prova
- 1.4: gates programáticos fora do modelo e handoff para humano.
- 2.2: intervenção como erro estruturado com categoria.
- 5.2: escalonamento quando o guardrail bloqueia.
- 5.6: o ponto incerto fica declarado e medido, não presumido.

## Curso Skilljar relacionado
Claude with Amazon Bedrock (Guardrails e `Converse`) e Building with the Claude API (tool use e tratamento de resultados de tool).

## Em produção, um arquiteto sênior faria
- Calibração em `LOG_ONLY` com tráfego real anonimizado antes de endurecer limiares.
- Conjunto de avaliação de injeções em português no CI.
- Revisão periódica de falsos positivos e um guardrail por classe de risco, não só por produto.
