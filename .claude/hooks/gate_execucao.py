#!/usr/bin/env python3
"""Hook PreToolUse (Bash): o que a execução autônoma nunca faz sozinha (D-047).

Analisa o comando com shlex, e não com regex, e nega:
- git push com força (--force*, -f, --mirror, --delete, refspec com "+") ou para o main,
  inclusive depois de opções globais (git -C x, git -c k=v) e com o nome entre aspas;
- merge de PR: gh pr merge e qualquer gh api que escreva (-X/--method diferente de GET, graphql,
  rota /merges ou /merge, refs);
- terraform/tofu apply ou destroy fora de um root de teste do Floci (-chdir ou cwd em */tests/floci);
- interpretador com código inline (python -c, node -e, bash -c, sh -c), que esconderia os casos acima.
A camada de git (`.githooks/pre-push`) e a proteção do main no GitHub seguram o que escapar daqui.
"""
import json
import os
import re
import shlex
import sys

SEPARADORES = re.compile(r"\s*(?:&&|\|\||;|\||\n)\s*")
OPCOES_GLOBAIS_GIT = {"-C", "-c", "--git-dir", "--work-tree", "--namespace"}


def _partes(comando: str) -> list[list[str]]:
    saida = []
    for trecho in SEPARADORES.split(comando):
        try:
            tokens = shlex.split(trecho, posix=True)
        except ValueError:
            tokens = trecho.split()
        while tokens and re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*=.*", tokens[0]):
            tokens = tokens[1:]  # VAR=valor antes do comando
        if tokens and tokens[0] == "env":
            tokens = [t for t in tokens[1:] if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*=.*", t) and t != "-u"]
        if tokens:
            saida.append(tokens)
    return saida


def _git_push(tokens: list[str]) -> str | None:
    i = 1
    while i < len(tokens) and tokens[i].startswith("-"):
        i += 2 if tokens[i] in OPCOES_GLOBAIS_GIT else 1
    if i >= len(tokens) or tokens[i] != "push":
        return None
    args = tokens[i + 1:]
    for a in args:
        if a in ("-f", "--mirror", "--delete", "-d") or a.startswith("--force") or (a.startswith("+") and len(a) > 1):
            return "D-047: push com força ou que apaga refs é proibido na execução autônoma."
        if a.startswith("-") and not a.startswith("--") and "f" in a[1:] and len(a) <= 4:
            return "D-047: push com força (-f combinado) é proibido."
    refs = [a for a in args if not a.startswith("-")]
    for r in refs[1:]:
        destino = r.split(":")[-1]
        if destino in ("main", "refs/heads/main"):
            return "D-047: push no main é proibido. Abra PR; o merge é do dono (D-032)."
    return None


def _gh(tokens: list[str]) -> str | None:
    if len(tokens) >= 3 and tokens[1] == "pr" and tokens[2] == "merge":
        return "D-047: merge de PR é decisão do dono."
    if len(tokens) >= 2 and tokens[1] == "api":
        args = tokens[2:]
        metodo = "GET"
        for j, a in enumerate(args):
            if a in ("-X", "--method") and j + 1 < len(args):
                metodo = args[j + 1].upper()
            elif a.startswith("--method="):
                metodo = a.split("=", 1)[1].upper()
        escreve = metodo != "GET" or any(a in ("-f", "-F", "--field", "--raw-field", "--input") for a in args)
        rota = " ".join(a for a in args if not a.startswith("-"))
        if "graphql" in rota or re.search(r"/merges?\b|/git/refs", rota) or escreve:
            return "D-047: gh api que escreve (merge, refs, graphql) é proibido na execução autônoma."
    return None


def _terraform(tokens: list[str], cwd: str) -> str | None:
    acoes = {"apply", "destroy"}
    if not any(t in acoes for t in tokens[1:]):
        return None
    chdir = next((t.split("=", 1)[1] for t in tokens if t.startswith("-chdir=")), "")
    alvo = os.path.normpath(os.path.join(cwd, chdir)).replace("\\", "/")
    if re.search(r"/tests/floci(/|$)", alvo + "/"):
        return None
    return ("D-047: apply e destroy só num root de teste do Floci (*/tests/floci). Na AWS real, quem dispara é "
            "o dono, pelos workflows (AGENTS.md, seção 7).")


def decidir(comando: str, cwd: str = ".") -> str | None:
    for tokens in _partes(comando):
        prog = os.path.basename(tokens[0])
        if prog in ("python", "python3", "py", "node", "bash", "sh", "zsh", "pwsh", "powershell") and \
                any(t in ("-c", "-e", "--eval", "-Command") for t in tokens[1:3]):
            return "D-047: código inline em interpretador é proibido na execução autônoma; use um script versionado."
        motivo = None
        if prog == "git":
            motivo = _git_push(tokens)
        elif prog == "gh":
            motivo = _gh(tokens)
        elif prog in ("terraform", "tofu"):
            motivo = _terraform(tokens, cwd)
        if motivo:
            return motivo
    return None


def main() -> int:
    try:
        entrada = json.load(sys.stdin)
    except ValueError:
        return 0
    motivo = decidir((entrada.get("tool_input") or {}).get("command") or "", entrada.get("cwd") or ".")
    if motivo:
        json.dump({"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "deny",
                                          "permissionDecisionReason": motivo}}, sys.stdout, ensure_ascii=False)
    return 0


if __name__ == "__main__":
    sys.exit(main())
