"""TS-02 · o contrato v1 não guarda segredo (T019; RF-003, RF-007, Art. IV, ADR-0002, ADR-0003).

Duas regras, as duas no próprio `v1.schema.json`, para valerem em qualquer leitor do contrato
(o Terraform do produto, o agente em tempo de execução, o produto sintético do Floci), e não só
neste teste:

1. **Nome de campo proibido.** Nenhum objeto do contrato aceita campo cujo nome contenha
   `segredo`, `senha`, `token`, `chave_secreta` ou `password`, em qualquer posição e sem diferença
   de maiúscula (`propertyNames` com `not pattern`). O `additionalProperties: false` já barra um
   campo novo hoje; o `propertyNames` barra também a versão futura do schema que tentar declarar
   o campo em `properties` (risco do ADR-0002).
2. **Valor com formato de credencial.** Nenhuma string do contrato aceita chave de acesso da AWS,
   chave privada PEM, chave da API da Anthropic, token do GitHub ou token do Slack
   (`$defs/sem_credencial`, um `not pattern` referenciado por toda string do schema). O T003
   (TT-S05, `plan/plano.py`) varre o plan; o schema cobre o contrato em si.

Os valores de credencial são montados em tempo de execução, por concatenação, para nenhum literal
no formato de credencial entrar no repositório nem disparar o gitleaks da esteira.
"""
from __future__ import annotations

import copy
import json
import re
import unittest
from pathlib import Path

from . import esquema

try:  # discover com -s plataforma/agentes/tests: `plan` é pacote de topo
    from plan import plano
except ImportError:  # pragma: no cover - discover a partir da raiz do repositório
    from ..plan import plano

AQUI = Path(__file__).resolve().parent
SCHEMA = AQUI.parents[1] / "contrato" / "v1.schema.json"
FIXTURES = AQUI / "fixtures"

NOMES_PROIBIDOS = ("segredo", "senha", "token", "chave_secreta", "password")

# Formatos de credencial montados em tempo de execução (nunca literais no arquivo).
CREDENCIAIS = {
    "chave de acesso da AWS": "AK" + "IA" + "Q" * 16,
    "chave temporária da AWS": "AS" + "IA" + "7" * 16,
    "chave privada": "-----BEGIN " + "RSA PRIVATE" + " KEY-----",
    "chave da API da Anthropic": "sk-" + "ant-" + "x" * 24,
    "token do GitHub": "gh" + "p_" + "a" * 24,
    "token do Slack": "xo" + "xb-" + "1" * 12,
}


def _json(caminho: Path):
    return json.loads(caminho.read_text(encoding="utf-8"))


def _nos(sch, caminho="$"):
    """(caminho, subschema) de cada subschema-objeto dentro do schema."""
    if isinstance(sch, dict):
        yield caminho, sch
        for k, v in sch.items():
            yield from _nos(v, f"{caminho}/{k}")
    elif isinstance(sch, list):
        for i, v in enumerate(sch):
            yield from _nos(v, f"{caminho}[{i}]")


class TestNomeProibido(unittest.TestCase):
    """Campo com nome de segredo reprova, inclusive se uma versão futura o declarar."""

    @classmethod
    def setUpClass(cls):
        cls.schema = _json(SCHEMA)
        cls.comum = _json(FIXTURES / "comum_conforme.json")
        cls.produto = _json(FIXTURES / "produto_conforme.json")

    def _reprova_pelo_nome(self, valor, sch, ref, campo):
        erros = esquema.validar(valor, sch, ref)
        self.assertTrue(any(f"{campo} (nome)" in e for e in erros),
                        f"o campo {campo!r} precisava reprovar pela regra de nome: {erros}")
        self.assertTrue(esquema.validar(valor, sch), "a raiz também reprova")

    def test_vermelho_campo_token_no_comum(self):
        valor = copy.deepcopy(self.comum)
        valor["token"] = "qualquer"
        self._reprova_pelo_nome(valor, self.schema, "#/$defs/comum", "token")

    def test_nomes_proibidos_em_qualquer_posicao_e_caixa(self):
        for base in NOMES_PROIBIDOS:
            for campo in (base, base.upper(), f"gateway_{base}", f"{base.capitalize()}Alvo"):
                with self.subTest(campo=campo):
                    valor = copy.deepcopy(self.comum)
                    valor[campo] = "qualquer"
                    self._reprova_pelo_nome(valor, self.schema, "#/$defs/comum", campo)

    def test_nome_proibido_em_objeto_aninhado(self):
        produto = copy.deepcopy(self.produto)
        produto["alvos"][0]["tools"][0]["api_token"] = "qualquer"
        self._reprova_pelo_nome(produto, self.schema, "#/$defs/produto", "api_token")
        comum = copy.deepcopy(self.comum)
        comum["mapa_erros"]["autenticacao"]["senha_alvo"] = "qualquer"
        self._reprova_pelo_nome(comum, self.schema, "#/$defs/comum", "senha_alvo")

    def test_versao_futura_que_declara_o_campo_ainda_reprova(self):
        # risco do ADR-0002: alguém acrescenta um campo secreto em `properties`; o
        # additionalProperties deixa de barrar, e o propertyNames precisa continuar barrando
        sch = copy.deepcopy(self.schema)
        sch["$defs"]["comum"]["properties"]["token"] = {"type": "string"}
        valor = copy.deepcopy(self.comum)
        valor["token"] = "qualquer"
        self._reprova_pelo_nome(valor, sch, "#/$defs/comum", "token")

    def test_todo_objeto_do_schema_tem_a_regra_de_nome(self):
        # falha fechada: objeto novo sem propertyNames reprova aqui
        ref = {"$ref": "#/$defs/nome_permitido"}
        for caminho, no in _nos(self.schema):
            if no.get("type") == "object":
                with self.subTest(no=caminho):
                    self.assertEqual(no.get("propertyNames"), ref)

    def test_nomes_atuais_continuam_validos(self):
        self.assertEqual(esquema.validar(self.comum, self.schema, "#/$defs/comum"), [])
        self.assertEqual(esquema.validar(self.produto, self.schema, "#/$defs/produto"), [])


