# Grafo de Conhecimento da Pós + Servidor MCP Local (`pos-grafo`)

Ferramenta oficial do harness (**D-079**) que indexa os materiais locais da pós-graduação
(`docs/curso/pos-legendas/`, `docs/curso/pos-resumos/` e `docs/curso/pos-pdfs/`) em um banco
de grafo **Neo4j 5 Community** (com snapshot local em `.neo4j-data/grafo_pos.json`) e expõe
4 ferramentas MCP via `stdio` para o **Claude Code** e o **Google Antigravity**.

> **Privacidade (D-001 / D-079):** Os diretórios `docs/curso/pos-*`, `docs/pos-archs/` e
> `.neo4j-data/` estão no `.gitignore` e nunca entram no git. Os testes automatizados em
> `harness/testes/test_mcp_pos_grafo.py` usam apenas fixtures sintéticas.

## Modelo do Grafo (Property Graph)

- **Nós:**
  - `(:Disciplina {id, codigo, nome})` — `D00` a `D07`
  - `(:Aula {id, disciplina, aula, modulo, titulo, resumo})`
  - `(:TrechoLegenda {id, aula_id, disciplina, aula, indice, inicio_ts, fim_ts, texto})`
  - `(:MaterialPDF {id, disciplina, titulo, arquivo, total_paginas})`
  - `(:PaginaPDF {id, material_id, disciplina, pagina, texto})`
  - `(:Conceito {id, nome, tipo, url, descricao})` — com dicionário fonético que corrige
    distorções da transcrição automática (ex.: `"model contestprotocol service"` e
    `"model Context PROROCON"` → `https://github.com/modelcontextprotocol/servers/`).
- **Arestas:**
  - `(:Disciplina)-[:TEM_AULA]->(:Aula)`
  - `(:Aula)-[:TEM_TRECHO]->(:TrechoLegenda)`
  - `(:TrechoLegenda)-[:PROXIMO_TRECHO]->(:TrechoLegenda)`
  - `(:Aula|TrechoLegenda|PaginaPDF)-[:MENCIONA_CONCEITO]->(:Conceito)`

## Como usar

### 1. Ingerir / atualizar o grafo a partir de `docs/curso/pos-*`

```bash
python scripts/mcp_pos_grafo/servidor_mcp.py --ingerir
```

### 2. (Opcional) Subir o Neo4j 5 Community via Docker Compose

O servidor MCP funciona mesmo com o Docker desligado (usando o motor híbrido sobre
`.neo4j-data/grafo_pos.json`), mas você pode subir o Neo4j 5 Community a qualquer momento
para explorar visualmente em `http://localhost:7474` e executar Cypher nativo:

```bash
docker compose -f scripts/mcp_pos_grafo/docker-compose.yml up -d
python scripts/mcp_pos_grafo/servidor_mcp.py --sync-neo4j
```

### 3. Ferramentas MCP expostas (`stdio`)

1. `buscar_conteudo_pos(consulta, disciplina?, limite?)` — busca híbrida (nós `Conceito` + léxico + similaridade de cosseno 64-d + travessia para `trecho_anterior` e `trecho_seguinte`).
2. `localizar_aula_por_termo_ou_link(termo)` — encontra a disciplina, aula e minuto exato (`HH:MM:SS`) em que um repositório, link ou ferramenta foi mostrado.
3. `obter_contexto_aula(disciplina, aula, timestamp_foco?)` — retorna o subgrafo completo da aula.
4. `consultar_grafo_cypher(cypher, parametros?)` — executa Cypher somente-leitura (`MATCH ... RETURN ...`), bloqueando qualquer mutação (`CREATE`, `MERGE`, `DELETE`, `SET`, `REMOVE`, `DROP`) com `isError: true`.
