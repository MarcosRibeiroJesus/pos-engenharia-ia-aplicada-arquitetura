"""Regras do T003 e do RF-006 no módulo observabilidade (T016; RF-006, Art. IV, Art. VI, ADR-0014).

O `entrega.tftest.hcl` confere cada recurso de entrega pelo nome. Este teste lê o plan em JSON do
módulo (`modules/observabilidade/tests/plan_json.tftest.hcl`, com mock e sem credencial) e confere
o que o HCL não alcança:

- todo `aws_cloudwatch_log_group` do módulo tem 7 dias e chave KMS, e nenhum é o `aws/spans`, que é
  da conta (`infra/conta`);
- há uma fonte `APPLICATION_LOGS` e uma `TRACES`, e um destino `XRAY`;
- nenhuma violação das regras transversais do T003 (`plano.violacoes`).
"""
from __future__ import annotations

import unittest
from pathlib import Path

from . import plano

AQUI = Path(__file__).resolve().parent
OBSERVABILIDADE = AQUI.parents[1] / "infra" / "terraform" / "modules" / "observabilidade"


class TestObservabilidadeNoPlan(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.doc = plano.documento_do_diretorio(OBSERVABILIDADE)

    def _criados(self, tipo: str) -> list[dict]:
        return [r["change"]["after"] for r in self.doc["plano"]["resource_changes"]
                if r.get("type") == tipo and "create" in r.get("change", {}).get("actions", [])]

    def test_grupos_com_retencao_e_chave_e_sem_spans(self):
        grupos = self._criados("aws_cloudwatch_log_group")
        self.assertEqual(len(grupos), 1, "o módulo cria só o grupo dos logs do gateway")
        for g in grupos:
            self.assertNotEqual(g["name"], "aws/spans", "o aws/spans é da conta (infra/conta)")
            self.assertEqual(g["retention_in_days"], 7, f"{g['name']}: retenção de 7 dias (RNF-002)")
            self.assertTrue(g.get("kms_key_id"), f"{g['name']}: cifrado com a chave (Art. IV)")
            self.assertNotEqual(g.get("skip_destroy"), True, f"{g['name']}: entra no destroy")

    def test_fontes_e_destino_xray(self):
        tipos = sorted(s["log_type"] for s in self._criados("aws_cloudwatch_log_delivery_source"))
        self.assertEqual(tipos, ["APPLICATION_LOGS", "TRACES"])
        destinos = [d.get("delivery_destination_type")
                    for d in self._criados("aws_cloudwatch_log_delivery_destination")]
        self.assertIn("XRAY", destinos)
        self.assertEqual(len(self._criados("aws_cloudwatch_log_delivery")), 2)

    def test_sem_violacoes_do_t003(self):
        self.assertEqual(plano.violacoes(self.doc), [])


if __name__ == "__main__":
    unittest.main()
