# ADR-0004: explicação por recomendação com Claude no Amazon Bedrock

- Status: aceito (modelo escolhido pelo dono do repositório em 2026-11-18)
- Data: 2026-11-18
- Unidade: 01.03 (recomendação)
- Curso oficial relacionado: Claude with Amazon Bedrock; Building with the Claude API (Skilljar)

## Contexto

O serviço devolve o top-N com `provenance` (batch, realtime, hybrid, fallback), mas nada que o cliente final entenda. "Por que estou vendo isto?" é um recurso de produto comum em recomendação e exige texto em linguagem natural. É o componente com Claude da unidade, perto do cenário da prova "extração de dados estruturados": a saída é JSON validado, não texto livre.

Restrições: o caminho principal tem SLO de p95 < 60 ms e regra de zero 500; uma chamada a LLM leva centenas de milissegundos ou mais. O texto não pode inventar motivo (por exemplo, dizer "parecido com o que você viu" para um item que veio só do histórico de compras) nem prometer preço ou desconto.

## Decisão

1. **Opt-in por requisição** (`explain=true`), fora do SLO de 60 ms. Sem o parâmetro, o fluxo não muda e não chama o Bedrock.
2. **Uma chamada por requisição** para todo o top-N, não uma por item: menos latência total e um único orçamento de tokens.
3. **Modelo**: Claude Haiku 5.5 no Bedrock (`anthropic.claude-haiku-5-5`, configurável por `bedrock_model_id`). Tarefa curta, bem delimitada e sensível a latência e custo.
4. **Saída estruturada via tool_use (4.3)**: uma única tool `record_explanations` com `input_schema` estrito (`strict: true`, `additionalProperties: false`) e `tool_choice: {type: "tool"}` forçado. Forçar a tool exige thinking desligado (`thinking: {type: "disabled"}`), o que o Haiku 5.5 aceita no effort padrão.
5. **Prompt com critérios explícitos (4.1) e um exemplo (4.2)**: uma explicação por item na mesma ordem, 20 a 160 caracteres, só sinais permitidos, sem preço, desconto, frete, estoque ou números.
6. **Proveniência (5.6)**: o serviço calcula, a partir dos dados, os sinais permitidos de cada item (`allowedSignalsFor`): `purchase_history` exige `batchScore`, `similar_items` exige `vectorScore`, `session_context` exige `vectorScore` e itens de sessão, `popular` só para o catálogo curado. A resposta carrega `signals` e `source: "claude"`.
7. **Validação e retentativa com o erro (4.4)**: zod e regras semânticas (ids exatos, sem repetição, tamanho, sinais sustentados, sem preço). Se falhar, a resposta do assistente fica no histórico e a próxima mensagem é um `tool_result` com `is_error: true` listando cada problema. No máximo 2 tentativas no total.
8. **Erros estruturados e propagação (2.2, 5.3)**: cada falha vira uma categoria (`validation`, `timeout`, `throttled`, `model_error`, `refusal`, `circuit_open`, `internal_error`) com flag de retentável. 429, 5xx e erro de conexão são retentáveis; 400/403/404 e `refusal` não. Timeout encerra na hora (o orçamento acabou). O SDK não retenta (`maxRetries: 0`): todas as tentativas cabem em um orçamento de 2,5 s.
9. **Disjuntor**: 5 falhas seguidas de disponibilidade abrem o circuito por 30 s; nesse tempo o serviço nem chama o Bedrock. Validação e recusa não contam, porque são problema da resposta, não do serviço.
10. **Fallback sem explicação**: qualquer falha, inclusive exceção inesperada, devolve as mesmas recomendações sem o campo `explanation` nos itens e com `explanation: {status: "unavailable", reason}` no topo. Não liga `degradedMode`, que continua significando "a recomendação piorou". Métricas `ExplanationFallbackCount` (com alarme) e `ExplanationRetryCount`.
11. **Cliente**: `AnthropicBedrock` do `@anthropic-ai/bedrock-sdk`, no caminho InvokeModel (`bedrock-runtime`), atrás de uma porta (`ClaudeMessagesPort`) que os testes substituem.

## Alternativas rejeitadas

