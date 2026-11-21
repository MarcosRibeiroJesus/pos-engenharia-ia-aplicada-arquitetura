"""TT-P01 · o root real compõe o gateway com o motor de política em ENFORCE (T015; RF-002,
ADR-0005, ADR-0011).

O `motor_politica_arn` do módulo `gateway` é anulável (ADR-0011), para o root do Floci compor o
gateway sem o motor. A proteção do root real fica num teste de composição, não no tipo da
variável. Ela tem duas partes:

- `infra/terraform/tests/composicao.tftest.hcl`: asserts sobre os outputs dos módulos;
- esta regra, sobre o plan em JSON do root (`tests/plan_json.tftest.hcl`, mock sem credencial):
  exatamente um gateway e um motor no plan, o motor dentro de `module.politica`, e o gateway com
  um `policy_engine_configuration` em `ENFORCE` cujo ARN é o do motor.

O vermelho é a fixture `fixtures/composicao/sem_motor.json`, gerada do plan com mock de uma cópia
do root em que a única mudança é `motor_politica_arn = null` no `module "gateway"`: ela precisa
reprovar. A `conforme.json` foi gerada do root do T015 sem mudança (controle positivo). As duas
guardam só o gateway e o motor, os únicos recursos que a regra lê; o root inteiro passa pelo
`TestRootReal` e pelas regras do T003 (`test_regras_plan.py`).

O aceite "o modo nunca é input de workflow" (ADR-0005) também é conferido aqui: nenhum workflow
declara `modo_politica` ou `calibracao` como input, e o `terraform.tfvars.example` não os cita.
O TH-05 (o apply recusa `TF_VAR_modo_politica=LOG_ONLY`) é outra tarefa.
"""
from __future__ import annotations

import re
import unittest
from pathlib import Path

from . import plano

AQUI = Path(__file__).resolve().parent
FIXTURES = AQUI / "fixtures" / "composicao"
ROOT = AQUI.parents[1] / "infra" / "terraform"
REPO = AQUI.parents[3]
WORKFLOWS = REPO / ".github" / "workflows"


def _criados(doc: dict, tipo: str) -> list[dict]:
    return [r for r in (doc.get("plano") or {}).get("resource_changes") or []
            if r.get("type") == tipo and r.get("mode") == "managed"
            and "create" in (r.get("change") or {}).get("actions", [])]


def violacoes_tt_p01(doc: dict) -> list[str]:
    """Violações do TT-P01 no plan do root real; lista vazia quando conforme."""
    gateways = _criados(doc, "aws_bedrockagentcore_gateway")
    motores = _criados(doc, "aws_bedrockagentcore_policy_engine")
    if len(gateways) != 1:
        return [f"TT-P01: esperado um aws_bedrockagentcore_gateway no root, plan tem "
                f"{[g['address'] for g in gateways]}"]
    if len(motores) != 1:
        return [f"TT-P01: esperado um aws_bedrockagentcore_policy_engine no root, plan tem "
                f"{[m['address'] for m in motores]}"]
    gateway, motor = gateways[0], motores[0]
    erros = []
    if not motor["address"].startswith("module.politica."):
        erros.append(f"TT-P01: o motor {motor['address']} não é do module.politica (ADR-0011)")
    arn_motor = (motor["change"].get("after") or {}).get("policy_engine_arn")
    if not arn_motor:
        erros.append(f"TT-P01: o ARN do motor {motor['address']} está desconhecido no plan; dê o "
                     "policy_engine_arn ao mock_resource no tests/plan_json.tftest.hcl")
    after = gateway["change"].get("after") or {}
    desconhecido = gateway["change"].get("after_unknown") or {}
    blocos = after.get("policy_engine_configuration") or []
    if len(blocos) != 1:
        erros.append(f"TT-P01 {gateway['address']}: {len(blocos)} policy_engine_configuration; o "
                     "root real passa o motor do module.politica ao gateway (ADR-0011)")
        return erros
    bloco = blocos[0]
    if bloco.get("mode") != "ENFORCE":
        erros.append(f"TT-P01 {gateway['address']}: mode = {bloco.get('mode')!r}; o padrão é "
                     "ENFORCE (RF-002, ADR-0005)")
    pec_desconhecido = desconhecido.get("policy_engine_configuration")
    arn_desconhecido = pec_desconhecido is True or (
        isinstance(pec_desconhecido, list) and pec_desconhecido
        and isinstance(pec_desconhecido[0], dict) and pec_desconhecido[0].get("arn") is True)
    if arn_desconhecido or not bloco.get("arn"):
        erros.append(f"TT-P01 {gateway['address']}: ARN do motor desconhecido no plan")
    elif arn_motor and bloco.get("arn") != arn_motor:
        erros.append(f"TT-P01 {gateway['address']}: o ARN do motor no gateway não é o do "
                     f"{motor['address']} (ADR-0011)")
    return erros


