"""ST-05 (RF-017, D-054, T095): o site publica só a página e o post AWS da D01; nenhum link ou item
em ITEMS aponta para o post da cloud comparativa (GCP), que fica só no repositório."""
import importlib.util
import pathlib
import unittest

RAIZ = pathlib.Path(__file__).resolve().parents[2]
STATIC_RULES = (RAIZ / "modulos" / "01-fundamentos-ia-llms" / "unidades" / "03-recomendacao"
                / "infra" / "terraform" / "tests" / "static_rules.py")


def _carregar():
    spec = importlib.util.spec_from_file_location("static_rules_01_recomendacao_site", STATIC_RULES)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class TestST05SiteSemPostGcp(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sr = _carregar()

    def test_site_do_repositorio_passa(self):
        self.assertEqual(self.sr.st05_site_sem_post_gcp(self.sr.textos_do_site()), [])

    def test_fixture_com_link_html_reprova(self):
        site = {"projetos/x.html": '<a href="../posts/modulo-01-recomendacao-gcp.html">GCP</a>'}
        self.assertTrue(self.sr.st05_site_sem_post_gcp(site))

    def test_fixture_com_link_para_gcp_md_reprova(self):
        site = {"projetos/x.html": "<a href='https://github.com/o/r/blob/main/u/posts/gcp.md'>x</a>"}
        self.assertTrue(self.sr.st05_site_sem_post_gcp(site))

    def test_fixture_com_item_em_items_reprova(self):
        site = {"index.html": '{ type: "post", href: "posts/recomendacao-gcp.html", title: "x" }'}
        self.assertTrue(self.sr.st05_site_sem_post_gcp(site))

    def test_pagina_do_post_gcp_no_site_reprova(self):
        self.assertTrue(self.sr.st05_site_sem_post_gcp({"posts/modulo-01-recomendacao-gcp.html": "<p>x</p>"}))

    def test_link_aws_e_texto_sem_link_passam(self):
        site = {"projetos/x.html": '<a href="../posts/modulo-01-recomendacao.html">AWS</a><p>No Google Cloud, o desenho muda.</p>'}
        self.assertEqual(self.sr.st05_site_sem_post_gcp(site), [])


if __name__ == "__main__":
    unittest.main()
