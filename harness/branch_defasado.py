#!/usr/bin/env python3
"""Reprova o PR cujo branch não tem o harness atual da base.

Um branch criado antes de uma mudança no harness não traz os hooks, as skills nem os especialistas
novos. Quem trabalha nele localmente passa por fora dos gates sem perceber: no PR #8, o branch saiu
de um main anterior ao harness, e quatro commits foram enviados sem pre-push, sem skill de decisão
do dono e sem especialistas. O hook local não protege esse caso, porque ele mora no próprio harness
que falta. Por isso este gate roda no CI.

Regra: os caminhos protegidos que a base mudou desde o ponto em que o branch saiu dela precisam
estar iguais no branch. Mudança do próprio PR no harness não conta, só a defasagem.

  branch_defasado.py <base> <head>    sai com 1 e lista os arquivos se o branch estiver defasado
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

PROTEGIDOS = ("harness/", ".githooks/", ".claude/", ".agents/", "AGENTS.md", ".specify/memory/")


def git(raiz: Path, *args: str) -> subprocess.CompletedProcess:
    return subprocess.run(["git", "-C", str(raiz), *args], capture_output=True, text=True)


def _blob(raiz: Path, rev: str, caminho: str) -> str | None:
    r = git(raiz, "rev-parse", "--verify", "-q", f"{rev}:{caminho}")
    return r.stdout.strip() if r.returncode == 0 else None


def defasados(raiz: Path, base: str, head: str) -> list[str]:
    ponto = git(raiz, "merge-base", base, head)
    if ponto.returncode != 0:
        return []  # sem histórico comum: o checkout raso é problema do workflow, não do PR
    mudou_na_base = git(raiz, "-c", "core.quotepath=false", "diff", "--name-only",
                        ponto.stdout.strip(), base, "--", *PROTEGIDOS).stdout.split("\n")
    return sorted(c for c in mudou_na_base if c and _blob(raiz, base, c) != _blob(raiz, head, c))


def verificar(raiz: Path, base: str, head: str) -> tuple[int, str]:
    achados = defasados(raiz, base, head)
    if not achados:
        return 0, "Branch com o harness atual da base."
    lista = "\n".join(f"  - {c}" for c in achados[:30])
    resto = f"\n  ... e mais {len(achados) - 30}" if len(achados) > 30 else ""
    return 1, (f"O branch está sem o harness atual da base ({len(achados)} arquivo(s)):\n{lista}{resto}\n"
               "Quem trabalha nele passa por fora dos gates. Atualize o branch com a base "
               "(git fetch origin main && git merge origin/main), rode bash harness/init.sh e envie de novo.")


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print(__doc__)
        return 2
    raiz = Path(git(Path.cwd(), "rev-parse", "--show-toplevel").stdout.strip() or ".")
    codigo, mensagem = verificar(raiz, argv[0], argv[1])
    print(mensagem)
    return codigo


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
