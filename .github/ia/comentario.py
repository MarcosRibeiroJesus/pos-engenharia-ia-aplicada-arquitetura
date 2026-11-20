#!/usr/bin/env python3
"""Lê e publica o comentário único da revisão de IA no PR (atualiza em vez de duplicar).

Uso: comentario.py anterior  |  comentario.py publicar saida1.json [saida2.json ...]
Requer GH_TOKEN, REPO e PR no ambiente.
"""
import json
import os
import subprocess
import sys

MARCA = "<!-- revisao-ia -->"
REPO, PR = os.environ["REPO"], os.environ["PR"]


def gh(*args, entrada=None):
    return subprocess.run(["gh", "api", *args], input=entrada, capture_output=True, text=True, check=True).stdout


def existente():
    for c in json.loads(gh(f"repos/{REPO}/issues/{PR}/comments", "--paginate") or "[]"):
        if MARCA in (c.get("body") or ""):
            return c
    return None


ICONE = {"critica": "🔴", "alta": "🟠", "media": "🟡", "baixa": "⚪"}

if sys.argv[1] == "anterior":
    c = existente()
    print(c["body"] if c else "Sem revisão anterior.")
    sys.exit(0)

partes = [MARCA, "## Revisão automática (agentes de segurança e FinOps)", ""]
for caminho in sys.argv[2:]:
    nome = os.path.basename(caminho).replace(".json", "")
    d = json.load(open(caminho, encoding="utf-8"))
    partes += [f"### {nome}", "", d.get("resumo", ""), ""]
    achados = sorted(d.get("achados", []), key=lambda a: ["critica", "alta", "media", "baixa"].index(a["severidade"]))
    if not achados:
        partes += ["Nenhum achado novo ou pendente.", ""]
    for a in achados:
        local = f"`{a['arquivo']}`" + (f" linha {a['linha']}" if a.get("linha") else "")
        partes += [f"- {ICONE[a['severidade']]} **{a['severidade']}** · {a['categoria']} · {a['origem']} · {local} · {a['status']} · confiança {a['confianca']}",
                   f"  - {a['descricao']}", f"  - Correção: {a['correcao']}"]
    partes.append("")
partes.append("_Revisores independentes do autor do código. Para corrigir automaticamente, adicione o rótulo `auto-fix`. O merge é sempre humano._")
corpo = json.dumps({"body": "\n".join(partes)})
c = existente()
if c:
    gh("-X", "PATCH", f"repos/{REPO}/issues/comments/{c['id']}", "--input", "-", entrada=corpo)
else:
    gh("-X", "POST", f"repos/{REPO}/issues/{PR}/comments", "--input", "-", entrada=corpo)
print("comentário publicado")
