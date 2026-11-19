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
- Teto mensal do projeto no README e no gate de FinOps.
- `destroy` sem sobras.

## Artigo VI · Operável e replicável
- Tags `project`, `module` e `managed-by` em todos os recursos.
- Logs, métricas e alarmes nos componentes críticos.
- State remoto com lock.
- README com no máximo 5 passos.

## Artigo VII · Lente da certificação
Todo projeto tem um componente com Claude que exercita tarefas da prova CCAR-F. Cada decisão relevante vira ADR com as tarefas exercitadas (ids) e o que um arquiteto sênior faria em produção.

## Artigo VIII · Proveniência e privacidade
- Toda afirmação sobre empresa tem fonte e data.
- Só fontes públicas e dados sintéticos.
- Nada do curso, do aluno ou das empresas em que o dono trabalha.
