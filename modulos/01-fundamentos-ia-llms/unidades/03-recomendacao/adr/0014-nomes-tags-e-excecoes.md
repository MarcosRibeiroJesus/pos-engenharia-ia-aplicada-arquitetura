# ADR-0014: prefixo 01-recomendacao, tags por módulo e exceções de nome versionadas

- Status: aceito (plano aprovado pelo dono em 2026-11-20, D-056)
- Data: 2026-11-20
- Projeto: `01-recomendacao` (D01, recomendação de e-commerce)
- Decisões aplicadas: D-029 (conta única com isolamento por tag e prefixo), D-031 (padrão de tags da política do Infracost)
- Curso Skilljar relacionado: Claude Code in Action (regras como teste)

## Contexto
Hoje as tags são `project = "recsys"` e `module = "01-fundamentos-ia-llms/03-recomendacao"`, com barra, e os nomes começam por `recsys-lab-`. As duas coisas reprovam a política de tags bloqueante (D-031) e o isolamento por prefixo (D-029).

Algumas APIs não aceitam nome começando por dígito:
- MemoryDB: começa por letra ([Getting started](https://docs.aws.amazon.com/memorydb/latest/devguide/getting-started.html));
- MWAA: `[a-zA-Z][0-9a-zA-Z-_]*` ([CreateEnvironment](https://docs.aws.amazon.com/mwaa/latest/API/API_CreateEnvironment.html)).

Os bancos do Glue Data Catalog usados pelo Athena seguem a regra de nomes do Athena, que até onde sei aceita só minúsculas, dígitos e sublinhado. Por isso o hífen não serviria no banco. Essa regra não foi consultada nesta fase: a primeira tarefa a confirma na página de nomes do Athena e só então registra a exceção com a fonte.

## Decisão
1. **Tags:**
   - `project = "01-recomendacao"` e `managed-by = "terraform"` no `default_tags` das duas raízes;
   - `module` em kebab no `local.tags` de cada módulo: `rede`, `chave-kms`, `dados`, `catalogo`, `recomendacoes-lote`, `busca-vetorial`, `re-ranker`, `treino`, `servico`, `consultas`, `pipeline-glue`, `monitoramento`, `entradas-janela` (o parâmetro SSM que a base publica para a janela, T052; fica fora de `orquestracao-mwaa` porque continua no ar quando a janela é destruída) e, na janela, `orquestracao-mwaa`;
   - os recursos do módulo da plataforma usam a tag `module` que o módulo define;
   - `environment` sai do `default_tags`, porque não faz parte da política e só ampliaria a superfície.
2. **Prefixo:** todo nome começa por `01-recomendacao-`.
3. **Exceções, num arquivo só** (`U/infra/terraform/tests/excecoes_de_nome.json`), cada uma com o motivo, a fonte e este ADR:
   - `p01-recomendacao-` no cluster do MemoryDB (a documentação exige letra inicial) e, **por precaução**, no subnet group e no parameter group. Na T012, o validador do provider aws 6.73.0 aceitou dígito inicial nos dois grupos, mas aceitou também no cluster, que a documentação proíbe: o validador não implementa a regra da letra inicial e por isso não serve de prova. Os dois grupos só saem da lista com uma fonte que trate da regra de nome deles em si (linha da T102); um teste ou erro de validação do provider não basta;
   - `p01-recomendacao-` no ambiente do MWAA. Entrou na T012, porque o módulo do MWAA ainda está na base até a T014; a T014 mantém a exceção, usada pela raiz da janela, e a T061 atualiza a fonte e acrescenta os log groups do Airflow;
   - `p01_recomendacao_` no banco do Glue Data Catalog (`p01_recomendacao_lab_golden`) e nas tabelas (T050). A página de nomes do Athena não foi aberta na T012 (sem acesso à documentação na sessão); a conferência fica com a T102;
   - `alias/01-recomendacao-` no alias do KMS, porque a API exige o prefixo `alias/` (o validador do provider reprova sem ele);
   - `/01-recomendacao/` no parâmetro SSM das entradas da janela (`/01-recomendacao/lab/janela/entradas`, ADR-0007, T052), porque o nome hierárquico do Parameter Store começa por `/`; o primeiro nível é a chave do projeto. A página de hierarquias do SSM não foi aberta na T052; a conferência fica com a T102. O ST-04 aceita `/` logo depois da chave;
   - `/aws/sagemaker/Endpoints/01-recomendacao-` no log group do endpoint, porque o SageMaker impõe o nome `/aws/sagemaker/Endpoints/<endpoint>` ([logs do SageMaker](https://docs.aws.amazon.com/sagemaker/latest/dg/logging-cloudwatch.html), achado A19 da análise 2). O Terraform cria o grupo com esse nome para ter KMS, retenção e destroy.

   Os log groups que o projeto nomeia livremente seguem o prefixo (A19): o do serviço é `01-recomendacao-lab-servico`, o que casa com o padrão `log-group:01-recomendacao-*` da T031; o do Glue é `01-recomendacao-lab-glue-feature-engineering`, apontado pelo `--continuous-log-logGroup`; o dos flow logs é `01-recomendacao-lab-flow-logs`.
4. **Teste:** começa pelo `harness/modelos/tags.tftest.hcl`. O TT-T02 (`tests/prefixo.tftest.hcl`) reprova um nome fora do prefixo e fora da lista, e uma exceção usada em outro tipo de recurso; o ST-04 (`static_rules.py`) reprova uma exceção sem motivo, fonte ou ADR, ou com padrão sem âncora na chave, e um item que saiu da lista sem link da fonte; o ST-T02 (`static_rules.py`) reprova recurso nomeado de `modules/` que falta no output `nomes_dos_recursos`, porque o TT-T02 só confere o que está nesse output.
5. **O prefixo não se troca por input:** a variável `project_name` só aceita `01-recomendacao`, e os nomes ficam `01-recomendacao-<environment>-<componente>`.

## Alternativas rejeitadas
| Alternativa | Por que não |
|---|---|
| Teste que só exige que o nome "contenha" a chave | Perde o controle por prefixo da D-029, usado por ARN nas políticas |
| Prefixo `p01-recomendacao-` em tudo | Diverge da regra da conta para todos os recursos por causa de três APIs |
| Exceções espalhadas nos módulos | Ninguém revisa o conjunto; vira afrouxamento silencioso |

## Trade-offs
Três formas de prefixo para quem lê o console. A lista única e o teste mantêm a regra explícita.

## Custo
Nenhum.

## Risco
Um recurso renomeado é recriado no próximo apply. Como o lab sobe e desce no mesmo dia, não há dado a migrar.

## Boa prática e erro comum (D-036)
**Regra estrita com exceção explícita, versionada e testada.** O arquiteto mantém a regra igual para todos e põe cada exceção num lugar só, com o motivo e a fonte, e um teste que reprova o que estiver fora. O erro comum é afrouxar a regra para todos por causa de um caso, ou aceitar exceções sem registro (1.4).

## O que um arquiteto sênior faria em produção
- **Conta por produto:** contas separadas no AWS Organizations, com SCP exigindo a tag na criação (`aws:RequestTag`).
- **Conformidade contínua:** tag policies do Organizations e o AWS Config para conferir a conformidade.
