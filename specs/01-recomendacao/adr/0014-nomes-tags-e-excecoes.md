# ADR-0014: prefixo 01-recomendacao, tags por módulo e exceções de nome versionadas

- Status: proposto (plano da D01 aguardando a aprovação do dono)
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
   - `module` em kebab no `local.tags` de cada módulo: `rede`, `chave-kms`, `dados`, `catalogo`, `recomendacoes-lote`, `busca-vetorial`, `re-ranker`, `treino`, `servico`, `consultas`, `pipeline-glue`, `monitoramento` e, na janela, `orquestracao-mwaa`;
   - os recursos do módulo da plataforma usam a tag `module` que o módulo define;
   - `environment` sai do `default_tags`, porque não faz parte da política e só ampliaria a superfície.
2. **Prefixo:** todo nome começa por `01-recomendacao-`.
3. **Exceções, num arquivo só** (`U/infra/terraform/tests/excecoes_de_nome.json`), cada uma com o motivo, a fonte e este ADR:
   - `p01-recomendacao-` no cluster, no subnet group e no parameter group do MemoryDB. O subnet group e o parameter group entram por precaução e são confirmados pelo erro de validação na primeira tarefa; sem confirmação, saem da lista;
   - `p01-recomendacao-` no ambiente do MWAA e nos log groups dele;
   - `p01_recomendacao_` no banco do Glue Data Catalog e nas tabelas.
4. **Teste:** começa pelo `harness/modelos/tags.tftest.hcl`. O TT-T02 reprova um nome fora do prefixo e fora da lista, e o ST-04 reprova uma exceção sem ADR.

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
