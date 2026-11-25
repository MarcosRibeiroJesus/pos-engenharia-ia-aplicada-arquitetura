"""Servidor MCP local do Grafo de Conhecimento da Pós-Graduação (`pos-grafo`).

Protocolo MCP: 2026-07-28 (com lane de compatibilidade 2025-11-25 e 2024-11-05).
Transporte: stdio (JSON-RPC 2.0 linha a linha) ou CLI para ingestão e consultas rápidas.

Ferramentas expostas:
1. `buscar_conteudo_pos`
2. `localizar_aula_por_termo_ou_link`
3. `obter_contexto_aula`
4. `consultar_grafo_cypher`
"""

from __future__ import annotations

import argparse
import json
import pathlib
import sys
from typing import Any

# Garante que a raiz do repositório esteja no sys.path quando executado diretamente
RAIZ_REPO = pathlib.Path(__file__).resolve().parents[2]
if str(RAIZ_REPO) not in sys.path:
    sys.path.insert(0, str(RAIZ_REPO))

from scripts.mcp_pos_grafo.grafo_motor import MotorGrafoPos

VERSAO_PROTOCOLO_PADRAO = "2026-07-28"
VERSOES_SUPORTADAS = {"2026-07-28", "2025-11-25", "2025-03-26", "2024-11-05"}

TOOLS_MCP: list[dict[str, Any]] = [
    {
        "name": "buscar_conteudo_pos",
        "description": (
            "O que faz: executa busca híbrida (nós de Conceito + índice léxico + similaridade vetorial por cosseno "
            "com travessia para trechos adjacentes) sobre legendas (.vtt), resumos (.md) e PDFs da pós-graduação. "
            "Quando usar: para responder perguntas conceituais ou técnicas sobre o que foi ensinado nas aulas. "
            "Quando NÃO usar: quando você já souber a URL/repositório exato e quiser apenas localizar o minuto da aula "
            "(prefira `localizar_aula_por_termo_ou_link`) ou quando já souber o número da disciplina e aula "
            "(prefira `obter_contexto_aula`). "
            "Unidades de entrada/saída: recebe `consulta` em texto livre, `disciplina` opcional (ex.: 'D03') e `limite` "
            "(1 a 25); devolve lista ordenada por score com disciplina, aula, timestamp HH:MM:SS, trecho e vizinhos."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "consulta": {
                    "type": "string",
                    "description": "Pergunta ou tópico a pesquisar no grafo da pós-graduação.",
                },
                "disciplina": {
                    "type": "string",
                    "description": "Filtro opcional de disciplina (ex.: 'D01', 'D02', 'D03', 'D04').",
                },
                "limite": {
                    "type": "integer",
                    "description": "Quantidade máxima de resultados (1 a 25, padrão 8).",
                    "minimum": 1,
                    "maximum": 25,
                    "default": 8,
                },
            },
            "required": ["consulta"],
            "additionalProperties": False,
        },
    },
    {
        "name": "localizar_aula_por_termo_ou_link",
        "description": (
            "O que faz: localiza exatamente em qual disciplina, aula e minuto/segundo (HH:MM:SS) um repositório GitHub, "
            "URL, pacote npm/pip, comando ou ferramenta foi mostrado ou citado pelo professor, aplicando correção fonética "
            "para transcrições automáticas (ex.: 'model contestprotocol service' -> https://github.com/modelcontextprotocol/servers/). "
            "Quando usar: sempre que o usuário perguntar 'em qual aula o professor mostra o link/repositório/ferramenta X?'. "
            "Quando NÃO usar: para buscas abertas de explicação teórica sem termo ou ferramenta específica (use `buscar_conteudo_pos`). "
            "Unidades de entrada/saída: recebe `termo` (URL, nome do repositório ou ferramenta) e retorna as ocorrências "
            "em legendas VTT (com `inicio_ts` e `fim_ts` em HH:MM:SS) e nos resumos das aulas."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "termo": {
                    "type": "string",
                    "description": "URL, repositório (ex.: 'modelcontextprotocol/servers'), pacote ou ferramenta.",
                }
            },
            "required": ["termo"],
            "additionalProperties": False,
        },
    },
    {
        "name": "obter_contexto_aula",
        "description": (
            "O que faz: recupera o subgrafo completo de uma aula específica (título, módulo, resumo estruturado, "
            "todos os conceitos e links citados, PDFs da disciplina e janela de trechos de legenda VTT). "
            "Quando usar: após identificar uma aula relevante ou quando o usuário pedir detalhes de uma aula específica (ex.: D03 Aula 06). "
            "Quando NÃO usar: quando ainda não se sabe qual aula aborda o assunto (use `buscar_conteudo_pos` primeiro). "
            "Unidades de entrada/saída: recebe `disciplina` (ex.: 'D03'), `aula` (inteiro >= 1) e `timestamp_foco` opcional "
            "('HH:MM:SS'); devolve o objeto da aula com seus relacionamentos no grafo."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "disciplina": {
                    "type": "string",
                    "description": "Código da disciplina (ex.: 'D01', 'D02', 'D03', 'D04').",
                },
                "aula": {
                    "type": "integer",
                    "description": "Número da aula (ex.: 4, 6, 22).",
                    "minimum": 1,
                },
                "timestamp_foco": {
                    "type": "string",
                    "description": "Timestamp opcional no formato HH:MM:SS para centralizar os trechos de legenda.",
                },
            },
            "required": ["disciplina", "aula"],
            "additionalProperties": False,
        },
    },
    {
        "name": "consultar_grafo_cypher",
        "description": (
            "O que faz: executa uma consulta Cypher somente-leitura (`MATCH ... RETURN ...`) contra o Neo4j 5 Community "
            "(ou fallback sobre o snapshot do grafo local caso o contêiner Docker esteja desligado). "
            "Quando usar: para agregações, contagens ou travessias customizadas entre `(:Disciplina)`, `(:Aula)`, "
            "`(:TrechoLegenda)`, `(:MaterialPDF)`, `(:PaginaPDF)` e `(:Conceito)`. "
            "Quando NÃO usar: para mutações no banco (qualquer comando `CREATE`, `MERGE`, `DELETE`, `SET`, `REMOVE` ou `DROP` "
            "é bloqueado com `isError: true`) ou para busca textual simples (use `buscar_conteudo_pos`). "
            "Unidades de entrada/saída: recebe `cypher` (string) e `parametros` opcional (objeto JSON); devolve colunas e linhas."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "cypher": {
                    "type": "string",
                    "description": "Consulta Cypher somente-leitura (ex.: MATCH (a:Aula)-[:MENCIONA_CONCEITO]->(c:Conceito) RETURN a.id, c.nome).",
                },
                "parametros": {
                    "type": "object",
                    "description": "Mapa opcional de parâmetros da consulta Cypher.",
                },
            },
            "required": ["cypher"],
            "additionalProperties": False,
        },
    },
]


