# Matriz requisito → tarefa → teste: `03-mcp-regras-cdb`

Gerada na fase `tarefas` (2026-11-22) a partir da matriz regra → teste do `plan.md`, aprovado pelo dono em 2026-11-22 (D-073), com a coluna de tarefa de `tasks.md`. Regra ou requisito sem tarefa ou sem teste conta como falha (Art. III); o teste `TH-MAT-01` (T002) confere esta tabela contra `specs/03-mcp-regras-cdb/spec.md`.

Ids de teste: UT (Vitest unitário), CT (contrato HTTP em processo), RG (agente com respostas gravadas, D-006), TT (`terraform test` com mock provider), TH (testes do harness), FL (integração no Floci), DM (demonstração real na AWS), ES (esteira `seguranca.yml`).

## Requisitos da spec
| Requisito | Tarefas | Testes |
|---|---|---|
| RF-001 · servidor MCP sem estado na versão `2026-07-28` e validação de cabeçalhos | T032, T052, T060 | CT-MCP-01, CT-MCP-02, TT-MCP-01, FL-02 |
| RF-002 · lane de compatibilidade em `2025-11-25` sem estado (D-072) | T032, T060 | CT-MCP-03, UT-MCP-01, FL-02 |
| RF-003 · recusa de versão não suportada e cabeçalho incoerente com erro de protocolo | T032 | CT-MCP-04 |
| RF-004 · conjunto pequeno e fechado de tools (4 do agente + 1 admin) e descrições em 4 partes | T030, T043, T063 | UT-TOOL-01, CT-TOOL-01, RG-08, DM-01 |
| RF-005 · entrada com JSON Schema estrito (`additionalProperties: false`, datas e valores decimais) | T030, T032 | UT-TOOL-02, CT-TOOL-02 |
| RF-006 · `buscar_regras` por tema e data de referência | T020, T030, T032 | UT-DAT-01, UT-TOOL-03, CT-TOOL-03 |
| RF-007 · `simular_resgate` determinístico e bateria de casos de fronteira | T022, T060 | UT-CALC-01, UT-CALC-02, FL-03 |
| RF-008 · `verificar_aporte` determinístico e somente leitura | T023, T052 | UT-CALC-03, TT-IAM-01 |
| RF-009 · `consultar_aplicacoes_cliente` (`dado_privado`, `^CLI-[0-9]{6}$`, `D03-P2 = A`) | T021, T023 | UT-DAT-02, UT-CLI-01, UT-CLI-02 |
| RF-010 · catálogo de regras como resources (`resources/list` e `resources/read`) | T030, T032, T063 | UT-TOOL-03, CT-RES-01, DM-01 |
| RF-011 · erros estruturados (`isError: true`) em dupla representação e sem vazamento | T031, T032, T033 | UT-ERR-01, UT-ERR-02, CT-ERR-01 |
| RF-012 · resultado de negócio negativo não é erro (`isError: false`) | T022, T023, T030 | UT-NEG-01, UT-TOOL-03 |
| RF-013 · regras em dados versionados validados por JSON Schema, zero literal no código | T020, T051 | UT-DAT-01, UT-DAT-03, TT-SEC-02 |
| RF-014 · regras públicas e regras do produto CDB sintético cobertas (`D03-P5 = A`) | T020 | UT-DAT-01, UT-DAT-04 |
| RF-015 · incerteza visível (`certeza: a_confirmar` preenche `incertezas`) | T020, T022 | UT-DAT-04, UT-CALC-01 |
| RF-016 · ingestão assistida fora desta entrega (`D03-P1 = B`); regras revisadas no PR | T020 | UT-DAT-01 |
| RF-017 · agente com loop por `stopReason`, limite de 6 chamadas de tool e acesso só pelo gateway | T042, T053 | RG-01, RG-02, TT-IAM-03 |
| RF-018 · resposta com citação `id@versao` e verificador determinístico de números com até 1 correção | T040, T042, T063 | UT-VER-01, RG-03, RG-04, DM-04 |
| RF-019 · escalonamento para humano (`handoff_humano`) por motivo | T041, T042 | UT-ERR-03, RG-05 |
| RF-020 · classificação de erros em 3 camadas na ordem e retentativa exponencial | T041, T042 | UT-ERR-03, RG-06 |
| RF-021 · `cliente_id` vindo exclusivamente do chamador autenticado (`D03-P2 = A`) | T042 | UT-AGT-04, RG-07 |
| RF-022 · registro pelo módulo `registro-produto`, classe `leitura_publica` e zero tríade letal | T002, T012, T050, T053 | TH-PLAT-01, TT-PLAT-01 |
| RF-023 · roteiro de demonstração (4 passos da plataforma + passos de produto + `listar_versoes_regra`) | T030, T043, T053, T063, T064 | TT-PLAT-02, RG-09, DM-01 a DM-04 |
| RF-024 · tópico negado do guardrail do produto (`"recomendação de investimento personalizada"`, `D03-P6 = A`) | T053, T063 | TT-PLAT-03, DM-03 |
| RF-025 · logs estruturados sem `dado_privado`, métricas EMF e 4 alarmes do servidor | T033, T054 | UT-LOG-01, UT-LOG-02, TT-OBS-01 |
| RNF-001 · segurança (nada público, D-044, KMS com rotação, menor privilégio, zero escrita) | T012, T051, T052, T053, T054, T055 | TT-SEC-01, TT-SEC-02, TT-IAM-01 a TT-IAM-03, ES |
| RNF-002 · custo consciente (teto US$ 0,50, Budgets diário, zero custo fixo ocioso, workflows e prazo) | T002, T010, T011, T012, T051, T055, T062, T063, T064 | TT-COST-01, TT-COST-02, TH-COST-01, TH-WF-01, ES, DM-06 |
| RNF-003 · operação (tags D-031, prefixo D-029, state com lock, README com até 5 passos) | T001, T011, T055 | TT-TAG-01, TT-PRE-01, TT-REG-01, TH-DOC-01 |
| RNF-004 · testes primeiro, respostas gravadas no CI, matriz completa e integração no Floci | T002, T010, T042, T060, T061 | TH-MAT-01, TH-WF-01, RG-01 a RG-09, FL-01 a FL-04 |
| RNF-005 · proveniência em domínios oficiais, dados 100% sintéticos e revisão humana do relatório | T020, T021, T064, T065, T070 | UT-DAT-01, UT-DAT-02, revisão humana (T065) |
| RNF-006 · região `us-east-1` e disponibilidade conferida antes do apply | T011, T062 | TT-REG-01, nota de conferência (T062) |
| RNF-007 · desempenho (`p95 <= 500 ms` nas tools determinísticas no servidor) | T060, T063 | FL-03, DM-05 |

