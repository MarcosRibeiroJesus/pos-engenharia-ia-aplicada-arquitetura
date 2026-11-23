"""Nomes e tags da D01 (recomendação de e-commerce): ST-04, ST-T01 e ST-T02 do static_rules.py, com fixtures.

ST-04 (RNF-108, ADR-0014): toda exceção de nome tem motivo, fonte e ADR.
ST-T01 (RNF-107, achado A1 da revisão da T011): todo recurso com tags usa local.tags e aparece no
output tags_dos_recursos do módulo.
ST-T02 (RNF-108, achado A1 da revisão da T012): todo recurso nomeado aparece no output
nomes_dos_recursos do módulo, para o TT-T02 não deixar recurso esquecido de fora.
"""
import importlib.util
import json
import pathlib
import unittest

RAIZ = pathlib.Path(__file__).resolve().parents[2]
TF = RAIZ / "modulos" / "01-fundamentos-ia-llms" / "unidades" / "03-recomendacao" / "infra" / "terraform"
STATIC_RULES = TF / "tests" / "static_rules.py"
EXCECOES = TF / "tests" / "excecoes_de_nome.json"


def _carregar():
    spec = importlib.util.spec_from_file_location("static_rules_01_recomendacao_nomes", STATIC_RULES)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)   # o módulo só verifica no __main__
    return mod


def _excecao(**mudancas):
    base = {"id": "fixture", "recurso": "aws_memorydb_cluster", "padrao": "^p01-recomendacao-",
            "motivo": "começa por letra", "fonte": "https://docs.aws.amazon.com/x", "adr": "ADR-0014"}
    base.update(mudancas)
    return {"prefixo": "01-recomendacao-", "excecoes": [base]}


