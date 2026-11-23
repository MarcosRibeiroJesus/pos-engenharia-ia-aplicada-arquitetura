# Tarefas: MCP de regras do CDB com liquidez diária

- **Projeto:** `03-mcp-regras-cdb` · **Plano:** `plan.md`, aprovado pelo dono em 2026-11-22 com o teto diário de US$ 0,50 e cota de 300.000 tokens (D-073). O hash sha256 está registrado em `harness/estado.json`, campo `plano_aprovado`
- **Data:** 2026-11-22 · **Autor:** arquiteto-aws (orquestração Antigravity) · **Matriz requisito → tarefa → teste:** `matriz.md`
- **Decisões aplicadas:** D-001, D-006, D-007, D-008, D-011, D-013, D-021, D-022, D-024, D-029, D-030, D-031, D-033, D-034, D-039, D-043, D-044, D-047, D-058, D-062, D-063, D-065, D-068, D-069, D-071, D-072 e D-073
- **Implementação limpa a partir do SDD:** não há código pré-SDD da D03 no repositório; todas as tarefas começam abertas (`[ ]`), com teste vermelho antes do código

`M/` abrevia `modulos/03-mcp/arquitetura/`.

Uma tarefa por sessão de trabalho. Cada tarefa começa por um teste que falha.
- `[P]` marca tarefas que podem rodar em paralelo, depois das dependências delas.
- `[x]` só depois do teste verde, da revisão independente em outra instância e do commit (`feat(03-mcp-regras-cdb): Txxx ...`, com `Revisado-por:` no corpo, skill `executar-tarefas`).
- Cada tarefa cita os requisitos que cobre (RF, RNF ou artigo) e os ids de teste da matriz do plano.
- Entre colchetes, depois do id, fica o especialista dono (`harness/especialistas.json`). `[DONO]` é tarefa do Marcos: nenhum agente a executa.
- **Ids de teste:** UT = Vitest unitário do servidor e do agente; CT = teste de contrato com cliente MCP HTTP em processo; RG = agente com respostas gravadas (D-006); TT = `terraform test` com mock provider (`command = plan`); TH = testes do harness (`harness/testes/test_<assunto>.py`, D-043); FL = integração no Floci; DM = demonstração real na AWS; ES = esteira `seguranca.yml`.
- **Regra de teste vermelho para verificadores:** quando o teste é uma regra transversal (por exemplo, "nenhuma ação `*` em recurso `*`" ou "nenhum literal de alíquota fora dos dados"), o vermelho é uma fixture que viola a regra e precisa reprovar.

## Fase 0 · Preparação, conferência de fidelidade e contrato da plataforma
- [ ] T000 [pesquisador] Extrair e resumir as legendas e PDFs das unidades 04 a 08 da D03 antes da análise · Art. II, D-071 (D03-P9 = A) · revisão de fidelidade
  - **Teste vermelho:** verificação documental que confere a presença da nota de conferência de fidelidade das unidades 04 a 08 (servidor MCP do zero, fachada de sistema legado, autenticação/autorização/rate limit, publicação/transports e agente de operações) contra `spec.md` e `plan.md`, sem incluir material bruto do curso nem dados do aluno (Art. VIII, D-001).
  - **Arquivos:** resumo próprio de conferência na conversa/nota de análise (sem texto literal da aula no repositório público, D-001).
  - **Aceite:** confirma se todos os conceitos técnicos das unidades 04 a 08 estão representados nos requisitos `RF-001` a `RF-025` e no `E11`, apontando qualquer ajuste antes do gate `sdd-analisar`.
  - **Depende de:** fase `tarefas` / `analisar`.
- [ ] T001 [operador-harness] Mover os ADRs para `M/adr/` e `azure.md` para `M/docs/azure.md` com redirecionamentos · Art. I, Art. VII · TH-DOC-01 (parte)
  - **Teste vermelho:** `harness/testes/test_d03_artefatos.py` afirma que `M/adr/0001-*.md` a `M/adr/0006-*.md` e `M/docs/azure.md` existem, que todo link relativo `adr/...` e `azure.md` de `specs/03-mcp-regras-cdb/spec.md` e `plan.md` resolve para um arquivo existente, e que o sha256 de `specs/03-mcp-regras-cdb/plan.md` continua idêntico ao de `plano_aprovado` no `harness/estado.json`.
  - **Arquivos:** `git mv specs/03-mcp-regras-cdb/adr/*.md M/adr/`, `git mv specs/03-mcp-regras-cdb/azure.md M/docs/azure.md`, arquivos de redirecionamento em `specs/03-mcp-regras-cdb/adr/*.md` e `specs/03-mcp-regras-cdb/azure.md`, e `harness/testes/test_d03_artefatos.py`.
  - **Aceite:** o conteúdo completo dos ADRs 0001 a 0006 fica em `M/adr/` e o da comparativa Azure em `M/docs/azure.md`; os redirecionamentos em `specs/03-mcp-regras-cdb/` mantêm todos os links funcionando sem tocar no `plan.md` (D-033).
  - **Depende de:** fase `implementar` (o `gate_sdd.py` bloqueia `M/` antes dela).
- [ ] T002 [P] [operador-harness] Declarar `consome: ["00-plataforma-agentes"]` e validar matriz completa da D03 no harness · Art. III, Art. V, RNF-002, RNF-004, RF-022 · TH-MAT-01, `estado.py validar`
  - **Teste vermelho:** `TH-MAT-01` em `harness/testes/test_d03_artefatos.py` lê `specs/03-mcp-regras-cdb/spec.md` e `specs/03-mcp-regras-cdb/matriz.md` e falha se algum `RF-001`..`RF-025` ou `RNF-001`..`RNF-007` não tiver linha na matriz com tarefa e teste, ou se a entrada `03-mcp-regras-cdb` em `harness/estado.json` não declarar `consome: ["00-plataforma-agentes"]`.
  - **Arquivos:** `harness/estado.json`, `harness/testes/test_d03_artefatos.py`.
  - **Aceite:** `python3 harness/estado.py validar` e `test_d03_artefatos.py` verdes; `infra.py` impõe que o prazo da D03 fique pelo menos 1 h antes do prazo da plataforma (ADR-0007 da plataforma, ADR-0006 da D03).
  - **Depende de:** T001.

