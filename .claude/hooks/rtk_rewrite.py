#!/usr/bin/env python3
"""PreToolUse (Bash): saída compacta pelo rtk, sem ampliar permissões (D-067).

O hook do rtk (`rtk hook claude`) reescreve o comando para `rtk <comando>` e devolve
`permissionDecision: allow`, o que pularia o pedido de permissão até de `git push`. Este wrapper
só repassa a reescrita quando o comando original é simples (sem encadear, redirecionar ou
substituir) e de leitura ou de teste. Em todo o resto, não devolve nada, e o comando segue o
fluxo normal de permissão e os outros gates (gate_execucao, gate_entrega).

Sem o rtk instalado, sai com 0 e não faz nada: a sessão funciona igual, só sem a economia.
"""
from __future__ import annotations

import json
import shlex
import shutil
import subprocess
import sys

# Prefixos do comando original (em tokens) que podem ganhar a reescrita aprovada.
SEGUROS = (
    ("git", "status"), ("git", "diff"), ("git", "log"), ("git", "show"),
    ("ls",), ("tree",), ("find",), ("grep",), ("rg",), ("wc",),
    ("pytest",), ("python3", "-m", "pytest"), ("python3", "-m", "unittest"),
    ("npm", "test"), ("npx", "vitest"), ("vitest",), ("cargo", "test"), ("go", "test"),
    ("terraform", "fmt"), ("terraform", "validate"), ("terraform", "test"),
    ("tflint",), ("checkov",), ("docker", "ps"), ("docker", "images"),
)
METACARACTERES = (";", "&", "|", ">", "<", "`", "$(", "\n")


def simples_e_seguro(comando: str) -> bool:
    if any(m in comando for m in METACARACTERES):
        return False
    try:
        tokens = shlex.split(comando)
    except ValueError:
        return False
    return any(tuple(tokens[:len(p)]) == p for p in SEGUROS)


def main() -> int:
    bruto = sys.stdin.read()
    rtk = shutil.which("rtk")
    if not rtk:
        return 0
    try:
        comando = json.loads(bruto).get("tool_input", {}).get("command", "")
    except (json.JSONDecodeError, AttributeError):
        return 0
    if not comando or not simples_e_seguro(comando):
        return 0
    try:
        r = subprocess.run([rtk, "hook", "claude"], input=bruto, capture_output=True, text=True, timeout=5)
    except (OSError, subprocess.TimeoutExpired):
        return 0
    saida = r.stdout.strip()
    if r.returncode != 0 or not saida:
        return 0
    try:
        dados = json.loads(saida)
        novo = dados["hookSpecificOutput"]["updatedInput"]["command"]
    except (json.JSONDecodeError, KeyError, TypeError):
        return 0
    # Só aceita a forma esperada: o mesmo comando com o prefixo `rtk`.
    if novo.strip() != f"rtk {comando.strip()}":
        return 0
    print(json.dumps(dados))
    return 0


if __name__ == "__main__":
    sys.exit(main())
