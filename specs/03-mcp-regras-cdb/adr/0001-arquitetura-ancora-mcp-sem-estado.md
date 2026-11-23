# ADR-0001: Arquitetura âncora — servidor MCP sem estado na AWS (Well-Architected)

- **Status:** aceito quanto à âncora (escolha do dono, D-065); o desenho detalhado vai na aprovação do plano
- **Data:** 2026-11-22 · **Autor:** arquiteto-aws (orquestração Antigravity)
- **Âncora:** *MCP went stateless: Is your AWS MCP server deployment well-architected?*, AWS Architecture Blog, publicado em **01/09/2026**. https://aws.amazon.com/blogs/architecture/mcp-went-stateless-is-your-aws-mcp-server-deployment-well-architected
- **Requisitos:** RF-001, RF-002, RF-003, RF-022, RNF-001, RNF-002; D-011, D-034, D-065, D-071, D-072

## Contexto
A regra do repositório exige que cada projeto de arquitetura AWS se ancore num estudo de caso ou artigo oficial da AWS, registrando o que foi seguido, o que mudou e por quê (D-065). O dono aprovou como âncora da D03 o artigo do AWS Architecture Blog de 01/09/2026 sobre a transição do Model Context Protocol (MCP) para um núcleo sem estado na revisão `2026-07-28` e suas implicações nos pilares do AWS Well-Architected Framework.

## O que a âncora descreve (resumo com palavras próprias)
- **Mudança no protocolo (`2026-07-28`):** a especificação removeu sessões no nível do protocolo, o handshake obrigatório `initialize` / `notifications/initialized` e o cabeçalho de sessão `Mcp-Session-Id`. Cada requisição JSON-RPC sobre HTTP carrega os metadados necessários em `_meta` e nos cabeçalhos HTTP (`MCP-Protocol-Version`, `Mcp-Method`, `Mcp-Name`).
- **Efeito na computação (Confiabilidade e Eficiência de Performance):** sem estado de protocolo em memória, deixam de ser necessários *sticky sessions* em Application Load Balancers (ALB) e caches compartilhados (como Redis) apenas para rastrear handshakes MCP. Qualquer réplica atende qualquer chamada, tornando **AWS Lambda** o compute natural para servidores MCP leves e intermitentes (requisição entra, resposta sai, escala a zero).
- **Desacoplamento entre estado de protocolo e estado de aplicação (Segurança e Confiabilidade):** a ausência de sessão no protocolo não elimina dados de negócio; o estado de aplicação deve ficar em armazenamento gerenciado externo (como **Amazon DynamoDB**) com IAM de menor privilégio, mantendo a camada de compute 100% sem estado.
- **Segurança de borda:** recomenda proteger endpoints HTTP remotos com autenticação baseada em token (OAuth 2.0 / Amazon Cognito) e AWS WAF na borda quando expostos a clientes externos.
- **Excelência Operacional e Custo:** eliminação de capacidade ociosa reservada para segurar conexões persistentes; propagação de cabeçalhos de rastreamento distribuído (W3C Trace Context / AWS X-Ray) e logs/métricas no Amazon CloudWatch.

