#!/usr/bin/env python3
"""Registro de uso de tokens e modelos do projeto.

Fonte da verdade: docs/uso/uso-tokens.csv (uma linha por sessão e modelo).

Comandos:
  registrar  lê um transcript JSONL do Claude Code e acrescenta uma linha por modelo
  manual     acrescenta uma linha com números informados (ex.: medição da conversa de orquestração)
  painel     gera site/uso.html e atualiza os widgets <!-- uso:projeto=CHAVE --> dos posts
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import html
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
LEDGER = RAIZ / "docs" / "uso" / "uso-tokens.csv"
SITE = RAIZ / "site"
CAMPOS = [
    "data", "sessao", "projeto", "disciplina", "unidade", "tarefa", "modelo",
    "requisicoes", "input", "cache_write", "cache_read", "output", "total", "fonte", "observacao",
]
# "total": medição que só traz a soma (ex.: o total que um subagente informa ao terminar), sem a divisão
# por tipo de token. Nunca é estimado: fica 0 quando a divisão existe (D-058).
NUMEROS = ["requisicoes", "input", "cache_write", "cache_read", "output", "total"]
# Pesos de custo relativo a um token de entrada comum (estimativa, não preço).
PESOS = {"input": 1.0, "cache_write": 2.0, "cache_read": 0.1, "output": 5.0}
WIDGET = re.compile(r"(<!-- uso:projeto=(?P<chave>[\w.\-/]+) -->)(.*?)(<!-- /uso -->)", re.S)


def ler_ledger(caminho: Path = LEDGER) -> list[dict]:
    if not caminho.exists():
        return []
    with caminho.open(newline="", encoding="utf-8") as f:
        linhas = list(csv.DictReader(f))
    for linha in linhas:
        for campo in NUMEROS:
            linha[campo] = int(linha[campo] or 0)
    return linhas


def _migrar_cabecalho(caminho: Path) -> None:
    """Ledger antigo sem a coluna total: reescreve com o cabeçalho atual, sem perder linhas."""
    with caminho.open(newline="", encoding="utf-8") as f:
        leitor = csv.DictReader(f)
        if leitor.fieldnames == CAMPOS:
            return
        linhas = list(leitor)
    with caminho.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=CAMPOS)
        w.writeheader()
        for l in linhas:
            w.writerow({c: l.get(c) or ("0" if c in NUMEROS else "") for c in CAMPOS})


def gravar_linhas(novas: list[dict], caminho: Path = LEDGER) -> None:
    caminho.parent.mkdir(parents=True, exist_ok=True)
    existe = caminho.exists()
    if existe:
        _migrar_cabecalho(caminho)
    chaves = {(l["sessao"], l["modelo"]) for l in ler_ledger(caminho)} if existe else set()
    with caminho.open("a", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=CAMPOS)
        if not existe:
            w.writeheader()
        for linha in novas:
            if linha["sessao"] and (linha["sessao"], linha["modelo"]) in chaves:
                print(f"já registrado: {linha['sessao']} / {linha['modelo']}", file=sys.stderr)
                continue
            w.writerow({c: linha.get(c, "") for c in CAMPOS})


def arquivos_da_sessao(caminho: Path) -> list[Path]:
    """Transcript principal e os dos subagentes (<sessao>/subagents/*.jsonl), D-058."""
    pasta = caminho.parent / caminho.stem / "subagents"
    return [caminho] + (sorted(pasta.glob("*.jsonl")) if pasta.is_dir() else [])


def somar_transcript(caminho: Path) -> dict[str, dict[str, int]]:
    """Soma message.usage por modelo, com os subagentes, sem contar duas vezes a mesma mensagem."""
    por_modelo: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    vistos: set[str] = set()
    brutas = [b for arq in arquivos_da_sessao(caminho) for b in arq.read_text(encoding="utf-8").splitlines()]
    for bruta in brutas:
        try:
            evento = json.loads(bruta)
        except json.JSONDecodeError:
            continue
        msg = evento.get("message") or {}
        uso = msg.get("usage")
        if not isinstance(uso, dict):
            continue
        mid = msg.get("id") or evento.get("uuid")
        if mid in vistos:
            continue
        vistos.add(mid)
        c = por_modelo[msg.get("model") or "desconhecido"]
        c["requisicoes"] += 1
        c["input"] += uso.get("input_tokens") or 0
        c["cache_write"] += uso.get("cache_creation_input_tokens") or 0
        c["cache_read"] += uso.get("cache_read_input_tokens") or 0
        c["output"] += uso.get("output_tokens") or 0
    return {m: dict(v) for m, v in por_modelo.items()}


def equivalente(linha: dict) -> float:
    detalhado = sum(linha.get(k, 0) * p for k, p in PESOS.items())
    # Só o total conhecido: conta como entrada comum, sem inventar a divisão (fica marcado na fonte).
    return detalhado if detalhado else float(linha.get("total", 0) or 0)


def agrupar(linhas: list[dict], chave: str) -> list[tuple[str, dict]]:
    grupos: dict[str, dict] = defaultdict(lambda: {**{n: 0 for n in NUMEROS}, "equiv": 0.0})
    for l in linhas:
        g = grupos[l[chave] or "—"]
        for n in NUMEROS:
            g[n] += l.get(n, 0) or 0
        g["equiv"] += equivalente(l)
    return sorted(grupos.items(), key=lambda kv: kv[1]["equiv"], reverse=True)


def fmt(n: float) -> str:
    if n >= 1_000_000:
        return f"{n / 1_000_000:.1f} mi".replace(".", ",")
    if n >= 1_000:
        return f"{n / 1_000:.0f} mil"
    return f"{n:.0f}"


def barras(grupos: list[tuple[str, dict]], titulo: str) -> str:
    topo = max((g["equiv"] for _, g in grupos), default=0) or 1
    linhas = []
    for nome, g in grupos:
        pct = 100 * g["equiv"] / topo
        dica = (f"{nome}: {fmt(g['equiv'])} equivalentes · entrada {fmt(g['input'])} · "
                f"cache escrito {fmt(g['cache_write'])} · cache lido {fmt(g['cache_read'])} · "
                f"saída {fmt(g['output'])} · {g['requisicoes']} requisições")
        linhas.append(
            f'<div class="uso-linha" title="{html.escape(dica)}">'
            f'<span class="uso-nome">{html.escape(nome)}</span>'
            f'<span class="uso-trilho"><span class="uso-barra" style="width:{pct:.1f}%"></span></span>'
            f'<span class="uso-valor">{fmt(g["equiv"])}</span></div>'
        )
    return f'<section class="uso-bloco"><h2>{html.escape(titulo)}</h2>{"".join(linhas)}</section>'


def tabela(linhas: list[dict]) -> str:
    cab = "".join(f"<th>{c}</th>" for c in ["Projeto", "Tarefa", "Modelo", "Requisições", "Entrada",
                                              "Cache escrito", "Cache lido", "Saída", "Total sem divisão", "Fonte"])
    corpo = "".join(
        "<tr>" + "".join(f"<td>{html.escape(str(v))}</td>" for v in [
            l["projeto"], l["tarefa"], l["modelo"], l["requisicoes"], fmt(l["input"]),
            fmt(l["cache_write"]), fmt(l["cache_read"]), fmt(l["output"]), fmt(l.get("total", 0) or 0),
            l["fonte"]]) + "</tr>"
        for l in linhas
    )
    return f'<details class="uso-tabela"><summary>Ver como tabela</summary><table><thead><tr>{cab}</tr></thead><tbody>{corpo}</tbody></table></details>'


def tiles(linhas: list[dict]) -> str:
    total = {n: sum(l.get(n, 0) or 0 for l in linhas) for n in NUMEROS}
    equiv = sum(equivalente(l) for l in linhas)
    nao_medidas = sum(1 for l in linhas if l["fonte"] == "nao-medido")
    itens = [
        ("Tokens equivalentes", fmt(equiv)),
        ("Saída gerada", fmt(total["output"])),
        ("Contexto lido do cache", fmt(total["cache_read"])),
        ("Requisições", f"{total['requisicoes']}"),
    ]
    if total["total"]:
        itens.append(("Medido só no total", fmt(total["total"])))
    html_tiles = "".join(f'<div class="uso-tile"><span>{a}</span><b>{b}</b></div>' for a, b in itens)
    aviso = (f'<p class="note">{nao_medidas} trecho(s) de trabalho sem medição registrada não entram nos totais.</p>'
             if nao_medidas else "")
    return f'<div class="uso-tiles">{html_tiles}</div>{aviso}'


NOTA = ("Tokens equivalentes ponderam cada tipo pelo custo relativo a um token de entrada comum: "
        "cache lido 0,1, cache escrito 2 e saída 5. É uma estimativa de esforço, não um preço.")


def pagina(linhas: list[dict]) -> str:
    return f"""<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Uso de IA · Arquitetura na Prática</title>
<link rel="stylesheet" href="assets/site.css">
</head>
<body>
<header class="topbar"><div class="in">
  <a class="brand" href="./">Arquitetura na Prática</a>
  <nav><a href="./">Projetos</a></nav>
</div></header>
<article class="article uso">
  <div class="kicker">Transparência</div>
  <h1>Uso de IA na construção dos projetos</h1>
  <p class="dek">Quantos tokens e quais modelos foram usados para pesquisar, projetar, codificar, testar e escrever cada projeto.</p>
  {tiles(linhas)}
  {barras(agrupar(linhas, "projeto"), "Por projeto")}
  {barras(agrupar(linhas, "modelo"), "Por modelo")}
  {tabela(linhas)}
  <p class="note">{NOTA}</p>
</article>
<footer class="site">Arquitetura na Prática · conteúdo construído com fontes públicas</footer>
</body>
</html>
"""


def widget(linhas: list[dict], chave: str, prefixo: str) -> str:
    doprojeto = [l for l in linhas if l["projeto"] == chave or l["projeto"].startswith(chave + "/")]
    if not doprojeto:
        return f'\n<aside class="uso-widget"><b>Uso de IA</b><p class="note">Ainda sem uso registrado para este projeto.</p></aside>\n'
    modelos = agrupar(doprojeto, "modelo")
    resumo = " · ".join(f"{html.escape(m)} {fmt(g['equiv'])}" for m, g in modelos)
    total = sum(equivalente(l) for l in doprojeto)
    return (f'\n<aside class="uso-widget"><b>Uso de IA neste projeto</b>'
            f'<p>{fmt(total)} tokens equivalentes · {resumo}</p>'
            f'<a href="{prefixo}uso.html">Ver o painel completo</a></aside>\n')


def gerar_painel(linhas: list[dict], site: Path = SITE) -> list[Path]:
    alterados = [site / "uso.html"]
    (site / "uso.html").write_text(pagina(linhas), encoding="utf-8")
    for post in sorted((site / "posts").glob("*.html")):
        texto = post.read_text(encoding="utf-8")
        novo = WIDGET.sub(lambda m: m.group(1) + widget(linhas, m.group("chave"), "../") + m.group(4), texto)
        if novo != texto:
            post.write_text(novo, encoding="utf-8")
            alterados.append(post)
    return alterados


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    for nome in ("registrar", "manual"):
        s = sub.add_parser(nome)
        s.add_argument("--projeto", required=True, help="chave do projeto, ex.: 01.03-recomendacao ou plataforma")
        s.add_argument("--disciplina", default="")
        s.add_argument("--unidade", default="")
        s.add_argument("--tarefa", required=True)
        s.add_argument("--sessao", default="")
        s.add_argument("--observacao", default="")
        s.add_argument("--data", default=dt.date.today().isoformat())
    sub.choices["registrar"].add_argument("--transcript", required=True, type=Path)
    m = sub.choices["manual"]
    m.add_argument("--modelo", required=True)
    m.add_argument("--fonte", default="medido")
    for n in NUMEROS:
        m.add_argument(f"--{n.replace('_', '-')}", type=int, default=0)
    sub.add_parser("painel")
    a = p.parse_args(argv)

    if a.cmd == "painel":
        for caminho in gerar_painel(ler_ledger()):
            print(caminho.relative_to(RAIZ))
        return 0

    base = {k: getattr(a, k) for k in ("data", "sessao", "projeto", "disciplina", "unidade", "tarefa", "observacao")}
    if a.cmd == "registrar":
        base["sessao"] = base["sessao"] or a.transcript.stem
        novas = [{**base, "modelo": modelo, "fonte": "transcript", **nums}
                 for modelo, nums in somar_transcript(a.transcript).items()]
    else:
        novas = [{**base, "modelo": a.modelo, "fonte": a.fonte, **{n: getattr(a, n) for n in NUMEROS}}]
    gravar_linhas(novas)
    print(f"{len(novas)} linha(s) registradas em {LEDGER.relative_to(RAIZ)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