## Fase 1 · Regras da constituição como testes, workflows e esqueleto Terraform
- [ ] T010 [engenheiro-terraform] Workflows de apply, destroy e CI da D03 a partir dos modelos · Art. III, Art. V, RNF-002, RNF-004 · TH-WF-01, `estado.py validar`
  - **Teste vermelho:** `TH-WF-01` em `harness/testes/test_workflows_03_mcp.py` reprova se `.github/workflows/03-mcp-regras-cdb-apply.yml`, `03-mcp-regras-cdb-destroy.yml` ou `03-mcp-regras-cdb-ci.yml` não existirem, se apply/destroy divergirem da estrutura de `harness/modelos/apply.yml` e `destroy.yml` (`prazo_horas` ≤ 23, `confirm_stack`, ambiente `aws-lab-destroy`, OIDC só no job, verificação de sobras pela tag `project=03-mcp-regras-cdb` e `harness/infra.py`), se as actions não usarem o mesmo SHA do repositório, ou se o workflow de CI citar `bedrock` ou `Converse`.
  - **Arquivos:** `.github/workflows/03-mcp-regras-cdb-apply.yml`, `.github/workflows/03-mcp-regras-cdb-destroy.yml`, `.github/workflows/03-mcp-regras-cdb-ci.yml`, `harness/testes/test_workflows_03_mcp.py`.
  - **Aceite:** `test_workflows.py` e `test_workflows_03_mcp.py` verdes; `03-mcp-regras-cdb-ci.yml` roda Vitest (`npm test`) e `terraform fmt -check`, `validate` e `test` sem credencial da AWS.
  - **Depende de:** T001.
- [ ] T011 [engenheiro-terraform] Esqueleto Terraform da D03 com tags, prefixo, região `us-east-1` e state remoto com lock · Art. VI, RNF-003, RNF-006 · TT-TAG-01, TT-PRE-01, TT-REG-01
  - **Teste vermelho:** `M/infra/terraform/tests/tags.tftest.hcl` (a partir de `harness/modelos/tags.tftest.hcl`) afirma `project = "03-mcp-regras-cdb"`, `module` em kebab e `managed-by = "terraform"`; `tests/regiao.tftest.hcl` afirma `var.regiao == "us-east-1"` e `versions.tf` com `backend "s3" { use_lockfile = true }`; `tests/prefixo.tftest.hcl` reprova fixture com nome fora de `^03-mcp-regras-cdb-` e fora das exceções do ADR-0006.
  - **Arquivos:** `M/infra/terraform/{versions.tf,providers.tf,variables.tf,main.tf,outputs.tf,terraform.tfvars.example}`, `M/infra/terraform/tests/{tags.tftest.hcl,regiao.tftest.hcl,prefixo.tftest.hcl}`.
  - **Aceite:** `terraform fmt -check`, `terraform validate`, `terraform test`, `tflint` e `checkov` verdes; `TH-COST-01` confirma que o default de `var.teto_diario_usd` em `variables.tf` é `0.50` (igual ao `harness/estado.json`).
  - **Depende de:** T010.
- [ ] T012 [P] [engenheiro-seguranca] Regras transversais de segurança, custo e isolamento da plataforma sobre o plan da D03 · Art. IV, Art. V, RNF-001, RNF-002, RF-022 · TT-SEC-01, TT-COST-02, TH-PLAT-01
  - **Teste vermelho:** script de verificação de plan e código em `M/tests/infra/test_regras_plan.test.ts` (e `TH-PLAT-01` em `harness/testes/test_d03_artefatos.py`) que reprova fixtures violadoras com: (1) política com `Principal "*"` ou curinga em condição de conta (`D-044`, `TT-SEC-01`); (2) declaração IAM com ação `*` e recurso `*`; (3) presença de `aws_nat_gateway`, `aws_vpc_endpoint` do tipo `Interface`, cluster ou instância (`TT-COST-02`); (4) tabela ou cache de sessão (`TT-MCP-01`); (5) recurso bruto `aws_bedrockagentcore_*` fora do módulo da plataforma ou string `arn:aws:bedrock` hardcoded fora de fixtures gravadas (`TH-PLAT-01`).
  - **Arquivos:** `M/package.json`, `M/tsconfig.json`, `M/vitest.config.ts`, `M/tests/infra/test_regras_plan.test.ts`, `M/tests/infra/fixtures/`, `harness/testes/test_d03_artefatos.py`.
  - **Aceite:** todas as fixtures violadoras reprovam com mensagem explícita e o esqueleto da T011 passa.
  - **Depende de:** T011.

