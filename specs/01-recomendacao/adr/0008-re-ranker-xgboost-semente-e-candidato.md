# ADR-0008: re-ranker XGBoost com artefato semente, candidato sem promoção automática e contrato CSV

- Status: proposto (plano da D01 aguardando a aprovação do dono)
- Data: 2026-11-20
- Projeto: `01-recomendacao` (D01, recomendação de e-commerce)
- Decisão do dono aplicada: D-051 (lab sintético fechado, com um XGBoost pequeno)
- Curso Skilljar relacionado: Claude with Amazon Bedrock (padrões de serviço na AWS); Building with the Claude API (validação de contrato)

## Contexto
O endpoint do re-ranker usa a imagem do XGBoost com `model_data_url` nulo. Sem modelo, ele não sobe (RF-109). O cliente do serviço manda um JSON próprio (`userId`, `candidates`) e espera `{modelId, predictions}`, mas o container nativo do XGBoost não fala esse contrato.

O DAG só roda na janela do MWAA (ADR-0007), e o endpoint precisa de um modelo desde o apply da base. Se o artefato dependesse do DAG, a base precisaria de um segundo apply, com aprovação, no meio da demonstração.

A partir da versão 1.3-1, o container nativo grava o modelo com `Booster.save_model`, e não com pickle ([XGBoost](https://docs.aws.amazon.com/sagemaker/latest/dg/xgboost-how-to-use.html)).

## Decisão
1. **Um único código de treino** (`U/src/batch/sagemaker/train_reranker.py`):
   - XGBoost 1.7 com `binary:logistic`;
   - 3 features: `batchScore`, `vectorScore` e `hibrido`;
   - rótulo sintético gerado por uma regra conhecida com ruído, semente fixa e `nthread = 1`;
   - formato nativo (`save_model`), sem pickle.
2. **Artefato semente publicado pelo apply:**
   - o job de apply roda o script com `xgboost==1.7.6`, sobre os dados sintéticos da mesma semente, e empacota `model.tar.gz`;
   - o Terraform sobe o arquivo em `reranker/publicado/<hash>/model.tar.gz`, com `source_hash`;
   - `model_data_url` aponta para esse caminho, e o hash entra no nome do modelo e na variável `RERANKER_MODEL_VERSION` do serviço.
3. **Candidato do DAG sem promoção:**
   - o DAG treina o mesmo script no SageMaker Training (container nativo 1.7-1, Spot) e grava em `reranker/candidatos/<ds>/`;
   - promover um candidato é um deploy pelo apply, nunca uma ação do DAG;
   - o DM-07 compara as predições do candidato com as da semente num conjunto fixo, com tolerância de 1e-6.
4. **Contrato CSV:**
   - o cliente do serviço converte os candidatos em linhas CSV (`text/csv`) e lê um score por linha, na ordem;
   - número de scores diferente do de candidatos vira erro de contrato, que leva à heurística do RF-005;
   - o contrato JSON legado sai.

## Alternativas rejeitadas
| Alternativa | Por que não |
|---|---|
| Endpoint criado só depois do DAG, num segundo apply da base | Dois applies com aprovação no meio da demonstração; o novo `registrar` também reabriria o prazo de 24 h |
| DAG que cria modelo e endpoint pela API | Recursos fora do Terraform escapam do destroy e da verificação de sobras |
| (B) Job de treino disparado pelo apply | Fica como saída do risco R3; hoje é mais lento e mais caro que o treino local de segundos |
| Modo script com `inference.py` próprio para manter o JSON | Põe código nosso dentro do endpoint, e o Serverless não tem isolamento de rede (ADR-0009) |
| Artefato binário versionado no git | Binário gerado no repositório, sem prova de origem; o build reproduzível e o teste de determinismo dão a mesma garantia |

## Trade-offs
- O job de apply ganha um passo de build com Python e `xgboost`, como já acontece com a imagem do serviço.
- A semente e o candidato são o mesmo modelo por construção. O lab demonstra o pipeline e a reprodutibilidade, não um ganho de qualidade.
- As 3 features são poucas de propósito: só usam o que o serviço tem na hora do pedido.

## Custo
- Treino local: segundos, no runner do GitHub.
- Treino no DAG: cerca de US$ 0,01 por execução com Spot (US$ 0,023 por duas execuções no pior caso on-demand, na tabela de custo do plano).
- Armazenamento: KB no S3.

## Risco
- **R3:** o container nativo pode não carregar um modelo treinado fora dele. Mitigação: mesma versão, mesmo formato e falha cedo no apply (DM-06).
- O determinismo do XGBoost entre o runner e o container depende da versão e do `nthread`. Mitigação: PY-03 e a tolerância do DM-07.

## Boa prática e erro comum (D-036)
**Gate programático antes da produção e saída validada contra o contrato.** O arquiteto separa quem treina de quem promove, valida a forma da resposta antes de usá-la e cai num caminho conhecido quando ela não confere. O erro comum é deixar o pipeline de treino trocar o modelo de produção sozinho, ou aceitar qualquer resposta do endpoint e só descobrir o desalinhamento pelos rankings errados (1.4, 4.4, 5.6).

## O que um arquiteto sênior faria em produção
- **Promoção controlada:** um registro de modelos (SageMaker Model Registry), com aprovação, métricas de avaliação offline e deploy canário pelo pipeline.
- **Modelo mais rico:** features de usuário e de item vindas de um feature store.
- **Validação contínua:** monitoramento de deriva e um teste de contrato do endpoint em cada versão.
