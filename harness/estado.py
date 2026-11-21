#!/usr/bin/env python3
"""Estado do projeto (anotação estruturada fora da janela de contexto).

Fonte de verdade de "onde cada projeto está" no fluxo SDD. Comandos:
  status            resumo de todos os projetos (fase, tarefas feitas/total, próxima tarefa)
  validar           confere o esquema e se os artefatos SDD existem para a fase declarada (exit 1 se falhar)
  projeto-de PATH   diz a qual projeto um caminho pertence (usado pelo gate SDD)
  avancar CHAVE FASE  muda a fase, só se os artefatos exigidos pela nova fase existirem
  checar-arquivos [ARQ...]  exit 1 se algum arquivo é código de projeto antes da fase implementar (git hook e CI)
  aprovar-plano CHAVE --fonte TEXTO  registra que o DONO aprovou o plan.md (só depois da aprovação dele, D-033)
  pode-delegar CHAVE  exit 0 se a orquestração pode delegar aos especialistas sem aprovar cada disparo (D-033)
"""
from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
ARQUIVO = RAIZ / "harness" / "estado.json"
CAMPOS = {"chave", "disciplina", "tipo", "titulo", "branch", "pastas", "specs", "fase"}
# Artefato exigido para estar NA fase indicada (ou depois dela).
EXIGE = {"esclarecer": "spec.md", "planejar": "spec.md", "tarefas": "plan.md", "analisar": "tasks.md",
         "implementar": "analise.md", "verificar": "tasks.md", "publicar": "tasks.md", "concluido": "tasks.md"}


# D-033: com o plano aprovado pelo dono, os disparos destas fases saem sem aprovação a cada um.
# Especificar e planejar vêm antes do plano; publicar e merge são sempre do dono.
FASES_DELEGAVEIS = ("tarefas", "analisar", "implementar", "verificar")
# D-055: antes do plano, especificar e planejar também saem sem aprovação por disparo. O plano
# continua precisando da aprovação do dono, que libera as fases de FASES_DELEGAVEIS.
FASES_ANTES_DO_PLANO = ("especificar", "esclarecer", "planejar")
CAMPOS_APROVACAO = {"data", "fonte", "sha256"}
CAMPOS_PAUSA = {"data", "fonte"}  # D-060: pausa decidida pelo dono, com as palavras dele


def carregar(arquivo: Path = ARQUIVO) -> dict:
    return json.loads(arquivo.read_text(encoding="utf-8"))


def indice(estado: dict, fase: str) -> int:
    return estado["fases"].index(fase)


def tarefas(raiz: Path, projeto: dict) -> tuple[int, int, str | None]:
    caminho = raiz / projeto["specs"] / "tasks.md"
    if not caminho.exists():
        return 0, 0, None
    linhas = re.findall(r"^- \[( |x|X)\] (.+)$", caminho.read_text(encoding="utf-8"), re.M)
    feitas = sum(1 for marca, _ in linhas if marca.lower() == "x")
    proxima = next((texto for marca, texto in linhas if marca == " "), None)
    return feitas, len(linhas), proxima


def exigidos(estado: dict, fase: str) -> list[str]:
    alvo = indice(estado, fase)
    return sorted({arq for f, arq in EXIGE.items() if indice(estado, f) <= alvo})


def problemas(estado: dict, raiz: Path = RAIZ) -> list[str]:
    erros = []
    chaves = set()
    for p in estado.get("projetos", []):
        falta = CAMPOS - p.keys()
        if falta:
            erros.append(f"{p.get('chave', '?')}: campos ausentes {sorted(falta)}")
            continue
        if p["chave"] in chaves:
            erros.append(f"{p['chave']}: chave duplicada")
        chaves.add(p["chave"])
        if p["fase"] not in estado["fases"]:
            erros.append(f"{p['chave']}: fase desconhecida {p['fase']}")
            continue
        for arq in exigidos(estado, p["fase"]):
            if not (raiz / p["specs"] / arq).exists():
                erros.append(f"{p['chave']}: fase '{p['fase']}' exige {p['specs']}{arq}")
        erros += problemas_infra(estado, p, raiz)
        pausa = p.get("pausado")
        if pausa is not None and (not isinstance(pausa, dict) or CAMPOS_PAUSA - pausa.keys()):
            erros.append(f"{p['chave']}: pausado precisa de {sorted(CAMPOS_PAUSA)} (a data e as palavras do dono)")
        aprov = p.get("plano_aprovado")
        if aprov is not None and (not isinstance(aprov, dict) or CAMPOS_APROVACAO - aprov.keys()):
            erros.append(f"{p['chave']}: plano_aprovado precisa de {sorted(CAMPOS_APROVACAO)} "
                         "(registre com `estado.py aprovar-plano`)")
    return erros


