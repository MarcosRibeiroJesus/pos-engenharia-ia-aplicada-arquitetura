# ADR-0009: Serverless Inference sem isolamento de rede, com proteções substitutas

- Status: proposto (plano da D01 aguardando a aprovação do dono)
- Data: 2026-11-20
- Projeto: `01-recomendacao` (D01, recomendação de e-commerce)
- Curso Skilljar relacionado: Claude with Amazon Bedrock (serviços gerenciados na AWS)

## Contexto
O modelo do re-ranker tem `enable_network_isolation = true` e usa Serverless Inference. A [documentação do Serverless](https://docs.aws.amazon.com/sagemaker/latest/dg/serverless-endpoints.html) lista a configuração de VPC e o isolamento de rede entre os recursos sem suporte. A combinação nunca foi provada, porque o emulador não sobe o endpoint (ADR-0006).

O isolamento existia para garantir que o container não falasse com nada fora. A spec (E13) pede escolher entre tirar o isolamento com outra proteção ou usar um endpoint em instância.

## Decisão
- **Serverless sem isolamento de rede.** O Terraform reprova a combinação de Serverless com `enable_network_isolation` (TT-E03).
- **Proteções no lugar do isolamento:**
  - **imagem:** só o container nativo do XGBoost 1.7-1, publicado pela AWS, sem código nosso no endpoint (ADR-0008);
  - **artefato:** formato nativo do XGBoost, sem pickle, então o arquivo é dado e não código;
  - **escrita no artefato:** só a role de deploy escreve em `reranker/publicado/`, e o Terraform confere o `source_hash`;
  - **role de execução:**
    - lê só `reranker/publicado/*`, com `kms:Decrypt` via S3;
    - puxa só a imagem da conta oficial;
    - escreve só no log group do endpoint e publica métricas só no namespace do SageMaker;
    - não escreve em S3 nem chama outro serviço (TT-E02);
  - **payload:** só scores e flags numéricas, sem dado pessoal.

## Alternativas rejeitadas
| Alternativa | Por que não |
|---|---|
| Endpoint em instância (`ml.t2.medium` ou similar) com isolamento de rede e VPC | Custo por hora o dia todo (cerca de US$ 1,30 por dia a mais, a confirmar) e mais uma pergunta de custo ao dono. Ganho pequeno, porque não há código nosso no container |
| Manter o isolamento e torcer para a AWS aceitar | O apply falharia no dia da demonstração, com o relógio do teto correndo |
| Re-ranker dentro do serviço (modelo carregado no Node.js) | Perde o padrão do post de referência e o caminho de degradação do RF-005 |

## Trade-offs
- O container gerenciado pela AWS tem saída de rede fora do nosso controle. Isso é aceito porque ele não roda código nosso e não recebe dado sensível.
- A prova de que a configuração é aceita fica para o primeiro apply real (DM-06). O TT só garante que a combinação proibida não volta.

## Custo
Zero de mudança: o Serverless continua sem custo ocioso. A estimativa de uso do plano é de US$ 0,01 por dia.

## Risco
- **R1:** o Serverless quente pode não caber nos 35 ms do RF-005. Se o DM-05 mostrar isso, as saídas mudam custo ou SLO e viram pergunta ao dono.
- Um artefato adulterado só entra por quem tem escrita no prefixo publicado, ou seja, pela role de deploy.

## Boa prática e erro comum (D-036)
**Configuração que o serviço aceita, provada antes do passo caro, e controle compensatório explícito.** O arquiteto lê a lista de limitações do serviço, troca o controle que não existe por outros que existem e escreve um teste que impede a volta da combinação inválida. O erro comum é declarar um controle que o serviço ignora ou recusa e só descobrir no apply da demonstração (1.4, 5.6).

## O que um arquiteto sênior faria em produção
- **Hospedagem:** endpoint em instância dentro da VPC, com isolamento de rede, auto scaling e réplicas em duas AZs, ou um container de inferência próprio com imagem assinada.
- **Artefato:** modelos assinados e verificados no deploy.
- **Rede:** política de endpoint de VPC limitando o `sagemaker.runtime` ao endpoint do produto.
