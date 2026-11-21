# Matriz requisito → tarefa → teste: `01-recomendacao`

Gerada na fase tarefas (2026-11-20) a partir da matriz regra → teste do `plan.md`, aprovado pelo dono em 2026-11-20 (D-056), com a coluna de tarefa do `tasks.md`. Regra sem teste ou sem tarefa conta como falha (Art. III).

Ids de teste: VT (Vitest), PY (unittest do lote), TT (`terraform test`), ST (`static_rules.py`), TH (harness), FL (Floci), DM (demonstração), ES (esteira `seguranca.yml`). Os ids novos da fase tarefas são TT-J02, VT-20, TH-07 e TH-08 (furos F2, F5 e F6 do `tasks.md`), e os da análise 1 são TH-09 (A04) e TH-10 (A05). "Plataforma T0xx" é a tarefa de mesmo id em `specs/00-plataforma-agentes/tasks.md`.

## Regras da constituição
| Regra | Tarefas | Testes |
|---|---|---|
| Art. I · código só em implementar | T000 | TH existente (`gate_sdd`, `pre-commit`); teste do T000 (links e hash do plano) |
| Art. III · cobertura | T101 | revisão a partir desta matriz; TH existente da matriz |
| Art. IV · nada público | T011, T053 (mantêm verdes) | TT existentes `rede_privada_por_padrao`, `rede_api_publica_exige_opt_in`, `s3_golden_dataset` |
| Art. IV · criptografia | T030, T061 | TT existentes `kms_chave_da_plataforma`, `memorydb_tls`; TT-K03; TT de `infra/conta` (bucket de state) |
| Art. IV · menor privilégio | T014, T031, T051, T053, T063, T090 | TT existentes; TT-B01, TT-E02, TT-J01, TT-I01, TT-R01 |
| Art. IV · segredos fora | T052, T053, T097 | ES (gitleaks); ST-06; TT-J02 (nenhum campo com segredo) |
| Art. IV · achado alto bloqueia | T097 | ES |
| Art. V · sem custo fixo ocioso | T014, T062 | TT-K02 (base e janela), ST-07 |
| Art. V · Budgets diário com o teto | T013, T102 | TT-K01 (só notificações `ACTUAL`), TH-06 |
| Art. V · custo do PR ≤ teto | T024, T096 | TH-04, TH-10; ES (Infracost) |
| Art. V · destroy com prazo, cascata e sobras | T010, T021, T022, T023, T055, T056, T064, T100, T104 | TH-01, TH-02, TH-03, TH-07, TH-09; `estado.py validar`; FL-04; DM-09 |
| Art. VI · tags | T011, T060 | TT-T01 (base e janela) |
| Art. VI · prefixo | T012, T061 | TT-T02, ST-04 |
| Art. VI · logs, métricas e alarmes | T015, T054 | TT existente `monitoramento_e_orcamento`; TT-A01; VT-15 |
| Art. VI · state remoto com lock | T011, T060 | ST existente (backend), estendido à janela |
| Art. VI · README com até 5 passos | T093 | ST-08 |
| Art. VII · componente Claude | T006 [x], T080 a T085 | VT existentes do explicador; VT-10 a VT-13, VT-17 |
| Art. VIII · sintético e proveniência | T040, T077, T080, T094, T106, T107, T108 | PY-07, VT-14, VT-13; revisão (RNF-111) |