class TestRegraTTP01(unittest.TestCase):
    def test_fixture_conforme_passa(self):
        doc = plano.documento_da_fixture(FIXTURES / "conforme.json")
        self.assertEqual(violacoes_tt_p01(doc), [])

    def test_fixture_de_root_com_motor_nulo_reprova(self):
        doc = plano.documento_da_fixture(FIXTURES / "sem_motor.json")
        erros = violacoes_tt_p01(doc)
        self.assertTrue(erros, "TT-P01: o root que passa motor_politica_arn = null precisa reprovar")
        self.assertTrue(any("module.gateway.aws_bedrockagentcore_gateway.plataforma" in e
                            and "policy_engine_configuration" in e for e in erros), erros)

    def test_modo_log_only_reprova(self):
        doc = plano.documento_da_fixture(FIXTURES / "conforme.json")
        for r in _criados(doc, "aws_bedrockagentcore_gateway"):
            r["change"]["after"]["policy_engine_configuration"][0]["mode"] = "LOG_ONLY"
        self.assertTrue(any("ENFORCE" in e for e in violacoes_tt_p01(doc)))

    def test_arn_de_outro_motor_reprova(self):
        doc = plano.documento_da_fixture(FIXTURES / "conforme.json")
        for r in _criados(doc, "aws_bedrockagentcore_gateway"):
            r["change"]["after"]["policy_engine_configuration"][0]["arn"] = (
                "arn:aws:bedrock-agentcore:us-east-1:111111111111:policy-engine/outro")
        self.assertTrue(any("não é o do" in e for e in violacoes_tt_p01(doc)))

    def test_sem_nada_para_checar_reprova(self):
        # Regra que passa sem nada para checar não conta como teste.
        self.assertTrue(violacoes_tt_p01({"plano": {"resource_changes": []}}))


class TestRootReal(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.doc = plano.documento_do_diretorio(ROOT)

    def test_root_cumpre_tt_p01(self):
        self.assertEqual(violacoes_tt_p01(self.doc), [])


class TestModoNuncaEInputDeWorkflow(unittest.TestCase):
    """ADR-0005: modo escolhido por input do workflow abre a chance de demonstrar sem bloqueio."""

    INPUT = re.compile(r"(?m)^\s+(modo_politica|calibracao)\s*:\s*$")

    def test_nenhum_workflow_declara_o_modo_como_input(self):
        achados = [f"{w.name}: {m.group(1)}"
                   for w in sorted(WORKFLOWS.glob("*.y*ml"))
                   for m in self.INPUT.finditer(w.read_text(encoding="utf-8"))]
        self.assertEqual(achados, [])

    def test_tfvars_de_exemplo_nao_cita_o_modo(self):
        texto = (ROOT / "terraform.tfvars.example").read_text(encoding="utf-8")
        self.assertNotRegex(texto, r"(?m)^\s*#?\s*(modo_politica|calibracao)\s*=")


if __name__ == "__main__":
    unittest.main()