## Fase 2 · Núcleo: dados versionados e motor determinístico de cálculo do CDB
- [ ] T020 [engenheiro-mcp] JSON Schemas e dados versionados das regras públicas e das regras do produto CDB sintético · Art. VIII, RF-006, RF-013, RF-014, RF-015, RF-016, RNF-005, D-071 (D03-P1 = B, D03-P5 = A) · UT-DAT-01, UT-DAT-03, UT-DAT-04
  - **Teste vermelho:** `M/tests/unit/regras-dados.test.ts` reprova se: (1) `M/dados/regras_cdb.json` falhar contra `M/schemas/regra.schema.json`; (2) faltar algum dos 9 temas do enum do `RF-006` (`rentabilidade`, `imposto_renda`, `iof`, `resgate`, `aporte`, `prazo`, `carencia`, `garantia`, `calendario`); (3) duas versões do mesmo `id` tiverem vigências sobrepostas; (4) alguma regra pública tiver `fonte.url` fora dos domínios oficiais (`planalto.gov.br`, `gov.br/receitafederal`, `bcb.gov.br`, `b3.com.br`, `anbima.com.br`) ou estiver `a_confirmar` na data da demonstração; (5) as regras do produto divergirem dos parâmetros aprovados em `D03-P5 = A` (100% CDI, aporte R$ 100 a R$ 1.000.000, vencimento 1.080 dias corridos, carência 0, crédito no mesmo dia útil, corte 16h `America/Sao_Paulo`, arredondamento `HALF_UP`); (6) uma busca estática em `M/src/` encontrar literais numéricos das tabelas de IR/IOF/limites fora de `M/dados/` e `M/tests/`.
  - **Arquivos:** `M/schemas/regra.schema.json`, `M/dados/regras_cdb.json`, `M/src/servidor/dominio/validador-dados.ts`, `M/tests/unit/regras-dados.test.ts`.
  - **Aceite:** `UT-DAT-01`, `UT-DAT-03` e `UT-DAT-04` verdes, com todas as fontes normativas datadas e conferidas conforme o ADR-0003.
  - **Depende de:** T012.
- [ ] T021 [P] [engenheiro-mcp] JSON Schema e dados sintéticos de aplicações de clientes (`CLI-000101` a `CLI-000104`) · Art. VIII, RF-009, RNF-005, D-071 (D03-P2 = A) · UT-DAT-02
  - **Teste vermelho:** `M/tests/unit/aplicacoes-dados.test.ts` reprova se `M/dados/aplicacoes_clientes.json` falhar contra `M/schemas/aplicacoes.schema.json`, se algum registro não tiver `sintetico: true`, se algum `cliente_id` sair de `^CLI-[0-9]{6}$`, se houver qualquer padrão de CPF/e-mail/nome civil/conta bancária, ou se faltarem os 4 perfis sintéticos de fronteira (`CLI-000101` com 15 dias corridos para IOF + IR 22,5%; `CLI-000102` com 3 aplicações nas faixas de IR 20%, 17,5% e 15% ≥ 721 dias; `CLI-000103` sem aplicações; `CLI-000104` com R$ 500.000,00 para regra do FGC e teste de isolamento `RF-021`).
  - **Arquivos:** `M/schemas/aplicacoes.schema.json`, `M/dados/aplicacoes_clientes.json`, `M/tests/unit/aplicacoes-dados.test.ts`.
  - **Aceite:** `UT-DAT-02` verde; fixtures 100% sintéticas e revisáveis no PR.
  - **Depende de:** T012.
- [ ] T022 [engenheiro-mcp] Motor decimal determinístico de simulação de resgate e bateria de casos de fronteira (`simular_resgate`) · RF-007, RF-012, RF-015, ADR-0003 · UT-CALC-01, UT-CALC-02, UT-NEG-01 (resgate)
  - **Teste vermelho:** `M/tests/unit/calculo-resgate.test.ts` executa a bateria de casos calculados à mão cobrindo: cada faixa do IR (22,5%, 20%, 17,5%, 15%), cada fronteira de faixa (180/181, 360/361, 720/721 dias corridos), IOF no 1º (96%), 15º (50%), 29º (3%) e 30º dia (0%), resgate no dia da aplicação, valor mínimo (`"100.00"`) e máximo (`"1000000.00"`), período com feriado nacional ANBIMA, ordem e base de cálculo lidas da regra versionada (`rendimento_bruto` → `IOF` → `IR sobre rendimento - IOF`), propagação de `incertezas` quando uma regra marcada `a_confirmar` é injetada, negativo de negócio (`permitido: false`, `isError: false` para resgate antes da aplicação, após o vencimento de 1.080 dias ou em dia não útil) e erro `fora_da_cobertura` (`isError: true`) para data fora do calendário versionado.
  - **Arquivos:** `M/src/servidor/dominio/decimal-cdb.ts`, `M/src/servidor/dominio/calculo-cdb.ts`, `M/tests/unit/calculo-resgate.test.ts`.
  - **Aceite:** diferença máxima de `R$ 0,00` em todos os casos da bateria (`critério de sucesso 2`); zero literal de alíquota/faixa no código (`UT-DAT-03` segue verde).
  - **Depende de:** T020.
- [ ] T023 [P] [engenheiro-mcp] Verificação determinística de aporte (`verificar_aporte`) e consulta de aplicações (`consultar_aplicacoes_cliente`) · RF-008, RF-009, RF-012, ADR-0003 · UT-CALC-03, UT-CLI-01, UT-CLI-02, UT-NEG-01 (aporte e cliente)
  - **Teste vermelho:** `M/tests/unit/aporte-e-aplicacoes.test.ts` testa: (1) `verificar_aporte` retornando `elegivel: true/false`, `motivo` (`abaixo_do_minimo`, `acima_do_maximo`, `fora_do_horario`, `dia_nao_util` no fuso `America/Sao_Paulo`, `E13`) e `regras_aplicadas` (`id@versao`), sempre com `isError: false` nos negativos de negócio e sem mutar o estado; (2) `consultar_aplicacoes_cliente` retornando as aplicações de `CLI-000101`, `CLI-000102` e `CLI-000104`, e devolvendo exatamente o mesmo objeto `{ aplicacoes: [], motivo: "cliente_sem_aplicacoes" }` (`isError: false`) para `CLI-000103` e para um ID inexistente `CLI-999999`.
  - **Arquivos:** `M/src/servidor/tools/verificar-aporte.ts`, `M/src/servidor/tools/consultar-aplicacoes-cliente.ts`, `M/tests/unit/aporte-e-aplicacoes.test.ts`.
  - **Aceite:** `UT-CALC-03`, `UT-CLI-01`, `UT-CLI-02` e `UT-NEG-01` verdes.
  - **Depende de:** T020, T021.

