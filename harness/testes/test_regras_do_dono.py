"""Regras do dono em manuais e skills (D-036, D-037, D-041, D-063)."""
from __future__ import annotations

from comum import *  # noqa: F401,F403


class TestPublicacaoDaPlataforma(unittest.TestCase):
    """D-037: a plataforma de agentes tem página e post próprios no site."""

    def test_skill_do_site_e_claude_md_trazem_a_regra(self):
        for arq in (".claude/skills/site-projeto/SKILL.md", "CLAUDE.md"):
            texto = (AQUI.parent / arq).read_text(encoding="utf-8")
            self.assertIn("D-037", texto, arq)
            self.assertIn("00-plataforma-agentes", texto, arq)


class TestComoExplicarDecisoes(unittest.TestCase):
    """D-036: explicação ao dono pelo nome da boa prática e o erro comum, não só pelos códigos da prova."""

    def test_regra_nos_manuais_e_no_contrato_do_especialista(self):
        raiz = AQUI.parent
        for arq in ("CLAUDE.md", "AGENTS.md", ".claude/skills/regras-do-especialista/SKILL.md"):
            texto = (raiz / arq).read_text(encoding="utf-8")
            self.assertIn("D-036", texto, arq)
            self.assertIn("erro comum", texto, arq)


class TestPerguntaAoDono(unittest.TestCase):
    """D-041: pergunta só no chat, com a boa prática no enunciado e o tradeoff de cada opção."""

    def _evento(self, enunciado: str, descricoes: tuple[str, str]) -> dict:
        return {"tool_input": {"questions": [{"header": "X", "question": enunciado, "options": [
            {"label": "A", "description": descricoes[0]}, {"label": "B", "description": descricoes[1]}]}]}}

    def test_sem_boa_pratica_nega(self):
        erros = gate_pergunta.problemas(self._evento("Qual opção?", ("ganha x", "perde y")))
        self.assertTrue(any("boa prática" in e for e in erros))

    def test_opcao_sem_tradeoff_nega(self):
        erros = gate_pergunta.problemas(self._evento("Contexto. Boa prática: gate programático.", ("ganha x", " ")))
        self.assertTrue(any("tradeoff" in e and "B" in e for e in erros))

    def test_formato_completo_passa(self):
        self.assertEqual(gate_pergunta.problemas(self._evento("Contexto. Boa prática: gate programático; "
                                                               "erro comum: instrução no prompt.",
                                                               ("ganha x", "perde y"))), [])

    def test_hook_registrado_e_regra_nos_manuais(self):
        cfg = json.loads((AQUI.parent / ".claude" / "settings.json").read_text(encoding="utf-8"))
        self.assertTrue(any("gate_pergunta.py" in h["command"] and m["matcher"] == "AskUserQuestion"
                            for m in cfg["hooks"]["PreToolUse"] for h in m["hooks"]))
        for arq in ("CLAUDE.md", "AGENTS.md", ".claude/skills/decisao-do-dono/SKILL.md"):
            self.assertIn("D-041", (AQUI.parent / arq).read_text(encoding="utf-8"), arq)


class TestOndeRodaOTerraform(unittest.TestCase):
    """D-063 (substitui a D-042): Terraform nas sessões de nuvem, sem escrever às cegas; um escritor por branch."""

    def test_regra_na_skill_e_no_claude_md(self):
        for arq, frase in ((".claude/skills/terraform-tdd/SKILL.md", "Um escritor por branch"),
                           ("CLAUDE.md", "única que comita")):
            texto = (AQUI.parent / arq).read_text(encoding="utf-8")
            self.assertIn("D-063", texto, arq)
            self.assertIn(frase, texto, arq)
            self.assertIn("às cegas", texto, arq)


class TestQuemGravaAMemoria(unittest.TestCase):
    """D-046: a sessão onde o dono decidiu grava, com escrita otimista (sem --force, refaz sobre o topo)."""

    def test_regra_no_claude_md(self):
        texto = (AQUI.parent / "CLAUDE.md").read_text(encoding="utf-8")
        self.assertIn("D-046", texto)
        self.assertIn("push sem `--force`", texto)



class TestRespostasDoDonoD062(unittest.TestCase):
    """D-062: GCP como cloud comparativa da D04 à D07, rodada real paga só com teto aprovado e merge do dono."""

    def _texto(self, arq: str) -> str:
        return (AQUI.parent / arq).read_text(encoding="utf-8")

    def test_cloud_da_d04_a_d07_na_skill_e_no_especialista(self):
        for arq in (".claude/skills/cloud-comparativa/SKILL.md", ".agents/skills/cloud-comparativa/SKILL.md",
                    ".claude/agents/arquiteto-cloud-comparativa.md"):
            self.assertIn("da D04 à D07", self._texto(arq), arq)

    def test_rodada_real_so_com_teto_aprovado_pelo_dono(self):
        texto = self._texto(".claude/skills/avaliacao-llm/SKILL.md")
        self.assertIn("D-062", texto)
        self.assertIn("Sem teto aprovado, não roda", texto)

    def test_merge_e_do_dono_sem_aprovacao_formal(self):
        self.assertIn("Não peça aprovação formal de PR", self._texto("CLAUDE.md"))


class TestUmaSessaoPorVez(unittest.TestCase):
    """D-066: uma sessão por vez, aberta pelo dono no ambiente certo, com push ao fim de cada fase."""

    def test_regra_no_claude_md(self):
        texto = (AQUI.parent / "CLAUDE.md").read_text(encoding="utf-8")
        self.assertIn("D-066", texto)
        self.assertIn("push ao fim de cada fase", texto)
