# ADR-0005: Memória própria em DynamoDB, com TTL, proveniência e direito de apagar

- **Status:** proposto (descreve o código atual; vai com o plano)
- **Data:** 2026-11-21 · **Autor:** arquiteto-aws (Claude Opus 5.5)

## Contexto
A memória guarda turnos, resumo, candidatos da última pergunta, fatos e preferências. A âncora usa o AgentCore Memory (curto e longo prazo, chaveado por ator). O material da disciplina mostra memória com bancos relacionais; isso exigiria um servidor sempre ligado.

## Decisão
Memória numa tabela DynamoDB sob demanda, com KMS do cliente e PITR, uma partição por paciente (`USUARIO#<id>`) e chave de ordenação por tipo de item, com TTL por tipo (7 dias turnos, 30 dias resumo, 1 hora candidatos, 90 dias fatos; preferências sem TTL). Fatos só pelo código; preferências por allowlist e só com origem `mensagem`; mensagem bloqueada entra mascarada. Apagar é Query mais exclusões na partição.

## Alternativas rejeitadas
- **AgentCore Memory, como a Natera.** Rejeitada no lab: o plano de dados não tem emulação confirmada no Floci, e o direito de apagar e a guarda da memória precisariam ser provados contra o serviço real. Fica como caminho de produção.
- **Checkpointer do LangGraph em DynamoDB.** Rejeitado: guarda o estado do grafo, não fatos com proveniência e TTL por tipo.
- **Postgres ou SQLite, como na aula.** Rejeitado: servidor para operar e custo fixo.

## Trade-offs
Mais código próprio (memória e guarda) em troca de custo ocioso zero e testes rápidos.

## Custo
Escritas a US$ 0,625 e leituras a US$ 0,125 por milhão de unidades; armazenamento de KB. Centavos no dia (plano).

## Risco
O TTL do DynamoDB apaga em até alguns dias depois do vencimento; a leitura filtra itens vencidos pelo campo `expira_em`, e o teste de memória cobre isso.

## Tarefas da prova exercitadas
5.1 (preservação de contexto com resumo), 5.6 (proveniência das preferências).

## Curso Skilljar relacionado
*Building with the Claude API*.

## O que um arquiteto sênior faria em produção
Avaliaria o AgentCore Memory pelo isolamento e pela estratégia de longo prazo gerenciada, mantendo a guarda de memória e o apagamento como requisitos de aceite do serviço.
