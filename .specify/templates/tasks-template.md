# Tarefas: {titulo}

Uma tarefa por sessão de trabalho. Cada tarefa começa por um teste que falha.
- `[P]` marca tarefas que podem rodar em paralelo.
- `[x]` só depois do teste verde e do commit.
- Cada tarefa cita os requisitos que cobre (RF e RNF).

## Fase 1 · Regras como testes
- [ ] T001 Escrever as regras da constituição como testes (tags a partir de `harness/modelos/tags.tftest.hcl`, criptografia, nada público) · RNF-001

## Fase 2 · Núcleo
- [ ] T010 ... · RF-001

## Fase 3 · Componente Claude
- [ ] T020 ... · RF-00x

## Fase 4 · Operação e custo (obrigatória com infraestrutura real)
- [ ] T080 Workflow de destroy: disparo manual ou pelo agendador, ambiente protegido, `confirm_stack`, OIDC, verificação de sobras pela tag e `harness/infra.py remover` (Art. V)
- [ ] T082 Workflow de apply registra o prazo com `harness/infra.py registrar` (input `prazo_horas`, padrão 24)
- [ ] T081 AWS Budgets diário com o teto do plano e alerta

## Fase 5 · Verificação
- [ ] T090 Integração no Floci e relatório
- [ ] T091 Posts (AWS e cloud comparativa) e página no site
