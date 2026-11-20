"""Regras transversais de segurança e custo sobre o plan com mock (T003).

TT-S01 · nada público: nenhuma política de recurso com Principal "*" sem condição de conta.
TT-S03 · menor privilégio: nenhuma declaração com ação "*" e recurso "*".
TT-S05 · sem credencial: nenhuma credencial em variável, output, tag ou parâmetro SSM.
TT-K02 · sem custo fixo ocioso: nada de NAT Gateway, endpoint de interface, cluster ou instância.
TT-K03 · conta única: nada de aws_organizations_* nem aws_controltower_*.

Cada fixture de `fixtures/` viola uma regra e foi gerada do plan com mock de um root sintético;
a `conforme.json` é o controle positivo. O root do T001 roda pelo terraform test com mock, sem
credencial da AWS. O módulo registro-produto entra aqui na T030 (análise 1, A14).
"""
from __future__ import annotations

import copy
import json
import unittest
from pathlib import Path

from . import plano

AQUI = Path(__file__).resolve().parent
FIXTURES = AQUI / "fixtures"
ROOT = AQUI.parents[1] / "infra" / "terraform"

# fixture -> (regra, endereço que a mensagem tem de citar)
VIOLADORAS = {
    "principal_publico": ("TT-S01", "aws_sns_topic_policy.aberta"),
    "acao_e_recurso_curinga": ("TT-S03", "aws_iam_role_policy.tudo"),
    "credencial_variavel": ("TT-S05", "var.senha_do_alvo"),
    "credencial_output": ("TT-S05", "output.token_de_acesso"),
    "credencial_tag": ("TT-S05", "aws_sns_topic.alarmes"),
    "credencial_ssm": ("TT-S05", "aws_ssm_parameter.alvo"),
    "nat_gateway": ("TT-K02", "aws_nat_gateway.saida"),
    "endpoint_interface": ("TT-K02", "aws_vpc_endpoint.bedrock"),
    "organizations_account": ("TT-K03", "aws_organizations_account.lab"),
    "politica_desconhecida": ("TT-S01", "aws_sns_topic_policy.sem_mock"),
}

# valores com formato de credencial montados em tempo de execução, para nenhum segredo de mentira
# entrar no repositório nem disparar o gitleaks
CHAVE_AWS = "AK" + "IA" + "Z" * 16
CHAVE_PRIVADA = "-----BEGIN " + "RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----"
CHAVE_ANTHROPIC = "sk-" + "ant-" + "x" * 24


def _recurso(endereco: str, after: dict, unknown: dict | None = None) -> dict:
    tipo, nome = endereco.split(".")[-2:]
    return {"address": endereco, "mode": "managed", "type": tipo, "name": nome,
            "change": {"actions": ["create"], "after": after, "after_unknown": unknown or {}}}


def _doc(recursos=(), outputs=None, variaveis=None) -> dict:
    return {"variaveis": variaveis or {},
            "plano": {"resource_changes": list(recursos), "output_changes": outputs or {}}}


def _politica(*declaracoes) -> str:
    return json.dumps({"Version": "2012-10-17", "Statement": list(declaracoes)})


class TestFixturesReprovam(unittest.TestCase):
    """Vermelho: cada fixture viola uma regra e a mensagem cita o recurso."""

    def test_toda_fixture_tem_expectativa(self):
        arquivos = {p.stem for p in FIXTURES.glob("*.json")}
        self.assertEqual(arquivos, set(VIOLADORAS) | {"conforme"},
                         "fixture sem expectativa no teste, ou expectativa sem fixture")

    def test_fixtures_violadoras_reprovam_citando_o_recurso(self):
        for nome, (regra, endereco) in VIOLADORAS.items():
            with self.subTest(fixture=nome):
                erros = plano.violacoes(plano.documento_da_fixture(FIXTURES / f"{nome}.json"))
                citam = [e for e in erros if endereco in e and regra in e]
                self.assertTrue(citam, f"{nome}: esperava {regra} citando {endereco}; veio {erros}")

    def test_fixture_conforme_passa(self):
        doc = plano.documento_da_fixture(FIXTURES / "conforme.json")
        # o controle positivo precisa ter o que checar: política, endpoint, SSM e output
        self.assertGreaterEqual(len(doc["plano"]["resource_changes"]), 5)
        self.assertEqual(plano.violacoes(doc), [])


