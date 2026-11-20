#!/usr/bin/env python3
"""Hook da memória compartilhada: entrega às sessões as decisões macro do dono.

A memória fica no branch `memoria-compartilhada` (arquivo DECISOES.md), atualizado pela
conversa de orquestração sem depender de merge. Este hook:
- no SessionStart, injeta o arquivo inteiro;
- no UserPromptSubmit e no PostToolUse (este no máximo a cada INTERVALO segundos), busca o
  branch e, se houver commit novo desde a última leitura, injeta só o que mudou.
Falhas de rede ou de git nunca bloqueiam a sessão: o hook sai em silêncio.
"""
import json
import os
import subprocess
import sys
import time
from pathlib import Path

RAMO = "memoria-compartilhada"
ARQUIVO = "DECISOES.md"
INTERVALO = int(os.environ.get("MEMORIA_INTERVALO_S", "600"))


def git(raiz: Path, *args: str, timeout: int = 20) -> str | None:
    try:
        r = subprocess.run(["git", "-C", str(raiz), *args], capture_output=True, text=True, timeout=timeout)
    except (OSError, subprocess.TimeoutExpired):
        return None
    return r.stdout if r.returncode == 0 else None


def estado_path(raiz: Path) -> Path:
    return raiz / ".claude" / ".memoria-estado.json"


def ler_estado(raiz: Path) -> dict:
    try:
        return json.loads(estado_path(raiz).read_text())
    except (OSError, ValueError):
        return {}


def gravar_estado(raiz: Path, estado: dict) -> None:
    try:
        estado_path(raiz).write_text(json.dumps(estado))
    except OSError:
        pass


def contexto(evento: str, raiz: Path, agora: float | None = None) -> str | None:
    agora = time.time() if agora is None else agora
    estado = ler_estado(raiz)
    if evento == "PostToolUse" and agora - estado.get("checado", 0) < INTERVALO:
        return None
    estado["checado"] = agora
    return _ler_e_marcar(evento, raiz, estado)


def novidades_pendentes(raiz: Path) -> str | None:
    """Sem throttle: devolve o que mudou desde a última leitura (e marca como lido). Usado pelo gate."""
    estado = ler_estado(raiz)
    estado["checado"] = time.time()
    return _ler_e_marcar("Gate", raiz, estado)


def _ler_e_marcar(evento: str, raiz: Path, estado: dict) -> str | None:
    if git(raiz, "fetch", "-q", "origin", f"+refs/heads/{RAMO}:refs/remotes/origin/{RAMO}") is None:
        gravar_estado(raiz, estado)
        return None
    sha = (git(raiz, "rev-parse", f"refs/remotes/origin/{RAMO}") or "").strip()
    if not sha:
        gravar_estado(raiz, estado)
        return None
    visto = estado.get("sha")
    if evento != "SessionStart" and sha == visto:
        gravar_estado(raiz, estado)
        return None
    if evento == "SessionStart" or not visto:
        corpo = git(raiz, "show", f"{sha}:{ARQUIVO}") or ""
        titulo = "MEMÓRIA COMPARTILHADA (decisões do dono, branch memoria-compartilhada). Siga estas decisões; elas prevalecem sobre o briefing."
    else:
        diff = git(raiz, "diff", "--unified=0", visto, sha, "--", ARQUIVO) or ""
        novas = [l[1:] for l in diff.splitlines() if l.startswith("+") and not l.startswith("+++")]
        corpo = "\n".join(novas)
        titulo = ("MEMÓRIA COMPARTILHADA ATUALIZADA: o dono registrou decisões novas. Leia, ajuste o trabalho em andamento "
                  f"e registre no PR o que mudou. Arquivo completo: git show origin/{RAMO}:{ARQUIVO}")
    estado["sha"] = sha
    gravar_estado(raiz, estado)
    if not corpo.strip():
        return None
    return f"{titulo}\n\n{corpo.strip()}"


def main() -> int:
    try:
        entrada = json.load(sys.stdin)
    except ValueError:
        entrada = {}
    evento = entrada.get("hook_event_name") or (sys.argv[1] if len(sys.argv) > 1 else "")
    raiz = Path(os.environ.get("CLAUDE_PROJECT_DIR") or entrada.get("cwd") or ".")
    texto = contexto(evento, raiz)
    if texto:
        json.dump({"hookSpecificOutput": {"hookEventName": evento, "additionalContext": texto}}, sys.stdout, ensure_ascii=False)
    return 0


if __name__ == "__main__":
    sys.exit(main())
