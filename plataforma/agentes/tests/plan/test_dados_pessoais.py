"""TT-S06 · dado pessoal fora de log público (T011; Art. VIII, ADR-0008, análise 1 A06).

O repositório é público, e os logs do Actions também. Um e-mail que o plan não marca como sensível
sai impresso no `terraform plan` e no `terraform apply` do CI. A regra lê o plan em JSON (o mesmo
formato do `terraform show -json`) e reprova:

- `aws_sns_topic_subscription` cujo `after_sensitive.endpoint` não seja `true`;
- output não sensível com endereço de e-mail no valor.

A T012 estende a regra aos destinatários das notificações do `aws_budgets_budget`.

As fixtures de `fixtures/dados_pessoais/` foram geradas do plan com mock de roots sintéticos, com
e-mails do domínio reservado `example.com`:

- `conforme`: `count = nonsensitive(length(split(...)))` e `endpoint = split(...)[count.index]`
  sobre o `value` sensível do parâmetro (o padrão do ADR-0008);
- `insecure_value`: o mesmo, lendo o atributo não sensível `insecure_value`;
- `nonsensitive_lista`: `nonsensitive()` em volta da lista, e não só da contagem;
- `output_com_emails`: assinaturas conformes, mas um output devolve a lista sem o sensível.

O módulo `nucleo` é lido pelo plan com mock (`modules/nucleo/tests/plan_json.tftest.hcl`), sem
credencial da AWS. Quando a T020 ligar o módulo no root, o root passa a ser coberto pelo T003.
"""
from __future__ import annotations

import re
import unittest
from pathlib import Path

from . import plano

AQUI = Path(__file__).resolve().parent
FIXTURES = AQUI / "fixtures" / "dados_pessoais"
NUCLEO = AQUI.parents[1] / "infra" / "terraform" / "modules" / "nucleo"

EMAIL = re.compile(r"[^@\s\"',]+@[^@\s\"',]+\.[A-Za-z]{2,}")

# fixture -> endereços que a mensagem tem de citar
VIOLADORAS = {
    "insecure_value": ["aws_sns_topic_subscription.alarmes[0]", "aws_sns_topic_subscription.alarmes[1]"],
    "nonsensitive_lista": ["aws_sns_topic_subscription.alarmes[0]", "aws_sns_topic_subscription.alarmes[1]"],
    "output_com_emails": ["output.destinos_dos_alarmes"],
}


def _sensivel(marca, atributo: str) -> bool:
    """`after_sensitive` marca o objeto inteiro (`true`) ou cada atributo."""
    if marca is True:
        return True
    return isinstance(marca, dict) and marca.get(atributo) is True


def _strings(valor):
    for _, texto in plano._strings(valor):
        yield texto


def dados_pessoais_expostos(documento: dict) -> list[str]:
    """Violações do TT-S06. A mensagem cita o endereço do recurso, nunca o valor."""
    plan = documento.get("plano") or {}
    erros = []
    for r in plan.get("resource_changes") or []:
        mudanca = r.get("change") or {}
        if r.get("mode") != "managed" or mudanca.get("actions") == ["delete"]:
            continue
        if r.get("type") == "aws_sns_topic_subscription":
            if not _sensivel(mudanca.get("after_sensitive"), "endpoint"):
                erros.append(
                    f"TT-S06 {r['address']}: endpoint não sensível no plan; o log público do CI "
                    "imprimiria o destino. Leia o value do parâmetro e use nonsensitive() só em "
                    "volta do length (ADR-0008)")
    for nome, saida in (plan.get("output_changes") or {}).items():
        if saida.get("after_sensitive") is True:
            continue
        if any(EMAIL.search(t) for t in _strings(saida.get("after"))):
            erros.append(f"TT-S06 output.{nome}: e-mail num output não sensível; nenhum output "
                         "expõe os endereços (ADR-0008, Art. VIII)")
    return erros


def _emails(documento: dict) -> set[str]:
    return {m for r in documento["plano"]["resource_changes"]
            for t in _strings((r.get("change") or {}).get("after"))
            for m in EMAIL.findall(t)}