| Alternativa | Por que não |
|---|---|
| Texto livre e parse por regex | Frágil; o modelo pode mudar o formato a qualquer momento. A tool com schema estrito garante a forma; o código valida o conteúdo. |
| `output_config.format` (structured outputs) no lugar de tool | Funciona, mas a unidade foi escolhida para exercitar o padrão tool_use + `tool_choice`, e o mesmo padrão serve a agentes com mais tools. |
| Uma chamada por item | N vezes a latência e o overhead de prompt; sem ganho de qualidade para frases curtas. |
| Explicação sempre ligada, no caminho de 60 ms | Inviável: nenhuma chamada a LLM cabe nesse SLO. |
| Cliente Mantle do Bedrock (`AnthropicBedrockMantle`) | É o cliente recomendado para código novo, mas usa outro host; a VPC já tem endpoint de interface para `bedrock-runtime` e o emulador local cobre esse caminho. Rever quando houver endpoint privado para o Mantle. |
| Sonnet 5.5 ou Opus 5.5 | Mais caros e mais lentos para uma frase por item; além disso não aceitam `tool_choice` forçado (exigiriam `auto` + instrução). |
| Retentar dentro do SDK | Cada retentativa do SDK teria o próprio timeout; o orçamento total ficaria imprevisível. |

## Trade-offs

- Mais código que uma chamada simples (validação, disjuntor, categorias). Em troca, a API nunca quebra por causa do LLM e cada falha aparece no CloudWatch com o motivo.
- A lista de sinais é pequena de propósito: limita a expressividade, mas é o que torna a proveniência verificável por código.

## Custo

Por requisição com `explain=true`: ~1,5 mil tokens de entrada e ~400 de saída. Na tabela da API da Anthropic (US$ 0,10 / US$ 0,50 por milhão de tokens) dá ~US$ 0,00035; o preço do Bedrock é tabelado à parte pela AWS e deve ser conferido na página de preços. No pior caso (retentativa), o dobro. Mil requisições explicadas por dia no lab ficam abaixo de US$ 0,50 por dia. O endpoint de interface `bedrock-runtime` está no custo fixo do ADR-0002.

## Risco

- **Comportamento real do modelo sem validação (decisão D-006 do dono).** Todos os testes do componente usam respostas sintéticas, com custo de modelo zero; nenhum teste chama o Claude de verdade. A forma da saída está garantida pelo schema estrito e pela validação, mas a qualidade do texto, a taxa de acerto na primeira tentativa e a latência real não foram medidas.

- O Haiku 5.5 precisa estar habilitado na conta e na região (acesso ao modelo no console do Bedrock). Sem isso, a chamada falha com 403/404 e o serviço segue sem explicação.
- O id exato do modelo ou do perfil de inferência no Bedrock pode diferir do padrão; é uma variável do Terraform, e a política de IAM aceita o modelo direto e o perfil `us.` com o mesmo id.
- Texto gerado por modelo exibido a cliente: as regras de validação reduzem, mas não eliminam, frases ruins. Ver abaixo a revisão por amostragem.

## Tarefas da prova CCAR-F exercitadas

- 4.1 critérios explícitos no prompt; 4.2 few-shot com um exemplo de chamada; 4.3 saída estruturada via tool_use com `tool_choice` forçado; 4.4 validação e retentativa com o erro devolvido ao modelo.
- 2.1 descrição da tool e do schema; 2.2 erros estruturados (`is_error`, categoria, retentável); 2.3 uma única tool e `tool_choice` forçado.
- 1.4 gate programático: nada chega ao cliente sem passar pela validação.
- 5.3 propagação de erros (falha vira estado explícito, não exceção); 5.6 proveniência (`signals` com lastro e `source`).

## O que um arquiteto sênior faria em produção

- Gerar as explicações do top-N do batch **offline**, com inferência em lote do Bedrock (o equivalente da Message Batches API, tarefa 4.5, com desconto sobre o preço on-demand), e gravar junto das recomendações no DynamoDB. A chamada online fica só para itens da sessão.
- Amostrar explicações exibidas para revisão humana e calibrar as regras (5.5), com um avaliador automático em segunda instância (4.6) para tom e aderência.
- Cache por (item, sinais) para não pagar duas vezes a mesma frase.
- Guardrails do Bedrock para filtro de conteúdo e PII, e um teste de avaliação versionado para cada mudança de prompt ou de modelo.
