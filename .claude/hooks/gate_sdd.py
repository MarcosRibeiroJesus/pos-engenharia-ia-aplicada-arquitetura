#!/usr/bin/env python3
"""Hook PreToolUse (Edit/Write/MultiEdit/NotebookEdit): constituição, Artigo I.

Nega a edição de arquivos de um projeto (pastas em harness/estado.json) enquanto o projeto não
estiver na fase `implementar` ou depois. Edições em specs/, harness/, docs/ e fora de projetos
passam. A mensagem diz exatamente qual artefato SDD falta e qual skill usar.
"""
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "harness"))

PROXIMO_PASSO = {
    "especificar": "use a skill sdd-especificar para escrever spec.md",
    "esclarecer": "use a skill sdd-especificar para resolver as ambiguidades da spec",
    "planejar": "use a skill sdd-planejar para escrever plan.md (em plan mode)",
    "tarefas": "use a skill sdd-tarefas para gerar tasks.md",
    "analisar": "use a skill sdd-analisar para validar spec, plano, tarefas e constituição (gera analise.md)",
}


def caminho_do_evento(entrada: dict) -> str:
    ti = entrada.get("tool_input") or {}
    return ti.get("file_path") or ti.get("notebook_path") or ti.get("path") or ""


def decidir(caminho: str, raiz: Path) -> str | None:
    import estado as est  # harness/estado.py

    if not caminho:
        return None
    try:
        relativo = str(Path(caminho).resolve().relative_to(raiz.resolve()))
    except ValueError:
        relativo = caminho
    try:
        e = est.carregar(raiz / "harness" / "estado.json")
    except (OSError, ValueError):
        return None  # sem estado legível o gate não decide (não vira ponto único de falha)
    p = est.projeto_de(e, relativo)
    if not p or est.indice(e, p["fase"]) >= est.indice(e, "implementar"):
        return None
    passo = PROXIMO_PASSO.get(p["fase"], "conclua as fases SDD anteriores")
    retro = (" Este projeto tem código anterior ao SDD: escreva os artefatos a partir do que existe "
             "(spec retroativa) antes de mudar o código.") if p.get("retroativo") else ""
    return (f"Constituição, Artigo I (SDD): o projeto {p['chave']} está na fase '{p['fase']}' e ainda não pode "
            f"receber código. Próximo passo: {passo}. Artefatos em {p['specs']}; depois avance a fase com "
            f"`python3 harness/estado.py avancar {p['chave']} <fase>`.{retro}")


def main() -> int:
    try:
        entrada = json.load(sys.stdin)
    except ValueError:
        return 0
    raiz = Path(os.environ.get("CLAUDE_PROJECT_DIR") or entrada.get("cwd") or ".")
    motivo = decidir(caminho_do_evento(entrada), raiz)
    if motivo:
        json.dump({"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "deny",
                                          "permissionDecisionReason": motivo}}, sys.stdout, ensure_ascii=False)
    return 0


if __name__ == "__main__":
    sys.exit(main())
