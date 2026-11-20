# ADR 0009 · Cobertura do Floci e lacunas

- **Status:** proposto (aprovação junto com o plano, D-033); emenda 1 com nova aprovação pendente
- **Data:** 2026-11-19; emenda 1 em 2026-11-20
- **Requisitos:** RNF-007, Art. III; CLAUDE.md, seção "TDD e regras de implementação"

## Contexto
A integração roda no Floci (`floci/floci:2.5.0`, D-013) e marca uma lacuna só com evidência. Pela documentação consultada em 2026-11-19 (a CLI `floci` não está disponível nesta sessão):

| Peça | Floci | Evidência |
|---|---|---|
| Gateway e alvos (plano de controle) | emulado | [AgentCore](https://floci.io/floci/services/bedrock-agentcore/): CRUD de gateways e alvos |
| Invocação MCP do gateway | não emulado | mesma página: sem execução real de tool, respostas fixas |
| Identity (provedores de credencial) | emulado | mesma página |
| Motor de política e políticas Cedar | não documentado | mesma página: só políticas de recurso |
| Guardrails | fora de escopo | [Bedrock Runtime](https://floci.io/floci/services/bedrock-runtime/) |
| `CreateInferenceProfile` | não descrito | mesma página: plano de controle do Bedrock "não emulado ainda" |
| Evaluations | não citado | página do AgentCore |
| KMS, SSM, SNS, Budgets, IAM, Tagging API | emulados | [lista de serviços](https://floci.io/floci/services/) |
| Alarmes do CloudWatch | emulado, só métrica única | [CloudWatch](https://floci.io/floci/services/cloudwatch/) |
| Entrega de logs | só guarda a configuração | mesma página |

## Decisão
- **Integração por composição de módulos, sem mudar código correto:**
  - o root de teste `plataforma/agentes/tests/floci/` aplica `nucleo`, `gateway`, `observabilidade` e `contrato`;
  - um produto sintético usa só a parte do `registro-produto` que o Floci emula: alvos, roles e o parâmetro do produto, por variável do próprio módulo que separa a parte não emulada (guardrail, perfil e políticas Cedar);
  - o produto sintético lê o contrato do SSM do Floci;
  - o módulo `gateway` recebe o ARN do motor de política como entrada de composição. O root real sempre o passa, e o TT-P01 afirma `policy_engine_configuration` presente e em `ENFORCE`; o root do Floci compõe sem o motor.
- **Campos do motor no root do Floci (emenda 1 do plano, 2026-11-20):**
  - os módulos `observabilidade` e `contrato` também recebem o id e o ARN do motor como entradas de composição obrigatórias;
  - no root real, os valores vêm do módulo `politica`, e o TT-P01 confere;
  - no root do Floci, vêm de valores sintéticos fixos declarados no próprio root de teste, no formato do mock do TT-P01;
  - o `v1.schema.json` continua exigindo `motor_politica_id` e `motor_politica_arn`;
  - os dois alarmes do motor nascem com a dimensão sintética, e o FL-01 afirma só a configuração deles;
  - o relatório marca os dois campos como sintéticos, com o link desta tabela.
- **Asserts no Floci:**
  - FL-01: alarmes;
  - FL-02: alvo registrado;
  - FL-03: contrato lido sem valor à mão;
  - FL-04: busca por tag vazia depois do destroy.
- **O que o Floci não prova:**
  - fica em TT (asserts do plan com mock provider), RG (respostas gravadas) e DM (evidência da demonstração real);
  - cada lacuna vai no relatório com o link desta tabela.
- **Variável de separação da parte não emulada:**
  - fica no módulo porque é útil também para produto sem Claude, como um produto só de tools, que não precisa de guardrail nem de perfil;
  - não é um "modo Floci";
  - o TT confere que o padrão liga tudo.

## Alternativas rejeitadas
- **Variável `floci = true` que desliga recursos:** mudaria o código para agradar o emulador (proibido pelo CLAUDE.md).
- **Campos do motor opcionais no schema** (emenda 1): enfraqueceria o contrato real que os produtos consomem só para o root do Floci passar, e a lacuna ficaria escondida.
- **LocalStack ou outro emulador para as lacunas:** a cobertura do AgentCore Policy e do Guardrails é a mesma incerteza; troca de ferramenta sem evidência de ganho.
- **Pular a integração:** contra o Art. III.

## Trade-offs
- **Ganho:** o Floci prova a parte que emula, e a política e o guardrail ficam provados por plan, gravações e demonstração.
- **Custo:** a avaliação real da política e do guardrail só aparece na demonstração; o ensaio antes da gravação compensa.

## Custo
US$ 0 (local ou no ambiente de nuvem).

## Risco
O Floci evolui e passa a emular o Policy. A tarefa de verificação reconsulta a documentação e, se houver cobertura nova, acrescenta o assert.

## Tarefas da prova
- 3.6: CI com testes determinísticos, sem chamada a serviço real.
- 5.6: lacuna marcada com fonte e incerteza explícita, sem completar de memória.

## Curso Skilljar relacionado
Claude Code in Action: testes e verificação no fluxo de CI.

## Em produção, um arquiteto sênior faria
- Uma conta de sandbox efêmera por PR para testes de integração dos serviços que nenhum emulador cobre, com destroy automático.
- O emulador só para o ciclo rápido.
