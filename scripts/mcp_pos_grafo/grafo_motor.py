"""Motor de grafo da pós-graduação (Neo4j 5 Community + índice híbrido local).

Sincroniza o grafo extraído de `docs/curso/pos-*` com o Neo4j local via HTTP
Transactional Cypher API (porta 7474) quando o contêiner está ativo, e mantém
um snapshot persistido em `.neo4j-data/grafo_pos.json` (fora do git, D-001/D-079)
para busca híbrida imediata (conceitos + léxico + similaridade vetorial por cosseno).
"""

from __future__ import annotations

import base64
import json
import os
import pathlib
import re
import urllib.error
import urllib.request
from typing import Any

from scripts.mcp_pos_grafo.extrator import (
    CATALOGO_CONCEITOS,
    construir_grafo_local,
    embedding_local,
    extrair_conceitos_texto,
    normalizar_busca,
    similaridade_cosseno,
)

PROJETO_RAIZ = pathlib.Path(__file__).resolve().parents[2]
CAMINHO_CACHE_PADRAO = PROJETO_RAIZ / ".neo4j-data" / "grafo_pos.json"

PALAVRAS_ESCRITA_CYPHER = re.compile(
    r"\b(CREATE|MERGE|DELETE|DETACH|SET|REMOVE|DROP|LOAD\s+CSV|CALL\s+dbms|CALL\s+apoc\.periodic)\b",
    re.IGNORECASE,
)


