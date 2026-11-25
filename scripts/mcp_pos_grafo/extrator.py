"""Extrator determinístico de legendas (.vtt/.txt), resumos (.md) e PDFs + embeddings locais gratuitos (D-079)."""
from __future__ import annotations

import hashlib
import math
import re
import zlib
from pathlib import Path
from typing import Any

DISCIPLINAS_PADRAO = {
    "00": "Ambientação",
    "01": "Fundamentos de IA e LLMs para Programadores",
    "02": "APIs de IA Generativa e Prompt Engineering",
    "03": "Model Context Protocol (MCP)",
    "04": "Criação de Agentes Autônomos",
    "05": "Ferramentas de IA para UX e UI",
    "06": "Ferramentas de IA para DevOps",
    "07": "Ferramentas de IA para Gestão de Projetos",
}

# Catálogo determinístico que corrige variações fonéticas da transcrição automática (.vtt)
CATALOGO_CONCEITOS: list[dict[str, Any]] = [
    {
        "id": "repo-mcp-servers",
        "nome": "modelcontextprotocol/servers",
        "tipo": "RepositorioGit",
        "url": "https://github.com/modelcontextprotocol/servers/",
        "padroes": [
            r"model\s*context\s*protocol\s*/?\s*servers",
            r"model\s*contest\s*protocol\s*service",
            r"model\s*context\s*prorocon",
            r"@modelcontextprotocol/server-filesystem",
            r"servidor\s+de\s+file\s*system\s+oficial\s+do\s+model\s+context\s+protocol",
        ],
    },
    {
        "id": "repo-awesome-mcp-servers",
        "nome": "awesome-mcp-servers",
        "tipo": "RepositorioGit",
        "url": "https://github.com/punkpeye/awesome-mcp-servers",
        "padroes": [r"awesome[- ]mcp[- ]servers", r"ossom\s+mcp(?:\s+servers)?"],
    },
    {
        "id": "repo-awesome-copilot",
        "nome": "awesome-copilot",
        "tipo": "RepositorioGit",
        "url": "https://github.com/github/awesome-copilot",
        "padroes": [r"awesome[- ]copilot"],
    },
    {
        "id": "tool-verdaccio",
        "nome": "Verdaccio",
        "tipo": "Ferramenta",
        "url": "https://verdaccio.org/",
        "padroes": [r"\bverdaccio\b", r"\bverd[aá]cio\b"],
    },
    {
        "id": "tool-context7",
        "nome": "Context7",
        "tipo": "ServidorMCP",
        "url": "https://context7.com/",
        "padroes": [r"\bcontext\s*7\b", r"\bcontext\s+seven\b"],
    },
    {
        "id": "tool-mcp-inspector",
        "nome": "MCP Inspector",
        "tipo": "Ferramenta",
        "url": "https://modelcontextprotocol.io/docs/tools/inspector",
        "padroes": [r"\bmcp\s+inspector\b", r"@modelcontextprotocol/inspector"],
    },
    {
        "id": "lib-mcp-sdk",
        "nome": "@modelcontextprotocol/sdk",
        "tipo": "Biblioteca",
        "url": "https://github.com/modelcontextprotocol/typescript-sdk",
        "padroes": [r"@modelcontextprotocol/sdk", r"\bstdio\s*server\s*transport\b", r"\bstreamable\s+http\b"],
    },
    {
        "id": "lib-langchain-js",
        "nome": "LangChain.js",
        "tipo": "Biblioteca",
        "url": "https://js.langchain.com/",
        "padroes": [r"\blangchain(?:\.js)?\b", r"\bleng\s*chain\b"],
    },
    {
        "id": "lib-langgraph",
        "nome": "LangGraph",
        "tipo": "Biblioteca",
        "url": "https://langchain-ai.github.io/langgraphjs/",
        "padroes": [r"\blang\s*graph\b"],
    },
    {
        "id": "db-neo4j",
        "nome": "Neo4j & Cypher",
        "tipo": "BancoDeDados",
        "url": "https://neo4j.com/",
        "padroes": [r"\bneo\s*4\s*j\b", r"\bneo\s+for\s+j\b", r"\bcypher\b"],
    },
    {
        "id": "db-mongodb",
        "nome": "MongoDB",
        "tipo": "BancoDeDados",
        "url": "https://www.mongodb.com/",
        "padroes": [r"\bmongo\s*db\b", r"\bmongo\s+express\b"],
    },
    {
        "id": "db-sqlite",
        "nome": "SQLite",
        "tipo": "BancoDeDados",
        "url": "https://www.sqlite.org/",
        "padroes": [r"\bsqlite3?\b", r"\bsq\s*lite\b"],
    },
    {
        "id": "lib-zod",
        "nome": "Zod",
        "tipo": "Biblioteca",
        "url": "https://zod.dev/",
        "padroes": [r"\bzod\b"],
    },
    {
        "id": "lib-fastify-pino",
        "nome": "Fastify & Pino",
        "tipo": "Biblioteca",
        "url": "https://fastify.dev/",
        "padroes": [r"\bfastify\b", r"\bpino\b"],
    },
    {
        "id": "tool-openrouter",
        "nome": "OpenRouter",
        "tipo": "PlataformaIA",
        "url": "https://openrouter.ai/",
        "padroes": [r"\bopen\s*router\b"],
    },
    {
        "id": "tool-ollama",
        "nome": "Ollama",
        "tipo": "Ferramenta",
        "url": "https://ollama.com/",
        "padroes": [r"\bollama\b"],
    },
    {
        "id": "tool-playwright",
        "nome": "Playwright",
        "tipo": "Ferramenta",
        "url": "https://playwright.dev/",
        "padroes": [r"\bplaywright\b", r"\bplay\s*right\b"],
    },
    {
        "id": "tool-coderabbit",
        "nome": "CodeRabbit",
        "tipo": "Ferramenta",
        "url": "https://www.coderabbit.ai/",
        "padroes": [r"\bcode\s*rabbit\b"],
    },
    {
        "id": "lib-tensorflow-js",
        "nome": "TensorFlow.js",
        "tipo": "Biblioteca",
        "url": "https://www.tensorflow.org/js",
        "padroes": [r"\btensor\s*flow(?:\.js)?\b", r"\btf\.js\b"],
    },
    {
        "id": "model-yolo",
        "nome": "YOLO",
        "tipo": "ModeloML",
        "url": "https://docs.ultralytics.com/",
        "padroes": [r"\byolo(?:v8|v11)?\b"],
    },
    {
        "id": "tool-langfuse",
        "nome": "Langfuse",
        "tipo": "Ferramenta",
        "url": "https://langfuse.com/",
        "padroes": [r"\blangfuse\b"],
    },
    {
        "id": "std-llms-txt",
        "nome": "llms.txt",
        "tipo": "Padrao",
        "url": "https://llmstxt.org/",
        "padroes": [r"\bllms\.txt\b"],
    },
    {
        "id": "tool-vercel-skills",
        "nome": "Skills (npx skills / SKILL.md)",
        "tipo": "Padrao",
        "url": "https://github.com/anthropics/skills",
        "padroes": [r"\bnpx\s+skills\b", r"\bskill\.md\b", r"\bfind[- ]skills\b", r"\bfive\s+skills\b"],
    },
]


