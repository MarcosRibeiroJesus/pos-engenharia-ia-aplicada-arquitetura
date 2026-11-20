#!/usr/bin/env python3
"""Troca de agente de código quando a cota de um acaba (Claude Code, Antigravity, Copilot).

A disponibilidade é compartilhada entre agentes e máquinas no branch `agentes-status`
(arquivo disponibilidade.json). A continuidade do trabalho não depende do agente: está em
AGENTS.md, harness/estado.json, specs/, harness/progresso.md e na memória compartilhada.

  status                                   quem está disponível agora
  marcar AGENTE --ate AAAA-MM-DDTHH:MM [--motivo TEXTO]   cota esgotada até o horário (com fuso; padrão -03:00)
  liberar AGENTE                           disponível de novo
  proximo --tarefa TIPO [--projeto CHAVE]  melhor agente e modelo disponíveis + prompt de passagem
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import ramo  # noqa: E402

RAIZ = Path(__file__).resolve().parents[1]
RAMO = "agentes-status"
ARQUIVO = "disponibilidade.json"
FUSO = timezone(timedelta(hours=-3))


def config() -> dict:
    return json.loads((RAIZ / "harness" / "agentes.json").read_text(encoding="utf-8"))


def agora() -> datetime:
    return datetime.now(FUSO)


def ler_disponibilidade(raiz: Path = RAIZ) -> dict:
    texto = ramo.ler(raiz, RAMO, ARQUIVO)
    return json.loads(texto) if texto else {}


def disponivel(registro: dict | None, momento: datetime) -> bool:
    if not registro or registro.get("status") != "esgotado":
        return True
    ate = registro.get("ate")
    if not ate:
        return False
    return momento >= datetime.fromisoformat(ate)


def escolher(cfg: dict, disp: dict, tarefa: str, momento: datetime) -> tuple[str, str, str] | None:
    """Devolve (agente, nível, modelo) do primeiro agente disponível na ordem do nível da tarefa."""
    nivel = cfg["tarefas"].get(tarefa)
    if not nivel:
        raise ValueError(f"tarefa desconhecida: {tarefa} (use: {', '.join(cfg['tarefas'])})")
    for agente in cfg["ordem"][nivel]:
        if disponivel(disp.get(agente), momento):
            return agente, nivel, cfg["agentes"][agente]["modelos"][nivel]
    return None


def especialista(tarefa: str, catalogo: dict | None = None) -> str | None:
    """Especialista de harness/especialistas.json responsável pela tarefa fim."""
    if catalogo is None:
        catalogo = json.loads((RAIZ / "harness" / "especialistas.json").read_text(encoding="utf-8"))
    return next((n for n, e in catalogo["especialistas"].items() if tarefa in e["tarefas"]), None)


def instrucao_do_papel(agente: str, nome: str) -> str:
    if agente == "claude-code":
        return f"Delegue ao subagente `{nome}` (.claude/agents/{nome}.md) ou assuma esse papel."
    if agente == "copilot":
        return f"Use o agente customizado `{nome}` (.github/agents/{nome}.agent.md)."
    return f"Assuma o papel descrito em .claude/agents/{nome}.md e siga as skills listadas nele (.agents/skills/)."


def prompt_de_passagem(agente: str, tarefa: str, projeto: str | None) -> str:
    alvo = f"o projeto `{projeto}`" if projeto else "o projeto indicado em harness/estado.json pelo branch atual"
    nome = especialista(tarefa)
    papel = (instrucao_do_papel(agente, nome) + " ") if nome else ""
    return (f"Você é o agente de código deste repositório. Leia AGENTS.md e siga-o à risca. {papel}"
            f"Antes de qualquer coisa rode `bash harness/init.sh` e `python3 harness/memoria.py ler`. "
            f"Trabalhe em {alvo}: continue da fase SDD e da próxima tarefa mostradas pelo init.sh, "
            f"uma tarefa por vez, com teste antes do código. Tipo de trabalho: {tarefa}. "
            f"Ao terminar ou antes de parar, faça commit, atualize harness/progresso.md e registre na entrada "
            f"o agente ({agente}). Perguntas ao dono vão no PR, nunca suponha a resposta.")


def main(argv: list[str]) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("status")
    m = sub.add_parser("marcar")
    m.add_argument("agente")
    m.add_argument("--ate", required=True)
    m.add_argument("--motivo", default="cota esgotada")
    lib = sub.add_parser("liberar")
    lib.add_argument("agente")
    pr = sub.add_parser("proximo")
    pr.add_argument("--tarefa", required=True)
    pr.add_argument("--projeto")
    a = p.parse_args(argv)
    cfg = config()
    disp = ler_disponibilidade()

    if a.cmd == "status":
        for nome in cfg["agentes"]:
            reg = disp.get(nome)
            ok = disponivel(reg, agora())
            extra = "" if ok else f" até {reg.get('ate', '?')} ({reg.get('motivo', '')})"
            print(f"{nome:12} {'disponível' if ok else 'esgotado'}{extra}")
        return 0

    if a.cmd in ("marcar", "liberar"):
        if a.agente not in cfg["agentes"]:
            print(f"agente desconhecido: {a.agente}")
            return 2
        if a.cmd == "marcar":
            ate = datetime.fromisoformat(a.ate if ("+" in a.ate[10:] or "-" in a.ate[10:]) else a.ate + "-03:00")
            disp[a.agente] = {"status": "esgotado", "ate": ate.isoformat(timespec="minutes"), "motivo": a.motivo,
                              "marcado_em": agora().isoformat(timespec="minutes")}
        else:
            disp[a.agente] = {"status": "disponivel", "marcado_em": agora().isoformat(timespec="minutes")}
        ramo.gravar(RAIZ, RAMO, ARQUIVO, json.dumps(disp, ensure_ascii=False, indent=2) + "\n",
                    f"{a.cmd} {a.agente}")
        print(f"{a.agente}: {disp[a.agente]['status']}")
        return 0

    escolha = escolher(cfg, disp, a.tarefa, agora())
    if not escolha:
        print("Nenhum agente disponível para este nível agora. Volte quando a primeira cota renovar "
              "(veja `status`); o trabalho continua de onde parou pelos arquivos do harness.")
        return 1
    agente, nivel, modelo = escolha
    info = cfg["agentes"][agente]
    print(f"Agente: {info['nome']} ({agente})\nModelo: {modelo} [nível {nivel}]\nComo iniciar: {info['como_iniciar']}")
    nome = especialista(a.tarefa)
    if nome:
        print(f"Especialista: {nome} · {instrucao_do_papel(agente, nome)}")
    if info.get("assincrono"):
        print(f"Assíncrono: {info['assincrono']}")
    print("\nPrompt de passagem:\n" + prompt_de_passagem(agente, a.tarefa, a.projeto))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