def hash_do_plano(raiz: Path, p: dict) -> str | None:
    plano = raiz / p["specs"] / "plan.md"
    if not plano.exists():
        return None
    # Fim de linha não é conteúdo: o autocrlf do Windows grava CRLF no checkout, e o hash aprovado usa LF.
    return hashlib.sha256(plano.read_bytes().replace(b"\r\n", b"\n")).hexdigest()


def aprovar_plano(estado: dict, chave: str, fonte: str, data: str, raiz: Path = RAIZ) -> str:
    """Registra a aprovação do plano pelo dono. Devolve "" ou o motivo de não registrar."""
    p = next((x for x in estado["projetos"] if x["chave"] == chave), None)
    if not p:
        return f"projeto {chave} não existe"
    if not fonte.strip():
        return "informe a fonte da aprovação (as palavras do dono e onde ele disse)"
    sha = hash_do_plano(raiz, p)
    if not sha:
        return f"não há {p['specs']}plan.md para aprovar"
    p["plano_aprovado"] = {"data": data, "fonte": fonte.strip(), "sha256": sha}
    return ""


def pode_delegar(estado: dict, chave: str, raiz: Path = RAIZ) -> tuple[bool, str]:
    """D-033 e D-055: delegação sem aprovar cada disparo antes do plano e dentro do plano aprovado."""
    p = next((x for x in estado["projetos"] if x["chave"] == chave), None)
    if not p:
        return False, f"projeto {chave} não existe em harness/estado.json"
    pausa = p.get("pausado")
    if pausa:
        return False, (f"{chave} está pausado pelo dono desde {pausa.get('data')} ({pausa.get('fonte')}). "
                       "Nenhuma tarefa dele sai sem uma nova decisão do dono")
    if p["fase"] in FASES_ANTES_DO_PLANO:
        return True, ""
    aprov = p.get("plano_aprovado")
    if not aprov:
        return False, (f"o plano de {chave} não foi aprovado pelo dono. Peça a aprovação do plan.md e registre com "
                       f"`python3 harness/estado.py aprovar-plano {chave} --fonte \"...\"`, ou peça a aprovação deste disparo")
    if aprov.get("sha256") != hash_do_plano(raiz, p):
        return False, (f"o plan.md de {chave} mudou depois da aprovação de {aprov.get('data')}. "
                       "Mostre a mudança ao dono e registre a nova aprovação")
    if p["fase"] not in FASES_DELEGAVEIS:
        return False, (f"{chave} está na fase '{p['fase']}', fora do plano aprovado "
                       f"(delegação livre só em {', '.join(FASES_DELEGAVEIS)}). Peça a aprovação deste disparo")
    return True, ""


def problemas_infra(estado: dict, p: dict, raiz: Path = RAIZ) -> list[str]:
    """Artigo V: infraestrutura real tem teto de um dia de execução e workflow de destroy (D-021)."""
    if not p.get("infra_real"):
        return []
    erros, fase = [], indice(estado, p["fase"])
    for campo in ("apply_workflow", "destroy_workflow", "teto_diario_usd"):
        if campo not in p:
            erros.append(f"{p['chave']}: infra real sem o campo {campo}")
    if erros:
        return erros
    teto = p["teto_diario_usd"]
    if fase >= indice(estado, "tarefas") and not (isinstance(teto, (int, float)) and teto > 0):
        erros.append(f"{p['chave']}: a partir de 'tarefas' exige teto_diario_usd (custo estimado de 1 dia, do plan.md)")
    if fase >= indice(estado, "verificar"):
        for campo, checar in (("apply_workflow", checar_apply), ("destroy_workflow", checar_destroy)):
            wf = raiz / p[campo]
            if not wf.exists():
                erros.append(f"{p['chave']}: a partir de 'verificar' exige {campo} em {p[campo]}")
            else:
                erros += [f"{p['chave']}: {x}" for x in checar(wf.read_text(encoding="utf-8"))]
    return erros


def checar_apply(texto: str) -> list[str]:
    """O apply registra o prazo de vida (D-022) e confere a tag de custo `project` na conta (D-034)."""
    exigencias = {
        "input prazo_horas": r"^\s*prazo_horas\s*:",
        "registro do prazo (harness/infra.py registrar)": r"harness/infra\.py\s+registrar",
        "conferência da tag de custo project (D-034)": r"list-cost-allocation-tags",
    }
    return [f"workflow de apply sem {nome}" for nome, rx in exigencias.items() if not re.search(rx, texto, re.M)]