## Fase 3 · Servidor MCP sem estado (`2026-07-28` + lane `2025-11-25`)
- [ ] T030 [engenheiro-mcp] Catálogo das 5 tools, JSON Schemas estritos de entrada, `buscar_regras`, `listar_versoes_regra` e resources do catálogo · RF-004, RF-005, RF-006, RF-010, RF-012, RF-023 · UT-TOOL-01, UT-TOOL-02, UT-TOOL-03
  - **Teste vermelho:** `M/tests/unit/catalogo-tools-e-regras.test.ts` reprova se: (1) o catálogo não tiver exatamente as 4 tools do agente (`buscar_regras`, `simular_resgate`, `verificar_aporte`, `consultar_aplicacoes_cliente`) mais a tool administrativa sem chamador (`listar_versoes_regra`); (2) alguma descrição não contiver as 4 partes obrigatórias (o que faz, quando usar, quando **não** usar, unidades de entrada/saída) ou houver sobreposição no "quando usar"; (3) algum JSON Schema de entrada não tiver `additionalProperties: false` ou aceitar data fora de `AAAA-MM-DD` / valor fora de `^\d{1,9}(\.\d{1,2})?$`; (4) `buscar_regras` não retornar lista vazia com `motivo: "sem_regra_vigente"` (`isError: false`) quando não há regra vigente na data; (5) `resources/list` e `resources/read` divergirem do conteúdo retornado por `buscar_regras`.
  - **Arquivos:** `M/src/servidor/tools/{catalogo.ts,buscar-regras.ts,simular-resgate.ts,listar-versoes-regra.ts}`, `M/src/servidor/resources/catalogo-regras.ts`, `M/tests/unit/catalogo-tools-e-regras.test.ts`.
  - **Aceite:** `UT-TOOL-01`, `UT-TOOL-02` e `UT-TOOL-03` verdes.
  - **Depende de:** T022, T023.
- [ ] T031 [engenheiro-mcp] Envelope de erros estruturados em dupla representação (`isError: true`) e sanitização contra vazamento · RF-011, Art. IV · UT-ERR-01, UT-ERR-02
  - **Teste vermelho:** `M/tests/unit/erros-servidor.test.ts` injetando falhas para as 4 categorias do `RF-011` (`entrada_invalida`, `fora_da_cobertura`, `dados_indisponiveis`, `interno`) e verificando que: (1) nunca escapa exceção para o transporte; (2) o retorno traz `isError: true`, `structuredContent: { categoria, retentavel, mensagem, campo? }` e `content: [{ type: "text", text: JSON.stringify(...) }]` idênticos (`E4`); (3) uma exceção interna contendo caminho `/var/task/...`, stack trace, nome de tabela DynamoDB ou ARN `arn:aws:...` sai com `categoria: "interno"` e `mensagem` sanitizada sem nenhum desses detalhes (`UT-ERR-02`).
  - **Arquivos:** `M/src/servidor/protocolo/erros-mcp.ts`, `M/tests/unit/erros-servidor.test.ts`.
  - **Aceite:** `UT-ERR-01` e `UT-ERR-02` verdes.
  - **Depende de:** T030.
- [ ] T032 [engenheiro-mcp] Roteador HTTP do protocolo MCP `2026-07-28` sem estado e lane `2025-11-25`, com suíte de contrato (`CT`) · RF-001, RF-002, RF-003, RF-010, RF-011, D-011, D-072, ADR-0002 · CT-MCP-01 a CT-MCP-04, CT-TOOL-01 a CT-TOOL-03, CT-RES-01, CT-ERR-01, UT-MCP-01
  - **Teste vermelho:** `M/tests/contract/servidor-mcp.contract.test.ts` sobe o servidor HTTP em processo (inclusive duas instâncias separadas em portas distintas) e testa com cliente MCP HTTP: (1) `2026-07-28`: `tools/list` e `tools/call` como primeiras requisições sem `initialize`, validação de `MCP-Protocol-Version`, `Mcp-Method` e `Mcp-Name`, ausência de `Mcp-Session-Id` na resposta, e resultados idênticos entre duas instâncias (`CT-MCP-01`, `CT-MCP-02`); (2) lane `2025-11-25`: com e sem `initialize`, retornando as mesmas tools e os mesmos resultados sem estado de sessão (`CT-MCP-03`); (3) versão fora de `["2025-11-25", "2026-07-28"]` (ex.: `2025-03-26`, `2025-06-18`) ou cabeçalho `Mcp-Method`/`Mcp-Name`/`MCP-Protocol-Version` incoerente com o corpo JSON-RPC recusados com erro `-32020` / `-32600` sem executar tool (`CT-MCP-04`); (4) ausência de anúncio ou chamada de `sampling` e `elicitation` (`UT-MCP-01`); (5) contrato das tools, resources e erros estruturados (`CT-TOOL-01` a `03`, `CT-RES-01`, `CT-ERR-01`).
  - **Arquivos:** `M/src/servidor/protocolo/roteador-mcp.ts`, `M/src/servidor/http-server.ts`, `M/tests/contract/servidor-mcp.contract.test.ts`.
  - **Aceite:** toda a suíte `CT-*` e `UT-MCP-01` verde.
  - **Depende de:** T031.
- [ ] T033 [P] [engenheiro-mcp] Repositório DynamoDB somente leitura, handler da Lambda Function URL, logger sem `dado_privado` e métricas EMF · RF-025, RNF-001, RNF-003, Art. VI, Art. VIII · UT-LOG-01, UT-LOG-02
  - **Teste vermelho:** `M/tests/unit/logger-e-handler.test.ts` verifica que: (1) cada requisição gera log JSON estruturado com `versao_protocolo`, `metodo`, `tool`, `categoria_resultado`, `duracao_ms` e `correlation_id`, mais o bloco `_aws` do CloudWatch EMF com contadores por tool e por categoria de erro (`UT-LOG-01`); (2) numa chamada a `consultar_aplicacoes_cliente` (`dado_privado`) para `CLI-000101`, nem `CLI-000101` nem os argumentos/resultados da aplicação aparecem no texto do log (`UT-LOG-02`).
  - **Arquivos:** `M/src/servidor/infra/repositorio-dynamodb.ts`, `M/src/servidor/infra/logger-emf.ts`, `M/src/servidor/handler.ts`, `M/tests/unit/logger-e-handler.test.ts`.
  - **Aceite:** `UT-LOG-01` e `UT-LOG-02` verdes; o adaptador DynamoDB converte falhas de leitura do SDK na categoria retentável `dados_indisponiveis` (`RF-011`).
  - **Depende de:** T032.

