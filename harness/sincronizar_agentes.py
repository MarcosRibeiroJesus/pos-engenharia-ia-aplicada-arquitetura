#!/usr/bin/env python3
"""Mantém skills e agentes especialistas iguais para todos os agentes de código.

Skills: fonte única em .claude/skills/<nome>/SKILL.md (Claude Code e Copilot leem); cópia em
.agents/skills/ para o Antigravity. Cópia e não link simbólico, para funcionar no Windows.

Especialistas: fonte única em harness/especialistas.json. Gera:
  .claude/agents/<nome>.md          subagente do Claude Code (modelo, ferramentas, skills pré-carregadas)
  .github/agents/<nome>.agent.md    agente customizado do Copilot (mesmo papel)
Arquivos de agente escritos à mão (sem a marca GERADO) não são tocados.

  (sem argumento)  sincroniza
  --verificar      exit 1 se algo estiver desatualizado (CI)
"""
from __future__ import annotations

import filecmp
import json
import shutil
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
ORIGEM = RAIZ / ".claude" / "skills"
DESTINO = RAIZ / ".agents" / "skills"
CATALOGO = RAIZ / "harness" / "especialistas.json"
MARCA = "<!-- GERADO por harness/sincronizar_agentes.py a partir de harness/especialistas.json: não edite à mão -->"


def diferencas(origem: Path = ORIGEM, destino: Path = DESTINO) -> list[str]:
    difs = []
    for arq in sorted(origem.rglob("*")):
        if arq.is_file():
            alvo = destino / arq.relative_to(origem)
            if not alvo.exists() or not filecmp.cmp(arq, alvo, shallow=False):
                difs.append(str(alvo.relative_to(destino.parent.parent)))
    for arq in sorted(destino.rglob("*")) if destino.exists() else []:
        if arq.is_file() and not (origem / arq.relative_to(destino)).exists():
            difs.append(f"{arq.relative_to(destino.parent.parent)} (sobrando)")
    return difs


def sincronizar(origem: Path = ORIGEM, destino: Path = DESTINO) -> None:
    if destino.exists():
        shutil.rmtree(destino)
    shutil.copytree(origem, destino)


def _lista(chave: str, itens: list[str]) -> str:
    return f"{chave}:\n" + "".join(f"  - {i}\n" for i in itens) if itens else ""


def _corpo(nome: str, e: dict, comum: dict, para_copilot: bool) -> str:
    skills = comum["skills"] + e["skills"]
    linhas = [MARCA, "", f"# {nome}", "", e["papel"], ""]
    if para_copilot:
        linhas += ["Antes de começar, leia e siga as skills abaixo (o `SKILL.md` de cada uma em `.claude/skills/<skill>/`):", ""]
        linhas += [f"- `{s}`" for s in skills] + [""]
    linhas += ["## Skills de mercado desta tarefa"]
    if e["plugins"]:
        linhas += ["Use quando estiverem instaladas; o catálogo e os comandos de instalação estão em `harness/AGENTES.md`. "
                   "Se divergirem da constituição ou das skills do repositório, valem as do repositório.", ""]
        linhas += [f"- `{p}`" for p in e["plugins"]]
    else:
        linhas += ["Nenhuma: as skills do repositório cobrem a tarefa."]
    linhas += ["", "Termine sempre com o relatório no formato da skill `regras-do-especialista`.", ""]
    return "\n".join(linhas)


def gerar(catalogo: dict) -> dict[Path, str]:
    """Conteúdo esperado de cada arquivo gerado, por caminho."""
    comum, saida = catalogo["comum"], {}
    for nome, e in catalogo["especialistas"].items():
        fm = (f"---\nname: {nome}\ndescription: {json.dumps(e['descricao'], ensure_ascii=False)}\nmodel: {e['modelo']}\n"
              + _lista("tools", e["ferramentas"]) + _lista("disallowedTools", comum["disallowedTools"])
              + _lista("skills", comum["skills"] + e["skills"]) + "---\n\n")
        saida[RAIZ / ".claude" / "agents" / f"{nome}.md"] = fm + _corpo(nome, e, comum, False)
        saida[RAIZ / ".github" / "agents" / f"{nome}.agent.md"] = (
            f"---\nname: {nome}\ndescription: {json.dumps(e['descricao'], ensure_ascii=False)}\n---\n\n" + _corpo(nome, e, comum, True))
    saida[RAIZ / "harness" / "AGENTES.md"] = catalogo_md(catalogo)
    return saida