def checar_destroy(texto: str) -> list[str]:
    """Requisitos mínimos do workflow de destroy (CLAUDE.md, Engenharia)."""
    exigencias = {
        "disparo manual (workflow_dispatch)": r"^\s*workflow_dispatch\s*:",
        "ambiente protegido (environment)": r"^\s*environment\s*:",
        "confirmação pelo nome do stack (input confirm_stack)": r"^\s*confirm_stack\s*:",
        "terraform destroy": r"terraform\s+destroy",
        "verificação final de sobras pela tag project": r"tag:project|TagFilters|resourcegroupstaggingapi",
        "OIDC sem chave estática (id-token: write)": r"id-token\s*:\s*write",
        "remoção do registro de prazo (harness/infra.py remover)": r"harness/infra\.py\s+remover",
    }
    return [f"workflow de destroy sem {nome}" for nome, rx in exigencias.items() if not re.search(rx, texto, re.M)]


def projeto_de(estado: dict, caminho: str) -> dict | None:
    caminho = caminho.replace("\\", "/")
    for p in estado["projetos"]:
        if any(caminho.startswith(pasta) or f"/{pasta}" in caminho for pasta in p["pastas"]):
            return p
    return None


def bloqueios(estado: dict, arquivos: list[str]) -> list[tuple[str, str, str]]:
    """Arquivos de código de projetos que ainda não chegaram à fase implementar (Artigo I)."""
    saida = []
    for arq in arquivos:
        p = projeto_de(estado, arq)
        if p and indice(estado, p["fase"]) < indice(estado, "implementar"):
            saida.append((arq, p["chave"], p["fase"]))
    return saida


def linha_status(raiz: Path, p: dict) -> str:
    feitas, total, proxima = tarefas(raiz, p)
    pausa = p.get("pausado")
    marca = f"  PAUSADO desde {pausa.get('data')}" if pausa else ""
    return f"{p['chave']:28} fase={p['fase']:12} tarefas={feitas}/{total}  próxima: {proxima or '—'}{marca}"


def main(argv: list[str]) -> int:
    estado = carregar()
    cmd = argv[0] if argv else "status"
    if cmd == "status":
        for p in estado["projetos"]:
            print(linha_status(RAIZ, p))
        return 0
    if cmd == "validar":
        erros = problemas(estado)
        for e in erros:
            print(f"ERRO {e}")
        print("ok" if not erros else f"{len(erros)} problema(s)")
        return 1 if erros else 0
    if cmd == "checar-arquivos":
        arquivos = [a for a in (argv[1:] or sys.stdin.read().split()) if a]
        bl = bloqueios(estado, arquivos)
        for arq, chave, fase in bl:
            print(f"BLOQUEADO {arq}: projeto {chave} na fase '{fase}' (Artigo I: spec, plano, tarefas e análise antes do código)")
        return 1 if bl else 0
    if cmd == "projeto-de" and len(argv) > 1:
        p = projeto_de(estado, argv[1])
        print(json.dumps(p, ensure_ascii=False) if p else "")
        return 0
    if cmd == "avancar" and len(argv) > 2:
        chave, fase = argv[1], argv[2]
        p = next((x for x in estado["projetos"] if x["chave"] == chave), None)
        if not p or fase not in estado["fases"]:
            print("projeto ou fase inválidos")
            return 2
        faltam = [a for a in exigidos(estado, fase) if not (RAIZ / p["specs"] / a).exists()]
        if faltam:
            print(f"não avança: faltam {faltam} em {p['specs']}")
            return 1
        p["fase"] = fase
        ARQUIVO.write_text(json.dumps(estado, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"{chave} → {fase}")
        return 0
    if cmd == "aprovar-plano" and len(argv) > 3 and argv[2] == "--fonte":
        from datetime import date
        erro = aprovar_plano(estado, argv[1], " ".join(argv[3:]), date.today().isoformat())
        if erro:
            print(f"não registrado: {erro}")
            return 1
        ARQUIVO.write_text(json.dumps(estado, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"{argv[1]}: plano aprovado pelo dono registrado; delegação liberada em {', '.join(FASES_DELEGAVEIS)}")
        return 0
    if cmd == "pode-delegar" and len(argv) > 1:
        ok, motivo = pode_delegar(estado, argv[1])
        print("ok" if ok else f"NÃO: {motivo}")
        return 0 if ok else 1
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
