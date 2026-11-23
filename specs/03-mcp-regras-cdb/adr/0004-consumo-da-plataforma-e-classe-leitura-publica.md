# ADR-0004: Consumo integral da plataforma 00-plataforma-agentes, classe leitura_publica (v1.1.0) e negação por padrão no Cedar

- **Status:** aceito (plano aprovado pelo dono em 2026-11-22, D-073; classe `leitura_publica` aprovada em D03-P10 = A, D-071)
- **Data:** 2026-11-22 · **Autor:** arquiteto-aws (orquestração Antigravity)
- **Requisitos:** RF-004, RF-022, RF-023, RF-024, RNF-001; D-030, D-034, D-044, D-071

## Contexto
Pela decisão D-034, a D03 (`03-mcp-regras-cdb`) é o **primeiro produto consumidor** da plataforma compartilhada `00-plataforma-agentes` e deve provar o roteiro de quatro passos do `RF-010` da plataforma (chamada permitida, chamada negada por falta de política Cedar, chamada negada pelo guardrail da camada de tools e entrada bloqueada pelo guardrail do modelo). Dois pontos exigiam definição arquitetural:
1. O contrato `v1.0.0` da plataforma exigia que toda tool declarasse pelo menos uma entre quatro classes de risco (`dado_privado`, `conteudo_nao_confiavel`, `canal_saida`, `sensivel`), mas as tools que apenas consultam regras públicas e fazem cálculos determinísticos não pertencem a nenhuma dessas quatro (`E8`). O dono decidiu (`D03-P10 = A`, D-071) adicionar a classe `leitura_publica` numa versão menor do contrato da plataforma (`1.1.0`), fora das três pernas da tríade letal.
2. Como a D03 é somente leitura e não tem ação destrutiva que peça aprovação humana, o passo de negação por política Cedar (`DenyDecisions` ≥ 1, `RF-023`) precisava de uma tool real no servidor MCP que não tivesse `permit` para a role do agente.

## Decisão
1. **Registro exclusivo pelo módulo `registro-produto` da plataforma (`RF-022`):**
   - O Terraform da D03 instancia `plataforma/agentes/infra/terraform/modules/registro-produto` no state da D03 (`03-mcp-regras-cdb-lab`) e lê `/00-plataforma-agentes/contrato/v1/comum` e `/00-plataforma-agentes/contrato/v1/produtos/03-mcp-regras-cdb` via SSM Parameter Store.
   - Nenhum ARN da plataforma é escrito à mão no código ou no Terraform da D03 (`RF-022`).
2. **Alvo `mcp_server` com autenticação de saída IAM SigV4 (`RNF-001`):**
   - O servidor MCP expõe uma **AWS Lambda Function URL** com `authorization_type = "AWS_IAM"`.
   - A permissão `aws_lambda_permission` da função libera `lambda:InvokeFunctionUrl` e `lambda:InvokeFunction` **somente** para a role de execução do gateway da plataforma, com condição `aws:SourceArn` igual ao ARN do gateway lido do contrato `comum` e sem `Principal "*"` (`D-044`).
   - O alvo registrado no gateway é `03-mcp-regras-cdb-servidor` (tipo `mcp_server`, endpoint da Function URL, autenticação IAM SigV4).
