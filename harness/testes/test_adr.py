"""ADRs da plataforma de agentes: conteúdo em plataforma/agentes/adr/ e links que resolvem (T000)."""
from __future__ import annotations

import re

from comum import *  # noqa: F401,F403

RAIZ = AQUI.parent
ADR_NOVO = RAIZ / "plataforma" / "agentes" / "adr"
SPEC = RAIZ / "specs" / "00-plataforma-agentes"
LINK_ADR = re.compile(r"\]\((adr/[^)\s#]+)")


class TestAdrDaPlataforma(unittest.TestCase):
    """O conteúdo dos ADRs 0001 a 0013 fica só em plataforma/agentes/adr/ (Art. I, Art. VII)."""

    def test_adrs_0001_a_0013_existem_no_novo_local(self):
        for n in range(1, 14):
            achados = list(ADR_NOVO.glob(f"{n:04d}-*.md"))
            self.assertEqual(len(achados), 1, f"ADR {n:04d} deveria estar em plataforma/agentes/adr/")

    def test_links_adr_do_spec_e_do_plan_resolvem(self):
        for arq in ("spec.md", "plan.md"):
            texto = (SPEC / arq).read_text(encoding="utf-8")
            links = LINK_ADR.findall(texto)
            if arq == "plan.md":
                self.assertTrue(links, "plan.md sem links adr/ (teste sem alvo)")
            for link in links:
                alvo = SPEC / link
                self.assertTrue(alvo.is_file(), f"{arq} aponta para {link}, que não resolve")

    def test_redirecionamento_aponta_para_o_novo_local(self):
        for n in range(1, 14):
            antigo = next((SPEC / "adr").glob(f"{n:04d}-*.md"), None)
            self.assertIsNotNone(antigo, f"sem redirecionamento para o ADR {n:04d}")
            texto = antigo.read_text(encoding="utf-8")
            self.assertIn(f"plataforma/agentes/adr/{antigo.name}", texto,
                          f"{antigo.name} deveria apontar para plataforma/agentes/adr/")


if __name__ == "__main__":
    unittest.main()
