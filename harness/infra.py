#!/usr/bin/env python3
"""Prazo de vida da infraestrutura de demonstração (D-022).

O uso é subir, gravar a demonstração e destruir no mesmo dia. O apply registra o prazo; o workflow
agendado `expirar-infra.yml` avisa uma hora antes e dispara o destroy do projeto quando o prazo
vence. O registro fica no branch `infra-no-ar` (arquivo ativos.json), visível a qualquer agente.

  status                                         o que está no ar e quando expira
  registrar PROJETO --stack NOME [--horas 24] [--run URL]   chamado pelo apply
  estender PROJETO --horas N                     adia o destroy automático (ex.: gravação atrasou)
  remover PROJETO                                chamado pelo destroy, depois da verificação de sobras
  vencidos [--aviso-min 60]                      JSON com o que avisar e o que destruir (usado pelo agendador)
  marcar-avisado PROJETO                         evita aviso repetido
  marcar-disparado PROJETO                       destroy disparado; só redispara depois de REDISPARO_H
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import estado  # noqa: E402
import ramo  # noqa: E402

RAIZ = Path(__file__).resolve().parents[1]
RAMO = "infra-no-ar"
ARQUIVO = "ativos.json"
PRAZO_PADRAO_H = 24
PRAZO_MAXIMO_H = 72  # um teto diário não sobrevive a uma semana esquecida
REDISPARO_H = 3  # destroy disparado e ainda registrado depois disso: falhou ou espera aprovação; tenta de novo


def agora() -> datetime:
    return datetime.now(timezone.utc)


def ler(raiz: Path = RAIZ) -> dict:
    texto = ramo.ler(raiz, RAMO, ARQUIVO)
    return json.loads(texto) if texto else {}


def gravar(ativos: dict, mensagem: str, raiz: Path = RAIZ) -> None:
    ramo.gravar(raiz, RAMO, ARQUIVO, json.dumps(ativos, ensure_ascii=False, indent=2, sort_keys=True) + "\n", mensagem)


def projeto(chave: str, est: dict | None = None) -> dict:
    est = est or estado.carregar()
    p = next((x for x in est["projetos"] if x["chave"] == chave), None)
    if not p or not p.get("infra_real"):
        raise ValueError(f"{chave} não é um projeto com infraestrutura real em harness/estado.json")
    return p


def validar_horas(horas: float) -> float:
    if not 0 < horas <= PRAZO_MAXIMO_H:
        raise ValueError(f"prazo precisa estar entre 0 e {PRAZO_MAXIMO_H} horas")
    return horas


def registrar(ativos: dict, p: dict, stack: str, horas: float, momento: datetime, run: str | None = None) -> dict:
    validar_horas(horas)
    ativos[p["chave"]] = {
        "stack": stack,
        "destroy_workflow": p["destroy_workflow"],
        "aplicado_em": momento.isoformat(timespec="minutes"),
        "expira_em": (momento + timedelta(hours=horas)).isoformat(timespec="minutes"),
        "avisado": False,
        "run": run,
    }
    return ativos


def estender(ativos: dict, chave: str, horas: float, momento: datetime) -> dict:
    validar_horas(horas)
    if chave not in ativos:
        raise ValueError(f"{chave} não está no ar")
    reg = ativos[chave]
    novo = max(datetime.fromisoformat(reg["expira_em"]), momento) + timedelta(hours=horas)
    limite = datetime.fromisoformat(reg["aplicado_em"]) + timedelta(hours=PRAZO_MAXIMO_H)
    if novo > limite:
        raise ValueError(f"o prazo total não passa de {PRAZO_MAXIMO_H} h desde o apply")
    reg["expira_em"], reg["avisado"] = novo.isoformat(timespec="minutes"), False
    reg.pop("destroy_disparado_em", None)
    return ativos


def vencidos(ativos: dict, momento: datetime, aviso_min: int = 60) -> dict:
    saida = {"avisar": [], "destruir": [], "aguardando": []}
    for chave, reg in sorted(ativos.items()):
        expira = datetime.fromisoformat(reg["expira_em"])
        item = {"projeto": chave, "stack": reg["stack"], "destroy_workflow": reg["destroy_workflow"],
                "expira_em": reg["expira_em"]}
        disparado = reg.get("destroy_disparado_em")
        if momento >= expira:
            if disparado and momento < datetime.fromisoformat(disparado) + timedelta(hours=REDISPARO_H):
                saida["aguardando"].append(item)
            else:
                saida["destruir"].append(item)
        elif momento >= expira - timedelta(minutes=aviso_min) and not reg.get("avisado"):
            saida["avisar"].append(item)
    return saida


def main(argv: list[str]) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("status")
    r = sub.add_parser("registrar")
    r.add_argument("projeto")
    r.add_argument("--stack", required=True)
    r.add_argument("--horas", type=float, default=PRAZO_PADRAO_H)
    r.add_argument("--run")
    e = sub.add_parser("estender")
    e.add_argument("projeto")
    e.add_argument("--horas", type=float, required=True)
    for nome in ("remover", "marcar-avisado", "marcar-disparado"):
        sub.add_parser(nome).add_argument("projeto")
    v = sub.add_parser("vencidos")
    v.add_argument("--aviso-min", type=int, default=60)
    a = p.parse_args(argv)

    ativos = ler()
    try:
        if a.cmd == "status":
            if not ativos:
                print("nada no ar")
            for chave, reg in sorted(ativos.items()):
                print(f"{chave:28} stack={reg['stack']:16} expira {reg['expira_em']}")
            return 0
        if a.cmd == "vencidos":
            print(json.dumps(vencidos(ativos, agora(), a.aviso_min), ensure_ascii=False))
            return 0
        if a.cmd == "registrar":
            registrar(ativos, projeto(a.projeto), a.stack, a.horas, agora(), a.run)
        elif a.cmd == "estender":
            estender(ativos, a.projeto, a.horas, agora())
        elif a.cmd == "remover":
            ativos.pop(a.projeto, None)
        elif a.cmd == "marcar-avisado":
            if a.projeto in ativos:
                ativos[a.projeto]["avisado"] = True
        elif a.cmd == "marcar-disparado":
            if a.projeto in ativos:
                ativos[a.projeto]["destroy_disparado_em"] = agora().isoformat(timespec="minutes")
    except ValueError as erro:
        print(f"erro: {erro}")
        return 2
    gravar(ativos, f"{a.cmd} {a.projeto}")
    reg = ativos.get(a.projeto)
    print(f"{a.projeto}: " + (f"expira {reg['expira_em']}" if reg else "fora do ar"))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