## Requisitos funcionais
| Requisito | Tarefas | Testes |
|---|---|---|
| RF-001 · API | T001 [x], T070 | VT existente (contrato); VT-01 |
| RF-002 · candidatos em paralelo | T002 [x], T071 | VT existente `hybrid-recommendation`; VT-03 |
| RF-003 · junção | T003 [x] | VT existente `candidate-merger` |
| RF-004 · filtros | T004 [x], T074 | VT existentes; VT-07 |
| RF-005 · re-ranking CSV com degradação | T005 [x], T051, T075, T104 | VT existente `fallback-sagemaker-degradation`; VT-09, VT-16; TT-E01; DM-06 |
| RF-006 · sem 500 | T005 [x], T073, T074 | VT existentes `fallback-*`; VT-05, VT-06, VT-08 |
| RF-007 · explicação | T006 [x], T082, T084 | VT existentes do explicador e da integração; VT-11, VT-12 |
| RF-008 · saúde | T076 | VT existente (controlador); VT-19 |
| RF-009 · logs e métricas | T015 | VT-15 |
| RF-010 · DAG | T007 [x], T046, T050, T061, T063, T104 | PY existente; PY-06; TT-G01; TT-J01; DM-07 |
| RF-011 · DynamoDB | T007 [x], T043, T044 | PY existente (contrato); PY-04; TT existente `dynamodb_criptografado` |
| RF-012 · MemoryDB | T007 [x], T040, T045 | PY existente (contrato); PY-05, PY-07 |
| RF-013 · features | T007 [x], T043, T050 | PY existente `test_glue_transformations` (estendido); TT existentes; TT-G02 |
| RF-014 · treino | T042, T043, T046, T051, T102, T104 | PY-03; PY existente `test_glue_transformations` (CSV de treino determinístico); PY-06 (`nthread` e `seed`); TT-E01; DM-07 (com as pré-condições) |
| RF-015 · Floci | T100 | FL-01 a FL-05 |
| RF-016 · execução local | T008 [x] | VT (o próprio `npm test`) |
| RF-017 · documentação e publicação | T093, T094, T095, T110, T111 | ST-05, ST-08; teste da página (T110); revisão |
| RF-104 · 30 dias e estoque no serviço real | T043, T044, T074 | VT-07, VT-08; PY-04 |
| RF-105 · vetor da sessão | T045, T072 | VT-04; PY-05 |
| RF-106 · falha visível | T073 | VT-05, VT-06 |
| RF-107 · lote coerente | T041, T046, T050, T052, T063 | PY-01, PY-06, TT-G01, TT-G02, TT-J02 |
| RF-108 · roteiro | T031, T090, T091, T104 | TT-R01, TT-I01 (leitura do log e da tarefa pela role de deploy), TH-08, VT-20; DM-01 a DM-05 |
| RF-109 · re-ranker aceito | T042, T051, T075, T104 | TT-E01, TT-E03; PY-03; DM-06 |
| RF-110 · plataforma | T020, T053, T080 a T084, T104 | TT-B01, TT-B02, ST-06, VT-10, VT-11, VT-12, VT-17; DM-08 |
| RF-111 · proveniência das gravadas | T080, T106, T107 | VT-13 |

## Requisitos não funcionais
| Requisito | Tarefas | Testes |
|---|---|---|
| RNF-001 · segurança | T030, T031, T051, T053, T061, T063, T070, T085, T090, T097 | itens do Art. IV; VT-18 |
| RNF-002 · custo | T013, T014, T022, T024, T062, T096, T102, T105 | itens do Art. V |
| RNF-003 · operação | T011, T015, T054 | itens do Art. VI |
| RNF-004 · desempenho | T054, T091, T104 | TT existente `monitoramento_e_orcamento`; VT-20 (cálculo do p95); DM-05 |
| RNF-005 · testes | T008 [x], T010 | CI (`01-recomendacao-ci.yml`) com todas as suítes |
| RNF-006 · CI e cadeia | T010 | TH-05; ES (zizmor) |
| RNF-007 · proveniência | T040, T077, T106 | VT-14, PY-07; revisão |
| RNF-008 · fonte única | T092, T093, T094 | ST-02, ST-03 |
| RNF-101 · workflows do harness | T010, T021, T055, T056, T064, T090 | TH existentes, TH-03, TH-07, TH-08, TH-09 e `estado.py validar` |
| RNF-102 · teto diário | T013, T096, T105 | TT-K01, TH-06, TH-10; DM-10 |
| RNF-103 · gate único | T010, T024 | ST-01; TH-04 (peso só no gate e linhas não cobertas) |
| RNF-104 · sem injeção | T045, T070, T071 | VT-01, VT-02, VT-03; PY-05 |
| RNF-105 · deploy com ABAC | T030, T031, T032, T033 | TT-I01; TT de `infra/conta`; TH-07 (variável com fallback) |
| RNF-106 · cadeia do harness | T010 | TH-05 (`test_um_sha_por_action` e `test_token_oidc_nunca_no_nivel_do_workflow` verdes) |
| RNF-107 · tags | T011, T060 | TT-T01; ES (política de tags do Infracost) |
| RNF-108 · prefixo | T012, T061 | TT-T02, ST-04 |
| RNF-109 · catálogo fictício | T077 | VT-14 |
| RNF-110 · fonte única | T092, T093, T094 | ST-02, ST-03 |
| RNF-111 · posts com fonte | T094, T108 | checklist de proveniência no relatório da fase verificar |

