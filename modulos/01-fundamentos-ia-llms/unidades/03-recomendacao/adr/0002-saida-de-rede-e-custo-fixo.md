# ADR-0002: saída de rede das tasks ECS e custo fixo do stack

- Status: aceito (padrão escolhido pelo dono do repositório em 2026-11-18)
- Data: 2026-11-18
- Unidade: 01.03 (recomendação)
- **Atualização (2026-11-23, T014):** a base tem 5 endpoints de interface (`ecr.api`, `ecr.dkr`, `logs`, `sagemaker.runtime` e `bedrock-runtime`). O `monitoring` saiu porque as métricas vão por EMF (ADR-0013). A `enable_mwaa` e o módulo do MWAA também saíram da base: o ambiente e os endpoints que só ele usa vivem na raiz da janela (ADR-0007). A parte de custo deste ADR foi substituída pelo ADR-0013. O corpo abaixo fica como registro da decisão original, e o TT-K02 (`custo_fixo.tftest.hcl`) e o ST-07 conferem o estado atual.

## Contexto

As tasks ECS ficam em subnets privadas, sem NAT e só com o endpoint de gateway do S3. Assim elas não conseguiam puxar a imagem (ECR), escrever logs (CloudWatch Logs), publicar métricas, chamar o SageMaker Runtime nem o Bedrock Runtime: o serviço nunca ficaria saudável. A imagem padrão vinha do `public.ecr.aws`, que também exige internet.

A regra do CLAUDE.md proíbe custo fixo ocioso sem ADR. Este ADR registra o padrão de saída e, junto, todo recurso do stack que cobra por hora.

## Decisão

Endpoints de interface (PrivateLink) para `ecr.api`, `ecr.dkr`, `logs`, `monitoring`, `sagemaker.runtime` e `bedrock-runtime`, com DNS privado, em **1 AZ no lab** (`interface_endpoint_az_count = 1`) e N AZs em produção. S3 e DynamoDB por endpoint de gateway (sem custo por hora). Com `enable_mwaa = true`, o módulo acrescenta `sqs`, `airflow.api`, `airflow.env` e `airflow.ops`.

Complementos:

- A imagem do serviço passa a vir de um repositório ECR do próprio stack (tags imutáveis, scan no push, KMS, `force_delete` no lab).
- O SG das tasks só sai em 443 para a VPC e para as prefix lists de S3/DynamoDB, e em 6379 para o MemoryDB. Nada vai para `0.0.0.0/0`.
- Internet gateway e subnets públicas só existem com `expose_api_publicly = true` (ADR-0003).

## Alternativas comparadas (us-east-1, preços públicos de 2026-11; confira na página de preços antes do apply)

| Opção | Custo por hora (lab) | 24/7 por mês | Por GB | Segurança |
|---|---|---|---|---|
| **Endpoints de interface, 1 AZ** (escolhida) | 6 × US$ 0,01 = US$ 0,06 | ~US$ 44 | US$ 0,01 | Tráfego não sai da rede da AWS; dá para pôr política de endpoint |
| NAT Gateway, 1 AZ | US$ 0,045 | ~US$ 33 | US$ 0,045 | Saída para qualquer destino na internet; exige controle de egress à parte |
| Subnet pública + IP público nas tasks | US$ 0,005 por IP | ~US$ 3,65 por task | US$ 0 (fora a transferência) | Quebra "nada público por padrão": cada task tem IP público |

Por que os endpoints, mesmo custando mais por hora que o NAT: o lab é efêmero (sobe, testa, destrói), então o que pesa é a hora ligada, não o mês; a diferença em 20 h de lab é de ~US$ 0,30. Em troca, as tasks não têm rota para a internet, o que é o padrão que um time de segurança exigiria em produção, e o custo por GB é 4,5 vezes menor que o do NAT, o que inverte a conta quando o tráfego cresce.

## Custo fixo do stack (inventário exigido pela regra R5)

Recursos que cobram por hora enquanto o stack existe, mesmo sem tráfego. Todos somem no destroy.

| Recurso | Terraform | Custo aproximado | Por que existe no lab |
|---|---|---|---|
| Endpoints de interface (6) | `aws_vpc_endpoint` | US$ 0,06/h | Saída privada das tasks (acima) |
| ALB interno | `aws_lb` | US$ 0,0225/h + LCU | Entrada do serviço; health check |
| MemoryDB `db.t4g.small`, 1 shard, 0 réplica | `aws_memorydb_cluster` | ~US$ 0,05/h | Busca vetorial do caminho em tempo real; é o padrão ensinado |
| 1 task Fargate (0,5 vCPU, 1 GB) | `aws_ecs_service` | ~US$ 0,025/h (base on-demand; o resto em Spot) | O serviço de recomendação |
| Chave KMS da plataforma | `aws_kms_key` | US$ 1/mês (proporcional) | Criptografia em repouso com chave do cliente (R2) |
| MWAA `mw1.small` | `aws_mwaa_environment` | ~US$ 0,49/h | **Desligado por padrão** (`enable_mwaa = false`); ligue só para validar o DAG |

Total com o padrão do lab: **~US$ 0,16/h**. Em 20 h de lab por mês: ~US$ 3,20, dentro do teto de US$ 10 do AWS Budgets. Se alguém esquecer o stack ligado, ~US$ 115/mês: o alerta de 80% do orçamento dispara em cerca de 2 dias.

## Trade-offs

- Endpoints em 1 AZ: tasks na outra AZ chegam por tráfego entre AZs (US$ 0,01/GB) e, se a AZ dos endpoints cair, o serviço perde ECR/Logs/Bedrock. Aceitável no lab; em produção, uma ENI por AZ.
- Cada serviço novo que as tasks chamarem precisa de um endpoint a mais (US$ 7,30/mês por AZ). Isso força uma conversa explícita sobre dependências, o que é bom.

## Risco

- Esquecer o stack ligado. Mitigação: Budgets com alerta em 80% e 100% (previsto), workflow de destroy e verificação de sobras por tag (ADR-0005).
- O endpoint `bedrock-runtime` não cobre o endpoint Mantle do Bedrock; o cliente usa o caminho InvokeModel (ADR-0004).

## Tarefas da prova CCAR-F exercitadas

5.3 (propagação de erros): sem rota para o Bedrock, a chamada falha por timeout e o serviço responde sem explicação em vez de propagar o erro (ADR-0004). Configuração de rede em si está fora do escopo da prova.

## O que um arquiteto sênior faria em produção

Endpoints em todas as AZs com política de endpoint restringindo às contas e recursos do serviço; endpoints compartilhados em uma VPC central (hub) com Route 53 Resolver para várias contas, diluindo o custo fixo; Fargate com auto scaling por requisições; MemoryDB com réplica; e uma revisão de custo fixo por ambiente no Infracost a cada PR.
