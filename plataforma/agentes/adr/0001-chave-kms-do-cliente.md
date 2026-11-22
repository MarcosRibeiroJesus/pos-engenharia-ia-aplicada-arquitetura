# ADR 0001 · Uma chave KMS do cliente por stack da plataforma

- **Status:** aprovado com o plano (D-035; emenda 1 aprovada na D-038)
- **Data:** 2026-11-19
- **Requisitos:** RNF-001 (criptografia), RNF-003 (alarmes no SNS), Art. IV e V

## Contexto
O RNF-001 pede criptografia em repouso com KMS nos recursos que aceitam chave e deixa para o plano o tipo da chave e o custo. Os recursos com dado da plataforma são:
- o tópico SNS dos alarmes;
- os log groups do gateway, cujos logs de aplicação gravam o corpo das requisições MCP;
- o gateway;
- o motor de política.

Fatos que decidem:
- **Tópico SNS:** para um serviço da AWS, como o CloudWatch, publicar num tópico cifrado, a [documentação do SNS](https://docs.aws.amazon.com/sns/latest/dg/sns-key-management.html) manda usar uma chave do cliente e acrescentar o principal do serviço à política da chave. A chave gerenciada `aws/sns` tem política fixa.
- **Preço:** a chave do cliente custa US$ 1 por mês, rateado por hora. Não há cobrança enquanto ela está agendada para exclusão ([preços do KMS](https://aws.amazon.com/kms/pricing/)).
- **Ciclo:** a plataforma vive no máximo 24 horas (D-024).

## Decisão
- **Uma chave simétrica do cliente por apply do stack da plataforma** (`00-plataforma-agentes-chave`, alias com o mesmo prefixo).
  - Tem rotação automática ligada e `deletion_window_in_days = 7`, o mínimo.
  - A chave é destruída com o stack.
- **Política da chave:**
  - a conta administra pela role de deploy;
  - `logs.<região>.amazonaws.com` com a condição `kms:EncryptionContext:aws:logs:arn` no prefixo dos grupos da plataforma;
  - `cloudwatch.amazonaws.com` e `sns.amazonaws.com` com `aws:SourceAccount` e `aws:SourceArn`;
  - `bedrock-agentcore.amazonaws.com` para o gateway e o motor, com `aws:SourceAccount`.
- **Usam a chave:** tópico SNS, log groups do gateway, gateway (`kms_key_arn`) e motor (`encryption_key_arn`).
- **Não usam a chave:** guardrail, perfil e parâmetros do contrato.
  - O guardrail e o perfil ficam no state do produto e usam a criptografia padrão do serviço. Se o produto quiser chave própria, ela entra no plano dele.
  - Os parâmetros do contrato são `String` (ADR-0002).

## Alternativas rejeitadas
- **Só chaves gerenciadas pela AWS:** de graça, mas o alarme não publica no SNS cifrado. Sobrariam duas saídas, ambas piores: o tópico sem criptografia, com exceção do checkov, ou o alarme sem notificação.
- **Chave persistente no `infra/conta`, compartilhada:** custo fixo ocioso de US$ 12 por ano, 5% do limite mensal (D-022), e raio de impacto entre stacks.
- **Uma chave por recurso:** mais custo e mais política sem ganho de isolamento num stack de um dia.

## Trade-offs
- **Ganho:** controle da política da chave e trilha no CloudTrail de cada uso.
- **Custo:** uma chave nova por demonstração, então dado cifrado não sobrevive ao destroy. Isso é desejado, porque logs e traces são de um dia.

## Custo
US$ 0,033 por dia (1 × US$ 1 × 24/730), mais requisições: até US$ 0,03 por dia no pior caso, sem contar a camada gratuita de 20.000 por mês. Em exclusão, US$ 0.

## Risco
- **Política da chave mal escrita:** o log group ou o alarme falha no apply. Mitigação: TT-S02 confere a política no plan; o ensaio prova.
- **Verificação de sobras:** depois do destroy, a chave fica 7 dias em `PendingDeletion` com a tag `project`, e a Tagging API a devolve. Hoje o modelo de destroy só tem um comentário sobre isso, então a verificação reprova todo destroy da plataforma (análise 1, A01).
  - **A garantia está na T048**, e não num comentário. O filtro fica no modelo `harness/modelos/destroy.yml` e vale para todo projeto: para cada ARN `arn:aws:kms:`, consulta `aws kms describe-key` e ignora só a chave com `KeyState = PendingDeletion`.
  - Qualquer outro ARN reprova, e uma chave `Enabled` também. Se a consulta falhar, por exemplo com `AccessDenied`, a chave conta como sobra (falha fechada).
  - O teste TH-14 começa vermelho com uma saída sintética da Tagging API. Os workflows da plataforma são regenerados a partir do modelo.
  - Até a T048 ficar verde, nenhum destroy real da plataforma deve ser disparado: o ensaio (T084) depende dela pela T080.
  - A ressalva no critério de sucesso 3 da spec ("exceto chave KMS com exclusão agendada, sem custo") fica com o especificador.

## Tarefas da prova
Nenhuma tarefa direta: configuração de cloud está fora do escopo da prova. A decisão vem do Art. IV. Indiretamente, protege os traces usados na revisão humana (5.5).

## Curso Skilljar relacionado
Claude with Amazon Bedrock: dados da aplicação ficam na conta e sob as chaves do cliente.

## Em produção, um arquiteto sênior faria
- Chave por ambiente e por domínio de dados, com rotação e administradores separados dos usuários (separação de funções).
- Política de chave gerada por módulo.
- Alerta de uso fora do padrão no CloudTrail.
- Para retenção longa de logs, chave persistente com período de exclusão de 30 dias.
