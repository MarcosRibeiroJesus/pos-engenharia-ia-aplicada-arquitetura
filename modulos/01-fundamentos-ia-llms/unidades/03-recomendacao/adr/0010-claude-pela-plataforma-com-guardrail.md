# ADR-0010: Claude pelo perfil e pelo guardrail da plataforma, com guardrail imposto por IAM e revisão da saída

- Status: aceito (plano aprovado pelo dono em 2026-11-20, D-056)
- Data: 2026-11-20
- Projeto: `01-recomendacao` (D01, recomendação de e-commerce)
- Decisões aplicadas: D-030 e D-034 (plataforma), D-053 (guardrail sem tópico extra), D-006 (testes com respostas gravadas)
- Complementa o ADR-0004 (explicação com Claude no Bedrock), que continua valendo para prompt, schema, validação e retentativa
- Curso Skilljar relacionado: Claude with Amazon Bedrock; Building with the Claude API

## Contexto
Hoje o serviço chama o Bedrock direto, com IAM sobre o modelo e um perfil `us.` escrito à mão, e sem guardrail. A spec (RF-110) manda consumir da `00-plataforma-agentes` o perfil de inferência de aplicação, o guardrail e a observabilidade, sem o gateway MCP (E1).

Fatos que moldam a decisão (consulta em 2026-11-20):
- **Modelo e região:** o Haiku 5.5 (`anthropic.claude-haiku-5-5`) não tem invocação na própria região em `us-east-1`, só pelos perfis `us.` e `global.`. Ele aceita guardrail no `bedrock-runtime` ([model card](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-haiku-5-5.html)).
- **Cabeçalhos do guardrail:** o InvokeModel aplica o guardrail pelos cabeçalhos `X-Amzn-Bedrock-GuardrailIdentifier` e `X-Amzn-Bedrock-GuardrailVersion`. Sem o identificador, nenhum guardrail é aplicado, e o identificador sem versão dá erro ([InvokeModel](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_InvokeModel.html)).
- **Sinal de intervenção:** a resposta traz `amazon-bedrock-guardrailAction` com `INTERVENED` ou `NONE` ([testar guardrail](https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails-test.html)).
- **Assinatura:** o `@anthropic-ai/bedrock-sdk` 1.1.2 não tem opção própria de guardrail, mas assina a requisição com SigV4 depois de montar os cabeçalhos (código do pacote, `client.js`). Os cabeçalhos por requisição entram na assinatura.
- **Alcance do guardrail:** ele não alcança parâmetros nem resultados de tool ([AWS Security Blog](https://aws.amazon.com/blogs/security/extend-amazon-bedrock-guardrails-to-tool-interactions-using-the-strands-agents-sdk/), 2026-08-27). As frases do D01 saem justamente como parâmetro da tool `record_explanations`.

## Decisão
1. **Registro na plataforma** pelo módulo `registro-produto`, no state da D01:
   - modelo de origem `us.anthropic.claude-haiku-5-5`;
   - tópicos negados vazios (D-053);
   - um agente `explicador`, assumido por `ecs-tasks.amazonaws.com`, cuja role é a task role do serviço;
   - nenhum alvo.
2. **Configuração pelo contrato:** o ARN do perfil e o id e a versão do guardrail vêm do parâmetro `produtos/01-recomendacao`, lido por data source no plan e passado ao task definition. Nenhum ARN do Bedrock fica escrito à mão (ST-06).
3. **Chamada:**
   - `AnthropicBedrock` no caminho InvokeModel, com `model` igual ao ARN do perfil;
   - cabeçalhos de guardrail por requisição;
   - `X-Amzn-Bedrock-Trace` ausente, para o trace (sem máscara) não voltar e não ir para log.
4. **IAM fecha o caminho sem guardrail:**
   - a task role é a do agente que o módulo `registro-produto` cria, e o ECS não acrescenta ação do Bedrock;
   - as ações do Bedrock ficam só em `bedrock:InvokeModel` (a ação de IAM que também autoriza o `Converse`, [pré-requisitos de inferência](https://docs.aws.amazon.com/bedrock/latest/userguide/inference-prereq.html), consulta em 2026-11-20) no perfil e nos modelos de origem dele, com as condições `bedrock:InferenceProfileArn` e `bedrock:GuardrailIdentifier`, e em `bedrock:ApplyGuardrail` só no próprio guardrail;
   - o módulo também concede `bedrock-agentcore:InvokeGateway` no gateway e `ssm:GetParameter` no contrato, que ficam como risco residual do R9, sem rota na VPC da base (linha E do STRIDE do plano, emenda 1);
   - uma chamada sem o guardrail recebe 403, não retentável.
5. **Entrada marcada:** só os campos de catálogo (título e categoria) vão entre as marcas de entrada do guardrail, com sufixo aleatório por requisição, porque são o ponto de injeção indireta.
   - **Nota de 2026-11-23 (T083, VT-17): FORMATO A CONFIRMAR.**
     - **O que está implementado** (`recommendation-explainer.ts`):
       - o prefixo `amazon-bedrock-guardrails-guardContent_<sufixo>`;
       - o campo `amazon-bedrock-guardrailConfig.tagSuffix` no corpo do InvokeModel;
       - o sufixo com 8 a 20 caracteres, só minúsculas e dígitos (gerado por `crypto.randomBytes`).
     - **Sem fonte aberta nesta sessão:** a documentação da AWS não pôde ser consultada. Os três itens estão marcados no código como "FORMATO A CONFIRMAR".
     - **A confirmar antes da demonstração (DM-08, T107):**
       - que o InvokeModel aceita o corpo com `tagSuffix`;
       - que o guardrail avalia só o trecho marcado;
       - se o Bedrock retira as marcas antes de entregar o texto ao Claude.
     - **Se o formato estiver errado:** o efeito é um 400, que vira `model_error` não retentável, e a explicação some (falha fechada); o fallback do RF-007 continua.
6. **Leitura da resposta:**
   - `amazon-bedrock-guardrailAction` com `INTERVENED` vira a categoria nova `guardrail`, não retentável, com o fallback do RF-007;
   - sem o campo e sem `tool_use`, a resposta segue a validação de hoje.
7. **Revisão da saída:**
   - as frases aprovadas na validação passam por um `ApplyGuardrail` com `source=OUTPUT`;
   - uma intervenção vira `guardrail`, e um erro da chamada segue as categorias do RF-007;
   - tudo cabe no orçamento de 2,5 s.
8. **Falha fechada:** sem configuração do contrato, o explicador não chama o modelo e devolve `unavailable` com `internal_error`.

## Alternativas rejeitadas
| Alternativa | Por que não |
|---|---|
| Trocar para o Converse com `guardrailConfig` | Troca o cliente e a forma da tool no meio do projeto; o caminho do Converse também não avalia o conteúdo de tool |
| `ApplyGuardrail` antes e depois, sem guardrail no InvokeModel | Duas chamadas a mais; perde a imposição por IAM, que é o que garante que nenhum caminho do código chame sem guardrail |
| Só o guardrail do InvokeModel, sem revisão da saída | Deixaria a frase, que está no parâmetro da tool, sem passar pelo filtro |
| Guardrail próprio da D01 | Duplica a governança da plataforma (E1) |
| Gateway MCP | A D01 não tem tool de ação; o gateway só traria custo e superfície |

## Trade-offs
- São duas chamadas ao Bedrock por requisição explicada, a InvokeModel e o `ApplyGuardrail`, que somam latência dentro do orçamento de 2,5 s, fora do SLO de 60 ms.
- O guardrail custa mais que o modelo: cerca de US$ 0,45 contra US$ 0,15 por dia, nas premissas do plano. O controle principal continua sendo a validação por código. O guardrail é defesa em camadas.
- A task role nasce no módulo da plataforma, e o ECS só acrescenta as políticas dele. Fica uma role, com duas origens de política.

## Custo
Por requisição explicada, no pior caso: cerca de US$ 0,00077 de modelo, com retentativa, e US$ 0,00225 de guardrail. Para 200 explicações por dia, cerca de US$ 0,60 (plano, seção "Custo do lab").

## Risco
- **R4:** o campo de intervenção pode não chegar pelo SDK. O desenho fecha pela validação, e o DM-08 captura o formato real.
- **R9:** o módulo da plataforma ainda não existe; as tarefas do RF-110 dependem dele. O módulo dá `InvokeGateway` ao agente mesmo sem alvo. Sem `permit` no Cedar, a chamada ao gateway é negada. Fica a sugestão de uma versão menor da plataforma.
- **R7:** o custo do Claude vai pelo AWS Marketplace e pode não aparecer no Budgets filtrado pela tag.

## Boa prática e erro comum (D-036)
**Acesso ao modelo governado num ponto só, imposto fora do código, e erros com categoria.** O arquiteto põe atribuição de custo e filtro de conteúdo na plataforma, garante pelo IAM que nenhum caminho chama o modelo sem guardrail e trata a intervenção como categoria própria, não retentável. O erro comum é passar o guardrail só por convenção no código, onde um caminho esquecido chama sem ele, ou retentar uma intervenção como se fosse falha temporária (1.4, 2.2, 2.3, 4.3, 4.4, 5.2, 5.3, 5.6).

## O que um arquiteto sênior faria em produção
- **Explicações offline:** gerar as explicações do top-N no lote, com a inferência em lote do Bedrock (tarefa 4.5), e guardar junto da recomendação.
- **Guardrail no texto final:** aplicar o guardrail só ao texto exibido, com cache por item e sinais.
- **Calibração:** amostragem para revisão humana (5.5) e um avaliador automático em outra instância (4.6).
