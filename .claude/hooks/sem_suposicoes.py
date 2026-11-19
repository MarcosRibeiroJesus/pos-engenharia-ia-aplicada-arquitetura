#!/usr/bin/env python3
"""Hook PostToolUse do AskUserQuestion: proíbe assumir escolhas do dono do repositório.

Se alguma pergunta ficou sem resposta, devolve decision=block com a instrução de não
assumir, listar o que falta e perguntar de novo. Sem resposta ausente, não interfere.
"""
import json
import re
import sys

SINAIS = re.compile(
    r"did not answer|not answered|make a reasonable assumption|n[ãa]o respondeu|sem resposta",
    re.IGNORECASE,
)

INSTRUCAO = (
    "REGRA DO REPOSITÓRIO (CLAUDE.md, 'Decisões do dono'): há pergunta sem resposta do dono. "
    "Não assuma a escolha, não aplique recomendação por falta de objeção e não marque nada como "
    "decidido. Liste as perguntas pendentes, explique em uma linha o que cada uma bloqueia e peça "
    "a resposta. Siga só com o trabalho que não depende dessas respostas."
)


def perguntas_sem_resposta(evento: dict) -> list[str]:
    entrada = evento.get("tool_input") or {}
    resposta = evento.get("tool_response")
    texto = json.dumps(resposta, ensure_ascii=False) if not isinstance(resposta, str) else resposta
    respostas = {}
    if isinstance(resposta, dict):
        respostas = resposta.get("answers") or {}
    pendentes = []
    for q in entrada.get("questions") or []:
        pergunta = q.get("question", "")
        valor = respostas.get(pergunta)
        if valor is None or not str(valor).strip() or SINAIS.search(str(valor)):
            pendentes.append(pergunta)
    if not pendentes and SINAIS.search(texto or ""):
        pendentes.append("(pergunta não identificada)")
    return pendentes


def main() -> int:
    try:
        evento = json.load(sys.stdin)
    except json.JSONDecodeError:
        return 0
    if evento.get("tool_name") != "AskUserQuestion":
        return 0
    pendentes = perguntas_sem_resposta(evento)
    if not pendentes:
        return 0
    lista = "\n".join(f"- {p}" for p in pendentes)
    json.dump(
        {
            "decision": "block",
            "reason": f"{INSTRUCAO}\nPerguntas sem resposta:\n{lista}",
            "hookSpecificOutput": {
                "hookEventName": "PostToolUse",
                "additionalContext": f"{INSTRUCAO}\nPerguntas sem resposta:\n{lista}",
            },
        },
        sys.stdout,
        ensure_ascii=False,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
