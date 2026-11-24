"""TT-G02 e regras do T003 no módulo gateway (T013; RF-001, Art. IV, ADR-0014).

O `gateway.tftest.hcl` confere os atributos do gateway como instância única. Este teste lê o plan
em JSON do módulo (`modules/gateway/tests/plan_json.tftest.hcl`, com mock e sem credencial) e
confere o que o HCL não alcança:

- exatamente um `aws_bedrockagentcore_gateway` no plan do módulo, qualquer que seja o nome (TT-G02);
- nenhuma violação das regras transversais do T003 (`plano.violacoes`): Principal curinga, ação e
  recurso curinga juntos, política desconhecida no plan, credencial no valor, custo fixo.

Quando a T020 ligar o módulo no root, o root passa a ser coberto também pelo T003.
"""
from __future__ import annotations

import unittest
from pathlib import Path

from . import plano

AQUI = Path(__file__).resolve().parent
GATEWAY = AQUI.parents[1] / "infra" / "terraform" / "modules" / "gateway"


class TestGatewayNoPlan(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.doc = plano.documento_do_diretorio(GATEWAY)

    def _criados(self, tipo: str) -> list[str]:
        return [r["address"] for r in self.doc["plano"]["resource_changes"]
                if r.get("type") == tipo and "create" in r.get("change", {}).get("actions", [])]

    def test_exatamente_um_gateway(self):
        gateways = self._criados("aws_bedrockagentcore_gateway")
        self.assertEqual(len(gateways), 1, f"TT-G02: esperado um gateway, plan tem {gateways}")

    def test_sem_violacoes_do_t003(self):
        self.assertEqual(plano.violacoes(self.doc), [])


if __name__ == "__main__":
    unittest.main()
