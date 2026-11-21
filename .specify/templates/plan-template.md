# Plano: {titulo}

- **Spec:** `specs/{chave}/spec.md` · **Status:** rascunho | aprovado

## Verificação da constituição
| Artigo | Como o plano cumpre | Risco |
|---|---|---|

## Arquitetura
Diagrama e componentes. Para cada serviço AWS: por que este, alternativa rejeitada, link da fonte oficial e se existe no Floci.

## Decisões técnicas (ADRs)
- ADR-0001: ... (tarefas da prova exercitadas: ...)

## Estratégia de testes
- **Unitários:** `terraform test` e testes da aplicação, com mocks.
- **Componente Claude:** respostas gravadas, validação de schema e retentativa.
- **Integração:** no Floci, com relatório em `testing/reports/`.
- **Matriz regra → teste:** `specs/{chave}/matriz.md`.

## Cloud comparativa
Mapeamento serviço a serviço e o que muda quando não há equivalente.

## Custo do lab (um dia de execução)
O uso é demonstração: subir, gravar, destruir no mesmo dia.

| Componente | Custo de 24 h (US$) | Fonte da estimativa |
|---|---|---|

- **Teto diário** = total acima. Copie para `teto_diario_usd` em `harness/estado.json`, para o README e para o AWS Budgets diário.
- **Fica cobrando depois do destroy?** Liste o que sobra (state, chaves KMS em exclusão, logs) e o custo de cada item.
- **Workflow de destroy:** caminho e nome do stack para a confirmação.

## Riscos e lacunas do emulador
