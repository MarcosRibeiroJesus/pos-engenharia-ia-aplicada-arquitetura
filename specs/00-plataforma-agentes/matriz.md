# Matriz requisito → tarefa → teste: `00-plataforma-agentes`

Gerada na fase tarefas (2026-11-20) a partir da matriz regra → teste do `plan.md`, aprovado em 2026-11-19 (D-035), com a coluna de tarefa de `tasks.md`. Regra sem teste ou sem tarefa conta como falha (Art. III); o TH-07 (T046) confere esta tabela contra o `spec.md`.

Ids de teste: TT (`terraform test`), TS (schema), RG (gravadas), TH (harness), FL (Floci), DM (demonstração), ES (esteira). TH-12 é o único id novo desta fase (furo F6 em `tasks.md`).

## Requisitos da spec
| Requisito | Tarefas | Testes |
|---|---|---|
| RF-001 · gateway MCP único, alvos com prefixo e classe, isolamento entre produtos | T013, T020, T030, T035, T045, T080 | TT-G02, TT-R01, TT-R02, TT-R03, TT-R04, TH-04, FL-02 |
| RF-002 · política por produto, nega por padrão, `ENFORCE`, `tools/list` filtrado | T014, T015, T036, T044, T065, T066, T084, T086 | TT-P01, TT-P02, TT-R09, TT-R10, TH-05, RG-02, DM-01, DM-02 |
| RF-003 · identidade IAM sem segredo | T013, T019, T032, T035, T063, T066, T084 | TT-G01, TT-S05, TS-02, RG-08, ES (gitleaks), DM-03 |
| RF-004 · guardrail na camada do modelo | T033, T065, T086 | TT-R08, RG-04, DM-04 |
| RF-005 · perfil de inferência por produto e custo por tag | T032, T034, T050, T087 | TT-R11, TT de `infra/conta`, DM-07 |
| RF-006 · logs, traces, métricas e avaliação sob demanda | T016, T037, T051, T067, T086, T088 | TT-O01, TT-O02, TT-O04, TT de `infra/conta`, DM-04, DM-08 |
| RF-007 · contrato v1 versionado | T018, T019, T030, T037, T047, T080 | TS-01, TS-02, TT-C01, TH-10, FL-03 |
| RF-008 · mesmo ciclo dos produtos, prazo e ordem de destroy | T040, T041, T042, T043, T070 [x], T084, T086 | TH existente, `estado.py validar`, TH-01, TH-02, TH-03, DM-06 |
| RF-009 · tríade letal recusada no plan | T031 | TT-R05 |
| RF-010 · guardrail na camada de tools e roteiro de 4 passos | T036, T060, T064, T065, T086 | TT-R06, RG-03, RG-05, DM-01 a DM-05 |
| RF-011 · erros estruturados | T018, T060, T062, T064 | TS-01 (`mapa_erros`), RG-06, RG-07 |
| RF-012 · ação sensível com handoff para humano | T031, T036, T062 | TT-R07, RG-06 |
| RNF-001 · segurança | T003, T010, T011, T013, T019, T031, T032, T045, T074 | TT-S01 a TT-S05, TT-R09, ES |
| RNF-002 · custo | T003, T012, T014, T047, T066, T073 | TT-K01, TT-K02, TH-06, TH-11, ES (Infracost) |
| RNF-003 · tags, state, README e seis alarmes | T001, T011, T017, T020, T037, T052, T072, T080 | TT-T01, TT-T02, TH-08, TH-09, TT-O03, TT-O04, FL-01 |
| RNF-004 · conta única, sem Organizations | T003, T083 | TT-K03 |
| RNF-005 · CI de código sem Bedrock | T002, T047 | TH-11, TH-12 |
| RNF-006 · região `us-east-1` | T001, T082 | TT-T03, tabela de achados com fonte |
| RNF-007 · matriz completa e lacunas do Floci com evidência | T002, T038, T046, T080 | TH-07, TH-12, FL (relatório) |
| RNF-008 · dados sintéticos | T060, T064, T088 | RG-09, RG-07, revisão humana |

## Regras da constituição
| Regra | Tarefas | Testes |
|---|---|---|
| Art. I · código só depois de implementar | T071 [x], T000 | TH existente (`gate_sdd`, `pre-commit`) |
| Art. III · cobertura | T046, T081 | TH-07 |
| Art. IV · nada público | T013, T003 | TT-G01, TT-S01 |
| Art. IV · criptografia em repouso | T010, T011, T013, T015, T016 | TT-S02 |
| Art. IV · criptografia em trânsito | T011 | TT-S04 |
| Art. IV · menor privilégio | T003, T014, T032 | TT-S03, TT-R09 |
| Art. IV · segredos fora | T019 | TS-02, ES (gitleaks) |
| Art. IV · achado alto bloqueia | T074 | ES |
| Art. V · sem custo fixo ocioso | T003, T073 | TT-K02, ES (Infracost) |
| Art. V · Budgets diário com o teto | T012 | TT-K01, TH-06 |
| Art. V · Infracost ≤ teto | T073 | ES (Infracost) |
| Art. V · destroy com prazo e `confirm_stack` | T070 [x], T043 | TH existente, `estado.py validar`, TH-03 |
| Art. V · destroy sem sobras | T080, T086 | FL-04, DM-06 |
| Art. VI · tags | T001, T020 | TT-T01 |
| Art. VI · isolamento e prefixo | T020, T030 | TT-R01, TT-T02 |
| Art. VI · logs, métricas e alarmes | T016, T017, T037 | TT-O01 a TT-O04 |
| Art. VI · state remoto com lock | T001 | TH-08 |
| Art. VI · README com até 5 passos | T072 | TH-09 |
| Art. VII · componente Claude | T061 a T065 | RG-01 a RG-08 |
| Art. VIII · dados sintéticos | T060, T088 | RG-09, revisão humana |

## Critérios de sucesso da spec
| Critério | Tarefas | Testes |
|---|---|---|
| 1 · demonstração só pelas interfaces | T030, T047, T086 | TH-10, DM-02 (`AllowDecisions` ≥ 1 e `DenyDecisions` ≥ 1) |
| 2 · custo dentro do teto | T073, T087 | ES (Infracost), DM-07 (custo real da plataforma e da D03) |
| 3 · destroy sem sobras | T080, T086 | FL-04, DM-06 |
