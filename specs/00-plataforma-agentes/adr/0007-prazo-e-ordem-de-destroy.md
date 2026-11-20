# ADR 0007 · Prazo e ordem de destroy entre produto e plataforma

- **Status:** aprovado com o plano (D-035; emenda 1 aprovada na D-038)
- **Data:** 2026-11-19
- **Requisitos:** RF-008 (segundo aceite: mecanismo decidido no plano), critério de sucesso 3, D-021, D-024

## Contexto
O `harness/infra.py` registra o prazo de cada stack no branch `infra-no-ar`. O `expirar-infra.yml` roda a cada hora: avisa uma hora antes e dispara o destroy de cada projeto vencido, de forma independente.

Com a plataforma compartilhada surgem duas regras:
- o produto tem alvos e políticas no gateway (ADR-0006), então o destroy dele precisa acontecer antes do da plataforma;
- o prazo do produto nunca passa do prazo da plataforma.

Os dois destroys disparados na mesma rodada do agendador rodariam em paralelo.

## Decisão
- **Dependência declarada:** produtos que usam a plataforma ganham `consome: ["00-plataforma-agentes"]` no `harness/estado.json`.
- **`infra.py registrar` de um consumidor:**
  - recusa se a plataforma não está registrada;
  - limita `expira_em` a `expira_em(plataforma) − 1 h`;
  - a 1 hora garante uma rodada do agendador entre os dois destroys.
- **`infra.py estender` de um consumidor:** mesmo limite. A plataforma continua limitada a 24 h desde o apply dela (D-024).
- **`vencidos`:**
  - a plataforma vencida vai para `aguardando` (motivo: consumidores no ar) enquanto houver consumidor registrado;
  - quando a plataforma vence, todo consumidor ainda registrado vai para `destruir`, mesmo antes do próprio prazo.
- **Comando `dependentes <chave>`:**
  - lista os consumidores no ar e sai com código 1 se houver;
  - o modelo de destroy o chama antes do `terraform destroy`, então o destroy manual da plataforma recusa com produto no ar;
  - para um produto, a lista é vazia, então o mesmo modelo serve a todos.
- **Comando `requisitos <chave>`:**
  - confere se os provedores estão no ar;
  - o modelo de apply o chama antes do Terraform.
- **Testes:** TH-01 a TH-03 no `harness/test_harness.py`.

**Correção da análise 1 (A10, 2026-11-20).** Dois caminhos de erro deixavam stack no ar sem prazo:
- **O prazo é registrado antes do `terraform apply`.** No modelo de apply, o job `prazo` roda antes do job `apply`, que passa a ter `needs: prazo`. Se o apply falhar no meio, o registro fica, e o agendador destrói o que foi criado no prazo. Destroy de um stack parcial ou vazio não custa nada.
  - Foi rejeitado o `if: always()` depois do apply: ele também cobre a falha, mas deixa o registro depender de um job que roda depois do custo já criado.
- **O `requisitos` de um consumidor recusa cedo** quando faltam menos de 2 horas para a plataforma vencer:
  - 1 hora é a margem desta decisão;
  - a outra hora é o prazo útil mínimo do consumidor, porque o agendador roda de hora em hora, e menos que isso seria destruído antes da gravação.
  - A mensagem diz quanto falta e que a plataforma pode ser estendida com `infra.py estender`, sem passar de 24 horas desde o apply dela (5.3).
- **Testes:** casos novos no TH-01 (T041) e no TH-03 (T043). O `estado.checar_apply` reprova modelo com o registro depois do apply.

## Alternativas rejeitadas
- **Só a margem de prazo, sem espera:** se o destroy do produto falhar, a plataforma seria destruída com alvos registrados. O state do produto ficaria órfão, apontando para um gateway que não existe.
- **Um workflow único que destrói produtos e plataforma em sequência:** acopla os workflows e quebra o modelo comum `apply.yml`/`destroy.yml` de todos os projetos.
- **`terraform_remote_state` para o produto saber da plataforma:** rejeitado na spec (E4) e não resolve o agendamento.

## Trade-offs
- **Ganho:**
  - ordem garantida no caminho normal;
  - falha fechada no caminho com erro: a plataforma espera, avisa e o agendador redispara o destroy do produto a cada 3 horas.
- **Custo:**
  - se o destroy de um produto falhar seguidamente, a plataforma passa das 24 horas enquanto espera;
  - o custo extra por hora é baixo (a chave, os alarmes e nada de tráfego), e a issue do agendador avisa o dono.

## Custo
US$ 0 de estrutura. Em caso de espera, cerca de US$ 0,002 por hora, entre chave e alarmes.

## Risco
- **Espera longa por destroy de produto quebrado:** a issue de aviso e o Budgets diário alertam; o dono pode destruir à mão pelo mesmo workflow.
- **Registro de prazo fora de sincronia com a AWS:** a verificação de sobras pela tag segue no fim de cada destroy.

## Tarefas da prova
- 1.4: o gate programático de dependência bloqueia a ação fora de ordem.
- 5.3: a falha do destroy do produto é propagada (plataforma em espera com motivo), não engolida.

## Curso Skilljar relacionado
Claude Code in Action: automação de CI com gates e fluxo de trabalho verificável.

## Em produção, um arquiteto sênior faria
- Orquestraria a dependência entre stacks num grafo explícito (Terraform Stacks, Step Functions ou o orquestrador de deploy da casa).
- Usaria remoção protegida para recursos compartilhados: o gateway só sai sem alvos.
- Teria um runbook de limpeza de órfãos.
