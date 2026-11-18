# Progresso do curso

Atualizado em 2026-11-18.

| Módulo | Tema | Aulas | Projeto escolhido | Projeto | Post |
|---|---|---|---|---|---|
| 01 | Sistemas de recomendação | parcialmente assistidas; mapeamento pendente | em escolha (A, B ou C) | não iniciado | rascunho no site |
| 02 | a mapear | — | — | — | — |
| 03 | a mapear | — | — | — | — |
| 04 | a mapear | — | — | — | — |
| 05 | a mapear | — | — | — | — |
| 06 | a mapear | — | — | — | — |

## Módulo 01: opções de projeto

| | Projeto | Arquitetura comparativa | Teste local | Custo em lab |
|---|---|---|---|---|
| A (recomendada) | Recomendação batch-first serverless: S3, Glue/Athena, Step Functions, DynamoDB e API de serving com re-rank | GCP: BigQuery, Vertex AI e Cloud Run | Alto (confirmar Glue e Athena no Floci) | Quase zero parado |
| B | A + tempo real: endpoint de embeddings e busca vetorial para sinais da sessão | Azure: AI Search e Functions | Médio | Médio, destroy rigoroso |
| C | Recomendação com LLM: embeddings no Bedrock, busca vetorial, re-rank e explicação com LLM, avaliação offline (recall@k, NDCG) | GCP: Vertex AI e Gemini | Baixo (modelos com mock) | Baixo, por token |

## Referências do módulo 01
- AWS Big Data Blog, recomendação do batch ao tempo real: https://aws.amazon.com/pt/blogs/big-data/building-a-scalable-personalized-recommendation-system-on-aws-from-batch-to-real-time/
- AI Engineer, "Teaching Gemini to Speak YouTube" (Devansh Tandon, 2025): https://www.youtube.com/watch?v=LxQsQ3vZDqo
