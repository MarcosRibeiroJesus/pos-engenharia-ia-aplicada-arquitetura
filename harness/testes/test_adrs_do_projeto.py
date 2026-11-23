"""Assunto: ADRs 0007 a 0016 do projeto 01-recomendacao ficam na pasta da unidade e o plano aprovado não muda."""
from __future__ import annotations

import hashlib
import json
import re
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
SPEC = RAIZ / "specs" / "01-recomendacao"
UNIDADE = RAIZ / "modulos" / "01-fundamentos-ia-llms" / "unidades" / "03-recomendacao"
LINK = re.compile(r"\]\(([^)\s#]*adr/[^)\s#]*)")


class TestAdrsDoProjeto(unittest.TestCase):
    def test_adrs_0007_a_0016_na_unidade(self):
        for n in range(7, 17):
            achados = list((UNIDADE / "adr").glob(f"{n:04d}-*.md"))
            self.assertEqual(len(achados), 1, f"ADR-{n:04d} ausente em U/adr/")

    def test_links_de_adr_do_spec_e_do_plan_resolvem(self):
        for nome in ("spec.md", "plan.md"):
            texto = (SPEC / nome).read_text(encoding="utf-8")
            for alvo in LINK.findall(texto):
                self.assertTrue((SPEC / alvo).is_file(), f"{nome}: link quebrado {alvo}")

    def test_redirecionamentos_apontam_para_o_novo_local(self):
        for ad in (UNIDADE / "adr").glob("00[01][0-9]-*.md"):
            if not 7 <= int(ad.name[:4]) <= 16:
                continue
            red = SPEC / "adr" / ad.name
            self.assertTrue(red.is_file(), f"sem redirecionamento {ad.name}")
            self.assertTrue((red.parent / re.search(r"\]\(([^)]+)\)", red.read_text(encoding="utf-8")).group(1)).resolve() == ad.resolve())

    def test_status_aceito_e_sem_teto_pendente(self):
        for ad in (UNIDADE / "adr").glob("00[01][0-9]-*.md"):
            if 7 <= int(ad.name[:4]) <= 16:
                t = ad.read_text(encoding="utf-8")
                self.assertNotIn("proposto (plano da D01", t, ad.name)
                self.assertIn("- Status: aceito (plano aprovado pelo dono em 2026-11-20, D-056)", t, ad.name)
        t13 = next((UNIDADE / "adr").glob("0013-*.md")).read_text(encoding="utf-8")
        self.assertNotIn("depende da P01-P5", t13)

    def test_hash_do_plano_igual_ao_aprovado(self):
        estado = json.loads((RAIZ / "harness" / "estado.json").read_text(encoding="utf-8"))
        proj = next(p for p in estado["projetos"] if p.get("chave") == "01-recomendacao" or p.get("nome") == "01-recomendacao")
        esperado = proj["plano_aprovado"]["sha256"]
        self.assertEqual(hashlib.sha256((SPEC / "plan.md").read_bytes()).hexdigest(), esperado)


if __name__ == "__main__":
    unittest.main()