## Regras da constituição
| Regra | Tarefas | Testes |
|---|---|---|
| Art. I · SDD e código bloqueado antes de `implementar` | T001 | TH (`gate_sdd.py`, `pre-commit`), `TH-DOC-01` |
| Art. II · decisões do dono registradas e não assumidas | T000, T063, T065, T072 | `memoria.py auditar`, `estado.py validar` |
| Art. III · testes primeiro e 100% de cobertura na matriz | T002, T010, T060, T061 | TH-MAT-01, TH-WF-01, FL-01 a FL-04 |
| Art. IV · segurança por padrão (KMS, IAM, D-044, esteira limpa) | T012, T031, T033, T051 a T055 | TT-SEC-01, TT-SEC-02, TT-IAM-01 a 03, UT-ERR-02, UT-LOG-02, ES |
| Art. V · custo consciente, Budgets diário e destroy sem sobras | T002, T010, T051, T055, T060, T063, T064 | TT-COST-01, TT-COST-02, TH-COST-01, TH-WF-01, FL-04, DM-06 |
| Art. VI · tags, prefixo, alarmes, state remoto e README | T001, T011, T033, T054, T055, T071 | TT-TAG-01, TT-PRE-01, TT-REG-01, TT-OBS-01, TH-DOC-01 |
| Art. VII · lente da certificação CCAR-F | T001, T040 a T043, T070 | UT-VER-01, UT-ERR-03, RG-01 a RG-09 |
| Art. VIII · proveniência e privacidade (dados sintéticos, sem links de sessão) | T000, T020, T021, T033, T065, T070 | UT-DAT-01, UT-DAT-02, UT-LOG-02, `test_links_de_sessao.py` |

