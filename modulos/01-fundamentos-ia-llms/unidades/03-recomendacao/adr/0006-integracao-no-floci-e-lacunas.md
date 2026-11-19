# ADR-0006: teste de integração no Floci e lacunas do emulador

- Status: aceito
- Data: 2026-11-19
- Unidade: 01.03 (recomendação)

## Contexto

A regra do repositório: com o projeto concluído, `terraform apply` e asserts contra o Floci (`http://localhost:4566`), depois destroy, sem conta AWS real. Falha real e lacuna do emulador ficam separadas, e uma lacuna só é marcada com evidência. Código correto não muda para agradar o emulador.

## Decisão

O harness `testing/scripts/integracao_01_03_recomendacao.py` roda, contra o Floci 2.5:

1. bootstrap do bucket de state no emulador;
2. `init` do stack com o backend S3 de verdade (`use_lockfile = true`) apontando para o emulador, o que testa o state remoto e o lock;
3. `plan` do código real, sem substitutos, e prova de que os recursos sem cobertura estão no plano;
4. `apply`, com substitutos só para os recursos com lacuna comprovada (overrides gerados em arquivos `zz_floci_override.tf`, apagados no fim e fora do git);
5. asserts por regra (R1 a R9 e ADRs), componente com Claude contra o `bedrock-runtime` do emulador, `destroy`, verificação de sobras por tag e do lock liberado;
6. relatório HTML em `testing/reports/<run>/relatorio.html` e `testing/reports/latest.html`.

O Floci roda com o socket do Docker montado (`-v /var/run/docker.sock:/var/run/docker.sock`, também no service container do CI): o ECR do emulador sobe um registry de verdade por ele. Sem o socket, até um repositório vazio falha no delete com `ServerException: Backing registry unreachable`, e o provider retenta o 5xx até o timeout. Foi o que travou o primeiro destroy completo por mais de 40 minutos; com o socket, o delete funciona e o ECR não precisa de substituto.

O provider aponta para o emulador por um override também gerado em tempo de execução. O host do S3 Control (`000000000000.localhost`) precisa resolver para 127.0.0.1; o harness e o workflow de CI acrescentam a linha em `/etc/hosts`.

## Lacunas do emulador (com evidência)

| Recurso | Evidência | Como a regra segue coberta |
|---|---|---|
| `aws_memorydb_subnet_group`, `aws_memorydb_parameter_group` | O Floci responde `UnknownOperationException: Operation CreateSubnetGroup is not supported` (e o mesmo para `CreateParameterGroup`) | `plan` completo; `terraform test memorydb_tls` |
| `aws_memorydb_cluster` | `describe-clusters --show-shard-details` devolve `"Shards": null`, e o provider aborta com `no available shards found` logo depois de criar | `plan` completo; `terraform test memorydb_tls` (TLS, KMS, 1 shard, 0 réplica) |
| `aws_lakeformation_permissions` (banco e localização de dados) | Revogar uma permissão inexistente devolve 200 no Floci. O provider v6.73.0 (`internal/service/lakeformation/permissions.go`, linhas 699 a 705) revoga de novo depois do delete e só aceita a remoção quando a AWS devolve `InvalidInputException: No permissions revoked. Grantee has no permissions`; com o 200, aborta com "empty retryable error" e o destroy para | `plan` completo; `terraform test lake_formation_concede_a_role_do_glue` |
| `aws_sagemaker_endpoint` | O endpoint vai a `Failed` com `java.net.SocketException: No such file or directory`: o Floci tenta subir o container do modelo pelo socket do Docker, que não existe no container dele | `plan` completo; `terraform test sagemaker_sem_full_access` |

Todo o resto do stack (VPC, endpoints, SGs, flow logs, KMS, S3, DynamoDB, ECR, ECS, ALB, IAM, Glue, Athena, registro do bucket no Lake Formation, CloudWatch, SNS, Budgets) é criado no emulador e verificado.

A verificação de sobras ignora chaves KMS em `PendingDeletion` e serviços ECS que não estão `ACTIVE` nem `DRAINING`. Serviço apagado fica `INACTIVE` e continua no índice de tags por um tempo, no emulador e na AWS. Não é sobra com custo. O workflow de destroy aplica a mesma regra.

## Falhas reais encontradas pela integração

| Achado | Correção |
|---|---|
| O Lake Formation recusa o ARN de quem roda o Terraform como principal (`root` no emulador, `assumed-role` no CI): "does not look like a user, role, group..." | Permissões do catálogo e da localização de dados concedidas à role do Glue, que é quem usa o catálogo; teste `lake_formation_concede_a_role_do_glue` escrito antes da correção |
| O `terraform destroy` passou de 40 min no primeiro ciclo completo e deixou o lock e 5 recursos | Não era o código: era o ECR do emulador sem o socket do Docker (acima). O harness passou a gravar a saída de cada comando em arquivo durante a execução, o que mostrou o recurso parado |

## Alternativas rejeitadas

- **LocalStack**: a edição gratuita também não cobre MemoryDB nem SageMaker endpoints; o repositório já padronizou o Floci.
- **Remover MemoryDB e SageMaker do stack quando o alvo é o emulador** (variável de feature flag no código de produto): mudaria o código para agradar o emulador. Os overrides vivem só no harness.
- **Testar só o plan**: não pegaria o erro do Lake Formation, que só aparece na chamada à API.

## Trade-offs

- Os overrides do harness usam o mecanismo de override do Terraform; se um módulo renomear um recurso, o override quebra e o harness falha alto (o que é desejável).
- Por decisão do dono (D-006), nenhum teste chama o Claude real: o comportamento real do modelo fica sem validação. O texto da explicação com Claude não é testado contra um modelo real: o `bedrock-runtime` do emulador devolve uma resposta que não chama a tool, e o teste verifica que o serviço devolve um estado explícito (`unavailable / validation`) em vez de lançar. Qualidade do texto fica para um eval com o modelo real.

## Custo

Zero de nuvem. O job de integração no CI usa o Floci como container de serviço.

## Risco

Um emulador que aceita o que a AWS recusa dá falso verde. Mitigações: `terraform test` e checkov contra o código real, plan completo sem substitutos, e o plan na AWS comentado no PR quando as roles OIDC estiverem configuradas.

## Tarefas da prova CCAR-F exercitadas

5.3 (propagação de erros): o componente com Claude é exercitado contra uma dependência que responde fora do contrato, e o erro vira estado explícito. 3.6: o mesmo harness roda no CI.

## O que um arquiteto sênior faria em produção

Um ambiente efêmero real por PR em conta sandbox, com destroy obrigatório e Budgets por conta; testes de contrato com o modelo real em um conjunto pequeno de casos (eval); e um aviso automático quando uma nova versão do emulador passar a cobrir uma lacuna, para remover o substituto.