def _ts_para_segundos(ts: str) -> float:
    partes = ts.strip().replace(",", ".").split(":")
    if len(partes) == 3:
        return int(partes[0]) * 3600 + int(partes[1]) * 60 + float(partes[2])
    if len(partes) == 2:
        return int(partes[0]) * 60 + float(partes[1])
    return 0.0


def embedding_local(texto: str, dim: int = 64) -> list[float]:
    """Embedding vetorial local determinístico (feature hashing de n-gramas + L2 norm, custo US$ 0)."""
    vec = [0.0] * dim
    limpo = re.sub(r"[^a-záàâãéêíóôõúç0-9_./-]+", " ", texto.lower())
    tokens = [t for t in limpo.split() if len(t) >= 2]
    if not tokens:
        return vec
    features = list(tokens)
    for i in range(len(tokens) - 1):
        features.append(f"{tokens[i]}_{tokens[i + 1]}")
    for feat in features:
        h = hashlib.blake2b(feat.encode("utf-8"), digest_size=8).digest()
        idx = int.from_bytes(h[:4], "little") % dim
        sinal = 1.0 if (h[4] & 1) == 0 else -1.0
        vec[idx] += sinal
    norma = math.sqrt(sum(v * v for v in vec))
    if norma > 0:
        vec = [round(v / norma, 5) for v in vec]
    return vec


