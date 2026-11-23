"""Teto diário da D01 (recomendação de e-commerce) igual nos três lugares: TH-06 e ST-K01 (T013).

TH-06 (RNF-102, Art. V, D-021): o padrão de teto_diario_usd no variables.tf do root, o valor citado
no README da unidade e o teto_diario_usd do harness/estado.json são o mesmo número. Mudar um só
reprova.
ST-K01 (D-022): nenhum aws_budgets_budget mensal no stack; o limite mensal da conta fica só no
infra/conta. Todo Budgets do stack é diário.
"""
import importlib.util
import json
import pathlib
import re
import unittest

RAIZ = pathlib.Path(__file__).resolve().parents[2]
CHAVE = "01-recomendacao"
UNIDADE = RAIZ / "modulos" / "01-fundamentos-ia-llms" / "unidades" / "03-recomendacao"
TF = UNIDADE / "infra" / "terraform"
STATIC_RULES = TF / "tests" / "static_rules.py"


def _carregar():
    spec = importlib.util.spec_from_file_location("static_rules_01_recomendacao_teto", STATIC_RULES)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)   # o módulo só verifica no __main__
    return mod


def _estado_teto() -> float:
    estado = json.loads((RAIZ / "harness" / "estado.json").read_text(encoding="utf-8"))
    projetos = estado["projetos"]
    projetos = projetos.values() if isinstance(projetos, dict) else projetos
    return next(p for p in projetos if p.get("chave") == CHAVE)["teto_diario_usd"]


class TestTH06TetoNosTresLugares(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sr = _carregar()
        cls.variables = (TF / "variables.tf").read_text(encoding="utf-8")
        cls.readme = (UNIDADE / "README.md").read_text(encoding="utf-8")
        cls.estado = _estado_teto()

    def test_repositorio_coincide(self):
        self.assertEqual(self.estado, 7.1, "teto aprovado pelo dono (D-056)")
        self.assertEqual(self.sr.th06_teto_nos_tres_lugares(self.variables, self.readme, self.estado), [])

    def test_variables_diferente_reprova(self):
        variables = re.sub(r"(default\s*=\s*)7\.1\b", r"\g<1>7.5", self.variables)
        self.assertNotEqual(variables, self.variables)
        self.assertTrue(self.sr.th06_teto_nos_tres_lugares(variables, self.readme, self.estado))

    def test_readme_diferente_reprova(self):
        readme = self.readme.replace("US$ 7,10", "US$ 7,50")
        self.assertNotEqual(readme, self.readme)
        self.assertTrue(self.sr.th06_teto_nos_tres_lugares(self.variables, readme, self.estado))

    def test_estado_diferente_reprova(self):
        self.assertTrue(self.sr.th06_teto_nos_tres_lugares(self.variables, self.readme, 6.5))

    def test_sem_teto_no_variables_reprova(self):
        self.assertTrue(self.sr.th06_teto_nos_tres_lugares('variable "x" {}', self.readme, self.estado))

    def test_sem_teto_no_readme_reprova(self):
        self.assertTrue(self.sr.th06_teto_nos_tres_lugares(self.variables, "# README", self.estado))


class TestSTK01SemBudgetsMensal(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sr = _carregar()

    def test_stack_do_repositorio_passa(self):
        textos = {str(p): p.read_text(encoding="utf-8") for p in TF.rglob("*.tf") if ".terraform" not in p.parts}
        self.assertEqual(self.sr.st_k01_budgets_diarios(textos), [])
        self.assertTrue(any("aws_budgets_budget" in t for t in textos.values()), "a regra precisa ter Budgets para checar")

    def test_budgets_mensal_reprova(self):
        tf = 'resource "aws_budgets_budget" "monthly" {\n  time_unit = "MONTHLY"\n}\n'
        self.assertTrue(self.sr.st_k01_budgets_diarios({"x.tf": tf}))

    def test_budgets_sem_time_unit_diario_reprova(self):
        tf = 'resource "aws_budgets_budget" "b" {\n  time_unit = var.periodo\n}\n'
        self.assertTrue(self.sr.st_k01_budgets_diarios({"x.tf": tf}))

    def test_budgets_diario_passa(self):
        tf = 'resource "aws_budgets_budget" "daily" {\n  time_unit = "DAILY"\n}\n'
        self.assertEqual(self.sr.st_k01_budgets_diarios({"x.tf": tf}), [])


if __name__ == "__main__":
    unittest.main()
