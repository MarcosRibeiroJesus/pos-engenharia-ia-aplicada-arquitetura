#!/usr/bin/env python3
"""Hook PreToolUse (Bash): gate programático antes de qualquer entrega.

1. Push ou abertura/edição de PR só passa se a sessão já recebeu a versão mais recente da
   memória compartilhada. Se houver decisão nova, o comando é negado e o motivo traz o que
   mudou; a sessão ajusta o trabalho e tenta de novo.
2. Escrita no branch `memoria-compartilhada` só com MEMORIA_ESCRITOR=orquestracao no comando:
   protege a fonte única contra push acidental de uma sessão de unidade.
Falha de rede ao consultar a memória não bloqueia a entrega (o hook não vira ponto único de falha).
"""
import json
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import memoria_compartilhada as memoria  # noqa: E402

ENTREGA = re.compile(r"\bgit\s+push\b|\bgh\s+pr\s+(create|edit|ready)\b|\bgh\s+api\b[^\n]*\bpulls\b")
ESCRITA_MEMORIA = re.compile(r"\bgit\s+push\b[^\n]*\bmemoria-compartilhada\b")


def decidir(comando: str, raiz: Path) -> str | None:
    """Retorna o motivo da negação, ou None para deixar passar."""
    if not ENTREGA.search(comando):
        return None
    if ESCRITA_MEMORIA.search(comando) and "MEMORIA_ESCRITOR=orquestracao" not in comando:
        return ("O branch memoria-compartilhada só é escrito pela conversa de orquestração (CLAUDE.md, "
                "'Memória compartilhada'). Se você tem uma decisão ou pergunta para o dono, registre no corpo "
                "do seu PR, na seção 'Perguntas ao dono'.")
    if "MEMORIA_ESCRITOR=orquestracao" in comando:
        return None
    novidades = memoria.novidades_pendentes(raiz)
    if novidades:
        return ("Entrega bloqueada: a memória compartilhada mudou desde a sua última leitura. Aplique as decisões "
                "abaixo ao trabalho, registre no PR o que mudou e repita o comando.\n\n" + novidades)
    return None


def main() -> int:
    try:
        evento = json.load(sys.stdin)
    except ValueError:
        return 0
    if evento.get("tool_name") != "Bash":
        return 0
    comando = (evento.get("tool_input") or {}).get("command", "")
    raiz = Path(os.environ.get("CLAUDE_PROJECT_DIR") or evento.get("cwd") or ".")
    motivo = decidir(comando, raiz)
    if motivo:
        json.dump({"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "deny",
                                          "permissionDecisionReason": motivo}}, sys.stdout, ensure_ascii=False)
    return 0


if __name__ == "__main__":
    sys.exit(main())