## Fase 4 · Componente Claude: agente de atendimento, verificador determinístico e respostas gravadas
- [ ] T040 [engenheiro-claude] Verificador determinístico de citações `id@versao` e números na resposta do modelo · RF-018, Art. VII, ADR-0005 · UT-VER-01
  - **Teste vermelho:** `M/tests/unit/verificador-resposta.test.ts` exercita respostas contendo valores monetários (`R$ 10.052,34`), percentuais (`100%`, `22,5%`, `50%`), contagens de dias (`15 dias corridos`, `11 dias úteis`), datas ISO (`2026-11-22`) e códigos (`regra-iof-tvm@2007.1`, `CLI-000101`, `APL-2026-001`), e afirma que: (1) resposta com número que aparece nos resultados/argumentos normalizados das tools do turno e com pelo menos uma citação `id@versao` válida das tools do turno é aprovada; (2) datas ISO e códigos `id@versao`/`CLI-*`/`APL-*` não geram falso positivo (R4 do plano); (3) resposta com qualquer número inventado (ausente das tools do turno) ou sem citação `id@versao` reprova e devolve a lista estruturada de divergências para a mensagem de correção ao modelo.
  - **Arquivos:** `M/src/agente/verificador-resposta.ts`, `M/tests/unit/verificador-resposta.test.ts`.
  - **Aceite:** `UT-VER-01` verde.
  - **Depende de:** T022.
- [ ] T041 [P] [engenheiro-claude] Classificador de erros em 3 camadas, retentativa exponencial (1, 2 e 4 s) e falha fechada para `handoff_humano` · RF-019, RF-020, ADR-0005 · UT-ERR-03
  - **Teste vermelho:** `M/tests/unit/classificador-erros.test.ts` testa cada linha da tabela do contrato `comum` da plataforma (`politica_negada`, `requer_aprovacao_humana`, `guardrail_entrada`, `guardrail_saida`, `autenticacao`, `limite_taxa`, `alvo_indisponivel`, `falha_transitoria`) e cada linha da tabela `RF-011` da D03 (`entrada_invalida`, `fora_da_cobertura`, `dados_indisponiveis`, `interno`), além de um erro com texto inédito, verificando que: (1) a ordem de precedência respeita as 3 camadas do `RF-020` (um erro da D03 nunca cai no `erro_desconhecido` da plataforma); (2) apenas as categorias retentáveis acionam o backoff exponencial (1, 2 e 4 s, até 3 tentativas, com relógio injetável nos testes); (3) `politica_negada`, `requer_aprovacao_humana`, erro não retentável, erro retentável esgotado e `erro_desconhecido` escalam para `handoff_humano` com o motivo e as regras consultadas (`RF-019`).
  - **Arquivos:** `M/src/agente/classificador-erros.ts`, `M/tests/unit/classificador-erros.test.ts`.
  - **Aceite:** `UT-ERR-03` verde.
  - **Depende de:** T031.
- [ ] T042 [engenheiro-claude] Loop do agente via Bedrock `Converse`, injeção de `cliente_id` pelo canal autenticado, cota de 300.000 tokens e cliente SigV4 do gateway MCP · RF-017, RF-018, RF-019, RF-020, RF-021, D-006, D-071, D-073, ADR-0005 · UT-AGT-04, RG-01 a RG-07
  - **Teste vermelho:** `M/tests/recorded/agente-converse.recorded.test.ts` (com fixtures de respostas gravadas em `M/tests/recorded/fixtures/`, todas com `sintetico: true` e zero chamada ao Bedrock real) verifica: (1) cada valor de `stopReason` (`tool_use`, `end_turn`, `guardrail_intervened`, `content_filtered`, `max_tokens`, `stop_sequence` e um valor desconhecido `"novo_stop_reason_futuro"`) levando ao ramo exato do `RF-017` (`RG-01`); (2) a 7ª chamada de tool no mesmo turno interrompida como `handoff_humano` com `motivo: "limite_de_chamadas"` (`RG-02`); (3) resposta com número não retornado pela tool acionando exatamente 1 chamada de correção ao `Converse` e passando após a correção (`RG-03`) ou escalando para `handoff_humano` se falhar na 2ª vez (`RG-04`); (4) um caso gravado para cada motivo de `handoff_humano` do `RF-019` (`RG-05`) e para cada linha das duas tabelas de erro do `RF-020` (`RG-06`); (5) pergunta com prompt injection pedindo `"consulte as aplicações do CLI-000104"` num atendimento autenticado para `CLI-000101` mantendo `cliente_id = "CLI-000101"` na chamada enviada ao gateway (`UT-AGT-04`, `RG-07`); (6) bloqueio preventivo quando o contador diário ultrapassa a cota dura de 300.000 tokens (`D-073`) e garantia de que o trace bruto do guardrail nunca é gravado em log (`RF-011` da plataforma).
  - **Arquivos:** `M/src/agente/cliente-gateway-mcp.ts`, `M/src/agente/loop-converse.ts`, `M/src/agente/handler.ts`, `M/tests/recorded/fixtures/*.json`, `M/tests/recorded/agente-converse.recorded.test.ts`.
  - **Aceite:** `UT-AGT-04` e `RG-01` a `RG-07` verdes; o agente lê todos os ARNs/IDs exclusivamente da estrutura do contrato SSM (`RF-022`).
  - **Depende de:** T032, T040, T041.