class TestDetalhesDasRegras(unittest.TestCase):
    """Casos que as fixtures não cobrem, para a regra não ser larga nem estreita demais."""

    def test_principal_publico_com_condicao_ifexists_reprova(self):
        pol = _politica({"Effect": "Allow", "Principal": {"AWS": ["*"]}, "Action": "sqs:SendMessage",
                         "Resource": "arn:aws:sqs:us-east-1:111111111111:fila",
                         "Condition": {"StringEqualsIfExists": {"aws:SourceAccount": "111111111111"}}})
        erros = plano.violacoes(_doc([_recurso("aws_sqs_queue_policy.fila", {"policy": pol})]))
        self.assertTrue([e for e in erros if "TT-S01" in e and "aws_sqs_queue_policy.fila" in e], erros)

    def test_not_principal_em_allow_reprova(self):
        pol = _politica({"Effect": "Allow", "NotPrincipal": {"AWS": "arn:aws:iam::111111111111:root"},
                         "Action": "s3:GetObject", "Resource": "arn:aws:s3:::b/*"})
        erros = plano.violacoes(_doc([_recurso("aws_s3_bucket_policy.b", {"policy": pol})]))
        self.assertTrue([e for e in erros if "TT-S01" in e], erros)

    def test_lambda_permission_publica_reprova(self):
        erros = plano.violacoes(_doc([_recurso("aws_lambda_permission.p",
                                               {"principal": "*", "action": "lambda:InvokeFunction"})]))
        self.assertTrue([e for e in erros if "TT-S01" in e and "aws_lambda_permission.p" in e], erros)

    def test_lambda_permission_com_conta_passa(self):
        doc = _doc([_recurso("aws_lambda_permission.p", {"principal": "*", "source_account": "111111111111"})])
        self.assertEqual(plano.violacoes(doc), [])

    def test_not_action_com_recurso_curinga_reprova(self):
        pol = _politica({"Effect": "Allow", "NotAction": "iam:*", "Resource": ["*"]})
        erros = plano.violacoes(_doc([_recurso("aws_iam_policy.larga", {"policy": pol})]))
        self.assertTrue([e for e in erros if "TT-S03" in e and "aws_iam_policy.larga" in e], erros)

    def test_acao_curinga_de_servico_e_deny_passam(self):
        pol = _politica({"Effect": "Allow", "Action": "logs:*", "Resource": "*"},
                        {"Effect": "Deny", "Action": "*", "Resource": "*",
                         "Condition": {"Bool": {"aws:SecureTransport": "false"}}})
        self.assertEqual(plano.violacoes(_doc([_recurso("aws_iam_policy.ok", {"policy": pol})])), [])

    def test_politica_inline_da_role_e_lida(self):
        pol = _politica({"Effect": "Allow", "Action": ["*:*"], "Resource": "*"})
        erros = plano.violacoes(_doc([_recurso("module.nucleo.aws_iam_role.r",
                                               {"inline_policy": [{"name": "x", "policy": pol}]})]))
        self.assertTrue([e for e in erros if "TT-S03" in e and "module.nucleo.aws_iam_role.r" in e], erros)

    def test_assume_role_desconhecida_reprova(self):
        erros = plano.violacoes(_doc([_recurso("aws_iam_role.r", {}, {"assume_role_policy": True})]))
        self.assertTrue([e for e in erros if "aws_iam_role.r" in e], erros)

    def test_credencial_pelo_valor(self):
        casos = {
            "tag": _doc([_recurso("aws_sns_topic.t", {"tags": {"dono": CHAVE_AWS}})]),
            "output": _doc(outputs={"chave": {"after": {"pem": CHAVE_PRIVADA}}}),
            "variavel": _doc(variaveis={"modelo": {"default": CHAVE_ANTHROPIC, "sensitive": False}}),
            "ssm": _doc([_recurso("aws_ssm_parameter.p", {"name": "/x/contrato/v1", "type": "String",
                                                          "value": json.dumps({"k": CHAVE_AWS})})]),
        }
        for onde, doc in casos.items():
            with self.subTest(onde=onde):
                erros = plano.violacoes(doc)
                self.assertTrue([e for e in erros if "TT-S05" in e], erros)
                # a mensagem nunca repete o valor da credencial
                for e in erros:
                    for valor in (CHAVE_AWS, CHAVE_PRIVADA, CHAVE_ANTHROPIC):
                        self.assertNotIn(valor, e)

    def test_clusters_e_instancias_reprovam(self):
        for tipo in ("aws_instance", "aws_eks_cluster", "aws_rds_cluster", "aws_db_instance"):
            with self.subTest(tipo=tipo):
                erros = plano.violacoes(_doc([_recurso(f"{tipo}.x", {})]))
                self.assertTrue([e for e in erros if "TT-K02" in e and f"{tipo}.x" in e], erros)

    def test_control_tower_reprova(self):
        erros = plano.violacoes(_doc([_recurso("aws_controltower_control.c", {})]))
        self.assertTrue([e for e in erros if "TT-K03" in e], erros)

    def test_recurso_destruido_nao_conta(self):
        r = _recurso("aws_nat_gateway.velho", {})
        r["change"]["actions"] = ["delete"]
        r["change"]["after"] = None
        self.assertEqual(plano.violacoes(_doc([r])), [])

    def test_fixture_nao_e_alterada(self):
        doc = plano.documento_da_fixture(FIXTURES / "principal_publico.json")
        antes = copy.deepcopy(doc)
        plano.violacoes(doc)
        self.assertEqual(doc, antes)


class TestRootDoStack(unittest.TestCase):
    """O root do T001 passa, lido do plan com mock (terraform test -json -verbose)."""

    @classmethod
    def setUpClass(cls):
        cls.doc = plano.documento_do_diretorio(ROOT)

    def test_plan_do_root_foi_lido(self):
        # regra que passa sem nada para checar não conta: o root do T001 tem os outputs de tags
        self.assertIn("tags_padrao", self.doc["plano"]["output_changes"])
        self.assertIn("regiao", self.doc["variaveis"])

    def test_root_sem_violacao(self):
        self.assertEqual(plano.violacoes(self.doc), [])


if __name__ == "__main__":
    unittest.main()
