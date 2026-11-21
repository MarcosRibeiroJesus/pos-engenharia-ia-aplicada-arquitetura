"""Regras transversais de segurança e custo sobre o plan com mock (T003).

TT-S01 · nada público: nenhum Principal "*", nem com condição; valores de condição de conta sem
curinga (ADR-0014).
TT-S03 · menor privilégio: nenhuma declaração com ação "*" e recurso "*".
TT-S05 · sem credencial: nenhuma credencial em variável, output, tag ou parâmetro SSM.
TT-K02 · sem custo fixo ocioso: nada de NAT Gateway, endpoint de interface, cluster ou instância.
TT-K03 · conta única: nada de aws_organizations_* nem aws_controltower_*.
TT-O03 · alarme que pode disparar: alarme comum só sobre conjunto de dimensões publicado; sem ele,
alarme por consulta do Metrics Insights (ADR-0013, T017).

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
    # endurecimento de TT-S01 (ADR-0014): Principal "*" reprova mesmo com condição de conta, e
    # valor de condição de conta com curinga reprova qualquer que seja o principal
    "principal_publico_com_conta": ("TT-S01", "aws_sns_topic_policy.com_conta"),
    "condicao_conta_curinga": ("TT-S01", "aws_sns_topic_policy.conta_curinga"),
    "condicao_arn_curinga": ("TT-S01", "aws_sns_topic_policy.arn_curinga"),
    # T017 (ADR-0013, análise 1 A05): alarme comum sobre métrica sem conjunto de dimensões
    # publicado; o "verde" que nunca fica vermelho
    "alarme_comum_deny_decisions": ("TT-O03", "aws_cloudwatch_metric_alarm.negacoes"),
    # o mesmo alarme comum, escrito como metric_query.metric (revisão da T017, M1)
    "alarme_metric_query_deny_decisions": ("TT-O03", "aws_cloudwatch_metric_alarm.negacoes_por_query"),
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

    def test_lambda_permission_publica_com_conta_reprova(self):
        # ADR-0014: principal "*" reprova mesmo com source_account ou source_arn concretos
        for extra in ({"source_account": "111111111111"},
                      {"source_arn": "arn:aws:sns:us-east-1:111111111111:t"}):
            with self.subTest(extra=extra):
                doc = _doc([_recurso("aws_lambda_permission.p", {"principal": "*", **extra})])
                erros = plano.violacoes(doc)
                self.assertTrue([e for e in erros if "TT-S01" in e and "aws_lambda_permission.p" in e], erros)

    def test_lambda_permission_de_servico_com_curinga_reprova(self):
        for extra in ({"source_account": "*"}, {"source_account": "11111111111?"},
                      {"source_arn": "arn:aws:sns:us-east-1:*:t"}):
            with self.subTest(extra=extra):
                doc = _doc([_recurso("aws_lambda_permission.p",
                                     {"principal": "sns.amazonaws.com", **extra})])
                erros = plano.violacoes(doc)
                self.assertTrue([e for e in erros if "TT-S01" in e and "aws_lambda_permission.p" in e], erros)

    def test_lambda_permission_de_servico_com_conta_concreta_passa(self):
        doc = _doc([_recurso("aws_lambda_permission.p",
                             {"principal": "sns.amazonaws.com", "source_account": "111111111111",
                              "source_arn": "arn:aws:sns:us-east-1:111111111111:t"})])
        self.assertEqual(plano.violacoes(doc), [])

    def test_principal_publico_reprova_com_qualquer_condicao_de_conta(self):
        for operador, chave, valor in (("StringEquals", "aws:PrincipalAccount", "111111111111"),
                                       ("StringEquals", "aws:SourceAccount", "111111111111"),
                                       ("ArnEquals", "aws:SourceArn", "arn:aws:sns:us-east-1:111111111111:t"),
                                       ("StringEquals", "aws:ResourceAccount", "111111111111")):
            with self.subTest(chave=chave):
                pol = _politica({"Effect": "Allow", "Principal": "*", "Action": "sns:Publish",
                                 "Resource": "arn:aws:sns:us-east-1:111111111111:t",
                                 "Condition": {operador: {chave: valor}}})
                erros = plano.violacoes(_doc([_recurso("aws_sns_topic_policy.t", {"policy": pol})]))
                self.assertTrue([e for e in erros if "TT-S01" in e], erros)

    def test_valor_de_conta_com_curinga_reprova(self):
        casos = {
            "interrogacao": {"StringLike": {"aws:SourceAccount": "11111111111?"}},
            "lista": {"StringEquals": {"aws:SourceAccount": ["111111111111", "*"]}},
            "chave_minuscula": {"StringLike": {"aws:sourceowner": "*"}},
            "principal_arn": {"ArnLike": {"aws:PrincipalArn": "arn:aws:iam::*:role/x"}},
            "resource_account": {"StringLike": {"aws:ResourceAccount": "*"}},
            "principal_account_ifexists": {"StringLikeIfExists": {"aws:PrincipalAccount": "*"}},
        }
        for nome, condicao in casos.items():
            with self.subTest(caso=nome):
                pol = _politica({"Effect": "Allow", "Principal": {"Service": "events.amazonaws.com"},
                                 "Action": "sns:Publish", "Resource": "arn:aws:sns:us-east-1:111111111111:t",
                                 "Condition": condicao})
                erros = plano.violacoes(_doc([_recurso("aws_sns_topic_policy.t", {"policy": pol})]))
                self.assertTrue([e for e in erros if "TT-S01" in e and "aws_sns_topic_policy.t" in e], erros)

    def test_principal_explicito_com_conta_concreta_passa(self):
        pol = _politica({"Effect": "Allow", "Principal": {"AWS": "arn:aws:iam::111111111111:root"},
                         "Action": "sns:Publish", "Resource": "arn:aws:sns:us-east-1:111111111111:t",
                         "Condition": {"StringEquals": {"aws:PrincipalAccount": ["111111111111"]},
                                       "ArnEquals": {"aws:SourceArn": "arn:aws:cloudwatch:us-east-1:111111111111:alarm:a"}}})
        self.assertEqual(plano.violacoes(_doc([_recurso("aws_sns_topic_policy.t", {"policy": pol})])), [])

    def test_conforme_nao_tem_principal_curinga_em_allow(self):
        doc = plano.documento_da_fixture(FIXTURES / "conforme.json")
        for r in doc["plano"]["resource_changes"]:
            for _, pol in plano._politicas(r["change"]["after"] or {}):
                for d in plano._lista(pol.get("Statement")):
                    if d.get("Effect") == "Allow":
                        self.assertFalse(plano._principal_publico(d), (r["address"], d))

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

    def test_alarme_comum_no_namespace_do_agentcore_reprova(self):
        # TT-O03 (ADR-0013): nenhuma métrica do AgentCore tem conjunto de dimensões publicado e
        # registrado em plano.CONJUNTOS_PUBLICADOS, então qualquer conjunto reprova
        for dims in ({}, {"Mode": "ENFORCE"}, {"PolicyEngine": "p00_x", "Mode": "ENFORCE"},
                     {"Resource": "arn:aws:bedrock-agentcore:us-east-1:111111111111:gateway/g"}):
            with self.subTest(dimensoes=dims):
                r = _recurso("aws_cloudwatch_metric_alarm.a", {
                    "alarm_name": "00-plataforma-agentes-a", "namespace": "AWS/Bedrock-AgentCore",
                    "metric_name": "SystemErrors", "dimensions": dims, "metric_query": []})
                erros = plano.violacoes(_doc([r]))
                self.assertTrue([e for e in erros if "TT-O03" in e], erros)

    def test_alarme_comum_com_conjunto_publicado_passa(self):
        # Guardrails (T037): InvocationsIntervened com GuardrailArn e GuardrailVersion (plano)
        r = _recurso("aws_cloudwatch_metric_alarm.g", {
            "alarm_name": "00-plataforma-agentes-g", "namespace": "AWS/Bedrock/Guardrails",
            "metric_name": "InvocationsIntervened", "metric_query": [],
            "dimensions": {"GuardrailArn": "arn:aws:bedrock:us-east-1:111111111111:guardrail/x",
                           "GuardrailVersion": "1"}})
        self.assertEqual(plano.violacoes(_doc([r])), [])

    def test_alarme_comum_com_conjunto_diferente_do_publicado_reprova(self):
        r = _recurso("aws_cloudwatch_metric_alarm.g", {
            "alarm_name": "00-plataforma-agentes-g", "namespace": "AWS/Bedrock/Guardrails",
            "metric_name": "InvocationsIntervened", "metric_query": [],
            "dimensions": {"GuardrailArn": "arn:aws:bedrock:us-east-1:111111111111:guardrail/x"}})
        erros = plano.violacoes(_doc([r]))
        self.assertTrue([e for e in erros if "TT-O03" in e], erros)

    def test_metrica_dentro_do_metric_query_e_conferida(self):
        def alarme(metrica):
            return _recurso("aws_cloudwatch_metric_alarm.m", {
                "alarm_name": "00-plataforma-agentes-m", "metric_query": [
                    {"id": "e1", "expression": "m1 + 0", "return_data": True, "metric": []},
                    {"id": "m1", "return_data": False, "metric": [metrica]}]})
        agentcore = {"namespace": "AWS/Bedrock-AgentCore", "metric_name": "SystemErrors",
                     "dimensions": {"Resource": "g"}, "period": 300, "stat": "Sum"}
        erros = plano.violacoes(_doc([alarme(agentcore)]))
        self.assertTrue([e for e in erros if "TT-O03" in e and "metric_query[1]" in e], erros)
        guardrail = {"namespace": "AWS/Bedrock/Guardrails", "metric_name": "InvocationsIntervened",
                     "dimensions": {"GuardrailArn": "a", "GuardrailVersion": "1"},
                     "period": 300, "stat": "Sum"}
        self.assertEqual(plano.violacoes(_doc([alarme(guardrail)])), [])
        incompleto = dict(guardrail, dimensions={"GuardrailArn": "a"})
        self.assertTrue([e for e in plano.violacoes(_doc([alarme(incompleto)])) if "TT-O03" in e])

    def test_metric_name_desconhecido_reprova(self):
        # falha fechada: a regra não lê o nome, então não pode afirmar que o conjunto é o publicado
        topo = _recurso("aws_cloudwatch_metric_alarm.t", {"alarm_name": "00-plataforma-agentes-t",
                                                          "metric_query": []},
                        {"metric_name": True})
        aninhado = _recurso(
            "aws_cloudwatch_metric_alarm.n",
            {"alarm_name": "00-plataforma-agentes-n", "metric_query": [
                {"id": "m1", "return_data": True, "metric": [
                    {"namespace": "AWS/Bedrock/Guardrails", "period": 300, "stat": "Sum",
                     "dimensions": {"GuardrailArn": "a", "GuardrailVersion": "1"}}]}]},
            {"metric_query": [{"metric": [{"metric_name": True}]}]})
        for r in (topo, aninhado):
            with self.subTest(endereco=r["address"]):
                erros = plano.violacoes(_doc([r]))
                self.assertTrue([e for e in erros if "TT-O03" in e and r["address"] in e], erros)

    def test_alarme_por_consulta_passa(self):
        r = _recurso("aws_cloudwatch_metric_alarm.q", {
            "alarm_name": "00-plataforma-agentes-q", "metric_query": [{
                "id": "q1", "period": 300, "return_data": True, "metric": [],
                "expression": "SELECT SUM(DenyDecisions) FROM \"AWS/Bedrock-AgentCore\" "
                              "WHERE PolicyEngine = 'p00_x' AND Mode = 'ENFORCE'"}]})
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