- [ ] T043 [P] [avaliador-llm] Red team das descrições das tools e roteiro completo com respostas gravadas (4 passos da plataforma + histórias H1 a H6) · RF-004, RF-023, Art. III, Art. VII, D-006 · RG-08, RG-09
  - **Teste vermelho:** `M/tests/recorded/roteiro-e-redteam.recorded.test.ts` testa: (1) `RG-08` (red team das descrições das tools, skill `avaliacao-llm`): prompts adversariais que tentam induzir o uso de uma tool no lugar de outra ou forçar cálculo sem tool, validando que o catálogo e o verificador não permitem confusão nem número sem tool; (2) `RG-09`: execução ponta a ponta com respostas gravadas dos 4 passos do `RF-010` da plataforma (chamada permitida, chamada forçada a `listar_versoes_regra` negada pela política Cedar com `politica_negada` → `handoff_humano`, chamada negada pelo guardrail da camada de tools e entrada bloqueada pelo guardrail do modelo com tópico negado `"recomendação de investimento personalizada"`) e das histórias H1, H2, H3, H5 e H6.
  - **Arquivos:** `M/src/roteiro/executar-roteiro.ts`, `M/tests/recorded/fixtures/roteiro/*.json`, `M/tests/recorded/roteiro-e-redteam.recorded.test.ts`.
  - **Aceite:** `RG-08` e `RG-09` verdes; todas as fixtures do roteiro declaram `sintetico: true`.
  - **Depende de:** T042.

## Fase 5 · Infraestrutura AWS em Terraform com TDD e consumo da plataforma
- [ ] T050 [engenheiro-terraform] Emenda `1.1.0` do contrato e do módulo `registro-produto` da plataforma com a classe `leitura_publica` · RF-022, RF-023, D-071 (D03-P10 = A), ADR-0004 · TT-PLAT-01 (pré-requisito)
  - **Teste vermelho:** teste do schema e do módulo em `plataforma/agentes/` (ou fixture espelhada validada pelo `TH-PLAT-01`) reprova se a classe `"leitura_publica"` não for aceita pelo contrato `v1.schema.json` (`versao_contrato = "1.1.0"`) ou se for contada como perna da tríade letal.
  - **Arquivos:** atualização do enum de classes em `plataforma/agentes/contrato/v1.schema.json` (e no módulo `registro-produto` quando criado na plataforma) mais a fixture de contrato `M/tests/fixtures/contrato_v1_1_0.json`.
  - **Aceite:** `"leitura_publica"` aceita na validação "toda tool tem pelo menos uma classe" e isenta das 3 pernas da tríade letal (`dado_privado`, `conteudo_nao_confiavel`, `canal_saida`).
  - **Depende de:** T012.
- [ ] T051 [engenheiro-terraform] Módulos `nucleo` (KMS e AWS Budgets diário de US$ 0,50) e `dados` (2 tabelas DynamoDB cifradas com PITR) · Art. IV, Art. V, RNF-001, RNF-002, RF-013, D-073, ADR-0003, ADR-0006 · TT-SEC-02 (KMS e DynamoDB), TT-COST-01, TH-COST-01
  - **Teste vermelho:** `M/infra/terraform/modules/nucleo/tests/nucleo.tftest.hcl` afirma chave KMS com `enable_key_rotation = true`, `deletion_window_in_days = 7` e `aws_budgets_budget` com `time_unit = "DAILY"`, `limit_amount == "0.5"` (ou `"0.50"`) e filtro `user:project$03-mcp-regras-cdb`; `modules/dados/tests/dados.tftest.hcl` afirma as tabelas `03-mcp-regras-cdb-regras` e `03-mcp-regras-cdb-aplicacoes` em `PAY_PER_REQUEST`, cifradas com o ARN da chave KMS do `nucleo` e com `point_in_time_recovery { enabled = true }`.
  - **Arquivos:** `M/infra/terraform/modules/nucleo/{main.tf,variables.tf,outputs.tf,tests/nucleo.tftest.hcl}`, `M/infra/terraform/modules/dados/{main.tf,variables.tf,outputs.tf,tests/dados.tftest.hcl}`.
  - **Aceite:** `TT-SEC-02`, `TT-COST-01` e `TH-COST-01` verdes.
  - **Depende de:** T011.
- [ ] T052 [engenheiro-terraform] Módulo `servidor-mcp` (Lambda arm64, Function URL `AWS_IAM` restrita ao gateway e role somente leitura) · Art. IV, RNF-001, RF-001, RF-008, D-044, ADR-0001, ADR-0004 · TT-SEC-01, TT-IAM-01, TT-MCP-01
  - **Teste vermelho:** `M/infra/terraform/modules/servidor-mcp/tests/servidor.tftest.hcl` afirma: (1) Lambda `03-mcp-regras-cdb-servidor` (`nodejs22.x`, `arm64`, fora de VPC, `kms_key_arn` da chave do `nucleo`, X-Ray `Active`); (2) `aws_lambda_function_url` com `authorization_type = "AWS_IAM"` (`expect_failures` para `"NONE"`); (3) `aws_lambda_permission` com `principal` da plataforma e `source_arn` igual ao ARN do gateway do contrato `comum`, sem `Principal "*"` (`TT-SEC-01`); (4) policy IAM da role do servidor contendo apenas `dynamodb:GetItem` e `dynamodb:Query` nos ARNs das 2 tabelas do módulo `dados`, logs e X-Ray, sem nenhuma ação de escrita (`PutItem`, `UpdateItem`, `DeleteItem`) e sem `*` (`TT-IAM-01`).
  - **Arquivos:** `M/infra/terraform/modules/servidor-mcp/{main.tf,variables.tf,outputs.tf,tests/servidor.tftest.hcl}`.
  - **Aceite:** `TT-SEC-01`, `TT-IAM-01` e `TT-MCP-01` verdes.
  - **Depende de:** T051.