class TestValorDeCredencial(unittest.TestCase):
    """String com formato de credencial reprova em qualquer campo do contrato."""

    @classmethod
    def setUpClass(cls):
        cls.schema = _json(SCHEMA)
        cls.comum = _json(FIXTURES / "comum_conforme.json")
        cls.produto = _json(FIXTURES / "produto_conforme.json")

    def _reprova(self, valor, ref):
        erros = esquema.validar(valor, self.schema, ref)
        self.assertTrue(erros, "o valor com formato de credencial precisava reprovar")
        self.assertTrue(esquema.validar(valor, self.schema), "a raiz também reprova")
        for credencial in CREDENCIAIS.values():  # a mensagem nunca repete o valor
            self.assertFalse(any(credencial in e for e in erros), erros)

    def test_vermelho_chave_aws_no_texto_livre(self):
        valor = copy.deepcopy(self.comum)
        valor["mapa_erros"]["autenticacao"]["acao"] = "use " + CREDENCIAIS["chave de acesso da AWS"]
        self._reprova(valor, "#/$defs/comum")

    def test_vermelho_chave_aws_num_identificador(self):
        # o gateway_id aceita maiúsculas e dígitos: o formato do campo, sozinho, não barra a chave
        valor = copy.deepcopy(self.comum)
        valor["gateway_id"] = CREDENCIAIS["chave de acesso da AWS"]
        self._reprova(valor, "#/$defs/comum")

    def test_cada_formato_reprova_no_texto_livre(self):
        for nome, credencial in CREDENCIAIS.items():
            with self.subTest(formato=nome):
                valor = copy.deepcopy(self.comum)
                valor["mapa_erros"]["falha_transitoria"]["origem"] = "x " + credencial
                self._reprova(valor, "#/$defs/comum")

    def test_formatos_sem_espaco_reprovam_em_identificador_e_url(self):
        for nome, credencial in CREDENCIAIS.items():
            if " " in credencial:
                continue  # chave PEM tem espaço e não cabe no formato desses campos
            for campo in ("gateway_id", "motor_politica_id"):
                with self.subTest(formato=nome, campo=campo):
                    valor = copy.deepcopy(self.comum)
                    valor[campo] = "a" + credencial
                    self._reprova(valor, "#/$defs/comum")
            with self.subTest(formato=nome, campo="gateway_url"):
                valor = copy.deepcopy(self.comum)
                valor["gateway_url"] = "https://gw.example.com/" + credencial
                self._reprova(valor, "#/$defs/comum")

    def test_valor_no_produto_reprova(self):
        for nome in ("chave da API da Anthropic", "token do Slack"):
            with self.subTest(formato=nome):
                produto = copy.deepcopy(self.produto)
                produto["roles"]["agentes"][0]["nome"] = CREDENCIAIS[nome]
                self._reprova(produto, "#/$defs/produto")

    def test_minuscula_nao_e_falso_positivo(self):
        # a chave de acesso da AWS é maiúscula; o mesmo texto em minúscula, num id, passa
        produto = copy.deepcopy(self.produto)
        produto["guardrail_id"] = CREDENCIAIS["chave de acesso da AWS"].lower()
        self.assertEqual(esquema.validar(produto, self.schema, "#/$defs/produto"), [])

    def test_toda_string_do_schema_tem_a_varredura(self):
        # falha fechada: string nova sem a varredura de valor reprova aqui
        ref = "#/$defs/sem_credencial"
        for caminho, no in _nos(self.schema):
            if no.get("type") == "string" and not caminho.endswith("/sem_credencial/not") \
                    and not caminho.endswith("/nome_permitido/not"):
                with self.subTest(no=caminho):
                    self.assertEqual(no.get("$ref"), ref)

    def test_schema_cobre_tudo_que_o_t003_cobre(self):
        # paridade com o TT-S05 (plan/plano.py): o que o plan reprova, o contrato também reprova
        padrao = re.compile(self.schema["$defs"]["sem_credencial"]["not"]["pattern"])
        for nome, credencial in CREDENCIAIS.items():
            with self.subTest(formato=nome):
                self.assertTrue(any(p.search(credencial) for _, p in plano.VALOR_DE_CREDENCIAL),
                                "a amostra precisa ter o formato que o T003 reconhece")
                self.assertTrue(padrao.search(credencial))

    def test_fixtures_conformes_passam(self):
        self.assertEqual(esquema.validar(self.comum, self.schema, "#/$defs/comum"), [])
        self.assertEqual(esquema.validar(self.produto, self.schema, "#/$defs/produto"), [])
        self.assertEqual(esquema.validar(self.comum, self.schema), [])
        self.assertEqual(esquema.validar(self.produto, self.schema), [])


if __name__ == "__main__":
    unittest.main()
