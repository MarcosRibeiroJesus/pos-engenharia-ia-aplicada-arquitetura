#!/usr/bin/env python3
"""Hook UserPromptSubmit: avisa quando o contexto da sessão passa de 230 mil tokens (D-076).

O tamanho do contexto é o tamanho da última requisição da sessão principal: tokens de entrada
mais leituras e escritas de cache (o `usage` da última mensagem do assistente no transcript).
Subagentes ficam fora da conta, porque têm contexto próprio.

- Abaixo do limite: não imprime nada (regra 5 da economia de tokens; sem repetir o que está certo).
- Ao cruzar o limite: injeta uma vez por sessão a instrução de reiniciar com resumo estruturado
  numa pausa entre tarefas. A marca fica num arquivo temporário por sessão, então não repete.
"""
import json
import sys
import tempfile
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


def decidir(evento: dict, limite: int = LIMITE_TOKENS, marca_dir: Path | None = None) -> dict | None:
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
    aviso = (f"Contexto da sessão em {tokens} tokens, acima de {limite} (D-076). Ao fim da tarefa atual, "
             "grave o resumo estruturado da seção 'Retomada de sessão' do CLAUDE.md e reinicie a orquestração. "
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