- [ ] T053 [engenheiro-terraform] Consumo do módulo `registro-produto` da plataforma e módulo `agente` (Lambda arm64 sem acesso direto ao servidor nem ao DynamoDB) · RF-017, RF-022, RF-023, RF-024, RNF-001, D-071 (D03-P6 = A, D03-P10 = A), ADR-0004, ADR-0005 · TT-PLAT-01, TT-PLAT-02, TT-PLAT-03, TT-IAM-02, TT-IAM-03
  - **Teste vermelho:** `M/infra/terraform/tests/consumo_plataforma.tftest.hcl` e `modules/agente/tests/agente.tftest.hcl` afirmam: (1) registro do alvo `03-mcp-regras-cdb-servidor` (`mcp_server`) com as 5 tools classificadas (`buscar_regras`, `simular_resgate`, `verificar_aporte` e `listar_versoes_regra` como `leitura_publica`; `consultar_aplicacoes_cliente` como `dado_privado`) e zero tríade letal (`TT-PLAT-01`); (2) `listar_versoes_regra` com `agentes = []`, gerando zero política `permit` no Cedar para essa ação (`TT-PLAT-02`); (3) guardrail do produto com exatamente o tópico negado `"recomendação de investimento personalizada"` e mensagem de bloqueio em português que não ecoa a entrada (`TT-PLAT-03`); (4) Lambda `03-mcp-regras-cdb-agente` usando a role `03-mcp-regras-cdb-agente-atendimento` gerada pelo módulo, sem permissão de DynamoDB (`TT-IAM-02`) e sem `lambda:InvokeFunction` ou `lambda:InvokeFunctionUrl` na Lambda do servidor MCP (`TT-IAM-03`).
  - **Arquivos:** `M/infra/terraform/modules/agente/{main.tf,variables.tf,outputs.tf,tests/agente.tftest.hcl}`, `M/infra/terraform/main.tf`, `M/infra/terraform/tests/consumo_plataforma.tftest.hcl`.
  - **Aceite:** `TT-PLAT-01`, `TT-PLAT-02`, `TT-PLAT-03`, `TT-IAM-02` e `TT-IAM-03` verdes; `TH-PLAT-01` segue verde.
  - **Depende de:** T050, T052.
- [ ] T054 [P] [engenheiro-terraform] Módulo `observabilidade` (grupos de log de 7 dias cifrados com KMS e 4 alarmes do servidor no tópico do contrato `comum`) · RF-025, RNF-001, RNF-003, Art. VI, ADR-0006 · TT-OBS-01, TT-SEC-02 (logs)
  - **Teste vermelho:** `M/infra/terraform/modules/observabilidade/tests/observabilidade.tftest.hcl` afirma: (1) grupos de log das duas Lambdas com `retention_in_days = 7` e `kms_key_id` da chave do `nucleo`; (2) os 4 alarmes do `RF-025` (`erro-interno >= 1`, `dados-indisponiveis >= 3`, `erro-protocolo >= 5`, `erro-execucao-lambda >= 1`) com `period = 300`, `evaluation_periods = 1`, `statistic = "Sum"`, `treat_missing_data = "notBreaching"` e `alarm_actions = [contrato_comum.topico_alarmes_arn]`, sem criar `aws_sns_topic` novo.
  - **Arquivos:** `M/infra/terraform/modules/observabilidade/{main.tf,variables.tf,outputs.tf,tests/observabilidade.tftest.hcl}`.
  - **Aceite:** `TT-OBS-01` e `TT-SEC-02` verdes; composição completa do root passa em `tags.tftest.hcl`, `prefixo.tftest.hcl`, `regiao.tftest.hcl`, `test_regras_plan.test.ts`, `tflint` e `checkov`.
  - **Depende de:** T052, T053.
- [ ] T055 [P] [redator-tecnico] `M/README.md` com até 5 passos, teto diário de US$ 0,50 e referências aos ADRs e `azure.md`, mais validação FinOps e segurança da esteira · Art. IV, Art. V, Art. VI, RNF-002, RNF-003 · TH-DOC-01, TH-COST-01, ES
  - **Teste vermelho:** `TH-DOC-01` e `TH-COST-01` em `harness/testes/test_d03_artefatos.py` reprovam se `M/README.md` não existir, tiver mais de 5 passos numerados, não citar o teto diário de `US$ 0,50` ou tiver link quebrado para `adr/0001..0006` e `docs/azure.md`.
  - **Arquivos:** `M/README.md`, `M/infra/terraform/infracost-usage.yml`, `harness/testes/test_d03_artefatos.py`.
  - **Aceite:** `TH-DOC-01` e `TH-COST-01` verdes; varredura local de segurança (`checkov`, `tflint`, testes de segredos) limpa (`ES`).
  - **Depende de:** T054.

## Fase 6 · Verificação (Floci, revisão independente e demonstração real)
- [ ] T060 [testador-integracao] Integração completa no Floci (apply, chamadas HTTP `2026-07-28` e `2025-11-25`, medição de `p95 <= 500 ms`, destroy sem sobras e relatório HTML) · RF-001, RF-002, RF-007, RNF-004, RNF-007, Art. III, Art. V, D-013, ADR-0006 · FL-01, FL-02, FL-03, FL-04
  - **Teste vermelho:** `M/tests/floci/integracao-floci.test.ts` (contra `${FLOCI_IMAGE:-floci/floci:2.5.0}` em `http://localhost:4566`) falha antes do root/script de carga do Floci e afirma: (1) `FL-01`: `terraform apply` do root de integração da D03 cria KMS, as 2 tabelas DynamoDB carregadas com `regras_cdb.json` e `aplicacoes_clientes.json`, log groups, 4 alarmes, parâmetro SSM de contrato e as 2 Lambdas; (2) `FL-02`: duas execuções HTTP `2026-07-28` e `2025-11-25` contra o servidor MCP apoiado no DynamoDB do Floci devolvem o mesmo resultado determinístico; (3) `FL-03`: a bateria de cálculo do critério de sucesso 2 responde com `p95 <= 500 ms` no servidor (`RNF-007`); (4) `FL-04`: `terraform destroy` remove 100% dos recursos com `project=03-mcp-regras-cdb` (exceto a chave KMS em `PendingDeletion`) e gera `M/testing/reports/floci-report.html` separando comportamento provado de lacuna documentada do emulador (ADR-0006).
  - **Arquivos:** `M/infra/terraform/floci/`, `M/tests/floci/integracao-floci.test.ts`, `M/testing/reports/floci-report.html`, job de integração em `.github/workflows/03-mcp-regras-cdb-ci.yml`.
  - **Aceite:** `FL-01` a `FL-04` verdes e relatório HTML gerado.
  - **Depende de:** T033, T043, T055.
