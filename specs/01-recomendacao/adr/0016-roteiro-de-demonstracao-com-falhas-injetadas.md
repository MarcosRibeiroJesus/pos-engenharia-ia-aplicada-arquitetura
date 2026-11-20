# ADR-0016: roteiro de demonstração por tarefa ECS avulsa, com falhas injetadas por configuração

- Status: proposto (plano da D01 aguardando a aprovação do dono)
- Data: 2026-11-20
- Projeto: `01-recomendacao` (D01, recomendação de e-commerce)
- Requisito: RF-108; DM-01 a DM-10 do plano
- Curso Skilljar relacionado: Claude with Amazon Bedrock; Building with the Claude API (avaliação com casos reais)

## Contexto
O RF-108 pede um roteiro versionado, com dados sintéticos, que gere evidência no stack real. São quatro passos:
1. uma recomendação híbrida;
2. uma explicação aceita na primeira tentativa;
3. uma explicação que cai no fallback;
4. um modo degradado com uma dependência desligada.

Três obstáculos:
- O ALB é interno, então um runner do GitHub não alcança a API.
- Os passos 3 e 4 precisam acontecer de forma previsível, sem porta dos fundos no serviço.
- O DAG roda num MWAA com webserver privado.

## Decisão
1. **Workflow `01-recomendacao-roteiro.yml`:**
   - só `workflow_dispatch`, com o input `parte` igual a `lote` ou `servico`;
   - ambiente `aws-lab`, com aprovação;
   - OIDC só no job;
   - relatório como artefato de 1 dia, revisado pelo dono antes de entrar no repositório (5.5).
2. **Parte `lote`:**
   - liga o DAG e dispara uma execução pelo `InvokeRestApi` do MWAA, que funciona com webserver privado e exige `airflow:InvokeRestApi` e `airflow:CreateWebLoginToken` na role do Airflow ([REST API](https://docs.aws.amazon.com/mwaa/latest/userguide/access-mwaa-apache-airflow-rest-api.html));
   - consulta o estado em intervalos, porque cada chamada tem timeout de 10 s;
   - registra o `dag_run_id` e o candidato do re-ranker.
3. **Parte `servico`:** `aws ecs run-task` com a mesma imagem e o mesmo task definition do serviço, com outro comando (`node dist/roteiro.js`) e variáveis sobrepostas só nesta tarefa:
   - **aquecimento:** chamadas ao re-ranker até a resposta vir sem cold start, com o cold start registrado (R2);
   - **passos 1 e 2:** contra o ALB interno; o passo 2 registra as tentativas;
   - **passo 3:** um servidor do próprio serviço, dentro da tarefa, com `EXPLANATION_TIMEOUT_MS=1`, o que dá `unavailable/timeout` pelo caminho real;
   - **passo 4:** um servidor dentro da tarefa com `MEMORYDB_CLUSTER_ENDPOINT` apontando para uma porta fechada da VPC, o que dá `degradedMode: true` e `MemoryDbFallbackCount` pelo adaptador real (RF-106);
   - **evidência:** cada passo grava o `requestId`. A tarefa calcula a latência p95 sem explicação sobre 200 chamadas e lê as métricas do namespace.
4. **O serviço no ar não é alterado:** nenhum cabeçalho, flag ou rota de teste em produção.

## Alternativas rejeitadas
| Alternativa | Por que não |
|---|---|
| API pública com certificado | Exige domínio e ACM do dono e abre a API durante o dia |
| ECS Exec no serviço | Mais um endpoint (`ssmmessages`) e acesso interativo ao contêiner de produção |
| Cabeçalho de teste para forçar falha | Porta dos fundos em produção |
| Revogar a regra do security group durante o passo 4 | Drift do Terraform; uma falha no meio deixa o serviço quebrado |
| AWS FIS | Mais um serviço e custo por ação-minuto para um efeito que a configuração da tarefa já dá |

## Trade-offs
- Os passos 3 e 4 rodam numa instância do serviço dentro da tarefa, não no serviço atrás do ALB. Eles provam o código e a rede reais, não o balanceamento.
- O workflow precisa de `iam:PassRole` para as roles da tarefa, limitado às roles `01-recomendacao-*` (ADR-0015).

## Custo
4 tarefas de 2 minutos: cerca de US$ 0,003. A chamada ao `InvokeRestApi` não tem custo próprio documentado.

## Risco
- O passo 2 depende do modelo real e pode precisar de retentativa. O relatório registra as tentativas, e isso é dado, não falha.
- O Floci não tem `InvokeRestApi`. No FL, o DAG é verificado pelo token de login web.

## Boa prática e erro comum (D-036)
**Evidência reproduzível do caminho real, com revisão humana antes de publicar.** O arquiteto provoca cada falha por configuração isolada, mede com o mesmo código de produção e passa o relatório por uma pessoa antes de usá-lo como prova. O erro comum é montar a demonstração com atalhos no serviço de produção, ou publicar números que ninguém revisou (1.4, 5.3, 5.5, 5.6).

## O que um arquiteto sênior faria em produção
- **Caos em ambiente de pré-produção:** experimentos com o AWS FIS, gatilhos de parada e alarmes.
- **Monitoramento sintético:** CloudWatch Synthetics para o caminho feliz.
- **Avaliação das explicações:** um conjunto fixo de casos rodado a cada mudança de prompt ou de modelo.
