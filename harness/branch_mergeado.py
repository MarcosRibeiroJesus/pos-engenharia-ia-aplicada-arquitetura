#!/usr/bin/env python3
"""Impede commit novo num branch cujo PR já foi mergeado (D-032).

Quando o dono mergeia um PR e alguém continua empurrando no mesmo branch, os commits novos não chegam
ao main e ficam esquecidos (aconteceu com o #16 e o #17). Sinal usado, sem depender da API do GitHub:
o topo anterior do branch remoto já está dentro do origin/main. Vale para o merge com commit de merge,
que é o usado neste repositório; um squash merge não deixaria esse sinal.

  branch_mergeado.py   lê do stdin as linhas do pre-push (<local ref> <local sha> <remote ref> <remote sha>)
                       e sai com 1 se algum branch empurrado já foi mergeado
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ZERO = "0" * 40
LIVRES = {"refs/heads/main", "refs/heads/memoria-compartilhada", "refs/heads/agentes-status", "refs/heads/infra-no-ar"}


def git(raiz: Path, *args: str) -> subprocess.CompletedProcess:
    return subprocess.run(["git", "-C", str(raiz), *args], capture_output=True, text=True)


def mergeados(raiz: Path, linhas: list[str], base: str = "origin/main") -> list[str]:
    git(raiz, "fetch", "-q", "origin", "+refs/heads/main:refs/remotes/origin/main")
    if git(raiz, "rev-parse", "--verify", "-q", base).returncode != 0:
        return []  # sem main remoto (repositório novo): nada a conferir
    achados = []
    for linha in linhas:
        partes = linha.split()
        if len(partes) != 4:
            continue
        _, local_sha, remote_ref, remote_sha = partes
        if remote_ref in LIVRES or remote_sha == ZERO or local_sha == ZERO or local_sha == remote_sha:
            continue
        no_main = git(raiz, "merge-base", "--is-ancestor", remote_sha, base).returncode == 0
        topo_do_main = git(raiz, "rev-parse", base).stdout.strip() == remote_sha
        if no_main and not topo_do_main:
            achados.append(remote_ref.removeprefix("refs/heads/"))
    return achados


def main() -> int:
    raiz = Path(git(Path.cwd(), "rev-parse", "--show-toplevel").stdout.strip() or ".")
    achados = mergeados(raiz, sys.stdin.read().splitlines())
    for b in achados:
        print(f"O branch {b} já foi mergeado no main: commits novos nele não chegariam ao main.\n"
              f"Crie um branch novo a partir do main (git switch -c <novo> origin/main), traga os commits "
              f"com cherry-pick e abra um PR novo (D-032).")
    return 1 if achados else 0


if __name__ == "__main__":
    sys.exit(main())