- [ ] T061 [revisor-independente] Revisão independente da implementação completa da D03 antes da demonstração · Art. III, Art. IV, Art. VII
  - **Teste vermelho:** checklist de conformidade SDD (`spec.md` × `plan.md` × `tasks.md` × `matriz.md` × código/Terraform) executado em instância separada de quem implementou (D-047).
  - **Arquivos:** relatório de revisão no PR da D03.
  - **Aceite:** todos os testes (`UT`, `CT`, `RG`, `TT`, `TH`, `FL`) verdes e zero achado bloqueante ou importante aberto.
  - **Depende de:** T060.
- [ ] T062 [pesquisador] Reconferência de disponibilidade regional (`us-east-1`) e preços do Bedrock/AgentCore antes do primeiro apply real · RNF-002, RNF-006
  - **Teste vermelho:** verificação da tabela de preços e disponibilidade do Claude Haiku 5.5, AgentCore Gateway/Policy e Bedrock Guardrails em `us-east-1` na data da demonstração.
  - **Arquivos:** nota de pré-demonstração em `M/docs/evidencias-demonstracao.md`.
  - **Aceite:** confirma que a estimativa de US$ 0,39 continua dentro do teto aprovado de US$ 0,50.
  - **Depende de:** T061.
- [ ] T063 [DONO] Dia da demonstração na AWS real (apply da plataforma + apply da D03 + roteiro + workflow de evidências + destroy da D03 e da plataforma) · RF-004, RF-022, RF-023, RNF-002, RNF-007, Art. V, D-021, D-024, D-062, D-068 · DM-01 a DM-06
  - **Teste vermelho:** roteiro real falha sem o stack aplicado no ambiente protegido `aws-lab`.
  - **Arquivos:** artefato de evidências gerado pelo workflow `.github/workflows/00-plataforma-agentes-evidencias.yml` (`--produto 03-mcp-regras-cdb`).
  - **Aceite:** `DM-01` (`tools/list` pelo gateway filtra para 4 tools e `resources/*` conferido), `DM-02` (`AllowDecisions >= 1` e `DenyDecisions >= 1` na chamada forçada a `listar_versoes_regra`), `DM-03` (intervenção do guardrail `>= 1` no tópico negado e no ataque de prompt), `DM-04` (toda resposta com número no roteiro real cita `id@versao` e passa no verificador), `DM-05` (latência `p95` medida e registrada) e `DM-06` (destroy sem sobras na Tagging API).
  - **Depende de:** T062.
- [ ] T064 [finops-demonstracao] Conferência do custo real do dia contra o teto de US$ 0,50 e substituição de gravações sintéticas por capturas reais · RF-023, RNF-002, RNF-005, Art. V, Art. VIII · DM-04, DM-06
  - **Teste vermelho:** teste das fixtures gravadas confere que as capturas reais da demonstração substituíram as gravações com `proveniencia: sintetica` sem quebrar `RG-01` a `RG-09`.
  - **Arquivos:** `M/docs/evidencias-demonstracao.md`, `M/tests/recorded/fixtures/*.json`.
  - **Aceite:** custo real medido (soma por tag `project=03-mcp-regras-cdb` + linhas sem tag) ≤ US$ 0,50; suíte `RG` verde com as capturas reais.
  - **Depende de:** T063.
- [ ] T065 [DONO] Revisão humana do relatório da demonstração e das capturas antes do commit · RNF-005, Art. VIII, D-001
  - **Aceite:** o dono confirma que nenhum ARN sensível, dado pessoal ou link de sessão entrou no relatório ou nas fixtures.
  - **Depende de:** T064.

## Fase 7 · Publicação
- [ ] T070 [redator-tecnico] Escrever os posts técnicos `M/posts/aws.md`, `M/posts/azure.md` e `M/posts/linkedin.md` com checklist de proveniência · Art. VII, Art. VIII, D-007
  - **Teste vermelho:** teste de proveniência em `harness/testes/test_d03_artefatos.py` reprova se algum post citar número ou afirmação sobre empresa sem fonte e data, se contiver link de sessão do Claude (D-069) ou termos internos do harness/curso (D-001).
  - **Arquivos:** `M/posts/aws.md`, `M/posts/azure.md`, `M/posts/linkedin.md`.
  - **Aceite:** posts escritos para engenheiros seniores (skill `post-tecnico`) com a âncora datada (01/09/2026), resultados da demonstração e comparativo Azure.
  - **Depende de:** T065.
- [ ] T071 [P] [desenvolvedor-site] Página da D03 no site (`site/`) e atualização de `MODULES` e `ITEMS` · Art. VI
  - **Teste vermelho:** teste do site verifica que o item da D03 existe em `ITEMS` com links válidos para a página, o post AWS e o post Azure, sem scripts ou fontes externas.
  - **Arquivos:** `site/`.
  - **Aceite:** página renderizada no tema escuro do repositório (skill `site-projeto`).
  - **Depende de:** T070.
- [ ] T072 [DONO] Aprovar a publicação e fazer o merge do PR da D03 · Art. II, D-032, D-062
  - **Depende de:** T071.
