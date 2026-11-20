#!/usr/bin/env python3
"""Mantém as skills iguais para todos os agentes.

Fonte única: .claude/skills/<nome>/SKILL.md (Claude Code e Copilot leem). Cópia gerada em
.agents/skills/ (Antigravity). Cópia e não link simbólico, para funcionar no Windows.
  (sem argumento)  sincroniza
  --verificar      exit 1 se as cópias estiverem desatualizadas (CI)
"""
import filecmp
import shutil
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
ORIGEM = RAIZ / ".claude" / "skills"
DESTINO = RAIZ / ".agents" / "skills"


def diferencas(origem: Path = ORIGEM, destino: Path = DESTINO) -> list[str]:
    difs = []
    for arq in sorted(origem.rglob("*")):
        if arq.is_file():
            alvo = destino / arq.relative_to(origem)
            if not alvo.exists() or not filecmp.cmp(arq, alvo, shallow=False):
                difs.append(str(alvo.relative_to(destino.parent.parent)))
    for arq in sorted(destino.rglob("*")) if destino.exists() else []:
        if arq.is_file() and not (origem / arq.relative_to(destino)).exists():
            difs.append(f"{arq.relative_to(destino.parent.parent)} (sobrando)")
    return difs


def sincronizar(origem: Path = ORIGEM, destino: Path = DESTINO) -> None:
    if destino.exists():
        shutil.rmtree(destino)
    shutil.copytree(origem, destino)


def main(argv: list[str]) -> int:
    if "--verificar" in argv:
        difs = diferencas()
        for d in difs:
            print(f"desatualizado: {d}")
        if difs:
            print("Rode `python3 harness/sincronizar_agentes.py` e faça commit.")
        return 1 if difs else 0
    sincronizar()
    print(f"skills copiadas para {DESTINO.relative_to(RAIZ)}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