## Decisão: o que seguimos e o que muda
| Aspecto da âncora | Neste projeto (`03-mcp-regras-cdb`) | Segue ou muda | Por quê |
|---|---|---|---|
| Protocolo MCP `2026-07-28` sem `initialize` e sem `Mcp-Session-Id` | Servidor atende `tools/list`, `tools/call`, `resources/list` e `resources/read` sem handshake e sem sessão (`RF-001`) | **segue** | Alinha ao núcleo sem estado da revisão `2026-07-28` (D-011) |
| Cabeçalhos HTTP `MCP-Protocol-Version`, `Mcp-Method` e `Mcp-Name` | Validados em toda requisição HTTP `2026-07-28`, exigindo coerência com o corpo JSON-RPC (`RF-001`, `RF-003`) | **segue** | Permite roteamento e falha rápida sem estado antes de executar qualquer tool (ADR-0002) |
| Compute serverless escalando a zero para tools somente leitura | **AWS Lambda** (Node.js 22, `arm64`, fora de VPC) para o servidor MCP e para o agente de atendimento | **segue** | Custo ocioso zero no lab de 1 dia (`RNF-002`) e emulação direta no Floci (ADR-0006) |
| Estado de aplicação fora do compute | Regras versionadas e aplicações sintéticas de clientes em **Amazon DynamoDB** sob demanda, cifrado com KMS (`RF-009`, `RF-013`) | **segue** | Duas invocações em instâncias distintas do servidor produzem exatamente o mesmo resultado (`RF-001`) |
| Observabilidade por requisição | Logs JSON estruturados (sem argumentos de `dado_privado`), métricas CloudWatch EMF, X-Ray e 4 alarmes do servidor + 1 do guardrail (`RF-025`) | **segue** | Auditoria por tool e por categoria de erro sem custo de `PutMetricData` |
| Autenticação de entrada (Cognito OAuth + WAF na âncora) | **IAM (`AWS_IAM` / SigV4)** na Lambda Function URL do servidor MCP, aceitando chamadas exclusivamente do **AgentCore Gateway** da plataforma (`aws:SourceArn`) | **muda (D-030, D-034, D-071)** | A D03 é a primeira consumidora da `00-plataforma-agentes`. O gateway centraliza autenticação IAM, política Cedar e guardrail; abrir OAuth ou stdio por fora contornaria a plataforma (E11, D03-P4 = A) |
| Apenas versão `2026-07-28` | **Lane de compatibilidade HTTP em `2025-11-25`** (`RF-002`, D-072), também sem guardar estado de sessão | **estende (D-011, D-072)** | Atende clientes da versão imediatamente anterior publicada no contrato `comum` da plataforma (ADR-0002) |
| Servidor MCP isolado | **Agente de atendimento com Claude no Bedrock** + **verificador determinístico** de citações `id@versao` e números (`RF-017` a `RF-021`) | **estende (D-008, E12)** | O modelo nunca calcula imposto ou rendimento de cabeça; o verificador programático garante que todo número veio de uma tool do turno (ADR-0005) |

## Alternativas rejeitadas
- **Amazon ECS Fargate com ALB sem sticky sessions:** embora citado na âncora para frotas de contêineres de longa duração, tem custo por hora enquanto ligado e exige VPC/endpoints, violando a meta de custo ocioso zero do lab (`RNF-002`).
- **Amazon Cognito + AWS WAF próprios no stack da D03:** duplicaria a camada de identidade e autorização que a plataforma `00-plataforma-agentes` já fornece via AgentCore Gateway + Policy Engine em Cedar (E11), além de adicionar custo fixo mensal do WAF.
- **Transporte local via `stdio` em pacote privado:** rejeitado pelo dono (`D03-P4 = A`, D-071) por criar um caminho fora do gateway, da política Cedar e do guardrail.

## Trade-offs
- **Ganho:** arquitetura 100% serverless com escala a zero, sem tabela de sessão, provando o servidor MCP sem estado como primeiro alvo real do AgentCore Gateway da plataforma.
- **Perda:** como a Lambda Function URL exige `AWS_IAM` restrito ao `aws:SourceArn` do gateway, clientes MCP externos não chamam a Lambda diretamente na AWS sem passar pelo gateway (nos testes de contrato `CT`, o servidor é instanciado em processo sobre HTTP local).

## Custo
Sem custo fixo do compute ou do transporte; entra no orçamento diário apenas por invocação de Lambda e leitura no DynamoDB (ver `plan.md`, seção "Custo do lab").

## Risco
- **R2 da spec:** o AgentCore Gateway traduzir ou fixar o cabeçalho `MCP-Protocol-Version` ao encaminhar para o alvo `mcp_server`. Mitigado testando a negociação `2026-07-28` e `2025-11-25` diretamente nos testes de contrato (`CT`) e validando os dois caminhos pelo gateway na demonstração (`DM`).

## Tarefas da prova exercitadas
- **2.1 e 2.3:** design de tools MCP determinísticas e escopo enxuto de tools por agente.
- **2.4:** configuração de servidor MCP remoto sem estado e integração via gateway governado.
- **1.4 e 5.6:** controles programáticos fora do modelo e arquitetura com proveniência datada.

## Curso Skilljar relacionado
*Introduction to Model Context Protocol* e *Claude with Amazon Bedrock*.

## O que um arquiteto sênior faria em produção
Colocaria o gateway corporativo atrás de controle de taxa por identidade de atendente; manteria o servidor MCP sem estado em Lambda (ou AgentCore Runtime se houvesse isolamento de microVM por sessão); usaria replicação multi-AZ nativa da Lambda e do DynamoDB; e separaria a conta da plataforma da conta do produto com AWS Organizations e políticas de recurso cross-account assinadas.