class ServidorMCPPosGrafo:
    """Servidor JSON-RPC 2.0 compatível com MCP stdio."""

    def __init__(self, motor: MotorGrafoPos | None = None) -> None:
        self.motor = motor or MotorGrafoPos()

    def chamar_ferramenta(self, nome: str, argumentos: dict[str, Any] | None) -> dict[str, Any]:
        """Despacha uma chamada `tools/call` e formata o retorno MCP com `isError`."""
        args = argumentos or {}
        if nome == "buscar_conteudo_pos":
            res = self.motor.buscar_conteudo_pos(
                consulta=str(args.get("consulta", "")),
                disciplina=args.get("disciplina"),
                limite=int(args.get("limite", 8)),
            )
        elif nome == "localizar_aula_por_termo_ou_link":
            res = self.motor.localizar_aula_por_termo_ou_link(
                termo=str(args.get("termo", "")),
            )
        elif nome == "obter_contexto_aula":
            if "disciplina" not in args or "aula" not in args:
                res = {
                    "isError": True,
                    "categoria": "parametro_obrigatorio_ausente",
                    "retentavel": False,
                    "mensagem": "Os parâmetros `disciplina` e `aula` são obrigatórios.",
                }
            else:
                res = self.motor.obter_contexto_aula(
                    disciplina=str(args["disciplina"]),
                    aula=int(args["aula"]),
                    timestamp_foco=args.get("timestamp_foco"),
                )
        elif nome == "consultar_grafo_cypher":
            res = self.motor.consultar_grafo_cypher(
                cypher=str(args.get("cypher", "")),
                parametros=args.get("parametros"),
            )
        else:
            res = {
                "isError": True,
                "categoria": "ferramenta_desconhecida",
                "retentavel": False,
                "mensagem": f"Ferramenta MCP desconhecida: {nome}",
            }

        is_error = bool(res.get("isError", False))
        return {
            "isError": is_error,
            "content": [
                {
                    "type": "text",
                    "text": json.dumps(res, ensure_ascii=False, indent=2),
                }
            ],
            "structuredContent": res,
        }

    def processar_mensagem_jsonrpc(self, msg: dict[str, Any]) -> dict[str, Any] | None:
        """Processa uma requisição JSON-RPC 2.0 do protocolo MCP."""
        metodo = msg.get("method", "")
        msg_id = msg.get("id")
        params = msg.get("params") or {}

        # Notificações (sem id) não exigem resposta
        if msg_id is None and metodo.startswith("notifications/"):
            return None

        if metodo == "initialize":
            versao_cliente = str(params.get("protocolVersion", VERSAO_PROTOCOLO_PADRAO))
            versao_negociada = (
                versao_cliente if versao_cliente in VERSOES_SUPORTADAS else VERSAO_PROTOCOLO_PADRAO
            )
            return {
                "jsonrpc": "2.0",
                "id": msg_id,
                "result": {
                    "protocolVersion": versao_negociada,
                    "capabilities": {
                        "tools": {"listChanged": False},
                    },
                    "serverInfo": {
                        "name": "pos-grafo",
                        "version": "1.0.0",
                    },
                },
            }

        if metodo == "ping":
            return {"jsonrpc": "2.0", "id": msg_id, "result": {}}

        if metodo == "tools/list":
            return {
                "jsonrpc": "2.0",
                "id": msg_id,
                "result": {"tools": TOOLS_MCP},
            }

        if metodo == "tools/call":
            nome_tool = str(params.get("name", ""))
            argumentos = params.get("arguments") or {}
            resultado = self.chamar_ferramenta(nome_tool, argumentos)
            return {
                "jsonrpc": "2.0",
                "id": msg_id,
                "result": resultado,
            }

        return {
            "jsonrpc": "2.0",
            "id": msg_id,
            "error": {
                "code": -32601,
                "message": f"Método não suportado pelo servidor pos-grafo: {metodo}",
            },
        }

    def rodar_stdio(self) -> None:
        """Loop principal de leitura/escrita JSON-RPC 2.0 via stdin/stdout."""
        for linha in sys.stdin:
            linha_limpa = linha.strip()
            if not linha_limpa:
                continue
            try:
                msg = json.loads(linha_limpa)
            except json.JSONDecodeError as exc:
                erro = {
                    "jsonrpc": "2.0",
                    "id": None,
                    "error": {"code": -32700, "message": f"JSON inválido: {exc}"},
                }
                sys.stdout.write(json.dumps(erro, ensure_ascii=False) + "\n")
                sys.stdout.flush()
                continue

            resposta = self.processar_mensagem_jsonrpc(msg)
            if resposta is not None:
                sys.stdout.write(json.dumps(resposta, ensure_ascii=False) + "\n")
                sys.stdout.flush()


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Servidor MCP e CLI do Grafo de Conhecimento da Pós-Graduação (Neo4j + índice híbrido local)."
    )
    parser.add_argument(
        "--ingerir",
        action="store_true",
        help="Extrai legendas (.vtt), resumos (.md) e PDFs de docs/curso/pos-* e sincroniza o grafo.",
    )
    parser.add_argument(
        "--sync-neo4j",
        action="store_true",
        help="Sincroniza o snapshot local (.neo4j-data/grafo_pos.json) com o Neo4j 5 Community.",
    )
    parser.add_argument(
        "--buscar",
        type=str,
        default=None,
        help="Executa busca híbrida no grafo (ex.: --buscar 'transporte stdio e streamable HTTP no MCP').",
    )
    parser.add_argument(
        "--disciplina",
        type=str,
        default=None,
        help="Filtro opcional de disciplina para --buscar (ex.: D03).",
    )
    parser.add_argument(
        "--localizar",
        type=str,
        default=None,
        help="Localiza aula e minuto exato de um termo/link (ex.: --localizar 'https://github.com/modelcontextprotocol/servers/').",
    )
    args = parser.parse_args()

    motor = MotorGrafoPos()

    if args.ingerir:
        grafo = motor.ingerir(sincronizar_neo4j=True)
        print(json.dumps(grafo.get("estatisticas", {}), ensure_ascii=False, indent=2))
        return 0

    if args.sync_neo4j:
        status = motor.sincronizar_com_neo4j()
        print(json.dumps(status, ensure_ascii=False, indent=2))
        return 0

    if args.localizar:
        res = motor.localizar_aula_por_termo_ou_link(args.localizar)
        print(json.dumps(res, ensure_ascii=False, indent=2))
        return 0

    if args.buscar:
        res = motor.buscar_conteudo_pos(args.buscar, disciplina=args.disciplina)
        print(json.dumps(res, ensure_ascii=False, indent=2))
        return 0

    servidor = ServidorMCPPosGrafo(motor=motor)
    servidor.rodar_stdio()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