## Critérios de "deu certo" da spec
| Critério | Tarefas | Testes |
|---|---|---|
| 1 · harness verde | T010, T021, T064 | TH-05; `estado.py validar` em `verificar` |
| 2 · demonstração de um dia dentro do teto e sem sobras | T104, T105 | DM-01 a DM-09; DM-10 |
| 3 · cobertura | T101 | esta matriz, conferida na revisão |

## Ids de teste do plano sem tarefa
Nenhum. Todo id da lista "Testes novos" do plano tem tarefa: VT-01 a VT-19, PY-01 e PY-03 a PY-07, TT-T01 a TT-I01, ST-01 a ST-08, TH-01 a TH-06, FL-01 a FL-05 e DM-01 a DM-10.

| Id | Tarefa | Id | Tarefa | Id | Tarefa |
|---|---|---|---|---|---|
| VT-01, VT-02 | T070 | TT-T01 | T011, T060 | ST-01 | T010 |
| VT-03 | T071 | TT-T02 | T012, T061 | ST-02 | T094 |
| VT-04 | T072 | TT-K01 | T013 | ST-03 | T092, T093 |
| VT-05, VT-06 | T073 | TT-K02 | T014, T062 | ST-04 | T012 |
| VT-07, VT-08 | T074 | TT-K03 | T061 | ST-05 | T095 |
| VT-09, VT-16 | T075 | TT-B01, TT-B02 | T053 | ST-06 | T053 |
| VT-10 | T081 | TT-E01 a TT-E03 | T051 | ST-07 | T014, T062 |
| VT-11 | T082 | TT-G01, TT-G02 | T050 | ST-08 | T093 |
| VT-12 | T084 | TT-J01 | T063 | TH-01 | T022 |
| VT-13 | T080, T107 | TT-J02 (novo) | T052 | TH-02 | T023, T056 |
| VT-14 | T077 | TT-A01 | T054 | TH-03 | T021, T064 |
| VT-15 | T015 | TT-R01 | T090 | TH-04 | T024, T096 |
| VT-17 | T083 | TT-I01 | T031 | TH-05 | T010 |
| VT-18 | T085 | PY-01 | T041 | TH-06 | T013, T093 |
| VT-19 | T076 | PY-03 | T042 | TH-07 (novo) | T010, T032, T055, T056, T064 |
| VT-20 (novo) | T091 | PY-04 | T044 | TH-08 (novo) | T021, T064, T090 |
| FL-01 a FL-05 | T100 | PY-05 | T045 | DM-01 a DM-09 | T104 |
| TH-09 (análise 1) | T064 | TH-10 (análise 1) | T096 | | |
| ES | T096, T097 | PY-06 | T046 | DM-10 | T105 |
| | | PY-07 | T040 | | |

## Dependências da plataforma (R9)
| Tarefa da D01 | Depende de (plataforma) | Por quê |
|---|---|---|
| T020 | T040, T043 | campo `consome` e comandos `requisitos` e `dependentes` |
| T022 | T041 | limite do consumidor no `registrar` e no `estender` |
| T023 | T042 | ordem de destroy dos consumidores antes da plataforma |
| T024 | T073 | regra única do gate para as linhas que o Infracost não cobre (A05 da análise 1) |
| T053 | T030, T032, T033, T034, T036, T037, T038 | módulo `registro-produto` completo: catálogo, roles, guardrail, perfil, Cedar, alarme, parâmetro e separação |
| T055 | T043 | `infra.py requisitos` e prazo registrado antes do apply no modelo |
| T056 | T048 | filtro da chave KMS em `PendingDeletion` no modelo de destroy |
| T100 | T038, T080 | composição da plataforma no Floci e separação da parte não emulada |
| T104 | T053, T083, T084 | tag `project` ativa (D-039), ambiente `aws-lab-destroy` e ensaio da plataforma |

## Decisões do dono
| Decisão | Tarefas | Testes |
|---|---|---|
| D-051 · lote como lab sintético fechado | T040 a T046, T050, T051 | PY-01, PY-03 a PY-07; TT-G01, TT-G02, TT-E01 |
| D-052 · MWAA numa janela curta | T021 a T024, T060 a T064 | TH-01 a TH-04, TT-K03, TT-J01 |
| D-053 · guardrail sem tópico extra | T053 | TT-B02 (tópicos negados vazios) |
| D-054 · publicar só a página e o post AWS | T095, T110, T111 | ST-05; teste da página |
| D-056 · plano aprovado e teto de US$ 7,10 | T013, T096, T105 | TT-K01, TH-06, TH-10; ES (Infracost); DM-10 |
