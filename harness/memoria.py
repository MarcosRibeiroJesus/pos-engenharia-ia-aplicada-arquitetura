#!/usr/bin/env python3
"""Memória compartilhada para qualquer agente (Claude Code, Antigravity, Copilot).

  ler        mostra DECISOES.md e registra, neste clone, que a versão atual foi lida
  verificar  exit 1 se a memória mudou desde a última leitura (usado no pre-push)
  auditar    exit 1 se uma decisão do dono (>= D-021) não diz onde foi aplicada (D-025),
             ou se DECISOES.md não pode ser lido no ramo obtido ou passa do teto (D-079)

No Claude Code os hooks fazem isso sozinhos; nos outros agentes o AGENTS.md manda rodar `ler`
no início, e o pre-push do git (.githooks) bloqueia o envio se houver decisão nova não lida.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import ramo  # noqa: E402

RAIZ = Path(__file__).resolve().parents[1]
RAMO = "memoria-compartilhada"


def marca(raiz: Path) -> Path:
    return Path(ramo.git(raiz, "rev-parse", "--absolute-git-dir").strip()) / "harness-memoria-lida"


PRIMEIRA_AUDITADA = 21  # D-025 vale para as decisões do dono a partir da D-021
MAX_BYTES_DECISOES = 8192  # 8 KB: teto do estado ativo injetado em toda sessão (D-079)


def sem_aplicacao(historico: str) -> list[str]:
    """Decisões do dono (fonte: Marcos) sem a linha **Aplicado em:** (D-025)."""
    faltam = []
    for bloco in re.split(r"^(?=### )", historico, flags=re.M):
        cab = re.match(r"### .*?· (D-(\d+)) · .*fonte: Marcos", bloco)
        if cab and int(cab.group(2)) >= PRIMEIRA_AUDITADA and "**Aplicado em:**" not in bloco:
            faltam.append(cab.group(1))
    return faltam


def decisoes_acima_do_teto(decisoes: str, limite: int = MAX_BYTES_DECISOES) -> int | None:
    """Devolve o tamanho em bytes UTF-8 se DECISOES.md ultrapassar `limite`, senão None."""
    tamanho = len(decisoes.encode("utf-8"))
    return tamanho if tamanho > limite else None


def main(argv: list[str], raiz: Path = RAIZ) -> int:
    cmd = argv[0] if argv else "ler"
    sha = ramo.buscar(raiz, RAMO)
    if not sha:
        print("memória compartilhada indisponível (sem rede?); siga com o que está no repositório")
        return 0
    if cmd == "ler":
        print(ramo.git(raiz, "show", f"{sha}:DECISOES.md"))
        marca(raiz).write_text(sha)
        return 0
    if cmd == "auditar":
        faltam = sem_aplicacao(ramo.git(raiz, "show", f"{sha}:HISTORICO.md"))
        try:
            decisoes = ramo.git(raiz, "show", f"{sha}:DECISOES.md")
        except RuntimeError as erro:
            print(f"Não foi possível ler DECISOES.md para a auditoria: {erro}", file=sys.stderr)
            return 1
        acima = decisoes_acima_do_teto(decisoes)
        for d in faltam:
            print(f"{d}: decisão do dono sem '**Aplicado em:**' (regra ou skill que a aplica)")
        if acima is not None:
            print(f"DECISOES.md com {acima} bytes (teto {MAX_BYTES_DECISOES}): "
                  "compacte o que já está no main para índice de 1 linha")
        erros = len(faltam) + (1 if acima is not None else 0)
        print("ok" if not erros else f"{erros} problema(s) na auditoria da memória compartilhada")
        return 1 if erros else 0
    if cmd == "verificar":
        try:
            lido = marca(raiz).read_text().strip()
        except OSError:
            lido = ""
        if lido == sha:
            return 0
        print("A memória compartilhada mudou desde a sua última leitura.")
        if lido:
            try:
                print(ramo.git(raiz, "diff", "--unified=0", lido, sha, "--", "DECISOES.md"))
            except RuntimeError:
                pass  # versão lida não existe mais neste clone: basta ler de novo
        print("Rode `python3 harness/memoria.py ler`, ajuste o trabalho às decisões e repita o push.")
        return 1
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
