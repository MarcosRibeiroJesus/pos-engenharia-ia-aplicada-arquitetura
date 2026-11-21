---
name: servidor-mcp
description: Projetar, implementar e testar servidores MCP (projeto da D03, regras do CDB com liquidez diária). Use para design de tools e resources, erros com isError, versão do protocolo 2026-07-28 com lane de compatibilidade e testes de contrato.
---

# Servidor MCP

## Design das tools (2.1, 2.3)
- **Nome e descrição:** verbo e objeto, com o que a tool faz, quando usar e quando **não** usar, e o formato da entrada e da saída.
- **Poucas tools e bem separadas:** sem duas tools que um modelo confundiria. Consulta somente leitura vira resource (2.4).
- **Entrada com JSON Schema estrito:** enums, limites e unidades no nome do campo (`valor_brl`, `prazo_dias`).
- **Erros** (2.2): `isError: true` com categoria, mensagem para o modelo agir e `retentavel`. Exceção vazando para o transporte é bug.

## Versão do protocolo (D-011)
- O alvo é a versão 2026-07-28, sem estado, com uma lane de compatibilidade para clientes antigos.
- A negociação de versão é testada nos dois caminhos. Antes de afirmar algo da especificação, confirme na especificação oficial em modelcontextprotocol.io.

## Regras de negócio
- **As regras do CDB ficam em dados versionados** (tabela ou JSON com fonte e data), não espalhadas no código. Cada regra cita a fonte pública.
- **Dados de cliente:** só sintéticos.

## Testes
- Contrato de cada tool: entrada válida, inválida, limite e erro de negócio.
- Teste com um cliente MCP real em processo (stdio ou HTTP) e com o componente Claude usando respostas gravadas.
- Red team das descrições: uma tool não pode ser induzida a executar outra (skill `avaliacao-llm`).

## Skills de mercado complementares
`mcp-server-dev` (plugin oficial da Anthropic) e `mcp-builder` (repositório `anthropics/skills`).