## Critérios de sucesso da spec
| Critério | Tarefas | Testes |
|---|---|---|
| 1 · respostas com proveniência (`id@versao` e todo número vindo de tool do turno) | T040, T042, T043, T063 | UT-VER-01, RG-03, RG-04, RG-09, DM-04 |
| 2 · contas certas (bateria de cálculo com diferença `R$ 0,00`) | T022, T023, T060 | UT-CALC-01, UT-CALC-02, UT-CALC-03, FL-03 |
| 3 · plataforma provada pelo 1º consumidor (roteiro de 4 passos pelo contrato v1.1.0, sem ARN à mão) | T012, T043, T050, T053, T063 | TH-PLAT-01, TT-PLAT-01, TT-PLAT-02, RG-09, DM-01 a DM-03 |
| 4 · custo abaixo de `teto_diario_usd` (US$ 0,50) e destroy sem sobras | T010, T051, T060, T063, T064 | TT-COST-01, TH-WF-01, FL-04, DM-06 |

## Decisões do dono específicas da D03
| Decisão | Tarefas | Testes |
|---|---|---|
| D-071 (`D03-P1 = B`) · ingestão assistida fora desta entrega; regras versionadas no PR | T020 | UT-DAT-01 |
| D-071 (`D03-P2 = A`) · aplicações sintéticas (`CLI-000101`..`000104`) e `consultar_aplicacoes_cliente` (`dado_privado`, `cliente_id` pelo canal) | T021, T023, T042, T053 | UT-DAT-02, UT-CLI-01, UT-CLI-02, UT-AGT-04, RG-07, TT-PLAT-01 |
| D-071 (`D03-P4 = A`) · somente HTTP sem estado pelo gateway, sem pacote local `stdio` | T032, T052 | CT-MCP-01 a 04, TT-SEC-01 |
| D-071 (`D03-P5 = A`) · parâmetros do CDB sintético (100% CDI, R$ 100 a R$ 1M, 1.080 dias, sem carência, corte 16h, `HALF_UP`) | T020, T022, T023 | UT-DAT-01, UT-CALC-01 a 03 |
| D-071 (`D03-P6 = A`) · tópico negado `"recomendação de investimento personalizada"` no guardrail | T043, T053, T063 | TT-PLAT-03, RG-09, DM-03 |
| D-074 (substitui `D03-P9` na arquitetura AWS) · arquiteturas AWS consomem 100% da `00-plataforma-agentes` com foco em produção AWS; IA aplicada 100% alinhada às aulas | T000 [x], T050, T053 | `TestConsumoCompletoDaPlataformaD074`, TH-PLAT-01, TT-PLAT-01 a 03 |
| D-071 (`D03-P10 = A`) · classe `leitura_publica` em versão menor (`1.1.0`) do contrato da plataforma | T050, T053 | TT-PLAT-01 |
| D-072 (`E16`) · lane de compatibilidade MCP somente na versão `2025-11-25` | T032, T060 | CT-MCP-03, CT-MCP-04, FL-02 |
| D-073 (`D03-P7 = A`, `D03-P11 = A`) · plano aprovado e `teto_diario_usd = 0.50` com cota de 300.000 tokens | T011, T042, T051, T055, T064 | TT-COST-01, TH-COST-01, RG-01, DM-06 |
