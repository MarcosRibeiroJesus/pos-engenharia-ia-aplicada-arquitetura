#!/usr/bin/env python3
"""Hook UserPromptSubmit: ao passar de 230 mil tokens de contexto, salva o estado da sessão e avisa (D-076).

O tamanho do contexto é o tamanho da última requisição da sessão principal: tokens de entrada
mais leituras e escritas de cache (o `usage` da última mensagem do assistente no transcript).
Subagentes ficam fora da conta, porque têm contexto próprio.

- Abaixo do limite: não imprime nada (regra 5 da economia de tokens; sem repetir o que está certo).
- Ao cruzar o limite, uma vez por sessão:
  1. grava um arquivo de estado em `harness/handoff/<sessao>.json` (gitignorado), com os fatos que
     o hook sabe: tokens, branch, último commit e alterações pendentes;
  2. injeta o aviso: completar o resumo estruturado nesse arquivo e perguntar ao dono se fecha
     a sessão agora ou continua. Não reinicia no meio de uma tarefa.
A marca fica num arquivo temporário por sessão, então não repete.
A memória compartilhada não é escrita aqui: só a orquestração grava nela (CLAUDE.md, D-046).
"""
import json
import os
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

LIMITE_TOKENS = 230_000  # D-076, decisão do dono
CAMPOS_ENTRADA = ("input_tokens", "cache_creation_input_tokens", "cache_read_input_tokens")


def tamanho_contexto(transcript: Path) -> int:
    """Tokens da última requisição da sessão principal. Zero se não houver usage."""
    ultimo = 0
    try:
        linhas = transcript.read_text(encoding="utf-8", errors="replace").splitlines()
    except OSError:
        return 0
    for linha in linhas:
        try:
            ev = json.loads(linha)
        except ValueError:
            continue
        uso = (ev.get("message") or {}).get("usage")
        if isinstance(uso, dict):
            ultimo = sum(uso.get(c) or 0 for c in CAMPOS_ENTRADA)
    return ultimo


def _git(raiz: Path, *args: str) -> str:
    """Saída do git no repositório; 'desconhecido' se não for um repositório ou o git falhar."""
    try:
        r = subprocess.run(["git", *args], cwd=raiz, capture_output=True, text=True, timeout=5)
    except (OSError, subprocess.SubprocessError):
        return "desconhecido"
    return r.stdout.strip() if r.returncode == 0 else "desconhecido"


def gravar_estado(evento: dict, tokens: int, limite: int, estado_dir: Path, raiz: Path) -> Path:
    """Grava os fatos da sessão para a próxima sessão retomar. Retorna o caminho do arquivo."""
    sessao = str(evento.get("session_id") or "sem-sessao")
    alteracoes = _git(raiz, "status", "--porcelain")
    estado = {
        "sessao": sessao,
        "quando": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "tokens": tokens,
        "limite": limite,
        "branch": _git(raiz, "branch", "--show-current"),
        "ultimo_commit": _git(raiz, "log", "-1", "--oneline"),
        "alteracoes_nao_commitadas": len(alteracoes.splitlines()) if alteracoes != "desconhecido" else "desconhecido",
        "resumo_estruturado": "a completar pela sessão: o que está pronto e testado; o que falta; "
                              "decisões aplicadas (ids da memória); perguntas abertas",
    }
    estado_dir.mkdir(parents=True, exist_ok=True)
    caminho = estado_dir / f"{sessao}.json"
    caminho.write_text(json.dumps(estado, ensure_ascii=False, indent=2), encoding="utf-8")
    return caminho


def decidir(evento: dict, limite: int = LIMITE_TOKENS, marca_dir: Path | None = None,
            estado_dir: Path | None = None, raiz: Path | None = None) -> dict | None:
    """Retorna o JSON de saída do hook, ou None quando não há nada a dizer."""
    sessao = str(evento.get("session_id") or "sem-sessao")
    caminho = evento.get("transcript_path")
    if not caminho:
        return None
    tokens = tamanho_contexto(Path(caminho))
    if tokens < limite:
        return None
    marca = (marca_dir or Path(tempfile.gettempdir())) / f"limite-contexto-{sessao}.flag"
    if marca.exists():
        return None
    try:
        marca.write_text(str(tokens), encoding="utf-8")
    except OSError:
        pass  # sem marca, o aviso pode repetir; não bloqueia o trabalho
    raiz = raiz or Path(os.environ.get("CLAUDE_PROJECT_DIR") or evento.get("cwd") or ".")
    estado_dir = estado_dir or (raiz / "harness" / "handoff")
    try:
        arquivo = str(gravar_estado(evento, tokens, limite, estado_dir, raiz))
    except OSError:
        arquivo = "não foi possível gravar (sem permissão na pasta)"
    aviso = (f"Contexto da sessão em {tokens} tokens, acima de {limite} (D-076). Estado salvo em {arquivo}. "
             "Complete o campo resumo_estruturado desse arquivo (pronto e testado; o que falta; decisões "
             "aplicadas; perguntas abertas). Depois pergunte ao dono: fechar a sessão agora ou continuar? "
             "Não reinicie no meio de uma tarefa.")
    return {"hookSpecificOutput": {"hookEventName": "UserPromptSubmit", "additionalContext": aviso}}


def main() -> int:
    try:
        evento = json.load(sys.stdin)
    except ValueError:
        return 0
    saida = decidir(evento)
    if saida:
        json.dump(saida, sys.stdout, ensure_ascii=False)
    return 0


if __name__ == "__main__":
    sys.exit(main())
