# ADR-0003: criptografia em trânsito, exposição e menor privilégio

- Status: aceito
- Data: 2026-11-18
- Unidade: 01.03 (recomendação)

## Contexto

A versão importada tinha: MemoryDB com `tls_enabled = false`; a role das tasks com `Resource = "*"` em DynamoDB, SageMaker e CloudWatch; a role do endpoint com `AmazonSageMakerFullAccess`; Glue com `AWSGlueServiceRole`; ALB público em HTTP 80; MWAA com UI pública; logs e SNS sem chave do cliente.

## Decisão

**Em trânsito**
- MemoryDB com `tls_enabled = true`. O serviço conecta com TLS (`MEMORYDB_TLS=true`).
- ALB **interno por padrão**. HTTP 80 só dentro da VPC. A API pública é opt-in (`expose_api_publicly = true`) e exige `certificate_arn`: a validação da variável falha o plan sem certificado. Com ela, listener HTTPS com política TLS 1.3 e o 80 só redireciona.
- Buckets negam requisições sem `aws:SecureTransport`.
- TLS termina no ALB; ALB → task é HTTP dentro da VPC privada.

**Em repouso**: uma CMK da plataforma (rotação anual, janela de exclusão de 7 dias) para S3, DynamoDB, MemoryDB, Logs, SNS, ECR, Glue, Athena e MWAA.

**Menor privilégio**
- Task role: `dynamodb:GetItem/BatchGetItem/Query` só na tabela; `sagemaker:InvokeEndpoint` só no endpoint; `bedrock:InvokeModel` só no modelo configurado (e no perfil de inferência com o mesmo id); `kms:Decrypt` só via DynamoDB.
- `cloudwatch:PutMetricData` não aceita ARN de recurso. A política usa `Resource = "*"` **com** condição `cloudwatch:namespace`. O teste aceita `"*"` só quando há condição.
- Execution role: política própria (pull só do repositório do stack, logs só no log group do serviço) no lugar da managed policy.
- SageMaker: sem `AmazonSageMakerFullAccess`; pull da imagem, logs no log group do endpoint, métricas por namespace; modelo com isolamento de rede.
- Glue: sem `AWSGlueServiceRole`; S3 só no bucket do golden dataset, DynamoDB só na tabela, catálogo só no banco do projeto, security configuration criptografando S3, logs e bookmarks.
- MWAA: UI `PRIVATE_ONLY`, SG sem saída para a internet, política escopada ao bucket, aos log groups e às filas do ambiente.
- Lake Formation: permissões explícitas no lugar de `ALL`.

**Exceções do checkov**: 18 checks pulados, cada um com justificativa inline no recurso (`#checkov:skip=ID:motivo`). Grupos: retenção de logs de 1 ano (lab usa 14 dias), access logs e replicação de buckets, WAF e deletion protection do ALB (interno e efêmero), HTTP entre ALB e task, SSE-S3 no bucket de state (ADR-0001) e dois falsos positivos de SG anexado em outro módulo.

## Alternativas rejeitadas

- **Manter o ALB público em HTTP**: contraria R1 e R2; nada no lab precisa de acesso pela internet (os testes rodam de dentro da VPC ou contra o emulador).
- **Certificado autoassinado importado no ACM para HTTPS interno**: cria um segredo para gerir e não protege contra nada que o SG já não proteja dentro da VPC.
- **Autenticação IAM no MemoryDB já nesta unidade**: exige gerar tokens SigV4 no cliente Redis; fica como próximo passo (abaixo).
- **Uma CMK por serviço**: US$ 1/mês cada, sem ganho real em um lab com um único time.

## Trade-offs

Mais política para manter (cada nova chamada do serviço exige uma linha de IAM e, às vezes, um endpoint). Em troca, a role de uma task comprometida só lê uma tabela, chama um endpoint e um modelo.

## Custo

US$ 1/mês da CMK (proporcional às horas de vida do stack). TLS no MemoryDB e políticas de IAM não custam nada.

## Risco

A ACL `open-access` do MemoryDB depende do SG: qualquer coisa que entre no SG das tasks lê os vetores. Os vetores são de catálogo (não pessoais), o que limita o impacto.

## Tarefas da prova CCAR-F exercitadas

2.3 (poucas tools e menor privilégio por agente) aplicada à infraestrutura: o componente com Claude só pode invocar o modelo configurado. Os demais itens são de segurança de cloud, fora do escopo da prova.

## O que um arquiteto sênior faria em produção

Usuários do MemoryDB com autenticação IAM e ACL por função (leitura para o serviço, escrita para o batch); WAF e access logs no ALB público; Service Control Policies negando recursos sem tag ou sem criptografia; IAM Access Analyzer validando as políticas no CI; e uma CMK por domínio de dados.
