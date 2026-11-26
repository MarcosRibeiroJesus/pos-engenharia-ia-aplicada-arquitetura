"""Testes de contrato e unidade do Grafo de Conhecimento da Pós + Servidor MCP (D-001, D-079)."""

from __future__ import annotations

import json
import os
import pathlib
import tempfile
import unittest
from unittest import mock

from scripts.mcp_pos_grafo.extrator import (
    construir_grafo_local,
    embedding_local,
    extrair_conceitos,
    similaridade_cosseno,
)
from scripts.mcp_pos_grafo.grafo_motor import MotorGrafoPos
from scripts.mcp_pos_grafo.servidor_mcp import TOOLS_MCP, ServidorMCPPosGrafo

RAIZ = pathlib.Path(__file__).resolve().parents[2]


class TestMcpPosGrafoD079(unittest.TestCase):
    """Verifica privacidade (.gitignore), correção fonética, extrator e as 4 tools MCP."""

    def test_gitignore_protege_material_privado_e_volume_neo4j(self) -> None:
        gitignore = (RAIZ / ".gitignore").read_text(encoding="utf-8")
        entradas_obrigatorias = [
            "docs/curso/pos-legendas/",
            "docs/curso/pos-pdfs/",
            "docs/curso/pos-resumos/",
            "docs/pos-archs/",
            ".neo4j-data/",
        ]
        for entrada in entradas_obrigatorias:
            self.assertIn(
                entrada,
                gitignore,
                f"Entrada de privacidade ausente no .gitignore (D-001/D-079): {entrada}",
            )

    def test_correcao_fonetica_e_embeddings_locais_deterministicos(self) -> None:
        fala_distorcida = (
            "no nosso model contestprotocol service aqui é bem legal esse repositório, "
            "ou até o model Context PROROCON e o ossom MCP com Verdácio"
        )
        conceitos = extrair_conceitos(fala_distorcida)
        ids = {c["id"] for c in conceitos}
        urls = {c["url"] for c in conceitos}
        self.assertIn("repo-mcp-servers", ids)
        self.assertIn("https://github.com/modelcontextprotocol/servers/", urls)
        self.assertIn("repo-awesome-mcp-servers", ids)
        self.assertIn("tool-verdaccio", ids)

        emb1 = embedding_local("servidor MCP com transporte stdio e Neo4j")
        emb2 = embedding_local("servidor MCP com transporte stdio e grafo Neo4j")
        self.assertEqual(len(emb1), 64)
        self.assertGreater(similaridade_cosseno(emb1, emb2), 0.75)

    def test_ingestao_sintetica_e_quatro_tools_mcp_jsonrpc(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            raiz_tmp = pathlib.Path(tmp)
            dir_leg = raiz_tmp / "pos-legendas"
            dir_res = raiz_tmp / "pos-resumos"
            dir_pdf = raiz_tmp / "pos-pdfs" / "03-mcp"
            dir_leg.mkdir(parents=True)
            dir_res.mkdir(parents=True)
            dir_pdf.mkdir(parents=True)

            # Fixture sintética de resumo Markdown
            resumo_md = (
                "# Disciplina 03\n\n"
                "### Aula 06 · Sistema de arquivos com MCP (Módulo 02, videoaula 05)\n\n"
                "- O instrutor apresenta o Servidor de file system oficial do Model Context Protocol "
                "e explora LangChain.js com Neo4j.\n"
            )
            (dir_res / "03-mcp-sintetico.md").write_text(resumo_md, encoding="utf-8")

            # Fixture sintética de legenda VTT com distorção fonética e timestamps
            vtt_texto = (
                "WEBVTT\n\n"
                "00:00:10.000 --> 00:00:25.000\n"
                "Vamos integrar o LangChain.js com o nosso banco de dados.\n\n"
                "00:00:33.000 --> 00:00:44.000\n"
                "Olha aqui no nosso model contestprotocol service quantas ferramentas oficiais existem.\n"
            )
            (dir_leg / "m03-aula06.vtt").write_text(vtt_texto, encoding="utf-8")

            motor = MotorGrafoPos(
                raiz_curso=raiz_tmp,
                caminho_cache=raiz_tmp / ".neo4j-data" / "grafo_pos.json",
                neo4j_http_url="http://127.0.0.1:1/offline",
            )
            grafo = motor.ingerir(sincronizar_neo4j=False)
            self.assertEqual(grafo["estatisticas"]["disciplinas"], 1)
            self.assertEqual(grafo["estatisticas"]["aulas"], 1)
            self.assertGreaterEqual(grafo["estatisticas"]["trechos_legenda"], 1)

            servidor = ServidorMCPPosGrafo(motor=motor)

            # 1. Negociação de protocolo 2026-07-28 e lane 2025-11-25
            resp_init = servidor.processar_mensagem_jsonrpc(
                {
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "initialize",
                    "params": {"protocolVersion": "2026-07-28"},
                }
            )
            self.assertEqual(resp_init["result"]["protocolVersion"], "2026-07-28")

            # 2. Contrato das 4 tools (additionalProperties: false e descrição em 4 partes)
            self.assertEqual(len(TOOLS_MCP), 4)
            for tool in TOOLS_MCP:
                self.assertIs(tool["inputSchema"].get("additionalProperties"), False)
                desc = tool["description"]
                self.assertIn("O que faz:", desc)
                self.assertIn("Quando usar:", desc)
                self.assertIn("Quando NÃO usar:", desc)
                self.assertIn("Unidades de entrada/saída:", desc)

            # 3. Tool localizar_aula_por_termo_ou_link
            resp_loc = servidor.chamar_ferramenta(
                "localizar_aula_por_termo_ou_link",
                {"termo": "https://github.com/modelcontextprotocol/servers/"},
            )
            self.assertFalse(resp_loc["isError"])
            dados_loc = resp_loc["structuredContent"]
            self.assertGreaterEqual(dados_loc["total_ocorrencias"], 1)
            self.assertEqual(dados_loc["ocorrencias"][0]["disciplina"], "D03")
            self.assertEqual(dados_loc["ocorrencias"][0]["aula"], 6)

            # 4. Tool buscar_conteudo_pos
            resp_busca = servidor.chamar_ferramenta(
                "buscar_conteudo_pos",
                {"consulta": "file system oficial Model Context Protocol LangChain", "disciplina": "D03"},
            )
            self.assertFalse(resp_busca["isError"])
            self.assertGreaterEqual(resp_busca["structuredContent"]["total_encontrado"], 1)

            # 5. Tool obter_contexto_aula
            resp_ctx = servidor.chamar_ferramenta(
                "obter_contexto_aula",
                {"disciplina": "D03", "aula": 6, "timestamp_foco": "00:00:35"},
            )
            self.assertFalse(resp_ctx["isError"])
            self.assertEqual(resp_ctx["structuredContent"]["aula"]["numero"], 6)

            # 6. Tool consultar_grafo_cypher bloqueia escrita (CREATE/DELETE) com isError: true
            resp_cypher_erro = servidor.chamar_ferramenta(
                "consultar_grafo_cypher",
                {"cypher": "CREATE (n:Conceito {id: 'hack'}) RETURN n"},
            )
            self.assertTrue(resp_cypher_erro["isError"])
            self.assertEqual(
                resp_cypher_erro["structuredContent"]["categoria"],
                "escrita_proibida",
            )

            # 7. Tool consultar_grafo_cypher aceita leitura (MATCH ... RETURN ...)
            resp_cypher_ok = servidor.chamar_ferramenta(
                "consultar_grafo_cypher",
                {"cypher": "MATCH (a:Aula) RETURN a"},
            )
            self.assertFalse(resp_cypher_ok["isError"])

    def test_neo4j_auth_compartilhada_sem_padrao_publico(self) -> None:
        compose = (RAIZ / "scripts" / "mcp_pos_grafo" / "docker-compose.yml").read_text(encoding="utf-8")
        # Compose restringe portas ao loopback e exige NEO4J_AUTH do ambiente (sem senha padrão pública)
        self.assertIn('"127.0.0.1:7474:7474"', compose)
        self.assertIn('"127.0.0.1:7687:7687"', compose)
        self.assertIn("NEO4J_AUTH=${NEO4J_AUTH:?", compose)
        self.assertNotIn("NEO4J_AUTH=${NEO4J_AUTH:-", compose)

        with tempfile.TemporaryDirectory() as tmp:
            raiz_tmp = pathlib.Path(tmp)
            # Sem NEO4J_AUTH no ambiente: motor não usa credencial padrão pública
            with mock.patch.dict(os.environ, {}, clear=True):
                motor_sem_auth = MotorGrafoPos(
                    raiz_curso=raiz_tmp,
                    caminho_cache=raiz_tmp / "grafo_pos.json",
                )
                self.assertEqual(motor_sem_auth.neo4j_auth, "")
                status = motor_sem_auth.sincronizar_com_neo4j()
                self.assertFalse(status["sincronizado"])
                self.assertIn("NEO4J_AUTH", status["mensagem"])

            # Com NEO4J_AUTH no ambiente: motor lê exatamente a mesma variável usada pelo Compose
            cred_sintetica = "neo4j/credencial_sintetica_teste"
            with mock.patch.dict(os.environ, {"NEO4J_AUTH": cred_sintetica}, clear=True):
                motor_com_auth = MotorGrafoPos(
                    raiz_curso=raiz_tmp,
                    caminho_cache=raiz_tmp / "grafo_pos.json",
                )
                self.assertEqual(motor_com_auth.neo4j_auth, cred_sintetica)


if __name__ == "__main__":
    unittest.main()
