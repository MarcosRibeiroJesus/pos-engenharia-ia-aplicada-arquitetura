#!/usr/bin/env python3
"""Trava de push no nível do git, para qualquer agente (D-047).

Lido pelo `.githooks/pre-push` com as linhas que o git passa:
`<ref local> <sha local> <ref remoto> <sha remoto>`. Recusa:
- push para o main (o merge é do dono, por PR);
- push que apaga um branch remoto;
- push que não é fast-forward, ou seja, um push com força, por qualquer caminho de invocação.
"""
from __future__ import annotations

import subprocess
import sys

ZERO = "0" * 40


def _e_ancestral(raiz: str, antigo: str, novo: str) -> bool | None:
    r = subprocess.run(["git", "merge-base", "--is-ancestor", antigo, novo], cwd=raiz, capture_output=True)
    if r.returncode in (0, 1):
        return r.returncode == 0
    return None  # objeto remoto desconhecido: o remoto tem commits que não temos


def problemas(raiz: str, linhas: list[str]) -> list[str]:
    erros = []
    for linha in linhas:
        partes = linha.split()
        if len(partes) != 4:
            continue
        _, local_sha, remote_ref, remote_sha = partes
        if remote_ref == "refs/heads/main":
            erros.append("push no main é proibido: abra PR, o merge é do dono (D-032, D-047)")
        elif local_sha == ZERO:
            erros.append(f"apagar {remote_ref} pelo push é proibido (D-047)")
        elif remote_sha != ZERO:
            ff = _e_ancestral(raiz, remote_sha, local_sha)
            if ff is None:
                erros.append(f"{remote_ref} mudou no remoto: faça git fetch e integre antes do push (D-046)")
            elif not ff:
                erros.append(f"push sem fast-forward em {remote_ref} (força) é proibido (D-047)")
    return erros


if __name__ == "__main__":
    erros = problemas(".", sys.stdin.read().splitlines())
    for e in erros:
        print(f"BLOQUEADO: {e}", file=sys.stderr)
    sys.exit(1 if erros else 0)