class TestST04ExcecoesDeNome(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sr = _carregar()
        cls.adrs = cls.sr.adrs_existentes()

    def test_lista_do_repositorio_passa(self):
        dados = json.loads(EXCECOES.read_text(encoding="utf-8"))
        self.assertEqual(self.sr.st04_excecoes_de_nome(dados, self.adrs), [])
        self.assertTrue(dados["excecoes"], "a regra precisa ter exceções para checar")

    def test_fixture_valida_passa(self):
        self.assertEqual(self.sr.st04_excecoes_de_nome(_excecao(), self.adrs), [])

    def test_sem_motivo_reprova(self):
        dados = _excecao()
        del dados["excecoes"][0]["motivo"]
        self.assertTrue(self.sr.st04_excecoes_de_nome(dados, self.adrs))

    def test_sem_fonte_reprova(self):
        self.assertTrue(self.sr.st04_excecoes_de_nome(_excecao(fonte=""), self.adrs))

    def test_sem_adr_reprova(self):
        self.assertTrue(self.sr.st04_excecoes_de_nome(_excecao(adr=""), self.adrs))

    def test_adr_inexistente_reprova(self):
        self.assertTrue(self.sr.st04_excecoes_de_nome(_excecao(adr="ADR-9999"), self.adrs))

    def test_padrao_curinga_reprova(self):
        self.assertTrue(self.sr.st04_excecoes_de_nome(_excecao(padrao=".*"), self.adrs))

    def test_padrao_sem_ancora_reprova(self):
        self.assertTrue(self.sr.st04_excecoes_de_nome(_excecao(padrao="p01-recomendacao-"), self.adrs))

    def test_excecao_sem_tipo_de_recurso_reprova(self):
        self.assertTrue(self.sr.st04_excecoes_de_nome(_excecao(recurso="*"), self.adrs))

    def test_prefixo_de_outro_projeto_reprova(self):
        dados = _excecao()
        dados["prefixo"] = "recsys-"
        self.assertTrue(self.sr.st04_excecoes_de_nome(dados, self.adrs))

    def test_verificado_sem_link_reprova(self):
        dados = _excecao()
        dados["verificados_sem_excecao"] = [{"recurso": "aws_memorydb_subnet_group", "fonte": "validador do provider"}]
        self.assertTrue(self.sr.st04_excecoes_de_nome(dados, self.adrs))

    def test_subnet_e_parameter_group_do_memorydb_na_lista(self):
        """Revisão da T012: o validador do provider não prova a regra da letra inicial."""
        dados = json.loads(EXCECOES.read_text(encoding="utf-8"))
        tipos = {e["recurso"] for e in dados["excecoes"]}
        self.assertLessEqual({"aws_memorydb_cluster", "aws_memorydb_subnet_group", "aws_memorydb_parameter_group"}, tipos)


MAIN_OK = '''
resource "aws_sns_topic" "alerts" {
  name = "x"
  tags = local.tags
}

resource "aws_lb" "alb" {
  name = "y"
  tags = merge(local.tags, {
    Name = "y"
  })
}
'''
OUT_OK = '''
output "tags_dos_recursos" {
  value = merge(
    { "aws_sns_topic.alerts" = aws_sns_topic.alerts.tags },
    { for i, r in aws_lb.alb : "aws_lb.alb[${i}]" => r.tags },
  )
}
'''


class TestST_T01TagsDosModulos(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sr = _carregar()

    def test_modulos_do_repositorio_passam(self):
        modulos = self.sr.modulos_do_stack()
        self.assertEqual(self.sr.st_t01_tags_dos_modulos(modulos), [])
        com_tags = sum(1 for m in modulos.values() for _, _, corpo in self.sr.blocos_de_recurso(m["main"])
                       if "\n  tags" in corpo)
        self.assertGreater(com_tags, 30, "a regra precisa enxergar os recursos com tags dos 13 módulos")

    def test_fixture_valida_passa(self):
        self.assertEqual(self.sr.st_t01_tags_dos_modulos({"m": {"main": MAIN_OK, "outputs": OUT_OK}}), [])

    def test_tags_sem_local_tags_reprova(self):
        main = MAIN_OK.replace("  tags = local.tags", '  tags = { module = "outro" }')
        self.assertTrue(self.sr.st_t01_tags_dos_modulos({"m": {"main": main, "outputs": OUT_OK}}))

    def test_recurso_fora_de_tags_dos_recursos_reprova(self):
        out = OUT_OK.replace('    { "aws_sns_topic.alerts" = aws_sns_topic.alerts.tags },\n', "")
        self.assertTrue(self.sr.st_t01_tags_dos_modulos({"m": {"main": MAIN_OK, "outputs": out}}))

    def test_sem_output_tags_dos_recursos_reprova(self):
        self.assertTrue(self.sr.st_t01_tags_dos_modulos({"m": {"main": MAIN_OK, "outputs": ""}}))



MAIN_NOMES = '''
resource "aws_glue_catalog_table" "interactions" {
  name          = "p01_recomendacao_lab_interactions"
  database_name = aws_glue_catalog_database.db.name
}

resource "aws_iam_role_policy" "inline" {
  name = "write-logs"
  role = aws_iam_role.r.id
}

resource "aws_s3_bucket_policy" "tls" {
  bucket = aws_s3_bucket.b.id
}

resource "aws_s3_object" "script" {
  bucket = var.s3_bucket_name
  key    = "scripts/x.py"
}
'''
OUT_NOMES = '''
output "nomes_dos_recursos" {
  value = merge(
    { "aws_glue_catalog_table.interactions" = aws_glue_catalog_table.interactions.name },
  )
}
'''
ESCAPOU = '''
resource "aws_glue_catalog_table" "recsys_escapou" {
  name          = "recsys_escapou"
  database_name = aws_glue_catalog_database.db.name
}
'''


class TestST_T02NomesDosModulos(unittest.TestCase):
    """ST-T02: todo recurso nomeado aparece em nomes_dos_recursos (revisão da T012, achado A1)."""

    @classmethod
    def setUpClass(cls):
        cls.sr = _carregar()

    def test_modulos_do_repositorio_passam(self):
        modulos = self.sr.modulos_do_stack()
        self.assertEqual(self.sr.st_t02_nomes_dos_modulos(modulos), [])
        vazios = {m: {"main": t["main"], "outputs": ""} for m, t in modulos.items()}
        self.assertGreaterEqual(len(self.sr.st_t02_nomes_dos_modulos(vazios)), 40,
                                "a regra precisa enxergar os recursos nomeados dos 13 módulos")

    def test_fixture_valida_passa(self):
        """Policy inline, referência a outro recurso e bucket de destino do objeto ficam fora."""
        self.assertEqual(self.sr.st_t02_nomes_dos_modulos({"m": {"main": MAIN_NOMES, "outputs": OUT_NOMES}}), [])

    def test_tabela_do_glue_fora_do_output_reprova(self):
        """Mutação do revisor: recurso sem tags e fora do output escapava do TT-T02."""
        falhas = self.sr.st_t02_nomes_dos_modulos({"m": {"main": MAIN_NOMES + ESCAPOU, "outputs": OUT_NOMES}})
        self.assertEqual(len(falhas), 1)
        self.assertIn("recsys_escapou", falhas[0])

    def test_sem_output_nomes_dos_recursos_reprova(self):
        self.assertTrue(self.sr.st_t02_nomes_dos_modulos({"m": {"main": MAIN_NOMES, "outputs": ""}}))

    def test_nome_vindo_de_variavel_conta(self):
        main = 'resource "aws_glue_catalog_database" "db" {\n  name = var.database_name\n}\n'
        self.assertTrue(self.sr.st_t02_nomes_dos_modulos({"m": {"main": main, "outputs": OUT_NOMES}}))


if __name__ == "__main__":
    unittest.main()
