#!/usr/bin/env python3
"""Falha se algum SARIF tiver achado alto ou crítico não suprimido.

Alto ou crítico: nível "error" ou `security-severity` >= 7.0 na regra ou no resultado.
Exceções devem ser versionadas (.semgrepignore, .trivyignore, .checkov.yaml) com ADR.
"""
import json
import sys


def severidade(regra, resultado):
    for fonte in (resultado.get("properties", {}), regra.get("properties", {})):
        valor = fonte.get("security-severity")
        if valor is not None:
            try:
                return float(valor)
            except ValueError:
                pass
    return None


bloqueantes = []
for caminho in sys.argv[1:]:
    try:
        sarif = json.load(open(caminho, encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        print(f"aviso: {caminho} ausente ou inválido")
        continue
    for run in sarif.get("runs", []):
        regras = {r.get("id"): r for r in run.get("tool", {}).get("driver", {}).get("rules", [])}
        ferramenta = run.get("tool", {}).get("driver", {}).get("name", "?")
        for r in run.get("results", []):
            if r.get("suppressions"):
                continue
            regra = regras.get(r.get("ruleId"), {})
            sev = severidade(regra, r)
            nivel = r.get("level") or regra.get("defaultConfiguration", {}).get("level", "warning")
            if (sev is not None and sev >= 7.0) or (sev is None and nivel == "error"):
                loc = (r.get("locations") or [{}])[0].get("physicalLocation", {})
                arq = loc.get("artifactLocation", {}).get("uri", "?")
                linha = loc.get("region", {}).get("startLine", "?")
                bloqueantes.append(f"{ferramenta} · {r.get('ruleId')} · {arq}:{linha} · sev={sev or nivel}")

if bloqueantes:
    print(f"{len(bloqueantes)} achado(s) alto(s) ou crítico(s):")
    print("\n".join(f"- {b}" for b in bloqueantes[:100]))
    sys.exit(1)
print("Nenhum achado alto ou crítico.")
