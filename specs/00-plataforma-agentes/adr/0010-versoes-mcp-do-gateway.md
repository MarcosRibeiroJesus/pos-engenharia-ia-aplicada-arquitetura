# ADR 0010 · Versões de MCP do gateway e a lane de compatibilidade da D03

- **Status:** aprovado com o plano (D-035; emenda 1 aprovada na D-038)
- **Data:** 2026-11-19
- **Requisitos:** RF-001, RF-007 (`versoes_mcp` no contrato), D-034 (D03 como primeiro consumidor)

## Contexto
O primeiro consumidor é a D03 (D-034). Pela memória compartilhada, ela usa o MCP 2026-07-28 com uma lane de compatibilidade, mas a spec da D03 ainda está na fase especificar.

O gateway aceita 2025-03-26, 2025-06-18, 2025-11-25 e 2026-07-28 ([blog da AWS de 2026-07-28](https://aws.amazon.com/blogs/machine-learning/how-agentcore-gateway-supports-the-mcp-2026-07-28-spec/), [alvos MCP](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/gateway-target-MCPservers.html)):
- serve várias versões ao mesmo tempo pelo cabeçalho `MCP-Protocol-Version`;
- um pedido sem o cabeçalho vale 2025-03-26 e é recusado se essa versão não estiver na lista;
- a tradução entre versões não cobre elicitation nem sampling.

O provider Terraform aceita `supported_versions` como conjunto de strings. O enum do CDK alpha ainda lista só duas versões, o que mostra que as ferramentas andam atrás do serviço.

## Decisão
- **Lista de versões:** `versoes_mcp` com padrão `["2025-11-25", "2026-07-28"]`, publicada no contrato `comum`.
- **Cabeçalho obrigatório:** o agente de exemplo sempre envia `MCP-Protocol-Version` (RG-08), então não depende do padrão 2025-03-26.
- **Ajuste para a D03:** o plano da D03 confere a lane dela contra este contrato.
  - Se a lane pedir 2025-06-18, a versão entra na lista como versão menor do contrato (`1.1.0`).
  - A D03 não usa elicitation nem sampling pelo gateway.

## Alternativas rejeitadas
- **Só 2026-07-28:** clientes 2025-* da lane de compatibilidade seriam recusados.
- **As quatro versões:** aceita 2025-03-26 sem necessidade, e a superfície de tradução aumenta.
- **Esperar a spec da D03:** o plano da plataforma ficaria parado. A lista é variável e muda por versão menor.

## Trade-offs
- **Ganho:** as duas versões mais recentes ficam no ar, e a mudança é barata e versionada.
- **Custo:** depende da conferência no plano da D03.

## Custo
US$ 0.

## Risco
R1 do plano: a lane da D03 é diferente da lista. O impacto é `-32022` no cliente, detectado no ensaio.

## Tarefas da prova
- 2.4: configuração do servidor MCP e do transporte.
- 5.6: a versão vem de fonte datada, e a incerteza da D03 está declarada.

## Curso Skilljar relacionado
Introduction to Model Context Protocol.

## Em produção, um arquiteto sênior faria
- Uma matriz de compatibilidade cliente × servidor × gateway no CI.
- Política de suporte de versões com data de remoção anunciada.
- Métrica de uso por versão antes de tirar uma da lista.