class TestFixtures(unittest.TestCase):
    """Vermelho: as fixtures violadoras reprovam citando o recurso; a conforme passa."""

    def test_toda_fixture_tem_expectativa(self):
        arquivos = {p.stem for p in FIXTURES.glob("*.json")}
        self.assertEqual(arquivos, set(VIOLADORAS) | {"conforme"})

    def test_fixtures_violadoras_reprovam_citando_o_recurso(self):
        for nome, enderecos in VIOLADORAS.items():
            doc = plano.documento_da_fixture(FIXTURES / f"{nome}.json")
            erros = dados_pessoais_expostos(doc)
            for endereco in enderecos:
                with self.subTest(fixture=nome, endereco=endereco):
                    self.assertTrue([e for e in erros if "TT-S06" in e and endereco in e], erros)

    def test_mensagem_nao_repete_o_email(self):
        for nome in VIOLADORAS:
            doc = plano.documento_da_fixture(FIXTURES / f"{nome}.json")
            emails = _emails(doc)
            self.assertTrue(emails, f"{nome}: a fixture precisa ter e-mails sintéticos para checar")
            for e in dados_pessoais_expostos(doc):
                for email in emails:
                    self.assertNotIn(email, e)

    def test_fixture_conforme_passa(self):
        doc = plano.documento_da_fixture(FIXTURES / "conforme.json")
        assinaturas = [r for r in doc["plano"]["resource_changes"]
                       if r["type"] == "aws_sns_topic_subscription"]
        # controle positivo com o que checar: duas assinaturas, como o mock
        self.assertEqual(len(assinaturas), 2)
        self.assertEqual(dados_pessoais_expostos(doc), [])

    def test_fixtures_usam_so_dominio_reservado(self):
        for arq in FIXTURES.glob("*.json"):
            doc = plano.documento_da_fixture(arq)
            for email in _emails(doc):
                with self.subTest(fixture=arq.stem, email=email):
                    self.assertTrue(email.endswith("@example.com"), "só e-mail sintético (RFC 2606)")


class TestDetalhes(unittest.TestCase):

    def test_objeto_inteiro_sensivel_passa(self):
        doc = {"plano": {"resource_changes": [{
            "address": "aws_sns_topic_subscription.s", "mode": "managed",
            "type": "aws_sns_topic_subscription",
            "change": {"actions": ["create"], "after": {"endpoint": "x@example.com"},
                       "after_sensitive": True}}]}}
        self.assertEqual(dados_pessoais_expostos(doc), [])

    def test_sem_after_sensitive_reprova(self):
        doc = {"plano": {"resource_changes": [{
            "address": "aws_sns_topic_subscription.s", "mode": "managed",
            "type": "aws_sns_topic_subscription",
            "change": {"actions": ["create"], "after": {"endpoint": "x@example.com"}}}]}}
        self.assertTrue(dados_pessoais_expostos(doc))

    def test_output_sensivel_passa(self):
        doc = {"plano": {"output_changes": {"d": {"after": ["x@example.com"], "after_sensitive": True}}}}
        self.assertEqual(dados_pessoais_expostos(doc), [])

    def test_output_com_arn_passa(self):
        doc = {"plano": {"output_changes": {"t": {
            "after": "arn:aws:sns:us-east-1:111111111111:00-plataforma-agentes-alarmes",
            "after_sensitive": False}}}}
        self.assertEqual(dados_pessoais_expostos(doc), [])


class TestModuloNucleo(unittest.TestCase):
    """O módulo nucleo, lido do plan com mock, cumpre o TT-S06 e as regras do T003."""

    @classmethod
    def setUpClass(cls):
        cls.doc = plano.documento_do_diretorio(NUCLEO)

    def test_plan_tem_as_assinaturas(self):
        # regra que passa sem nada para checar não conta: o mock tem dois endereços
        assinaturas = [r for r in self.doc["plano"]["resource_changes"]
                       if r["type"] == "aws_sns_topic_subscription"]
        self.assertEqual(len(assinaturas), 2)

    def test_nucleo_sem_dado_pessoal_exposto(self):
        self.assertEqual(dados_pessoais_expostos(self.doc), [])

    def test_nucleo_sem_violacao_do_t003(self):
        self.assertEqual(plano.violacoes(self.doc), [])


if __name__ == "__main__":
    unittest.main()
