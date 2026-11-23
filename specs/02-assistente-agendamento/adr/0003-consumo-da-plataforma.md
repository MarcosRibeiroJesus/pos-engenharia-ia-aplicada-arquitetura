# ADR-0003: Consumo da plataforma `00-plataforma-agentes`

- **Status:** **pendente** (decisão do dono, D02-P3). Nada aqui está decidido; o plano descreve as três opções e recomenda uma
- **Data:** 2026-11-21 · **Autor:** arquiteto-aws (Claude Opus 5.5)

## Contexto
A D-030 diz que o produto consome da plataforma o gateway MCP, a política, o guardrail, o perfil de inferência e a observabilidade. O D02 nasceu antes da plataforma e tem uma diferença de forma:
- o modelo tem **uma única tool, `registrar_intencao`, que não executa nada**;
- quem chama as ações (agendar, abrir aprovação, cancelar) é o código, depois do gate, e não o modelo.

O gateway MCP e a política Cedar da plataforma controlam o que **o agente** chama. No D02, o agente não chama nenhuma ação. Além disso, a plataforma está em implementação (6 de 63 tarefas) e o primeiro consumidor dela é a D03 (D-034).

## Opções
| Opção | O que o D02 usa da plataforma | O que muda no D02 | Ordem e dependência | Custo do dia (só o D02, plano) |
|---|---|---|---|---|
| **A · consumo parcial** | módulo `registro-produto` sem alvos: perfis de inferência, guardrail, role do gateway de LLM com a condição de guardrail, role de aprovação e o alarme de intervenção | provedor pelo `bedrock-runtime` (ADR-0002); rota de aprovação restrita à role de aprovação (ADR-0004) | plataforma no ar antes do apply do D02 e destruída depois (ADR-0007 da plataforma); depende de uma versão menor do contrato com um perfil por modelo da cadeia | cerca de US$ 0,71 |
| **B · consumo completo** | A, mais o executor como alvo Lambda do gateway, com `agendar` permitido ao orquestrador e `cancelar` como tool `sensivel`, permitida só à role de aprovação | orquestrador e Step Functions passam a chamar o executor pelo gateway MCP com SigV4; novas gravações MCP | como A, e a política Cedar do D02 só é criada depois do alvo | cerca de US$ 0,72 (invocações e autorizações a frações de centavo) |
| **C · sem plataforma** | nada | guardrail e perfis de inferência criados no próprio stack; ADR de exceção à D-030 | nenhuma | cerca de US$ 0,71 |

O custo da plataforma no ar é o da `00-plataforma-agentes` (teto de US$ 1,20 aprovado, D-035), cobrado no stack dela, e entra no dia nas opções A e B.

## Decisão
Pendente (D02-P3). O custo de cada opção está na tabela acima e no plano.

## Recomendação
**A.** Boa prática: **consumir a capacidade compartilhada onde ela agrega controle, e não onde ela só acrescenta um salto.** O arquiteto aplica o guardrail e o custo por produto, que dão defesa na camada do modelo e atribuição de custo, sem forçar MCP num fluxo em que o código, e não o modelo, chama as ações. O erro comum que isso evita é o "MCP por obrigação": pôr o executor atrás de um gateway de tools que o modelo nunca chama, pagar latência e complexidade e ganhar uma política que repete o gate que já existe em código.

B passa a valer a pena se o produto evoluir para o modelo escolher ações (tool com efeito colateral), porque aí a política Cedar e a negação de `sensivel` ao agente viram a defesa principal. C é o caminho mais simples, mas cria um segundo jeito de configurar guardrail e perfil na conta, que é o que a D-030 quis evitar.

## Trade-offs
- A e B criam dependência de ordem com a plataforma e com o progresso dela.
- C não depende de ninguém, mas duplica o padrão de guardrail.

## Risco
Em A e B, se a plataforma não chegar à fase verificar antes da demonstração do D02, a demonstração espera ou precisa de C como plano B. Isso é registrado no plano como risco R1, sem decisão.

## Tarefas da prova exercitadas
1.4 (gate programático), 2.1 e 2.4 (em B: tools e MCP), 5.2 (escalonamento por aprovação).

## Curso Skilljar relacionado
*Introduction to Model Context Protocol* (opção B) e *Claude with Amazon Bedrock*.

## O que um arquiteto sênior faria em produção
Consumiria a plataforma da empresa pelo contrato versionado e registraria as ações como tools com classe no catálogo central assim que algum agente pudesse chamá-las, para que a política, e não cada time, decida quem executa ação sensível.
