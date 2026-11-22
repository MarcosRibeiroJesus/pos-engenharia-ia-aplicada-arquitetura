# ADR-0004: Grafo da conversa na Lambda e aprovação humana durável no Step Functions

- **Status:** proposto (descreve o código atual e a correção da DV-11; vai com o plano)
- **Data:** 2026-11-21 · **Autor:** arquiteto-aws (Claude Opus 5.5)

## Contexto
Um turno de conversa dura segundos e precisa ser síncrono. A espera pelo aprovador pode durar horas. Hoje o grafo LangGraph.js roda dentro da Lambda `orquestrador`, e o cancelamento abre uma execução Step Functions Standard que espera com `waitForTaskToken` e só então chama o executor. O `aprovadorId` da rota `POST /v1/aprovacoes/{acaoId}` vem do corpo (DV-11): qualquer principal da conta com a chave de API pode aprovar dizendo ser outra pessoa.

## Decisão
1. **Dois orquestradores, cada um no seu tempo:** o grafo em código para o turno (rápido, testável com funções puras e respostas gravadas) e o Step Functions para a espera humana (pausa sem compute, histórico de execução como trilha de auditoria, timeout de `timeout_aprovacao_s` que leva a `EXPIRADA`).
2. **Idempotência pelo nome da execução** (`acaoId`) e transações condicionais no executor, como hoje.
3. **Identidade do aprovador pela autenticação (correção da DV-11):**
   - a rota de aprovação só aceita a role de aprovação do produto (política de recurso da API por método, e a role com `execute-api:Invoke` só nesse método);
   - o `aprovadorId` gravado na ação é o ARN completo da sessão assumida (`requestContext.identity.userArn`), e não um campo do corpo; o corpo continua com `decisao` e `motivo`;
   - como o nome da sessão é livre para quem assume a role, a política de confiança da role de aprovação exige `sts:SourceIdentity` (ou `sts:RoleSessionName` igual a `${aws:username}`) e lista quem pode assumi-la; assim o nome gravado é o do humano autenticado. Na opção A ou B do ADR-0003, essa condição é pedida ao módulo `registro-produto` como versão menor do contrato (mesmo pedido do R2 do plano);
   - continua proibido o aprovador ser o paciente da consulta.
4. Com a opção A ou B do ADR-0003, a role de aprovação é a do módulo `registro-produto` (`02-assistente-agendamento-aprovacao`); com C, ela nasce no stack do D02.

## Alternativas rejeitadas
- **Esperar o humano dentro do grafo (checkpoint do LangGraph em DynamoDB).** Rejeitada: o turno ficaria aberto ou precisaria de um mecanismo de retomada próprio; o Step Functions já dá pausa, timeout e histórico.
- **Grafo inteiro no Step Functions.** Rejeitada: cada nó viraria uma Lambda e uma transição cobrada, e os testes das arestas deixariam de ser funções puras.
- **Aprovação por link com token no e-mail.** Rejeitada: o token vira segredo num canal fraco; a aprovação autenticada por IAM é auditável.

## Trade-offs
Dois mecanismos de orquestração para entender e operar. A aprovação autenticada exige que o demonstrador assuma a role de aprovação no roteiro.

## Custo
Step Functions Standard a US$ 0,000025 por transição: frações de centavo no dia (plano).

## Risco
Um aprovador com a role errada recebe 403 e a ação expira no fim do prazo (o tempo restante do stack menos 1 h), sem cancelar: falha segura.

## Tarefas da prova exercitadas
1.4 (workflow com gate e handoff para humano), 5.2 (escalonamento), 5.5 (revisão humana).

## Curso Skilljar relacionado
*Building with the Claude API*.

## O que um arquiteto sênior faria em produção
Usaria identidade federada para os aprovadores (IAM Identity Center ou o IdP da clínica), separação de funções por grupo, e um painel de pendências sobre o histórico do Step Functions com alarme de pendências perto do timeout.
