"""Respostas do dono de 2026-11-20: Langfuse Cloud na D02 (D-048), marketplaces confirmados (D-049) e códigos com nome (D-050)."""
from __future__ import annotations

from comum import *  # noqa: F401,F403

RAIZ = AQUI.parent
MARKETPLACES_CONFIRMADOS = {"anthropic-agent-skills", "hashicorp", "trailofbits", "promptfoo", "google-plugins"}


class TestRespostasDoDono(unittest.TestCase):
    def test_d02_avalia_no_ci_e_traces_no_langfuse_cloud(self):
        skill = (RAIZ / ".claude" / "skills" / "avaliacao-llm" / "SKILL.md").read_text(encoding="utf-8")
        for trecho in ("D-048", "Langfuse Cloud", "Fallback seguro", "sintéticos"):
            self.assertIn(trecho, skill)
        p = next(x for x in estado.carregar(AQUI / "estado.json")["projetos"] if x["chave"] == "02-assistente-agendamento")
        self.assertIn("D-048", p["decisoes"])

    def test_so_marketplaces_confirmados_pelo_dono(self):
        cfg = json.loads((RAIZ / ".claude" / "settings.json").read_text(encoding="utf-8"))
        novos = set(cfg.get("extraKnownMarketplaces", {})) - MARKETPLACES_CONFIRMADOS
        self.assertEqual(novos, set(), "marketplace novo precisa de confirmação do dono (D-049)")

    def test_codigos_com_nome_nas_regras(self):
        for arq in ("CLAUDE.md", ".claude/skills/decisao-do-dono/SKILL.md", ".claude/skills/regras-do-especialista/SKILL.md"):
            self.assertIn("D-050", (RAIZ / arq).read_text(encoding="utf-8"), arq)
