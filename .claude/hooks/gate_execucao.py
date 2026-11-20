#!/usr/bin/env python3
"""Hook PreToolUse (Bash): o que a execução autônoma nunca faz sozinha (D-047).

Com os comandos do projeto liberados em `.claude/settings.json`, este gate nega o que é
irreversível ou é decisão do dono, mesmo que caia num padrão liberado:
- push com --force/-f/--force-with-lease ou refspec com "+", e push no main;
- merge de PR (gh pr merge, ou a rota /merge da API);
- terraform apply/destroy fora de um root de teste do Floci (caminho com "floci").
"""
import json
import re
import sys

PUSH = re.compile(r"\bgit\s+push\b([^\n;&|]*)")
FORCA = re.compile(r"(\s--force(-with-lease)?\b|\s-f\b|\s\+\S)")
NO_MAIN = re.compile(r"(\s|:|refs/heads/)main(\s|$)")
MERGE = re.compile(r"\bgh\s+pr\s+merge\b|\bgh\s+api\b[^\n]*/pulls/\d+/merge\b")
TF_REAL = re.compile(r"\b(terraform|tofu)\b[^\n;&|]*\b(apply|destroy)\b([^\n;&|]*)")


def decidir(comando: str) -> str | None:
    for m in PUSH.finditer(comando):
        resto = m.group(1)
        if FORCA.search(resto):
            return "D-047: push com força é proibido na execução autônoma. Refaça a operação sobre o topo atual."
        if NO_MAIN.search(resto + " "):
            return "D-047: push direto no main é proibido. Abra PR; o merge é do dono (D-032)."
    if MERGE.search(comando):
        return "D-047: merge de PR é decisão do dono. Avise-o pelo critério 1 da skill executar-tarefas."
    for m in TF_REAL.finditer(comando):
        if "floci" not in m.group(0).lower():
            return ("D-047: apply e destroy só no root de teste do Floci (caminho com 'floci'). "
                    "Na AWS real, quem dispara é o dono, pelos workflows (AGENTS.md, seção 7).")
    return None


def main() -> int:
    try:
        entrada = json.load(sys.stdin)
    except ValueError:
        return 0
    motivo = decidir((entrada.get("tool_input") or {}).get("command") or "")
    if motivo:
        json.dump({"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "deny",
                                          "permissionDecisionReason": motivo}}, sys.stdout, ensure_ascii=False)
    return 0


if __name__ == "__main__":
    sys.exit(main())
