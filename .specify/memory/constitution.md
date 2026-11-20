# Constituição do projeto

Princípios que nenhuma spec, plano ou tarefa pode violar. Toda spec cita os artigos que a afetam, e a fase **analisar** reprova o conjunto se algum artigo for desrespeitado. Mudar esta constituição é decisão do dono e entra pela memória compartilhada.

## Artigo I · Spec antes de código (SDD)
Nenhum código de implementação nasce sem spec, plano e tarefas aprovados na fase **analisar**. O fluxo é:

constituição → especificar → esclarecer → planejar → tarefas → analisar → implementar → verificar → publicar

O hook `gate_sdd.py` nega edições de código de um projeto que ainda não chegou à fase implementar.

## Artigo II · Decisões do dono
Nenhuma spec assume escopo, produto, orçamento, cloud comparativa, projeto de IA aplicada ou publicação. O que depende do dono fica marcado `[PENDENTE: pergunta]` e vai para `## Perguntas ao dono` no PR. As decisões técnicas e de processo são delegadas e seguem as boas práticas da prova CCAR-F, sempre com o porquê.

## Artigo III · Testes primeiro
- Cada tarefa de implementação começa por um teste que falha (vermelho → verde).
- **Infraestrutura:** `terraform test` com mock providers, checkov e tflint.
- **Integração:** no Floci, só com o projeto completo, gerando relatório.
- **Cobertura:** matriz regra → teste; regra sem teste é falha.
- **Componente Claude:** testado com respostas gravadas.

## Artigo IV · Segurança por padrão
- Nada público por padrão.
- Criptografia em repouso e em trânsito.
- IAM de menor privilégio.
- Segredos fora do repositório.
- Achado alto ou crítico da esteira bloqueia o merge.

## Artigo V · Custo consciente
- Sem custo fixo ocioso sem ADR.
- Versão "lab" na menor escala que demonstre o padrão.
- O uso é demonstração: subir, gravar a demonstração e destruir no mesmo dia. Por isso o teto de cada projeto é o **custo estimado de um dia de execução** (`teto_diario_usd`), calculado no plano. Ele vai no README, no AWS Budgets diário e no gate de FinOps.
- **Limite mensal da conta: US$ 20**, num AWS Budgets mensal que soma todas as demonstrações do mês. É a segunda camada, para o caso de um destroy esquecido.
- **Workflow de destroy obrigatório** em todo projeto com infraestrutura real:
  - disparo manual ou pelo agendador de prazo;
  - ambiente próprio do destroy (`aws-lab-destroy`), restrito ao `main` e sem aprovação, para o destroy automático não esperar ninguém (D-024);
  - confirmação pelo nome do stack no input `confirm_stack`;
  - OIDC, sem chave estática;
  - verificação final de sobras pela tag `project`;
  - no fim, remove o registro de prazo (`harness/infra.py remover`).
- **Prazo de vida:** o apply registra o prazo (`harness/infra.py registrar`, padrão e máximo de 24 horas). O workflow `expirar-infra.yml` avisa uma hora antes e dispara o destroy quando o prazo vence.
- `destroy` sem sobras.

## Artigo VI · Operável e replicável
- Tags `project`, `module` e `managed-by` em todos os recursos.
- **Conta única, isolamento por tag** (D-029):
  - nome com o prefixo da chave do projeto;
  - roles por projeto com condição na tag `project` (ABAC);
  - nenhum projeto acessa recurso de outro, a não ser pela plataforma compartilhada.
- Todo projeto nasce pelo caminho padrão (`harness/novo_projeto.py`), na mesma esteira e com os mesmos gates.
- Logs, métricas e alarmes nos componentes críticos.
- State remoto com lock.
- README com no máximo 5 passos.

## Artigo VII · Lente da certificação
Todo projeto tem um componente com Claude que exercita tarefas da prova CCAR-F. Cada decisão relevante vira ADR com as tarefas exercitadas (ids) e o que um arquiteto sênior faria em produção.

## Artigo VIII · Proveniência e privacidade
- Toda afirmação sobre empresa tem fonte e data.
- Só fontes públicas e dados sintéticos.
- Nada do curso, do aluno ou das empresas em que o dono trabalha.
