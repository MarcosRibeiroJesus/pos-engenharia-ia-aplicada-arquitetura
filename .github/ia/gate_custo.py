#!/usr/bin/env python3
"""Falha se o custo mensal estimado pelo Infracost passar do teto (USD)."""
import json
import sys

dados = json.load(open(sys.argv[1], encoding="utf-8"))
teto = float(sys.argv[2])
total = float(dados.get("totalMonthlyCost") or 0)
print(f"Custo mensal estimado: US$ {total:.2f} · teto: US$ {teto:.2f}")
for p in dados.get("projects", []):
    custo = float((p.get("breakdown") or {}).get("totalMonthlyCost") or 0)
    print(f"- {p.get('name')}: US$ {custo:.2f}")
if total > teto:
    print("Acima do teto. Reduza a escala do lab ou registre a exceção em ADR e ajuste a variável CUSTO_MAX_MENSAL_USD.")
    sys.exit(1)