3. **Catálogo de 5 tools, classes de risco com `leitura_publica` (`v1.1.0`) e prova da tríade letal (`RF-004`, `RF-022`, `RF-023`):**

   | Tool no servidor MCP | Classe(s) no catálogo (`v1.1.0`) | Agentes com `permit` no Cedar | Papel na arquitetura e no roteiro |
   |---|---|---|---|
   | `buscar_regras` | `["leitura_publica"]` | `["atendimento"]` | Consulta regras vigentes por tema e data (`RF-006`) |
   | `simular_resgate` | `["leitura_publica"]` | `["atendimento"]` | Cálculo determinístico de rendimento, IOF, IR e líquido (`RF-007`) |
   | `verificar_aporte` | `["leitura_publica"]` | `["atendimento"]` | Verificação determinística de limites, dia útil e horário de corte (`RF-008`) |
   | `consultar_aplicacoes_cliente` | `["dado_privado"]` | `["atendimento"]` | Consulta aplicações sintéticas do cliente autenticado (`RF-009`, `D03-P2 = A`) |
   | `listar_versoes_regra` | `["leitura_publica"]` | `[]` *(nenhum chamador)* | Tool administrativa somente leitura sem agente autorizado; prova o filtro de `tools/list` e a negação por padrão no Cedar (`DenyDecisions` ≥ 1, `RF-023`) |

   - **Verificação da tríade letal:** a role `03-mcp-regras-cdb-agente-atendimento` acumula apenas `leitura_publica` e `dado_privado` (1 das 3 pernas da tríade; zero `conteudo_nao_confiavel` e zero `canal_saida`).
4. **Emenda menor `1.1.0` na `00-plataforma-agentes` (`D03-P10 = A`, D-071):**
   - O enum de classes de tool do módulo `registro-produto` e do schema `v1.schema.json` da plataforma passa a aceitar `"leitura_publica"` ao lado das 4 classes originais, mantendo a regra "toda tool tem pelo menos 1 classe" e excluindo `"leitura_publica"` da soma das 3 pernas da tríade letal.

## Alternativas rejeitadas
- **Rotular `buscar_regras` e `simular_resgate` como `conteudo_nao_confiavel` para não emendar o contrato v1:** falsificaria o modelo de segurança (regras versionadas e revisadas em PR são dados confiáveis) e aproximaria artificialmente o agente da tríade letal (`E8`).
- **Permitir tool com lista de classes vazia (`[]`):** rejeitado pelo dono (`D03-P10 = A`), pois enfraqueceria o gate estático que pega esquecimento de classificação.
- **Marcar `listar_versoes_regra` como `sensivel`:** geraria `permit` automático para a role de aprovação da D03; com `leitura_publica` e lista de agentes vazia (`[]`), nenhum principal recebe `permit` e a negação vem puramente do *default deny* do motor Cedar (`RF-023`).

## Trade-offs
- **Ganho:** vocabulário de classes fiel ao domínio, validação estática preservada e prova completa dos 4 passos da plataforma sem criar tool destrutiva artificial.
- **Perda:** requer aplicar a emenda menor `1.1.0` (`leitura_publica`) na `00-plataforma-agentes` antes da integração final.

## Custo
O custo do gateway e do motor Cedar está no teto da plataforma (`US$ 1,20/dia`); o guardrail, o perfil de inferência e o 6º alarme criados pelo módulo `registro-produto` no state da D03 entram no teto diário da D03.

## Risco
- **R6 da spec:** sincronismo com a tarefa do módulo `registro-produto` na `00-plataforma-agentes`. Mitigado isolando os testes unitários e de contrato (`UT`, `CT`, `RG`) do servidor e do agente para rodarem contra uma fixture conforme do contrato SSM v1.1.0.

## Tarefas da prova exercitadas
- **1.4:** política Cedar em `ENFORCE` fora do modelo, com negação por padrão provada por teste.
- **2.1 e 2.3:** separação explícita de classes de risco e filtragem do catálogo exposto ao agente (4 tools de atendimento visíveis, 5ª tool administrativa oculta e negada).

## Curso Skilljar relacionado
*Introduction to Model Context Protocol* e *Claude with Amazon Bedrock*.

## O que um arquiteto sênior faria em produção
Versionaria o módulo `registro-produto` num registro privado de módulos Terraform com tag semântica (`v1.1.0`), exigiria aprovação de CODEOWNERS do time de segurança em qualquer mudança na lista de classes das tools e monitoraria `DenyDecisions` por tool para detectar tentativas de invocação fora do catálogo.
