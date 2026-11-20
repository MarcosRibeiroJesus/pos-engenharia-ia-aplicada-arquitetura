#!/usr/bin/env python3
"""Resume os SARIF de uma pasta em Markdown compacto para o contexto dos agentes.

Mantém só o essencial (ferramenta, regra, severidade, local, mensagem curta) e limita o volume,
para não gastar o contexto com saída verbosa das ferramentas.
"""
import json
import pathlib
import sys

pasta = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "achados")
linhas, total = [], 0
for arq in sorted(pasta.glob("*.sarif")):
    try:
        sarif = json.loads(arq.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        continue
    for run in sarif.get("runs", []):
        driver = run.get("tool", {}).get("driver", {})
        regras = {r.get("id"): r for r in driver.get("rules", [])}
        for r in run.get("results", []):
            if r.get("suppressions"):
                continue
            total += 1
            regra = regras.get(r.get("ruleId"), {})
            sev = (r.get("properties", {}).get("security-severity")
                   or regra.get("properties", {}).get("security-severity")
                   or r.get("level") or "warning")
            loc = (r.get("locations") or [{}])[0].get("physicalLocation", {})
            msg = " ".join((r.get("message", {}).get("text") or "").split())[:240]
            linhas.append(f"- [{driver.get('name', '?')}] {r.get('ruleId')} · sev={sev} · "
                          f"{loc.get('artifactLocation', {}).get('uri', '?')}:{loc.get('region', {}).get('startLine', '?')} · {msg}")
print(f"# Achados das ferramentas ({total} no total; mostrando até 200)\n")
print("\n".join(linhas[:200]) if linhas else "Nenhum achado.")
custo = pasta / "infracost.json"
if custo.exists():
    d = json.loads(custo.read_text(encoding="utf-8"))
    print(f"\n# Custo estimado (Infracost)\n\nTotal mensal: US$ {float(d.get('totalMonthlyCost') or 0):.2f}")
    for p in d.get("projects", []):
        print(f"- {p.get('name')}: US$ {float((p.get('breakdown') or {}).get('totalMonthlyCost') or 0):.2f}")
