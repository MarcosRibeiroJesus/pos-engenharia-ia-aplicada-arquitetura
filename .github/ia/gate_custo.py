#!/usr/bin/env python3
"""Gate de FinOps por PR (D-021 e D-022).

O uso é demonstração de um dia: subir, gravar, destruir. Por isso o gate compara o custo de 24 horas
de cada diretório Terraform com o teto diário do projeto (`teto_diario_usd` em harness/estado.json).

  gate_custo.py INFRACOST_JSON LIMITE_MENSAL_CONTA_USD [ESTADO_JSON]

Bloqueia (exit 1) quando:
- o custo de um dia passa do teto diário do projeto;
- o custo de um dia passa sozinho do limite mensal da conta (US$ 20). Esse dia estouraria o mês inteiro.

Sem teto diário calculado (projeto antes da fase 'tarefas'), só avisa: o harness exige o teto a
partir dessa fase.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

HORAS_MES = 730  # convenção do Infracost para custo mensal


def diario(mensal: float) -> float:
    return mensal * 24 / HORAS_MES


def projeto_do_caminho(estado: dict, caminho: str) -> dict | None:
    caminho = caminho.replace("\\", "/").rstrip("/") + "/"
    for p in estado.get("projetos", []):
        if any(caminho.startswith(pasta) or pasta.startswith(caminho) for pasta in p.get("pastas", [])):
            return p
    return None


def avaliar(infracost: dict, limite_mensal: float, estado: dict) -> tuple[list[str], list[str], list[str]]:
    linhas, avisos, bloqueios = [], [], []
    for proj in infracost.get("projects", []):
        caminho = (proj.get("metadata") or {}).get("path") or proj.get("name") or "?"
        mensal = float((proj.get("breakdown") or {}).get("totalMonthlyCost") or 0)
        dia = diario(mensal)
        p = projeto_do_caminho(estado, caminho)
        teto = p.get("teto_diario_usd") if p else None
        nome = p["chave"] if p else caminho
        linhas.append(f"- {nome}: US$ {dia:.2f} por dia (US$ {mensal:.2f} se ficasse no ar o mês todo)"
                      + (f" · teto diário US$ {float(teto):.2f}" if teto else " · teto diário pendente"))
        if dia > limite_mensal:
            bloqueios.append(f"{nome}: um dia (US$ {dia:.2f}) passa do limite mensal da conta (US$ {limite_mensal:.2f})")
        if teto:
            if dia > float(teto):
                bloqueios.append(f"{nome}: US$ {dia:.2f} por dia passa do teto diário US$ {float(teto):.2f}")
        else:
            avisos.append(f"{nome}: sem teto_diario_usd em harness/estado.json; calcule no plano (fase planejar)")
    return linhas, avisos, bloqueios


def main(argv: list[str]) -> int:
    infracost = json.loads(Path(argv[0]).read_text(encoding="utf-8"))
    limite_mensal = float(argv[1])
    caminho_estado = Path(argv[2]) if len(argv) > 2 else Path("harness/estado.json")
    estado = json.loads(caminho_estado.read_text(encoding="utf-8")) if caminho_estado.exists() else {}
    linhas, avisos, bloqueios = avaliar(infracost, limite_mensal, estado)
    print(f"Custo de um dia de demonstração · limite mensal da conta: US$ {limite_mensal:.2f}")
    print("\n".join(linhas) or "- nenhum diretório Terraform estimado")
    for a in avisos:
        print(f"::warning::{a}")
    for b in bloqueios:
        print(f"::error::{b}")
    if bloqueios:
        print("Reduza a escala do lab ou recalcule o teto no plano com ADR. Não aumente o teto só para passar no gate.")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
