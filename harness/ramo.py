"""Ler e gravar um arquivo num branch remoto sem tocar na árvore de trabalho (plumbing do git).

Usado pelos estados compartilhados entre agentes (memória e disponibilidade): qualquer agente,
em qualquer máquina, lê e grava o mesmo arquivo sem trocar de branch nem gerar conflito local.
"""
from __future__ import annotations

import subprocess
from pathlib import Path


def git(raiz: Path, *args: str, entrada: str | None = None, timeout: int = 30) -> str:
    # encoding explícito: o git fala UTF-8 em qualquer SO; no Windows o padrão seria cp1252 e quebraria caminhos com acento
    r = subprocess.run(["git", "-C", str(raiz), *args], input=entrada, capture_output=True, text=True,
                       encoding="utf-8", errors="replace", timeout=timeout)
    if r.returncode != 0:
        raise RuntimeError(r.stderr.strip() or f"git {' '.join(args)} falhou")
    return r.stdout


def buscar(raiz: Path, ramo: str) -> str | None:
    """Atualiza refs/remotes/origin/<ramo>; devolve o sha ou None se o ramo não existe."""
    try:
        git(raiz, "fetch", "-q", "origin", f"+refs/heads/{ramo}:refs/remotes/origin/{ramo}")
        return git(raiz, "rev-parse", f"refs/remotes/origin/{ramo}").strip()
    except RuntimeError:
        return None


def ler(raiz: Path, ramo: str, arquivo: str) -> str | None:
    sha = buscar(raiz, ramo)
    if not sha:
        return None
    try:
        return git(raiz, "show", f"{sha}:{arquivo}")
    except RuntimeError:
        return None


def gravar(raiz: Path, ramo: str, arquivo: str, conteudo: str, mensagem: str, tentativas: int = 3) -> str:
    """Grava `arquivo` no topo de `ramo` e faz push. Em corrida com outro agente, refaz sobre o novo topo."""
    for _ in range(tentativas):
        pai = buscar(raiz, ramo)
        blob = git(raiz, "hash-object", "-w", "--stdin", entrada=conteudo).strip()
        linhas = []
        if pai:
            for linha in git(raiz, "ls-tree", pai).splitlines():
                if linha.split("\t", 1)[1] != arquivo:
                    linhas.append(linha)
        linhas.append(f"100644 blob {blob}\t{arquivo}")
        arvore = git(raiz, "mktree", entrada="\n".join(linhas) + "\n").strip()
        args = ["commit-tree", arvore, "-m", mensagem] + (["-p", pai] if pai else [])
        commit = git(raiz, *args).strip()
        try:
            git(raiz, "push", "-q", "origin", f"{commit}:refs/heads/{ramo}")
            return commit
        except RuntimeError:
            continue  # outro agente gravou antes: tenta de novo sobre o topo atual
    raise RuntimeError(f"não foi possível gravar {arquivo} em {ramo}")
