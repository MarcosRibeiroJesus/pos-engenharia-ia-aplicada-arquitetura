---
title: "Recomendação do lote ao tempo real na AWS, com um LLM que explica sem inventar"
tema: "Sistemas de recomendação"
data: 2026-11-19
status: rascunho para revisão
---

# Recomendação do lote ao tempo real na AWS, com um LLM que explica sem inventar

Quase todo sistema de recomendação maduro tem duas velocidades. O histórico de compras muda devagar e cabe num job noturno; o que o cliente está olhando agora muda a cada clique e não espera o próximo lote. Este post mostra uma arquitetura de lab que junta as duas velocidades na AWS, com Terraform testado, e acrescenta um componente com Claude que escreve "por que você está vendo isto" sem poder inventar o motivo.

## A referência

O ponto de partida é o post "Building a scalable personalized recommendation system on AWS: From batch to real-time", do AWS Big Data Blog ([link](https://aws.amazon.com/blogs/big-data/building-a-scalable-personalized-recommendation-system-on-aws-from-batch-to-real-time/), lido em 2026-11-19). Nele, um time da Amazon.com conta como montou uma arquitetura **batch-first**: golden datasets em S3 governados pelo Lake Formation, pipelines no MWAA que leem pelo Athena, transformam no Glue e treinam no SageMaker, e recomendações pré-calculadas no DynamoDB servidas por um serviço em ECS. Depois o time estendeu o desenho com MemoryDB para busca vetorial, para sinais da sessão que não podem esperar o ciclo do lote.

A lição que eu levo do post, nas minhas palavras: lote e tempo real não competem. O lote cuida dos sinais lentos, o tempo real dos rápidos, e um re-ranking na hora da requisição dá a sensação de frescor sem pagar a geração de candidatos em tempo real.

O que segue **não** é o sistema da Amazon.com. É um lab com dados sintéticos e a menor escala que demonstra o padrão. Onde eu vou além do post, digo que é decisão minha.

## A arquitetura do lab

```
Lote (diário)                         Requisição (p95 < 60 ms)
S3 golden (KMS) → Athena → Glue       ALB interno → ECS Fargate
          ↓                ↓             ├─ DynamoDB (candidatos do lote)
   SageMaker treino Spot   ├→ DynamoDB   ├─ MemoryDB (vizinhos por vetor, TLS)
                           └→ MemoryDB   ├─ SageMaker Serverless (re-ranking)
MWAA orquestra (desligado por padrão)    └─ Bedrock / Claude (só com explain=true)
```

O serviço busca os dois conjuntos de candidatos em paralelo, junta e marca a proveniência (`batch`, `realtime`, `hybrid`), aplica as regras de negócio (nada fora de estoque, nada comprado nos últimos 30 dias), pede o score ao SageMaker e devolve o top-N. Cada dependência tem um degrau de degradação: SageMaker lento vira uma heurística ponderada; MemoryDB fora do ar vira só lote; usuário sem histórico vira só tempo real; tudo fora do ar vira catálogo curado. A API não devolve 500 por falha de dependência, e cada degrau tem teste.

## Três decisões de arquiteto

**1. Saída de rede sem NAT.** As tasks ficam em subnets privadas sem rota para a internet. Para puxar imagem, escrever log e chamar SageMaker e Bedrock, usei endpoints de interface (ECR, Logs, CloudWatch, SageMaker Runtime, Bedrock Runtime) e de gateway (S3, DynamoDB). Por hora, seis endpoints em uma AZ custam mais que um NAT Gateway (US$ 0,06 contra US$ 0,045), mas o tráfego não sai da rede da AWS e o custo por GB é 4,5 vezes menor. Num lab que sobe, testa e destrói, a diferença em 20 horas é de centavos. Em produção, uma ENI por AZ.

**2. Custo fixo explícito.** Todo recurso que cobra por hora parado (endpoints, ALB, MemoryDB, task Fargate, chave KMS, MWAA) aparece num inventário no ADR, e um teste falha se alguém acrescentar um recurso desses sem citá-lo. O MWAA, o mais caro, fica desligado por padrão. Total do lab: cerca de US$ 0,16 por hora. O AWS Budgets tem teto de US$ 10 por mês com alerta em 80%: se o stack ficar esquecido ligado, o alerta chega em uns dois dias.

**3. Privado por padrão, público só com opt-in.** ALB interno; a API pública exige uma variável explícita e um certificado, e o plan falha sem ele. MemoryDB com TLS, KMS do cliente em tudo, e IAM sem `Resource = "*"` exceto onde a própria AWS não aceita ARN (como `cloudwatch:PutMetricData`), e aí com condição de namespace.

## O componente com Claude: explicar sem inventar

O cliente vê "Fone de ouvido sem fio" e quer saber por quê. Com `explain=true`, o serviço manda o top-N para o Claude Haiku 5.5 no Bedrock e recebe uma frase por item. O cuidado está em quatro lugares:

- **Saída estruturada por tool_use.** Uma única tool, `record_explanations`, com schema estrito, e `tool_choice` forçando a chamada. O formato vem garantido; o conteúdo, não.
- **Proveniência verificável.** O próprio serviço calcula, a partir dos dados, quais sinais cada item pode citar: "histórico de compras" só se o item veio do lote; "itens parecidos" só se veio da busca vetorial. O modelo recebe essa lista e a resposta é rejeitada se citar um sinal sem lastro, prometer desconto ou usar números.
- **Retentativa com o erro.** Se a validação falha, a resposta do modelo fica no histórico e a próxima mensagem é um `tool_result` com `is_error: true` listando cada problema. Uma retentativa, dentro de um orçamento total de 2,5 s.
- **Fallback que não aparece para o cliente.** Timeout, 429, 5xx, recusa ou validação reprovada viram um estado explícito (`explanation.status = unavailable` com a categoria), as recomendações saem iguais e sem explicação, e uma métrica com alarme conta quantas vezes isso aconteceu. Um disjuntor para de chamar o Bedrock depois de falhas seguidas.

A explicação fica fora do SLO de 60 ms de propósito: nenhuma chamada a LLM cabe nele. Em produção, eu geraria as explicações do top-N do lote offline, com inferência em lote do Bedrock, e guardaria junto das recomendações.

## Como foi testado

- **Regras antes do código.** As regras do repositório (nada público, criptografia, menor privilégio, tags, custo ocioso, logs e alarmes, destroy limpo, state com lock, orçamento) viraram 20 blocos de `terraform test` com mock provider, vermelhos antes da implementação. Mais checkov sem falhas (as exceções justificadas no próprio recurso) e tflint.
- **Serviço.** 39 testes Vitest, incluindo 13 do componente com Claude contra um cliente falso: schema, retentativa, sinais inventados, recusa, 429, timeout, disjuntor.
- **Integração.** Apply real contra o emulador Floci, com o backend S3 e o lock apontando para o emulador, asserts por regra e destroy. O emulador não cobre o MemoryDB nem o endpoint do SageMaker; esses recursos ficam provados no plan e nos testes de unidade, e o relatório marca cada lacuna com a mensagem do próprio emulador como evidência. A integração encontrou um bug real: o Lake Formation recusa como principal o ARN de quem roda o Terraform. A correção concede as permissões à role do Glue, que é quem usa o catálogo.

## O que fica para depois

Autenticação IAM no MemoryDB, WAF quando a API for pública, explicações geradas em lote e um eval com o modelo real para a qualidade do texto. O código, os ADRs e o relatório de teste estão no repositório da unidade.

---

*Fonte: AWS Big Data Blog, "Building a scalable personalized recommendation system on AWS: From batch to real-time", lido em 2026-11-19. Os detalhes do sistema da Amazon.com citados aqui vêm só desse post; a arquitetura do lab é minha.*
