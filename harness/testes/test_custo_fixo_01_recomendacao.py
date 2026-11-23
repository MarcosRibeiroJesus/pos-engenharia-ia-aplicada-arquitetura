"""Custo fixo da base da D01 (recomendação de e-commerce): ST-07 do static_rules.py, com fixtures (T014).

ST-07 (RNF-002, Art. V): todo recurso cobrado por hora do root da base (endpoint de interface, ALB,
MemoryDB, serviço ECS) é citado num ADR da unidade, cada endpoint de interface pelo nome do serviço; e
a base não declara NAT Gateway nem MWAA (o MWAA vive na raiz da janela, ADR-0007). O TT-K02 do
tests/custo_fixo.tftest.hcl confere as quantidades no plan; o ST-07 confere o que o plan não vê: o
porquê escrito de cada custo fixo e os tipos declarados nos módulos que o root usa.
"""
import importlib.util
import pathlib
import unittest

RAIZ = pathlib.Path(__file__).resolve().parents[2]
TF = RAIZ / "modulos" / "01-fundamentos-ia-llms" / "unidades" / "03-recomendacao" / "infra" / "terraform"
STATIC_RULES = TF / "tests" / "static_rules.py"
BASE = ["ecr.api", "ecr.dkr", "logs", "sagemaker.runtime", "bedrock-runtime"]
ADRS = "| Endpoints | `aws_vpc_endpoint` |\n| ALB | `aws_lb` |\n| MemoryDB | `aws_memorydb_cluster` |\n" \
       "| ECS | `aws_ecs_service` |\n" + " ".join(f"`{s}`" for s in BASE)


def _carregar():
    spec = importlib.util.spec_from_file_location("static_rules_01_recomendacao_custo", STATIC_RULES)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)   # o módulo só verifica no __main__
    return mod


class TestST07CustoFixoCitado(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sr = _carregar()
        cls.tipos = {"aws_vpc_endpoint", "aws_lb", "aws_memorydb_cluster", "aws_ecs_service", "aws_s3_bucket"}

    def test_repositorio_passa(self):
        tipos = self.sr.tipos_do_root()
        self.assertIn("aws_lb", tipos, "a regra precisa ter o que checar")
        self.assertEqual(self.sr.st07_custo_fixo_citado(tipos, self.sr.servicos_de_interface_da_base(),
                                                        self.sr.texto_dos_adrs()), [])

    def test_base_tem_os_5_endpoints_sem_monitoring(self):
        self.assertEqual(sorted(self.sr.servicos_de_interface_da_base()), sorted(BASE))

    def test_root_nao_usa_o_modulo_do_mwaa(self):
        tipos = self.sr.tipos_do_root()
        self.assertNotIn("aws_mwaa_environment", tipos)
        self.assertNotIn("aws_nat_gateway", tipos)

    def test_fixture_valida_passa(self):
        self.assertEqual(self.sr.st07_custo_fixo_citado(self.tipos, BASE, ADRS), [])

    def test_alb_sem_adr_reprova(self):
        falhas = self.sr.st07_custo_fixo_citado(self.tipos, BASE, ADRS.replace("`aws_lb`", "ALB"))
        self.assertTrue(any("aws_lb" in f for f in falhas), falhas)

    def test_endpoint_sem_adr_reprova(self):
        falhas = self.sr.st07_custo_fixo_citado(self.tipos, BASE + ["kinesis-streams"], ADRS)
        self.assertTrue(any("kinesis-streams" in f for f in falhas), falhas)

    def test_mwaa_na_base_reprova_mesmo_citado(self):
        falhas = self.sr.st07_custo_fixo_citado(self.tipos | {"aws_mwaa_environment"}, BASE,
                                                ADRS + " `aws_mwaa_environment`")
        self.assertTrue(any("aws_mwaa_environment" in f for f in falhas), falhas)

    def test_nat_na_base_reprova_mesmo_citado(self):
        falhas = self.sr.st07_custo_fixo_citado(self.tipos | {"aws_nat_gateway"}, BASE, ADRS + " `aws_nat_gateway`")
        self.assertTrue(any("aws_nat_gateway" in f for f in falhas), falhas)

    def test_citacao_sem_crase_nao_conta(self):
        # Citação é o identificador entre crases, para "logs" solto no texto não contar como porquê.
        falhas = self.sr.st07_custo_fixo_citado(self.tipos, BASE, ADRS.replace("`logs`", "logs"))
        self.assertTrue(any("logs" in f for f in falhas), falhas)

    def test_tipos_do_root_ignoram_modulo_fora_do_main(self):
        tipos = self.sr.tipos_do_root_de(
            'module "a" {\n  source = "./modules/a"\n}\n',
            {"a": 'resource "aws_lb" "x" {\n}\n', "b": 'resource "aws_mwaa_environment" "y" {\n}\n'})
        self.assertEqual(tipos, {"aws_lb"})


if __name__ == "__main__":
    unittest.main()
