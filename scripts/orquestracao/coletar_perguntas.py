#!/usr/bin/env python3
"""Coleta as perguntas ao dono que as sessões registram no corpo dos PRs abertos.

Formato no PR (CLAUDE.md, "Perguntas ao dono"):

    ## Perguntas ao dono
    | id | pergunta | bloqueia | opções | recomendação |
    |---|---|---|---|---|
    | D03-P1 | ... | ... | ... | ... |

Uso: python3 scripts/orquestracao/coletar_perguntas.py [owner/repo]  → JSON na saída.
"""
import json
import re
import subprocess
import sys

CAMPOS = ["id", "pergunta", "bloqueia", "opcoes", "recomendacao"]


def extrair(corpo: str) -> list[dict]:
    m = re.search(r"^##\s+Perguntas ao dono\s*$(.*?)(?=^##\s|\Z)", corpo or "", re.M | re.S)
    if not m:
        return []
    perguntas = []
    for linha in m.group(1).splitlines():
        linha = linha.strip()
        if not linha.startswith("|") or re.match(r"^\|\s*-", linha) or re.match(r"^\|\s*id\s*\|", linha, re.I):
            continue
        celulas = [c.strip() for c in linha.strip("|").split("|")]
        if len(celulas) >= 2 and celulas[0]:
            perguntas.append(dict(zip(CAMPOS, celulas + [""] * (len(CAMPOS) - len(celulas)))))
    return perguntas


def main() -> int:
    repo = sys.argv[1] if len(sys.argv) > 1 else "MarcosRibeiroJesus/pos-engenharia-ia-aplicada-arquitetura"
    saida = subprocess.run(["gh", "api", f"repos/{repo}/pulls?state=open&per_page=100"],
                           capture_output=True, text=True, check=True).stdout
    resultado = []
    for pr in json.loads(saida):
        for p in extrair(pr.get("body") or ""):
            resultado.append({"pr": pr["number"], "url": pr["html_url"], "branch": pr["head"]["ref"], **p})
    json.dump(resultado, sys.stdout, ensure_ascii=False, indent=2)
    return 0


if __name__ == "__main__":
    sys.exit(main())