def similaridade_cosseno(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    return sum(x * y for x, y in zip(a, b))


def extrair_conceitos(texto: str) -> list[dict[str, Any]]:
    achados: dict[str, dict[str, Any]] = {}
    for c in CATALOGO_CONCEITOS:
        for pat in c["padroes"]:
            if re.search(pat, texto, re.I):
                achados[c["id"]] = {
                    "id": c["id"],
                    "nome": c["nome"],
                    "tipo": c["tipo"],
                    "url": c.get("url") or "",
                }
                break
    # Também extrai URLs explícitas do texto
    for m in re.finditer(r'https?://[^\s)>\]"]+', texto):
        url = m.group(0).rstrip(".,;:")
        cid = "url-" + hashlib.sha1(url.encode("utf-8")).hexdigest()[:10]
        if cid not in achados:
            achados[cid] = {"id": cid, "nome": url, "tipo": "URL", "url": url}
    return list(achados.values())


def parse_vtt(caminho: Path, janela_seg: float = 45.0) -> list[dict[str, Any]]:
    """Lê um arquivo .vtt e agrupa as falas em janelas com timestamp inicial/final exatos."""
    texto = caminho.read_text(encoding="utf-8", errors="replace")
    padrao_cue = re.compile(
        r"(\d{2}:\d{2}:\d{2}[.,]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[.,]\d{3})\s*\r?\n([\s\S]*?)(?=\r?\n\r?\n|\Z)"
    )
    cues = []
    for m in padrao_cue.finditer(texto):
        ini_ts, fim_ts, corpo = m.group(1), m.group(2), m.group(3)
        linhas = [re.sub(r"<[^>]+>", "", ln).strip() for ln in corpo.splitlines()]
        fala = " ".join(ln for ln in linhas if ln and not ln.isdigit())
        if fala:
            cues.append((ini_ts, fim_ts, _ts_para_segundos(ini_ts), _ts_para_segundos(fim_ts), fala))

    trechos: list[dict[str, Any]] = []
    if not cues:
        return trechos

    atual_ini_ts, _, atual_ini_s, atual_fim_s, _ = cues[0]
    atual_fim_ts = cues[0][1]
    falas_janela: list[str] = []

    for ini_ts, fim_ts, ini_s, fim_s, fala in cues:
        if falas_janela and (fim_s - atual_ini_s) > janela_seg:
            texto_janela = " ".join(falas_janela)
            trechos.append({
                "inicio_ts": atual_ini_ts.split(".")[0],
                "fim_ts": atual_fim_ts.split(".")[0],
                "inicio_seg": round(atual_ini_s, 2),
                "fim_seg": round(atual_fim_s, 2),
                "texto": texto_janela,
                "conceitos": extrair_conceitos(texto_janela),
                "embedding": embedding_local(texto_janela),
            })
            atual_ini_ts, atual_ini_s = ini_ts, ini_s
            falas_janela = []
        falas_janela.append(fala)
        atual_fim_ts, atual_fim_s = fim_ts, fim_s

    if falas_janela:
        texto_janela = " ".join(falas_janela)
        trechos.append({
            "inicio_ts": atual_ini_ts.split(".")[0],
            "fim_ts": atual_fim_ts.split(".")[0],
            "inicio_seg": round(atual_ini_s, 2),
            "fim_seg": round(atual_fim_s, 2),
            "texto": texto_janela,
            "conceitos": extrair_conceitos(texto_janela),
            "embedding": embedding_local(texto_janela),
        })
    return trechos


def parse_resumo_md(caminho: Path) -> dict[str, Any]:
    """Extrai aulas, módulos e tópicos de um arquivo Markdown de resumo de disciplina."""
    m_disc = re.match(r"^(\d{2})-", caminho.name)
    disc_num = m_disc.group(1) if m_disc else "00"
    texto = caminho.read_text(encoding="utf-8", errors="replace")
    aulas: list[dict[str, Any]] = []
    padrao_aula = re.compile(
        r"^###\s+Aula\s+(\d+)\s*·\s*(.+?)(?:\s*\((Módulo\s+(\d+)[^)]*)\))?\s*$",
        re.M,
    )
    matches = list(padrao_aula.finditer(texto))
    for i, m in enumerate(matches):
        aula_num = int(m.group(1))
        titulo = m.group(2).strip()
        meta_parenteses = (m.group(3) or "").strip()
        mod_num = int(m.group(4)) if m.group(4) else 1
        ini = m.end()
        fim = matches[i + 1].start() if i + 1 < len(matches) else len(texto)
        corpo = texto[ini:fim].strip()
        # Corta antes de seção "## " seguinte, se houver
        m_sec = re.search(r"^##\s+", corpo, re.M)
        if m_sec:
            corpo = corpo[:m_sec.start()].strip()
        aulas.append({
            "disciplina": disc_num,
            "aula": aula_num,
            "modulo": mod_num,
            "titulo": titulo,
            "metadados": meta_parenteses,
            "resumo": corpo,
            "conceitos": extrair_conceitos(titulo + "\n" + corpo),
            "embedding": embedding_local(titulo + "\n" + corpo),
        })
    return {"disciplina": disc_num, "arquivo": caminho.name, "aulas": aulas}


def extrair_texto_pdf_fallback(caminho: Path, max_paginas: int = 40) -> list[dict[str, Any]]:
    """Extrai texto de PDF usando pypdf/pymupdf quando disponível, ou fallback de streams FlateDecode."""
    try:
        import pypdf  # type: ignore
        reader = pypdf.PdfReader(str(caminho))
        paginas = []
        for idx, page in enumerate(reader.pages[:max_paginas], 1):
            t = (page.extract_text() or "").strip()
            if t:
                paginas.append({
                    "numero": idx,
                    "texto": t[:4000],
                    "conceitos": extrair_conceitos(t[:4000]),
                    "embedding": embedding_local(t[:4000]),
                })
        if paginas:
            return paginas
    except Exception:
        pass

    # Fallback leve: extrai strings legíveis e streams comprimidos do PDF
    raw = caminho.read_bytes()
    textos: list[str] = []
    for m in re.finditer(rb"stream\r?\n([\s\S]*?)\r?\nendstream", raw):
        bloco = m.group(1)
        try:
            decomp = zlib.decompress(bloco)
        except Exception:
            continue
        partes = re.findall(rb"\(([^()]{3,200})\)", decomp)
        if partes:
            linha = " ".join(p.decode("latin-1", errors="ignore") for p in partes)
            linha = re.sub(r"\s+", " ", linha).strip()
            if len(linha) > 40:
                textos.append(linha)
    if not textos:
        # Mesmo sem texto extraído dos streams, registra o metadado do arquivo PDF
        nome_limpo = caminho.stem.replace("-", " ").replace("_", " ")
        return [{
            "numero": 1,
            "texto": f"Documento PDF da disciplina: {nome_limpo}",
            "conceitos": extrair_conceitos(nome_limpo),
            "embedding": embedding_local(nome_limpo),
        }]
    paginas = []
    for idx, t in enumerate(textos[:max_paginas], 1):
        paginas.append({
            "numero": idx,
            "texto": t[:4000],
            "conceitos": extrair_conceitos(t[:4000]),
            "embedding": embedding_local(t[:4000]),
        })
    return paginas


def construir_grafo_de_diretorios(
    dir_legendas: Path | None,
    dir_resumos: Path | None,
    dir_pdfs: Path | None,
) -> dict[str, Any]:
    """Constrói o grafo completo em memória a partir das pastas de legendas, resumos e PDFs."""
    disciplinas: dict[str, dict[str, Any]] = {}
    aulas: dict[str, dict[str, Any]] = {}
    trechos: list[dict[str, Any]] = []
    pdfs: list[dict[str, Any]] = []
    conceitos: dict[str, dict[str, Any]] = {}

    def _registrar_conceitos(lista: list[dict[str, Any]]) -> list[str]:
        ids = []
        for c in lista:
            conceitos[c["id"]] = c
            ids.append(c["id"])
        return ids

    # 1. Resumos Markdown
    if dir_resumos and dir_resumos.exists():
        for md in sorted(dir_resumos.glob("*.md")):
            dados_res = parse_resumo_md(md)
            d_num = dados_res["disciplina"]
            disciplinas.setdefault(d_num, {
                "id": f"D{d_num}",
                "numero": d_num,
                "titulo": DISCIPLINAS_PADRAO.get(d_num, f"Disciplina {d_num}"),
            })
            for a in dados_res["aulas"]:
                aid = f"D{d_num}-A{a['aula']:02d}"
                cids = _registrar_conceitos(a["conceitos"])
                aulas[aid] = {
                    "id": aid,
                    "disciplina": d_num,
                    "aula": a["aula"],
                    "modulo": a["modulo"],
                    "titulo": a["titulo"],
                    "metadados": a["metadados"],
                    "resumo": a["resumo"],
                    "conceitos": cids,
                    "embedding": a["embedding"],
                }

    # 2. Legendas VTT (ou TXT quando não houver VTT)
    if dir_legendas and dir_legendas.exists():
        for vtt in sorted(dir_legendas.glob("m*-aula*.vtt")):
            m = re.match(r"m(\d+)-aula(\d+)", vtt.stem, re.I)
            if not m:
                continue
            d_num = f"{int(m.group(1)):02d}"
            a_num = int(m.group(2))
            aid = f"D{d_num}-A{a_num:02d}"
            disciplinas.setdefault(d_num, {
                "id": f"D{d_num}",
                "numero": d_num,
                "titulo": DISCIPLINAS_PADRAO.get(d_num, f"Disciplina {d_num}"),
            })
            aulas.setdefault(aid, {
                "id": aid,
                "disciplina": d_num,
                "aula": a_num,
                "modulo": 1,
                "titulo": f"Aula {a_num:02d} (Disciplina {d_num})",
                "metadados": "",
                "resumo": "",
                "conceitos": [],
                "embedding": [],
            })
            lista_t = parse_vtt(vtt)
            for idx, t in enumerate(lista_t, 1):
                tid = f"{aid}-T{idx:03d}"
                cids = _registrar_conceitos(t["conceitos"])
                for cid in cids:
                    if cid not in aulas[aid]["conceitos"]:
                        aulas[aid]["conceitos"].append(cid)
                trechos.append({
                    "id": tid,
                    "aula_id": aid,
                    "disciplina": d_num,
                    "aula": a_num,
                    "ordem": idx,
                    "inicio_ts": t["inicio_ts"],
                    "fim_ts": t["fim_ts"],
                    "inicio_seg": t["inicio_seg"],
                    "fim_seg": t["fim_seg"],
                    "texto": t["texto"],
                    "arquivo": vtt.name,
                    "conceitos": cids,
                    "embedding": t["embedding"],
                })

    # 3. PDFs das disciplinas
    if dir_pdfs and dir_pdfs.exists():
        for pdf_p in sorted(dir_pdfs.rglob("*.pdf")):
            m_d = re.match(r"^(\d{2})-", pdf_p.parent.name)
            d_num = m_d.group(1) if m_d else "00"
            disciplinas.setdefault(d_num, {
                "id": f"D{d_num}",
                "numero": d_num,
                "titulo": DISCIPLINAS_PADRAO.get(d_num, f"Disciplina {d_num}"),
            })
            paginas = extrair_texto_pdf_fallback(pdf_p)
            pid = f"D{d_num}-PDF-{pdf_p.stem}"
            cids_pdf: list[str] = []
            for pg in paginas:
                for cid in _registrar_conceitos(pg["conceitos"]):
                    if cid not in cids_pdf:
                        cids_pdf.append(cid)
            pdfs.append({
                "id": pid,
                "disciplina": d_num,
                "titulo": pdf_p.stem,
                "arquivo": str(pdf_p.relative_to(dir_pdfs)).replace("\\", "/"),
                "paginas": [
                    {
                        "numero": pg["numero"],
                        "texto": pg["texto"],
                        "conceitos": [c["id"] for c in pg["conceitos"]],
                        "embedding": pg["embedding"],
                    }
                    for pg in paginas
                ],
                "conceitos": cids_pdf,
            })

    return {
        "versao": "1.0.0",
        "disciplinas": list(disciplinas.values()),
        "aulas": list(aulas.values()),
        "trechos": trechos,
        "pdfs": pdfs,
        "conceitos": list(conceitos.values()),
    }


def normalizar_busca(texto: str) -> str:
    """Normaliza string para comparação léxica (minúsculas, sem pontuação extra)."""
    import unicodedata
    s = unicodedata.normalize("NFKD", (texto or "").lower())
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = re.sub(r"[^a-z0-9_./-]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def extrair_conceitos_texto(texto: str) -> list[str]:
    """Retorna apenas a lista de IDs de conceitos encontrados no texto."""
    return [c["id"] for c in extrair_conceitos(texto)]


def construir_grafo_local(raiz_curso: Path) -> dict[str, Any]:
    """Constrói o grafo padronizado a partir de uma pasta raiz (com pos-legendas, pos-resumos, pos-pdfs)."""
    dir_leg = raiz_curso / "pos-legendas" if (raiz_curso / "pos-legendas").exists() else raiz_curso
    dir_res = raiz_curso / "pos-resumos" if (raiz_curso / "pos-resumos").exists() else raiz_curso
    dir_pdf = raiz_curso / "pos-pdfs" if (raiz_curso / "pos-pdfs").exists() else raiz_curso
    bruto = construir_grafo_de_diretorios(dir_leg, dir_res, dir_pdf)

    disciplinas = [
        {
            "id": f"disciplina:D{d['numero']}",
            "codigo": f"D{d['numero']}",
            "nome": d["titulo"],
        }
        for d in bruto["disciplinas"]
    ]
    aulas = []
    arestas = []
    for a in bruto["aulas"]:
        cod_disc = f"D{a['disciplina']}"
        aula_id = f"aula:{cod_disc}:{int(a['aula']):02d}"
        aulas.append({
            "id": aula_id,
            "disciplina": cod_disc,
            "aula": int(a["aula"]),
            "modulo": f"Módulo {int(a['modulo']):02d}",
            "titulo": a["titulo"],
            "metadados": a.get("metadados", ""),
            "resumo": a.get("resumo", ""),
            "conceitos": a.get("conceitos", []),
            "embedding": a.get("embedding", []),
        })
        arestas.append({"origem": f"disciplina:{cod_disc}", "destino": aula_id, "tipo": "TEM_AULA"})
        for cid in a.get("conceitos", []):
            arestas.append({"origem": aula_id, "destino": cid, "tipo": "MENCIONA_CONCEITO"})

    trechos_legenda = []
    for t in bruto["trechos"]:
        cod_disc = f"D{t['disciplina']}"
        aula_num = int(t["aula"])
        idx = int(t["ordem"])
        aula_id = f"aula:{cod_disc}:{aula_num:02d}"
        tid = f"trecho:{cod_disc}:aula-{aula_num:02d}:{idx:04d}"
        trechos_legenda.append({
            "id": tid,
            "aula_id": aula_id,
            "disciplina": cod_disc,
            "aula": aula_num,
            "indice": idx,
            "inicio_ts": t["inicio_ts"],
            "fim_ts": t["fim_ts"],
            "texto": t["texto"],
            "arquivo": t.get("arquivo", ""),
            "conceitos": t.get("conceitos", []),
            "embedding": t.get("embedding", []),
        })
        arestas.append({"origem": aula_id, "destino": tid, "tipo": "TEM_TRECHO"})
        if idx > 1:
            tid_ant = f"trecho:{cod_disc}:aula-{aula_num:02d}:{idx - 1:04d}"
            arestas.append({"origem": tid_ant, "destino": tid, "tipo": "PROXIMO_TRECHO"})
        for cid in t.get("conceitos", []):
            arestas.append({"origem": tid, "destino": cid, "tipo": "MENCIONA_CONCEITO"})

    materiais_pdf = []
    paginas_pdf = []
    for p_item in bruto["pdfs"]:
        cod_disc = f"D{p_item['disciplina']}"
        mid = f"pdf:{cod_disc}:{p_item['titulo']}"
        pags = p_item.get("paginas", [])
        materiais_pdf.append({
            "id": mid,
            "disciplina": cod_disc,
            "titulo": p_item["titulo"],
            "arquivo": p_item["arquivo"],
            "total_paginas": len(pags),
            "conceitos": p_item.get("conceitos", []),
        })
        for pg in pags:
            pid = f"{mid}:p{int(pg['numero']):03d}"
            paginas_pdf.append({
                "id": pid,
                "material_id": mid,
                "disciplina": cod_disc,
                "pagina": int(pg["numero"]),
                "texto": pg["texto"],
                "conceitos": pg.get("conceitos", []),
                "embedding": pg.get("embedding", []),
            })

    conceitos = [
        {
            "id": c["id"],
            "nome": c["nome"],
            "tipo": c["tipo"],
            "url": c.get("url", ""),
            "descricao": f"{c['tipo']}: {c['nome']}",
        }
        for c in bruto["conceitos"]
    ]

    return {
        "versao": "1.0.0",
        "estatisticas": {
            "disciplinas": len(disciplinas),
            "aulas": len(aulas),
            "trechos_legenda": len(trechos_legenda),
            "materiais_pdf": len(materiais_pdf),
            "paginas_pdf": len(paginas_pdf),
            "conceitos": len(conceitos),
            "arestas": len(arestas),
        },
        "disciplinas": disciplinas,
        "aulas": aulas,
        "trechos_legenda": trechos_legenda,
        "materiais_pdf": materiais_pdf,
        "paginas_pdf": paginas_pdf,
        "conceitos": conceitos,
        "arestas": arestas,
    }