FONTES = {
    "claude-plugins-official": "https://github.com/anthropics/claude-plugins-official",
    "anthropic-agent-skills": "https://github.com/anthropics/skills",
    "hashicorp": "https://github.com/hashicorp/agent-skills",
    "trailofbits": "https://github.com/trailofbits/skills",
    "promptfoo": "https://www.promptfoo.dev/docs/integrations/agent-skill/",
    "google-plugins": "https://github.com/google/skills",
}


def catalogo_md(catalogo: dict) -> str:
    ligados = set(catalogo["plugins_ligados_no_projeto"])
    l = [MARCA, "", "# Agentes especialistas e skills", "",
         "Cada tarefa fim tem um especialista com o modelo do nível da tarefa, só as skills dela e sem poder criar subagentes. "
         "Fonte: `harness/especialistas.json`. Para saber quem faz uma tarefa: "
         "`python3 harness/agente.py proximo --tarefa <tipo>`.", "",
         "| Especialista | Tarefas | Modelo | Skills do repositório | Skills de mercado |", "|---|---|---|---|---|"]
    for nome, e in catalogo["especialistas"].items():
        plug = ", ".join(f"`{x}`" + (" (ligado)" if x in ligados else "") for x in e["plugins"]) or "—"
        sk = ", ".join(f"`{s}`" for s in catalogo["comum"]["skills"] + e["skills"])
        l.append(f"| `{nome}` | {', '.join(e['tarefas'])} | {e['modelo']} | {sk} | {plug} |")
    l += ["", "## Skills de mercado", "",
          "Entram como plugins dos marketplaces dos próprios publicadores, declarados em `.claude/settings.json`; não são copiados para o repositório. "
          "Assim seguem as licenças e as atualizações de cada publicador.", ""]
    l += ["| Marketplace | Publicador | Fonte |", "|---|---|---|"]
    for n, m in catalogo["plugins_marketplaces"].items():
        l.append(f"| `{n}` | {m['publicador']} | {FONTES.get(n, m['repo'])} |")
    l += ["", "**Ligados no projeto** (carregados em toda sessão do Claude Code): " + ", ".join(f"`{x}`" for x in sorted(ligados)) + ".",
          "", "**Os demais:** instale sob demanda quando a tarefa pedir, para não encher o contexto de toda sessão.",
          "- Claude Code: `/plugin install <plugin>@<marketplace>`.",
          "- Copilot CLI e Antigravity: instale pelo comando do próprio publicador, conforme a fonte de cada marketplace.",
          "", "## Não recomendados aqui", ""]
    l += [f"- `{k}`: {v}" for k, v in catalogo["plugins_nao_recomendados"].items()]
    return "\n".join(l) + "\n"


def diferencas_agentes(catalogo: dict) -> list[str]:
    esperado = gerar(catalogo)
    difs = [str(p.relative_to(RAIZ)) for p, txt in esperado.items()
            if not p.exists() or p.read_text(encoding="utf-8") != txt]
    for pasta in (RAIZ / ".claude" / "agents", RAIZ / ".github" / "agents"):
        for p in sorted(pasta.glob("*.md")) if pasta.exists() else []:
            if p not in esperado and MARCA in p.read_text(encoding="utf-8"):
                difs.append(f"{p.relative_to(RAIZ)} (sobrando)")
    return difs


def sincronizar_agentes(catalogo: dict) -> None:
    esperado = gerar(catalogo)
    for pasta in (RAIZ / ".claude" / "agents", RAIZ / ".github" / "agents"):
        for p in pasta.glob("*.md") if pasta.exists() else []:
            if p not in esperado and MARCA in p.read_text(encoding="utf-8"):
                p.unlink()
    for p, txt in esperado.items():
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(txt, encoding="utf-8")


def main(argv: list[str]) -> int:
    catalogo = json.loads(CATALOGO.read_text(encoding="utf-8"))
    if "--verificar" in argv:
        difs = diferencas() + diferencas_agentes(catalogo)
        for d in difs:
            print(f"desatualizado: {d}")
        if difs:
            print("Rode `python3 harness/sincronizar_agentes.py` e faça commit.")
        return 1 if difs else 0
    sincronizar()
    sincronizar_agentes(catalogo)
    print(f"skills copiadas para {DESTINO.relative_to(RAIZ)}; {len(catalogo['especialistas'])} especialistas gerados")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
