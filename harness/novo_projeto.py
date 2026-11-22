#!/usr/bin/env python3
"""Caminho padrão (golden path): todo projeto novo entra pela mesma esteira.

Em um comando, o projeto ganha:
- a entrada em harness/estado.json, na fase `especificar`;
- a spec inicial, a partir do template;
- se tiver infraestrutura real, os workflows de apply e destroy dos modelos do harness (D-021, D-024).
Daí em diante valem os mesmos gates para todos: gate SDD, CI do harness, esteira de segurança e
FinOps, prazo de 24 h e destroy automático.

  novo_projeto.py CHAVE --titulo T --tipo {arquitetura,ia-aplicada,plataforma} --pasta CAMINHO/
                  --branch NOME [--disciplina NN] [--cloud C] [--sem-infra] [--stack NOME] [--tag TAG]

Não cria código dentro da pasta do projeto: isso só acontece na fase implementar (Artigo I).
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
CHAVE_VALIDA = re.compile(r"^[0-9]{2}-[a-z0-9]+(-[a-z0-9]+)*$")
TIPOS = ("arquitetura", "ia-aplicada", "plataforma")


class ErroProjeto(ValueError):
    pass


def validar(estado: dict, chave: str, pasta: str) -> None:
    if not CHAVE_VALIDA.match(chave):
        raise ErroProjeto("chave no formato NN-nome-em-kebab (ex.: 04-agente-plantao)")
    if any(p["chave"] == chave for p in estado["projetos"]):
        raise ErroProjeto(f"já existe projeto {chave}")
    if not pasta.endswith("/"):
        raise ErroProjeto("pasta termina com / (ex.: modulos/04-agentes/arquitetura/)")
    for p in estado["projetos"]:
        for outra in p["pastas"]:
            if pasta.startswith(outra) or outra.startswith(pasta):
                raise ErroProjeto(f"pasta {pasta} cruza com {outra} do projeto {p['chave']}")


def entrada(chave: str, titulo: str, tipo: str, pasta: str, branch: str, disciplina: str,
            cloud: str | None, infra_real: bool) -> dict:
    p = {"chave": chave, "disciplina": disciplina, "tipo": tipo, "titulo": titulo, "branch": branch,
         "pastas": [pasta], "specs": f"specs/{chave}/", "fase": "especificar", "retroativo": False,
         "pr": None, "cloud": cloud, "decisoes": [], "nota": "", "infra_real": infra_real}
    if infra_real:
        p.update({"apply_workflow": f".github/workflows/{chave}-apply.yml",
                  "destroy_workflow": f".github/workflows/{chave}-destroy.yml",
                  "teto_diario_usd": None})
        p["decisoes"] = ["D-021", "D-022", "D-024"]
    return p


def preencher_modelo(texto: str, chave: str, stack: str, tag: str, pasta: str) -> str:
    base = pasta.rstrip("/")
    return (texto.replace("TROCAR-CHAVE", chave).replace("TROCAR-STACK", stack).replace("TROCAR-TAG", tag)
            .replace("TROCAR/infra/terraform", f"{base}/infra/terraform")
            .replace("TROCAR/lab.tfstate", f"{chave}/lab.tfstate"))


def criar(raiz: Path, chave: str, titulo: str, tipo: str, pasta: str, branch: str, disciplina: str,
          cloud: str | None = None, infra_real: bool = True, stack: str | None = None,
          tag: str | None = None) -> list[Path]:
    caminho_estado = raiz / "harness" / "estado.json"
    estado = json.loads(caminho_estado.read_text(encoding="utf-8"))
    validar(estado, chave, pasta)
    p = entrada(chave, titulo, tipo, pasta, branch, disciplina, cloud, infra_real)
    criados: list[Path] = []

    spec = raiz / p["specs"] / "spec.md"
    if not spec.exists():
        modelo = (raiz / ".specify" / "templates" / "spec-template.md").read_text(encoding="utf-8")
        spec.parent.mkdir(parents=True, exist_ok=True)
        spec.write_text(modelo.replace("{titulo}", titulo).replace("{chave}", chave)
                        .replace("{disciplina}", disciplina), encoding="utf-8")
        criados.append(spec)

    if infra_real:
        stack, tag = stack or f"{chave}-lab", tag or chave
        for qual in ("apply", "destroy"):
            destino = raiz / p[f"{qual}_workflow"]
            if destino.exists():
                raise ErroProjeto(f"{destino.relative_to(raiz)} já existe")
            modelo = (raiz / "harness" / "modelos" / f"{qual}.yml").read_text(encoding="utf-8")
            destino.parent.mkdir(parents=True, exist_ok=True)
            destino.write_text(preencher_modelo(modelo, chave, stack, tag, pasta), encoding="utf-8")
            criados.append(destino)

    estado["projetos"].append(p)
    caminho_estado.write_text(json.dumps(estado, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    criados.append(caminho_estado)
    return criados


def main(argv: list[str]) -> int:
    a = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    a.add_argument("chave")
    a.add_argument("--titulo", required=True)
    a.add_argument("--tipo", choices=TIPOS, required=True)
    a.add_argument("--pasta", required=True)
    a.add_argument("--branch", required=True)
    a.add_argument("--disciplina", default="00")
    a.add_argument("--cloud")
    a.add_argument("--sem-infra", action="store_true", help="projeto sem infraestrutura real na AWS")
    a.add_argument("--stack")
    a.add_argument("--tag")
    x = a.parse_args(argv)
    try:
        criados = criar(RAIZ, x.chave, x.titulo, x.tipo, x.pasta, x.branch, x.disciplina, x.cloud,
                        not x.sem_infra, x.stack, x.tag)
    except ErroProjeto as erro:
        print(f"erro: {erro}")
        return 2
    for c in criados:
        print(f"criado/atualizado: {c.relative_to(RAIZ)}")
    print(f"\nPróximo passo: fase especificar com o especialista `especificador` "
          f"(python3 harness/agente.py proximo --tarefa especificacao --projeto {x.chave}).")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
