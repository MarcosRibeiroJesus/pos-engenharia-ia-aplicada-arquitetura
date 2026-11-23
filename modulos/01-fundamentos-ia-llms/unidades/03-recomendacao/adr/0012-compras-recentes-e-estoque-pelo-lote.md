# ADR-0012: compras recentes e estoque pelos dados do lote, sem serviço novo

- Status: aceito (plano aprovado pelo dono em 2026-11-20, D-056)
- Data: 2026-11-20
- Projeto: `01-recomendacao` (D01, recomendação de e-commerce)
- Requisito: RF-104 (com RF-004 e RF-006); esclarecimento E7 da spec
- Curso Skilljar relacionado: AI Fluency (o teste prova o que roda)

## Contexto
A regra de não mostrar compras dos últimos 30 dias (RF-004) só funciona nos testes. O `buildDefaultUseCase`, que monta o serviço do contêiner, não injeta repositório de compras nem de estoque. A spec exige uma fonte real, sem serviço novo de custo fixo, e que a falha dela siga o RF-006: 200 e `degradedMode`, nunca 500.

## Decisão
- **Compras recentes:**
  - o job de publicação do DynamoDB grava `recentPurchases` (item e data, últimos 30 dias) no mesmo item do usuário que guarda as recomendações;
  - o serviço lê tudo no GetItem que já faz, então não há chamada nova.
- **Estoque:**
  - o lote grava `inStock` em cada recomendação do item do usuário e no hash do item no MemoryDB;
  - a consulta vetorial devolve o campo no `RETURN`.
- **Repositório real:** `InventoryEligibilityRepository` lê esses dados, já buscados pelo caso de uso, e o `buildDefaultUseCase` o injeta.
- **Falha da fonte:**
  - com o DynamoDB fora, não se sabe o que o usuário comprou;
  - a resposta segue com os candidatos vetoriais, `degradedMode: true` (já ligado pela falha do DynamoDB, RF-106) e a métrica;
  - qualquer exceção do repositório de elegibilidade vira degradação, nunca 500.
- **Frescor:** o do lote, diário. A documentação diz isso.

## Alternativas rejeitadas
| Alternativa | Por que não |
|---|---|
| Tabela de compras separada no DynamoDB | Mais uma chamada e mais um modo de falha no caminho de 60 ms, sem ganho no lab |
| Serviço de estoque em tempo real (Lambda + fila) | Escopo novo e mais peças, fora da spec |
| Manter o repositório só nos testes | O teste verde não provaria o que roda em produção |

## Trade-offs
- Uma compra feita hoje só some da recomendação no lote seguinte.
- O item do usuário cresce com a lista de compras, que é limitada a 30 dias.

## Custo
Nenhum custo novo: a mesma leitura e alguns bytes a mais por item.

## Risco
O item do DynamoDB passar de 400 KB num usuário com muitas compras. No lab, os volumes sintéticos ficam longe disso. A publicação limita a lista a 100 compras.

## Boa prática e erro comum (D-036)
**O teste prova o que roda em produção, e a falha segue o mesmo contrato de degradação.** O arquiteto monta o caminho real com a mesma composição que o teste usa e trata a falha da fonte nova como as outras. O erro comum é um teste verde com um repositório injetado que o serviço real nunca injeta (4.1, 5.3).

## O que um arquiteto sênior faria em produção
Eventos de pedido e de estoque em streaming (Kinesis ou EventBridge) atualizando um índice de supressão com TTL e o estoque no MemoryDB em segundos. O lote ficaria só como reconciliação.
