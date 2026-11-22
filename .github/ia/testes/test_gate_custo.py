"""Gate de FinOps: custo de um dia contra o teto diário do projeto (D-021) e o limite mensal da conta (D-022).
python3 -m unittest discover -s .github/ia/testes"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import gate_custo  # noqa: E402

ESTADO = {"projetos": [
    {"chave": "01-recomendacao", "pastas": ["modulos/01/unidades/03-recomendacao/"], "teto_diario_usd": 2.0},
    {"chave": "02-agendamento", "pastas": ["modulos/02/arquitetura/"], "teto_diario_usd": None},
]}


def infracost(caminho, mensal):
    return {"projects": [{"metadata": {"path": caminho}, "breakdown": {"totalMonthlyCost": str(mensal)}}]}


class TestGateCusto(unittest.TestCase):
    def test_converte_mensal_em_um_dia(self):
        self.assertAlmostEqual(gate_custo.diario(730), 24)

    def test_dentro_do_teto_diario_passa(self):
        _, _, bloqueios = gate_custo.avaliar(infracost("modulos/01/unidades/03-recomendacao/infra/terraform", 50), 20, ESTADO)
        self.assertEqual(bloqueios, [])  # US$ 50/mês = US$ 1,64/dia < US$ 2

    def test_acima_do_teto_diario_bloqueia(self):
        _, _, bloqueios = gate_custo.avaliar(infracost("modulos/01/unidades/03-recomendacao/infra/terraform", 100), 20, ESTADO)
        self.assertEqual(len(bloqueios), 1)  # US$ 3,29/dia > US$ 2

    def test_mensal_alto_nao_bloqueia_se_o_dia_cabe(self):
        # o motivo da mudança: MWAA ligado o mês todo passaria de US$ 20, mas um dia de demonstração não
        _, _, bloqueios = gate_custo.avaliar(infracost("modulos/01/unidades/03-recomendacao/infra/terraform", 60), 20, ESTADO)
        self.assertEqual(bloqueios, [])

    def test_teto_pendente_so_avisa(self):
        _, avisos, bloqueios = gate_custo.avaliar(infracost("modulos/02/arquitetura/infra/terraform", 100), 20, ESTADO)
        self.assertEqual((len(avisos), bloqueios), (1, []))

    def test_um_dia_acima_do_limite_mensal_da_conta_bloqueia_mesmo_sem_teto(self):
        _, _, bloqueios = gate_custo.avaliar(infracost("modulos/02/arquitetura/infra/terraform", 730), 20, ESTADO)
        self.assertEqual(len(bloqueios), 1)  # US$ 24 num dia > US$ 20 no mês

    def test_diretorio_fora_de_projeto_usa_so_o_limite_da_conta(self):
        linhas, avisos, bloqueios = gate_custo.avaliar(infracost("infra/conta", 1), 20, ESTADO)
        self.assertEqual((bloqueios, len(avisos)), ([], 1))
        self.assertIn("infra/conta", linhas[0])


if __name__ == "__main__":
    unittest.main()