class MotorGrafoPos:
    """Gerencia a ingestão, sincronização com Neo4j e consultas híbridas do grafo."""

    def __init__(
        self,
        raiz_curso: pathlib.Path | None = None,
        caminho_cache: pathlib.Path | None = None,
        neo4j_http_url: str | None = None,
        neo4j_auth: str | None = None,
    ) -> None:
        self.raiz_curso = raiz_curso or (PROJETO_RAIZ / "docs" / "curso")
        self.caminho_cache = caminho_cache or CAMINHO_CACHE_PADRAO
        self.neo4j_http_url = neo4j_http_url or os.environ.get(
            "NEO4J_HTTP_URL", "http://localhost:7474/db/neo4j/tx/commit"
        )
        self.neo4j_auth = (
            neo4j_auth if neo4j_auth is not None else os.environ.get("NEO4J_AUTH", "")
        ).strip()
        self._grafo: dict[str, Any] | None = None

    def carregar_ou_ingerir(self, forcar_reingestao: bool = False) -> dict[str, Any]:
        """Carrega o snapshot do grafo ou executa a ingestão a partir de docs/curso."""
        if not forcar_reingestao and self._grafo is not None:
            return self._grafo
        if not forcar_reingestao and self.caminho_cache.exists():
            self._grafo = json.loads(self.caminho_cache.read_text(encoding="utf-8"))
            return self._grafo
        return self.ingerir()

    def ingerir(self, sincronizar_neo4j: bool = True) -> dict[str, Any]:
        """Extrai todo o grafo de docs/curso e salva o snapshot em .neo4j-data/."""
        grafo = construir_grafo_local(self.raiz_curso)
        self.caminho_cache.parent.mkdir(parents=True, exist_ok=True)
        self.caminho_cache.write_text(
            json.dumps(grafo, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        self._grafo = grafo
        if sincronizar_neo4j:
            status_neo4j = self.sincronizar_com_neo4j()
            grafo["estatisticas"]["neo4j_sincronizado"] = status_neo4j.get("sincronizado", False)
            grafo["estatisticas"]["neo4j_detalhe"] = status_neo4j.get("mensagem", "")
        return grafo

    def _executar_cypher_http(
        self, statements: list[dict[str, Any]], timeout: float = 3.5
    ) -> dict[str, Any]:
        """Envia statements Cypher para a API HTTP Transactional do Neo4j 5."""
        payload = json.dumps({"statements": statements}).encode("utf-8")
        req = urllib.request.Request(
            self.neo4j_http_url,
            data=payload,
            headers={
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            method="POST",
        )
        if self.neo4j_auth and "/" in self.neo4j_auth:
            cred = base64.b64encode(self.neo4j_auth.encode("utf-8")).decode("ascii")
            req.add_header("Authorization", f"Basic {cred}")
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            dados = json.loads(resp.read().decode("utf-8"))
        if dados.get("errors"):
            raise RuntimeError(str(dados["errors"]))
        return dados

    def sincronizar_com_neo4j(self) -> dict[str, Any]:
        """Popula o banco Neo4j 5 Community quando o contêiner local está acessível."""
        if not self.neo4j_auth:
            return {
                "sincronizado": False,
                "mensagem": "NEO4J_AUTH não definida no ambiente; sincronização com Neo4j ignorada.",
            }
        grafo = self.carregar_ou_ingerir()
        try:
            statements: list[dict[str, Any]] = [
                {"statement": "MATCH (n) DETACH DELETE n"},
                {
                    "statement": (
                        "UNWIND $disciplinas AS d "
                        "MERGE (n:Disciplina {codigo: d.codigo}) "
                        "SET n.nome = d.nome, n.id = d.id"
                    ),
                    "parameters": {"disciplinas": grafo.get("disciplinas", [])},
                },
                {
                    "statement": (
                        "UNWIND $conceitos AS c "
                        "MERGE (n:Conceito {id: c.id}) "
                        "SET n.nome = c.nome, n.tipo = c.tipo, n.url = c.url, n.descricao = c.descricao"
                    ),
                    "parameters": {"conceitos": grafo.get("conceitos", [])},
                },
                {
                    "statement": (
                        "UNWIND $aulas AS a "
                        "MERGE (n:Aula {id: a.id}) "
                        "SET n.disciplina = a.disciplina, n.aula = a.aula, "
                        "    n.titulo = a.titulo, n.modulo = a.modulo, "
                        "    n.resumo = a.resumo, n.Conceitos = a.conceitos "
                        "WITH n, a "
                        "MATCH (d:Disciplina {codigo: a.disciplina}) "
                        "MERGE (d)-[:TEM_AULA]->(n)"
                    ),
                    "parameters": {"aulas": grafo.get("aulas", [])},
                },
            ]
            # Lotes de trechos de legenda
            trechos = grafo.get("trechos_legenda", [])
            for i in range(0, len(trechos), 250):
                lote = trechos[i : i + 250]
                statements.append(
                    {
                        "statement": (
                            "UNWIND $trechos AS t "
                            "MERGE (n:TrechoLegenda {id: t.id}) "
                            "SET n.disciplina = t.disciplina, n.aula = t.aula, "
                            "    n.indice = t.indice, n.inicio_ts = t.inicio_ts, "
                            "    n.fim_ts = t.fim_ts, n.texto = t.texto "
                            "WITH n, t "
                            "MATCH (a:Aula {id: t.aula_id}) "
                            "MERGE (a)-[:TEM_TRECHO]->(n)"
                        ),
                        "parameters": {"trechos": lote},
                    }
                )
            # Arestas MENCIONA_CONCEITO
            arestas_c = [
                a for a in grafo.get("arestas", []) if a.get("tipo") == "MENCIONA_CONCEITO"
            ]
            if arestas_c:
                statements.append(
                    {
                        "statement": (
                            "UNWIND $arestas AS r "
                            "MATCH (o {id: r.origem}), (c:Conceito {id: r.destino}) "
                            "MERGE (o)-[:MENCIONA_CONCEITO]->(c)"
                        ),
                        "parameters": {"arestas": arestas_c},
                    }
                )
            self._executar_cypher_http(statements, timeout=8.0)
            return {"sincronizado": True, "mensagem": "Grafo sincronizado com Neo4j 5 Community."}
        except Exception as exc:
            return {
                "sincronizado": False,
                "mensagem": f"Neo4j offline ou inacessível ({exc}); operando com motor de grafo local (.neo4j-data/grafo_pos.json).",
            }

    def buscar_conteudo_pos(
        self,
        consulta: str,
        disciplina: str | None = None,
        limite: int = 8,
    ) -> dict[str, Any]:
        """Busca híbrida (conceitos + léxico + cosseno vetorial) com travessia de vizinhança."""
        grafo = self.carregar_ou_ingerir()
        consulta_limpa = (consulta or "").strip()
        if not consulta_limpa:
            return {
                "isError": True,
                "categoria": "consulta_vazia",
                "retentavel": False,
                "mensagem": "Informe uma consulta não vazia em `consulta`.",
            }

        limite = max(1, min(int(limite or 8), 25))
        filtro_disc = disciplina.strip().upper() if disciplina else None

        emb_consulta = embedding_local(consulta_limpa)
        conceitos_consulta = set(extrair_conceitos_texto(consulta_limpa))
        norm_consulta = normalizar_busca(consulta_limpa)
        stopwords = {"de", "da", "do", "das", "dos", "em", "na", "no", "para", "com", "por", "que", "qual", "onde", "como", "uma", "um", "os", "as"}
        tokens_consulta = [
            t for t in norm_consulta.split() if len(t) >= 2 and t not in stopwords
        ]

        # Também verifica se a consulta cita o id/nome/url de algum conceito do catálogo
        for item in CATALOGO_CONCEITOS:
            if (
                item["id"].replace("_", " ") in norm_consulta
                or normalizar_busca(item["nome"]) in norm_consulta
                or (item["url"] and normalizar_busca(item["url"]) in norm_consulta)
            ):
                conceitos_consulta.add(item["id"])

        aulas_por_id = {a["id"]: a for a in grafo.get("aulas", [])}
        trechos_por_id = {t["id"]: t for t in grafo.get("trechos_legenda", [])}
        conceitos_por_id = {c["id"]: c for c in grafo.get("conceitos", [])}

        candidatos: list[dict[str, Any]] = []

        # 1. Avalia trechos de legenda (.vtt)
        for trecho in grafo.get("trechos_legenda", []):
            if filtro_disc and trecho["disciplina"].upper() != filtro_disc:
                continue
            aula = aulas_por_id.get(trecho["aula_id"], {})
            norm_texto = normalizar_busca(trecho["texto"] + " " + aula.get("titulo", ""))

            # Pontuação de conceitos (peso 3.5)
            conc_trecho = set(trecho.get("conceitos", [])) | set(aula.get("conceitos", []))
            intersecao_conc = conceitos_consulta & conc_trecho
            score_conceito = 3.5 * len(intersecao_conc)

            # Pontuação léxica (peso 2.0)
            hits_lexicos = sum(1 for tok in tokens_consulta if tok in norm_texto)
            score_lexico = (
                2.0 * (hits_lexicos / len(tokens_consulta)) if tokens_consulta else 0.0
            )
            if norm_consulta and len(norm_consulta) >= 4 and norm_consulta in norm_texto:
                score_lexico += 1.5

            # Similaridade vetorial (peso 1.0)
            score_vetorial = max(
                0.0, similaridade_cosseno(emb_consulta, trecho.get("embedding", []))
            )

            score_total = score_conceito + score_lexico + score_vetorial
            if score_total <= 0.35 and hits_lexicos == 0 and not intersecao_conc:
                continue

            # Travessia de grafo: recupera trecho anterior e seguinte na mesma aula
            idx = trecho["indice"]
            id_ant = f"trecho:{trecho['disciplina']}:aula-{trecho['aula']:02d}:{idx - 1:04d}"
            id_seg = f"trecho:{trecho['disciplina']}:aula-{trecho['aula']:02d}:{idx + 1:04d}"
            vizinho_ant = trechos_por_id.get(id_ant, {}).get("texto")
            vizinho_seg = trechos_por_id.get(id_seg, {}).get("texto")

            candidatos.append(
                {
                    "tipo_fonte": "legenda_vtt",
                    "score": round(score_total, 4),
                    "disciplina": trecho["disciplina"],
                    "aula": trecho["aula"],
                    "titulo_aula": aula.get("titulo", f"Aula {trecho['aula']:02d}"),
                    "modulo": aula.get("modulo", ""),
                    "inicio_ts": trecho["inicio_ts"],
                    "fim_ts": trecho["fim_ts"],
                    "trecho": trecho["texto"],
                    "contexto_adjacente": {
                        "trecho_anterior": vizinho_ant,
                        "trecho_seguinte": vizinho_seg,
                    },
                    "resumo_aula": (aula.get("resumo") or "")[:420],
                    "conceitos_relacionados": [
                        {
                            "id": cid,
                            "nome": conceitos_por_id[cid]["nome"],
                            "url": conceitos_por_id[cid]["url"],
                        }
                        for cid in sorted(conc_trecho)
                        if cid in conceitos_por_id
                    ],
                }
            )

        # 2. Avalia resumos de aulas (.md)
        for aula in grafo.get("aulas", []):
            if filtro_disc and aula["disciplina"].upper() != filtro_disc:
                continue
            if not aula.get("resumo"):
                continue
            norm_resumo = normalizar_busca(
                f"{aula.get('titulo', '')} {aula.get('modulo', '')} {aula.get('resumo', '')}"
            )
            conc_aula = set(aula.get("conceitos", []))
            intersecao_conc = conceitos_consulta & conc_aula
            score_conceito = 3.5 * len(intersecao_conc)
            hits_lexicos = sum(1 for tok in tokens_consulta if tok in norm_resumo)
            score_lexico = (
                2.2 * (hits_lexicos / len(tokens_consulta)) if tokens_consulta else 0.0
            )
            score_vetorial = max(
                0.0, similaridade_cosseno(emb_consulta, aula.get("embedding", []))
            )
            score_total = score_conceito + score_lexico + score_vetorial
            if score_total <= 0.40 and hits_lexicos == 0 and not intersecao_conc:
                continue

            candidatos.append(
                {
                    "tipo_fonte": "resumo_aula_md",
                    "score": round(score_total, 4),
                    "disciplina": aula["disciplina"],
                    "aula": aula["aula"],
                    "titulo_aula": aula.get("titulo", ""),
                    "modulo": aula.get("modulo", ""),
                    "inicio_ts": "00:00:00",
                    "fim_ts": "00:00:00",
                    "trecho": aula.get("resumo", ""),
                    "contexto_adjacente": None,
                    "resumo_aula": aula.get("resumo", ""),
                    "conceitos_relacionados": [
                        {
                            "id": cid,
                            "nome": conceitos_por_id[cid]["nome"],
                            "url": conceitos_por_id[cid]["url"],
                        }
                        for cid in sorted(conc_aula)
                        if cid in conceitos_por_id
                    ],
                }
            )

        # 3. Avalia páginas de PDFs
        for pag in grafo.get("paginas_pdf", []):
            if filtro_disc and pag["disciplina"].upper() != filtro_disc:
                continue
            norm_pag = normalizar_busca(pag["texto"])
            conc_pag = set(pag.get("conceitos", []))
            intersecao_conc = conceitos_consulta & conc_pag
            score_conceito = 3.2 * len(intersecao_conc)
            hits_lexicos = sum(1 for tok in tokens_consulta if tok in norm_pag)
            score_lexico = (
                1.8 * (hits_lexicos / len(tokens_consulta)) if tokens_consulta else 0.0
            )
            score_vetorial = max(
                0.0, similaridade_cosseno(emb_consulta, pag.get("embedding", []))
            )
            score_total = score_conceito + score_lexico + score_vetorial
            if score_total <= 0.45 and hits_lexicos == 0 and not intersecao_conc:
                continue

            candidatos.append(
                {
                    "tipo_fonte": "pagina_pdf",
                    "score": round(score_total, 4),
                    "disciplina": pag["disciplina"],
                    "pagina": pag["pagina"],
                    "material_id": pag["material_id"],
                    "trecho": pag["texto"][:600],
                    "conceitos_relacionados": [
                        {
                            "id": cid,
                            "nome": conceitos_por_id[cid]["nome"],
                            "url": conceitos_por_id[cid]["url"],
                        }
                        for cid in sorted(conc_pag)
                        if cid in conceitos_por_id
                    ],
                }
            )

        candidatos.sort(key=lambda x: x["score"], reverse=True)
        return {
            "isError": False,
            "consulta": consulta_limpa,
            "disciplina_filtro": filtro_disc,
            "conceitos_detectados_na_consulta": sorted(conceitos_consulta),
            "total_encontrado": len(candidatos),
            "resultados": candidatos[:limite],
        }

    def localizar_aula_por_termo_ou_link(self, termo: str) -> dict[str, Any]:
        """Localiza aulas e timestamps exatos que citam um link, repositório ou ferramenta (com correção fonética)."""
        grafo = self.carregar_ou_ingerir()
        termo_limpo = (termo or "").strip()
        if not termo_limpo:
            return {
                "isError": True,
                "categoria": "termo_vazio",
                "retentavel": False,
                "mensagem": "Informe um termo, link ou repositório em `termo`.",
            }

        norm_termo = normalizar_busca(termo_limpo)
        conceitos_alvo = set(extrair_conceitos_texto(termo_limpo))
        for item in CATALOGO_CONCEITOS:
            if (
                norm_termo in normalizar_busca(item["nome"])
                or norm_termo in normalizar_busca(item["url"])
                or norm_termo in item["id"].replace("_", " ")
            ):
                conceitos_alvo.add(item["id"])

        aulas_por_id = {a["id"]: a for a in grafo.get("aulas", [])}
        conceitos_por_id = {c["id"]: c for c in grafo.get("conceitos", [])}

        ocorrencias: list[dict[str, Any]] = []

        for trecho in grafo.get("trechos_legenda", []):
            conc_trecho = set(trecho.get("conceitos", []))
            bate_conceito = bool(conceitos_alvo & conc_trecho)
            bate_texto = norm_termo in normalizar_busca(trecho["texto"])
            if not (bate_conceito or bate_texto):
                continue
            aula = aulas_por_id.get(trecho["aula_id"], {})
            ocorrencias.append(
                {
                    "fonte": "legenda_vtt",
                    "disciplina": trecho["disciplina"],
                    "aula": trecho["aula"],
                    "titulo_aula": aula.get("titulo", f"Aula {trecho['aula']:02d}"),
                    "modulo": aula.get("modulo", ""),
                    "inicio_ts": trecho["inicio_ts"],
                    "fim_ts": trecho["fim_ts"],
                    "trecho_transcrito": trecho["texto"],
                    "via_correcao_fonetica_ou_conceito": bate_conceito,
                    "conceitos": [
                        {
                            "id": cid,
                            "nome": conceitos_por_id[cid]["nome"],
                            "url": conceitos_por_id[cid]["url"],
                        }
                        for cid in sorted(conc_trecho)
                        if cid in conceitos_por_id
                    ],
                }
            )

        for aula in grafo.get("aulas", []):
            conc_aula = set(aula.get("conceitos", []))
            bate_conceito = bool(conceitos_alvo & conc_aula)
            bate_texto = norm_termo in normalizar_busca(
                f"{aula.get('titulo', '')} {aula.get('resumo', '')}"
            )
            if not (bate_conceito or bate_texto):
                continue
            ocorrencias.append(
                {
                    "fonte": "resumo_aula_md",
                    "disciplina": aula["disciplina"],
                    "aula": aula["aula"],
                    "titulo_aula": aula.get("titulo", ""),
                    "modulo": aula.get("modulo", ""),
                    "inicio_ts": "00:00:00",
                    "fim_ts": "00:00:00",
                    "trecho_transcrito": aula.get("resumo", ""),
                    "via_correcao_fonetica_ou_conceito": bate_conceito,
                    "conceitos": [
                        {
                            "id": cid,
                            "nome": conceitos_por_id[cid]["nome"],
                            "url": conceitos_por_id[cid]["url"],
                        }
                        for cid in sorted(conc_aula)
                        if cid in conceitos_por_id
                    ],
                }
            )

        return {
            "isError": False,
            "termo_pesquisado": termo_limpo,
            "conceitos_canonicos_identificados": [
                conceitos_por_id[cid] for cid in sorted(conceitos_alvo) if cid in conceitos_por_id
            ],
            "total_ocorrencias": len(ocorrencias),
            "ocorrencias": ocorrencias,
        }

    def obter_contexto_aula(
        self,
        disciplina: str,
        aula: int,
        timestamp_foco: str | None = None,
    ) -> dict[str, Any]:
        """Retorna o subgrafo completo de uma aula (resumo, conceitos, PDFs da disciplina e legendas)."""
        grafo = self.carregar_ou_ingerir()
        cod = (disciplina or "").strip().upper()
        if not cod.startswith("D"):
            cod = f"D{int(cod):02d}" if cod.isdigit() else cod
        aula_num = int(aula)
        aula_id = f"aula:{cod}:{aula_num:02d}"

        no_aula = next((a for a in grafo.get("aulas", []) if a["id"] == aula_id), None)
        if not no_aula:
            return {
                "isError": True,
                "categoria": "aula_nao_encontrada",
                "retentavel": False,
                "mensagem": f"Aula {aula_num:02d} da disciplina {cod} não encontrada no grafo.",
            }

        trechos_aula = [
            t for t in grafo.get("trechos_legenda", []) if t["aula_id"] == aula_id
        ]
        trechos_aula.sort(key=lambda t: t["indice"])

        if timestamp_foco:
            # Filtra janela em torno do timestamp_foco
            foco_idx = 0
            for i, t in enumerate(trechos_aula):
                if t["inicio_ts"] <= timestamp_foco <= t["fim_ts"] or t["inicio_ts"] >= timestamp_foco:
                    foco_idx = i
                    break
            ini = max(0, foco_idx - 3)
            fim = min(len(trechos_aula), foco_idx + 4)
            trechos_recorte = trechos_aula[ini:fim]
        else:
            trechos_recorte = trechos_aula[:25]

        conceitos_por_id = {c["id"]: c for c in grafo.get("conceitos", [])}
        conceitos_aula = set(no_aula.get("conceitos", []))
        for t in trechos_aula:
            conceitos_aula.update(t.get("conceitos", []))

        materiais_disc = [
            {"id": m["id"], "arquivo": m["arquivo"], "total_paginas": m["total_paginas"]}
            for m in grafo.get("materiais_pdf", [])
            if m["disciplina"] == cod
        ]

        return {
            "isError": False,
            "aula": {
                "id": no_aula["id"],
                "disciplina": no_aula["disciplina"],
                "numero": no_aula["aula"],
                "titulo": no_aula.get("titulo", ""),
                "modulo": no_aula.get("modulo", ""),
                "metadados": no_aula.get("metadados", ""),
                "resumo": no_aula.get("resumo", ""),
            },
            "conceitos_e_links_da_aula": [
                conceitos_por_id[cid] for cid in sorted(conceitos_aula) if cid in conceitos_por_id
            ],
            "materiais_pdf_da_disciplina": materiais_disc,
            "total_trechos_legenda": len(trechos_aula),
            "trechos_legenda": [
                {
                    "indice": t["indice"],
                    "inicio_ts": t["inicio_ts"],
                    "fim_ts": t["fim_ts"],
                    "texto": t["texto"],
                }
                for t in trechos_recorte
            ],
        }

    def consultar_grafo_cypher(
        self,
        cypher: str,
        parametros: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Executa consulta Cypher somente-leitura no Neo4j (ou fallback sobre o grafo em memória)."""
        consulta = (cypher or "").strip()
        if not consulta:
            return {
                "isError": True,
                "categoria": "cypher_vazio",
                "retentavel": False,
                "mensagem": "Informe uma consulta Cypher em `cypher`.",
            }

        if PALAVRAS_ESCRITA_CYPHER.search(consulta):
            return {
                "isError": True,
                "categoria": "escrita_proibida",
                "retentavel": False,
                "mensagem": (
                    "Apenas consultas Cypher somente-leitura (MATCH / RETURN) são permitidas. "
                    "Operações como CREATE, MERGE, DELETE, SET, REMOVE ou DROP são bloqueadas."
                ),
            }

        params = parametros or {}
        try:
            resp = self._executar_cypher_http(
                [{"statement": consulta, "parameters": params}], timeout=4.0
            )
            resultados = resp.get("results", [{}])[0]
            colunas = resultados.get("columns", [])
            linhas = [
                dict(zip(colunas, item.get("row", [])))
                for item in resultados.get("data", [])
            ]
            return {
                "isError": False,
                "motor": "neo4j_5_http",
                "colunas": colunas,
                "linhas": linhas,
            }
        except Exception:
            # Fallback local determinístico sobre o snapshot do grafo
            grafo = self.carregar_ou_ingerir()
            c_upper = consulta.upper()
            if ":CONCEITO" in c_upper:
                itens = grafo.get("conceitos", [])
            elif ":TRECHOLEGENDA" in c_upper:
                itens = [
                    {k: v for k, v in t.items() if k != "embedding"}
                    for t in grafo.get("trechos_legenda", [])[:30]
                ]
            elif ":AULA" in c_upper:
                itens = [
                    {k: v for k, v in a.items() if k != "embedding"}
                    for a in grafo.get("aulas", [])
                ]
            elif ":DISCIPLINA" in c_upper:
                itens = grafo.get("disciplinas", [])
            else:
                itens = [grafo.get("estatisticas", {})]
            return {
                "isError": False,
                "motor": "grafo_local_fallback",
                "estatisticas_grafo": grafo.get("estatisticas", {}),
                "linhas": itens[:30],
            }
