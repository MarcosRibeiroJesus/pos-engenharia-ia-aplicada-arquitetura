# ADR-0007: janela do MWAA como stack e componente com prazo próprio

- Status: aceito (plano aprovado pelo dono em 2026-11-20, D-056)
- Data: 2026-11-20
- Projeto: `01-recomendacao` (D01, recomendação de e-commerce)
- Decisão do dono aplicada: D-052 (MWAA ligado numa janela curta, com `prazo_horas` curto)
- Curso Skilljar relacionado: Claude Code in Action (harness, gates e CI)

## Contexto
O MWAA é o maior custo por hora do stack: US$ 0,49/h no `mw1.small`, segundo a [página de preços](https://aws.amazon.com/managed-workflows-for-apache-airflow/pricing/). O dono decidiu que ele fica ligado só numa janela curta do dia de demonstração. O resto do stack fica no ar por até 24 h.

Hoje o MWAA é um `count` dentro do stack base, ligado por `enable_mwaa`. O harness tem um registro de prazo por projeto (`harness/infra.py`, branch `infra-no-ar`), e o `expirar-infra.yml` dispara o destroy do projeto quando o prazo vence. Desligar só o MWAA no mesmo state exigiria um novo apply com `enable_mwaa = false`, que roda no ambiente `aws-lab`, com aprovação. Um desligamento automático ficaria esperando alguém, e isso contraria a D-024.

O gate de custo (`.github/ia/gate_custo.py`) também conta cada raiz Terraform por 24 h, sem somar raízes do mesmo projeto.

## Decisão
1. **Stack próprio da janela:**
   - pasta `U/infra/janela-mwaa/`, com state `01-recomendacao/janela-mwaa.tfstate`;
   - cria o ambiente `p01-recomendacao-lab-mwaa` (`mw1.micro`, Airflow 2.11.2, webserver privado), a role de execução, o security group, os log groups do Airflow e os 9 endpoints que só o Airflow usa;
   - lê as entradas da base de um parâmetro SSM `/01-recomendacao/lab/janela/entradas`, sem ler o state da base.
2. **Componente com prazo próprio no harness:**
   - o projeto ganha `componentes: [{nome: "janela-mwaa", stack, apply_workflow, destroy_workflow, prazo_maximo_horas: 3}]` no `estado.json`;
   - `infra.py registrar --componente janela-mwaa` exige a base no ar e limita o prazo ao menor de 3 h e do prazo da base menos 1 h;
   - o padrão do input `prazo_horas` do apply da janela é 2.
3. **Destroy em cascata:**
   - o destroy da base roda primeiro o destroy da raiz da janela (com state vazio, não faz nada), depois o da base, e remove os dois registros;
   - o destroy da janela verifica sobras por `project=01-recomendacao` e `module=orquestracao-mwaa` juntos, porque a base continua no ar.
4. **Gate de custo:** o `gate_custo.py` soma as raízes de um projeto e pesa a raiz de um componente por `prazo_maximo_horas/24`.

## Alternativas rejeitadas
| Alternativa | Por que não |
|---|---|
| Flag `enable_mwaa` no mesmo state, com novo apply para desligar | O desligamento automático ficaria esperando aprovação no `aws-lab` (D-024) |
| `terraform destroy -target` do módulo do MWAA | Destroy parcial por `-target` deixa o state divergente da configuração; o próximo apply recria o MWAA |
| Projeto separado no `estado.json` (`01-recomendacao-janela`) | Uma chave sem spec própria quebra a relação chave → spec → tag do harness |
| MWAA Serverless | O DAG passa a ser YAML, o que é outra reescrita, e a cobertura no Terraform e no Floci não foi confirmada |
| Step Functions no lugar do Airflow | Troca o orquestrador do post de referência |

## Trade-offs
- São duas raízes Terraform e dois pares de workflows a manter, em troca de um custo que só existe por 2 a 3 h e de um desligamento que não depende de ninguém.
- A criação e a remoção do MWAA levam dezenas de minutos cada uma. A janela padrão de 2 h cobre criação, execução do DAG e remoção, e o máximo de 3 h dá folga para uma nova tentativa.

## Custo
- Janela de 3 h: cerca de US$ 1,86, contra US$ 13,11 se o MWAA e os 9 endpoints ficassem 24 h (0,49 × 24 + 9 × 0,01 × 24).
- Com a janela padrão de 2 h: cerca de US$ 1,28.

## Risco
- O MWAA criar log groups próprios fora do Terraform. Mitigação: os nomes são pré-criados no Terraform, e o destroy confere o prefixo `airflow-p01-recomendacao`.
- A base ser destruída com a janela no ar. Mitigação: a cascata e o limite de prazo (base menos 1 h).

## Boa prática e erro comum (D-036)
**Workflow com gate programático e ordem garantida pelo código.** O arquiteto põe o prazo, a ordem e o desligamento em regras que o harness aplica sozinho, e decompõe o ciclo em peças com dono e prazo. O erro comum é confiar que alguém vai lembrar de desligar a parte cara, ou fazer o desligamento automático depender de uma aprovação humana (1.4, 1.6, 5.3).

## O que um arquiteto sênior faria em produção
Um ambiente MWAA permanente por conta de dados, dimensionado pela fila de tarefas. A conta separaria os ambientes por time com ABAC e teria um alarme de ociosidade. Para cargas com poucas execuções por dia, avaliaria o MWAA Serverless ou o Step Functions, com uma comparação de custo por execução.
