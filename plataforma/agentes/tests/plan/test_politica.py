"""Regras do T003 no módulo politica (T015; RF-002, Art. IV, ADR-0014).

O `politica.tftest.hcl` confere o motor como instância única. Este teste lê o plan em JSON do
módulo (`modules/politica/tests/plan_json.tftest.hcl`, com mock e sem credencial) e confere:

- exatamente um `aws_bedrockagentcore_policy_engine` no plan do módulo;
- nenhuma `aws_bedrockagentcore_policy` no módulo: os `permit` são de cada produto (RF-002), e a
  role de fumaça não pode ganhar nenhum (T014);
- nenhuma violação das regras transversais do T003 (`plano.violacoes`).
"""
from __future__ import annotations

import unittest
from pathlib import Path

from . import plano

AQUI = Path(__file__).resolve().parent
POLITICA = AQUI.parents[1] / "infra" / "terraform" / "modules" / "politica"


class TestPoliticaNoPlan(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.doc = plano.documento_do_diretorio(POLITICA)

    def _criados(self, tipo: str) -> list[str]:
        return [r["address"] for r in self.doc["plano"]["resource_changes"]
                if r.get("type") == tipo and "create" in r.get("change", {}).get("actions", [])]

    def test_exatamente_um_motor(self):
        motores = self._criados("aws_bedrockagentcore_policy_engine")
        self.assertEqual(len(motores), 1, f"esperado um motor, plan tem {motores}")

    def test_nenhuma_politica_cedar_na_plataforma(self):
        self.assertEqual(self._criados("aws_bedrockagentcore_policy"), [])

    def test_sem_violacoes_do_t003(self):
        self.assertEqual(plano.violacoes(self.doc), [])


if __name__ == "__main__":
    unittest.main()
