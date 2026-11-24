"""Regras obrigatórias de economia de tokens (AGENTS.md, seção 9; skill economia-de-tokens).

Guarda que as sete regras continuam escritas e que a skill está espelhada para o Antigravity.
Não mede consumo: a medição é do painel de IA e do registro de uso.
"""
from __future__ import annotations

from comum import *  # noqa: F401,F403

RAIZ = AQUI.parent
AGENTS = RAIZ / "AGENTS.md"
SKILL = RAIZ / ".claude" / "skills" / "economia-de-tokens" / "SKILL.md"
ESPELHO = RAIZ / ".agents" / "skills" / "economia-de-tokens" / "SKILL.md"
CLAUDE = RAIZ / "CLAUDE.md"

REGRAS = [
    "sessao_longa_sem_compactar",
    "modelo_caro_mecanica",
    "cache_frio_pausa",
    "revisao_excessiva",
    "injecao_hook_repetida",
    "resultado_ferramenta_grande",
    "arquivo_relido",
]


class TestEconomiaDeTokens(unittest.TestCase):
    """As sete regras da seção 9 do AGENTS.md são obrigatórias e rastreáveis ao painel."""

    def setUp(self):
        self.texto = AGENTS.read_text(encoding="utf-8")
        self.secao = self.texto.split("## 9. Economia de tokens (obrigatória)", 1)
        self.assertEqual(len(self.secao), 2, "AGENTS.md sem a seção 9 de economia de tokens")
        self.secao = self.secao[1]

    def test_seção_9_tem_as_sete_regras_com_sinal_do_painel(self):
        for regra in REGRAS:
            self.assertIn(f"(`{regra}`)", self.secao, f"regra {regra} ausente da seção 9")

    def test_skill_existe_e_cita_as_sete_regras(self):
        self.assertTrue(SKILL.is_file(), "falta .claude/skills/economia-de-tokens/SKILL.md")
        skill = SKILL.read_text(encoding="utf-8")
        for n in range(1, 8):
            self.assertIn(f"regra {n}", skill, f"skill não cita a regra {n}")

    def test_skill_espelhada_para_o_antigravity(self):
        self.assertTrue(ESPELHO.is_file(), "rode python3 harness/sincronizar_agentes.py")
        self.assertEqual(ESPELHO.read_text(encoding="utf-8"), SKILL.read_text(encoding="utf-8"))

    def test_claude_md_aponta_para_a_seção_9(self):
        self.assertIn("`AGENTS.md`, seção 9", CLAUDE.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
