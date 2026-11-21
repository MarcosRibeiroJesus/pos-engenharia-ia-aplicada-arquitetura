#!/usr/bin/env python3
"""Hook PreToolUse (Agent/Task): delegação aos especialistas só dentro do plano aprovado (D-033).

O dono aprova o plano SDD (`plan.md`) de um projeto; depois disso a orquestração delega as tarefas
das fases tarefas, analisar, implementar e verificar sem pedir aprovação a cada disparo. Fora disso
(sem plano aprovado ou plano alterado nas fases tarefas a verificar, e a fase publicar; especificar, esclarecer e planejar são livres pela D-055), o
disparo precisa da aprovação do dono para ele, registrada no briefing numa linha
`Aprovação do dono: <palavras dele e quando>`.

Todo briefing de especialista declara o projeto numa linha `Projeto: <chave>`. Agentes que não são
especialistas (Explore, Plan, general-purpose) não passam por este gate.
"""
import json
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "harness"))

PROJETO = re.compile(r"^\s*Projeto:\s*`?([A-Za-z0-9._-]+)`?", re.M)
APROVACAO = re.compile(r"^\s*Aprovação do dono:\s*\S", re.M)


def decidir(entrada: dict, raiz: Path) -> str | None:
    import estado as est  # harness/estado.py

    ti = entrada.get("tool_input") or {}
    tipo = ti.get("subagent_type") or ""
    try:
        especialistas = json.loads((raiz / "harness" / "especialistas.json").read_text(encoding="utf-8"))["especialistas"]
        e = est.carregar(raiz / "harness" / "estado.json")
    except (OSError, ValueError, KeyError):
        return None  # sem catálogo ou estado legível o gate não decide (não vira ponto único de falha)
    if tipo not in especialistas:
        return None
    prompt = ti.get("prompt") or ""
    if APROVACAO.search(prompt):
        return None
    m = PROJETO.search(prompt)
    if not m:
        return ("D-033: o briefing de um especialista declara o projeto numa linha `Projeto: <chave>` "
                "(chaves em harness/estado.json). Se a tarefa não é de um projeto, peça a aprovação do dono "
                "para este disparo e registre no briefing `Aprovação do dono: <palavras dele e quando>`.")
    ok, motivo = est.pode_delegar(e, m.group(1), raiz)
    if ok:
        return None
    return (f"D-033: a delegação sem aprovação a cada disparo vale só dentro do plano aprovado pelo dono. {motivo}. "
            "Com a aprovação do dono para este disparo, registre no briefing `Aprovação do dono: <palavras dele e quando>`.")


def main() -> int:
    try:
        entrada = json.load(sys.stdin)
    except ValueError:
        return 0
    raiz = Path(os.environ.get("CLAUDE_PROJECT_DIR") or entrada.get("cwd") or ".")
    motivo = decidir(entrada, raiz)
    if motivo:
        json.dump({"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "deny",
                                          "permissionDecisionReason": motivo}}, sys.stdout, ensure_ascii=False)
    return 0


if __name__ == "__main__":
    sys.exit(main())
