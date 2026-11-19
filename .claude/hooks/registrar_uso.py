#!/usr/bin/env python3
"""Hook Stop: registra o uso de tokens da sessão sem ação manual.

Lê o transcript (transcript_path do evento), soma message.usage por modelo sem contar duas
vezes a mesma mensagem e grava harness/uso/<session_id>.json. Um arquivo por sessão, reescrito
a cada parada: sessões em paralelo nunca editam o mesmo arquivo (sem conflito de merge), e a
agregação acontece na leitura.
"""
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

CAMPOS = {"input_tokens": "input", "cache_creation_input_tokens": "cache_write",
          "cache_read_input_tokens": "cache_read", "output_tokens": "output"}


def somar(transcript: Path) -> dict:
    por_modelo: dict = {}
    vistos: dict = {}
    for linha in transcript.read_text(encoding="utf-8", errors="replace").splitlines():
        try:
            ev = json.loads(linha)
        except ValueError:
            continue
        msg = ev.get("message") or {}
        uso, modelo = msg.get("usage"), msg.get("model")
        if not isinstance(uso, dict) or not modelo or modelo == "<synthetic>":
            continue
        vistos[msg.get("id") or ev.get("uuid")] = (modelo, uso)  # a última versão da mensagem vale
    for modelo, uso in vistos.values():
        g = por_modelo.setdefault(modelo, {"requisicoes": 0, **{v: 0 for v in CAMPOS.values()}})
        g["requisicoes"] += 1
        for k, v in CAMPOS.items():
            g[v] += uso.get(k) or 0
    return por_modelo


def branch(raiz: Path) -> str:
    try:
        return subprocess.run(["git", "-C", str(raiz), "branch", "--show-current"], capture_output=True,
                              text=True, timeout=5).stdout.strip()
    except (OSError, subprocess.TimeoutExpired):
        return ""


def registrar(entrada: dict, raiz: Path) -> Path | None:
    transcript = Path(entrada.get("transcript_path") or "")
    sessao = entrada.get("session_id") or transcript.stem
    if not sessao or not transcript.is_file():
        return None
    modelos = somar(transcript)
    if not modelos:
        return None
    destino = raiz / "harness" / "uso" / f"{sessao}.json"
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_text(json.dumps({"sessao": sessao, "branch": branch(raiz),
                                   "atualizado": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                                   "modelos": modelos}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return destino


def main() -> int:
    try:
        entrada = json.load(sys.stdin)
    except ValueError:
        return 0
    raiz = Path(os.environ.get("CLAUDE_PROJECT_DIR") or entrada.get("cwd") or ".")
    try:
        registrar(entrada, raiz)
    except OSError:
        pass  # registro de uso nunca derruba a sessão
    return 0


if __name__ == "__main__":
    sys.exit(main())
