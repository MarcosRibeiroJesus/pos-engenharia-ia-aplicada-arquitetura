#!/usr/bin/env python3
"""Hook PreToolUse (AskUserQuestion): formato das perguntas ao dono (D-041).

O dono responde só no chat, por múltipla escolha. Cada pergunta precisa:
- explicar o porquê pelo nome da boa prática, ou seja, como o exame trata o assunto (D-036): o
  enunciado traz "Boa prática";
- dizer o tradeoff de cada opção: toda opção tem descrição.
Sem isso, o hook nega a chamada e diz o que falta.
"""
import json
import re
import sys

BOA_PRATICA = re.compile(r"boa pr[áa]tica", re.IGNORECASE)


def problemas(entrada: dict) -> list[str]:
    erros = []
    for i, q in enumerate((entrada.get("tool_input") or {}).get("questions") or [], 1):
        rotulo = q.get("header") or f"pergunta {i}"
        if not BOA_PRATICA.search(q.get("question") or ""):
            erros.append(f"{rotulo}: explique o porquê pelo nome da boa prática (escreva 'Boa prática: ...' "
                         "no enunciado, com o erro comum que ela evita)")
        sem_tradeoff = [o.get("label", "?") for o in q.get("options") or [] if not (o.get("description") or "").strip()]
        if sem_tradeoff:
            erros.append(f"{rotulo}: dê o tradeoff de cada opção na descrição (faltando em {', '.join(sem_tradeoff)})")
    return erros


def main() -> int:
    try:
        entrada = json.load(sys.stdin)
    except ValueError:
        return 0
    erros = problemas(entrada)
    if erros:
        motivo = "D-041: pergunta ao dono fora do formato. " + "; ".join(erros) + "."
        json.dump({"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "deny",
                                          "permissionDecisionReason": motivo}}, sys.stdout, ensure_ascii=False)
    return 0


if __name__ == "__main__":
    sys.exit(main())
