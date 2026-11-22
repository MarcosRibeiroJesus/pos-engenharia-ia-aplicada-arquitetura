"""Caminho padrão de projeto novo (D-030, D-031)."""
from __future__ import annotations

from comum import *  # noqa: F401,F403


class TestCaminhoPadrao(unittest.TestCase):
    """D-030: todo projeto novo entra pela mesma esteira com um comando."""

    def raiz(self, t: str) -> Path:
        r = Path(t)
        import shutil
        for rel in ("harness/estado.json", ".specify/templates/spec-template.md",
                    "harness/modelos/apply.yml", "harness/modelos/destroy.yml"):
            (r / rel).parent.mkdir(parents=True, exist_ok=True)
            shutil.copy(AQUI.parent / rel, r / rel)
        return r

    def novo(self, r: Path, **kw):
        args = dict(chave="09-produto-teste", titulo="Produto de teste", tipo="arquitetura",
                    pasta="modulos/09-teste/arquitetura/", branch="modulo/09-teste/produto", disciplina="09")
        args.update(kw)
        return novo_projeto.criar(r, **args)

    def test_projeto_com_infra_sai_valido_e_com_apply_e_destroy_que_passam_nos_gates(self):
        with tempfile.TemporaryDirectory() as t:
            r = self.raiz(t)
            self.novo(r)
            est = estado.carregar(r / "harness" / "estado.json")
            p = next(x for x in est["projetos"] if x["chave"] == "09-produto-teste")
            self.assertEqual((p["fase"], p["infra_real"], p["teto_diario_usd"]), ("especificar", True, None))
            self.assertEqual(estado.checar_apply((r / p["apply_workflow"]).read_text()), [])
            destroy = (r / p["destroy_workflow"]).read_text()
            self.assertEqual(estado.checar_destroy(destroy), [])
            self.assertNotIn("TROCAR", destroy)
            self.assertIn("modulos/09-teste/arquitetura/infra/terraform", destroy)
            self.assertIn("# Spec: Produto de teste", (r / "specs/09-produto-teste/spec.md").read_text())
            self.assertEqual([e for e in estado.problemas(est, r) if "09-produto" in e], [])

    def test_projeto_sem_infra_nao_gera_workflows(self):
        with tempfile.TemporaryDirectory() as t:
            r = self.raiz(t)
            criados = self.novo(r, infra_real=False, tipo="ia-aplicada")
            self.assertFalse(any(c.suffix == ".yml" for c in criados))

    def test_recusa_chave_repetida_invalida_ou_pasta_que_cruza_outro_projeto(self):
        with tempfile.TemporaryDirectory() as t:
            r = self.raiz(t)
            self.novo(r)
            casos = [dict(), dict(chave="Produto"), dict(chave="09-outro", pasta="modulos/09-teste/"),
                     dict(chave="09-outro", pasta="sem-barra")]
            for kw in casos:
                with self.subTest(**kw), self.assertRaises(novo_projeto.ErroProjeto):
                    self.novo(r, **kw)

    def test_regex_de_project_do_modelo_de_tags_e_o_da_chave_do_projeto(self):
        # D-031: a política do Infracost, o modelo de teste e o caminho padrão usam o mesmo padrão.
        modelo = (AQUI / "modelos" / "tags.tftest.hcl").read_text()
        self.assertIn(novo_projeto.CHAVE_VALIDA.pattern, modelo)
        for p in estado.carregar()["projetos"]:
            self.assertRegex(p["chave"], novo_projeto.CHAVE_VALIDA)

    def test_nao_cria_codigo_na_pasta_do_projeto(self):
        with tempfile.TemporaryDirectory() as t:
            r = self.raiz(t)
            self.novo(r)
            self.assertFalse((r / "modulos/09-teste").exists())

