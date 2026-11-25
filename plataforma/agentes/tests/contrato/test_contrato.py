"""TS-01 e TT-C01 · contrato v1 da plataforma (T018; RF-007, RF-011, ADR-0002, ADR-0009).

O output `contrato_v1` do plan com mock do módulo `contrato`
(`modules/contrato/tests/plan_json.tftest.hcl`, sem credencial) precisa passar no
`plataforma/agentes/contrato/v1.schema.json`. O schema cobre os dois parâmetros do contrato:
`#/$defs/comum` (`/00-plataforma-agentes/contrato/v1/comum`) e `#/$defs/produto`
(`/00-plataforma-agentes/contrato/v1/produtos/<chave>`), e a raiz aceita um dos dois.

O vermelho é a fixture `fixtures/sem_mapa_erros.json`: um `comum` completo, só sem `mapa_erros`,
que precisa reprovar. As outras violações (categoria a menos, retentável trocado, motor ausente)
saem de cópias da fixture conforme, alteradas no próprio teste.

As oito categorias e o retentável de cada uma vêm da tabela do RF-011 (spec.md), copiadas aqui
como fonte do teste: se o schema ou o módulo divergirem da tabela, o teste reprova.
"""
from __future__ import annotations

import copy
import json
import unittest
from pathlib import Path

from . import esquema

try:  # discover com -s plataforma/agentes/tests: `plan` é pacote de topo
    from plan import plano
except ImportError:  # pragma: no cover - discover a partir da raiz do repositório
    from ..plan import plano

AQUI = Path(__file__).resolve().parent
AGENTES = AQUI.parents[1]
SCHEMA = AGENTES / "contrato" / "v1.schema.json"
CONTRATO = AGENTES / "infra" / "terraform" / "modules" / "contrato"
FIXTURES = AQUI / "fixtures"

NOME_COMUM = "/00-plataforma-agentes/contrato/v1/comum"
LIMITE_BYTES = 4096  # camada Standard do SSM (ADR-0002)

# Tabela "Contrato v1" do plan.md, linha do comum.
CAMPOS_COMUM = {
    "versao_contrato", "regiao", "gateway_arn", "gateway_url", "gateway_id", "motor_politica_id",
    "motor_politica_arn", "versoes_mcp", "grupo_log_gateway", "grupo_spans", "topico_alarmes_arn",
    "chave_kms_arn", "mapa_erros",
}
# Tabela "Contrato v1" do plan.md, linha do produto.
CAMPOS_PRODUTO = {"versao_contrato", "perfil_inferencia_arn", "guardrail_id", "guardrail_versao",
                  "alvos", "roles"}
# Tabela do RF-011 (spec.md): categoria -> retentável.
RF_011 = {
    "politica_negada": False,
    "requer_aprovacao_humana": False,
    "guardrail_entrada": False,
    "guardrail_saida": False,
    "autenticacao": False,
    "limite_taxa": True,
    "falha_transitoria": True,
    "erro_desconhecido": False,
}


def _json(caminho: Path):
    return json.loads(caminho.read_text(encoding="utf-8"))


class TestSchema(unittest.TestCase):
    """O schema sozinho, contra fixtures estáticas (TS-01)."""

    @classmethod
    def setUpClass(cls):
        cls.schema = _json(SCHEMA)
        cls.comum = _json(FIXTURES / "comum_conforme.json")

    def _reprova(self, valor, ref="#/$defs/comum"):
        erros = esquema.validar(valor, self.schema, ref)
        self.assertTrue(erros, "a fixture precisava reprovar no schema")
        # a raiz também reprova: nem comum nem produto
        self.assertTrue(esquema.validar(valor, self.schema))
        return erros

    def test_comum_conforme_passa(self):
        self.assertEqual(esquema.validar(self.comum, self.schema, "#/$defs/comum"), [])
        self.assertEqual(esquema.validar(self.comum, self.schema), [])

    def test_vermelho_sem_mapa_erros_reprova(self):
        erros = self._reprova(_json(FIXTURES / "sem_mapa_erros.json"))
        self.assertTrue(any("mapa_erros" in e for e in erros), erros)

    def test_categoria_a_menos_reprova(self):
        valor = copy.deepcopy(self.comum)
        del valor["mapa_erros"]["erro_desconhecido"]
        self.assertTrue(any("erro_desconhecido" in e for e in self._reprova(valor)))

    def test_categoria_inventada_reprova(self):
        valor = copy.deepcopy(self.comum)
        valor["mapa_erros"]["timeout"] = {"origem": "x", "retentavel": True, "acao": "x"}
        self._reprova(valor)

    def test_retentavel_trocado_reprova(self):
        for categoria, retentavel in RF_011.items():
            with self.subTest(categoria=categoria):
                valor = copy.deepcopy(self.comum)
                valor["mapa_erros"][categoria]["retentavel"] = not retentavel
                self._reprova(valor)

    def test_motor_obrigatorio(self):
        # emenda 1 (F3) e ADR-0009: os dois campos do motor nunca ficam opcionais no schema
        for campo in ("motor_politica_id", "motor_politica_arn"):
            with self.subTest(campo=campo):
                valor = copy.deepcopy(self.comum)
                del valor[campo]
                self._reprova(valor)

    def test_campo_extra_reprova(self):
        valor = copy.deepcopy(self.comum)
        valor["role_arn"] = "arn:aws:iam::111111111111:role/qualquer"
        self._reprova(valor)

    def test_url_sem_tls_reprova(self):
        valor = copy.deepcopy(self.comum)
        valor["gateway_url"] = valor["gateway_url"].replace("https://", "http://")
        self._reprova(valor)

    def test_versao_maior_diferente_de_1_reprova(self):
        valor = copy.deepcopy(self.comum)
        valor["versao_contrato"] = "2.0.0"
        self._reprova(valor)

    def test_quebra_de_linha_no_fim_reprova(self):
        # revisão A1: no dialeto do JSON Schema (ECMA-262), `$` casa só no fim do valor; o `$` do
        # re do Python também casa antes de um \n final, e "1.0.0\n" passaria
        for campo in ("versao_contrato", "gateway_url", "motor_politica_arn"):
            with self.subTest(campo=campo):
                valor = copy.deepcopy(self.comum)
                valor[campo] += "\n"
                self._reprova(valor)

    def test_booleano_nao_vale_como_numero_em_const(self):
        # revisão A2: True == 1 no Python, mas no JSON true e 1 são valores diferentes
        valor = copy.deepcopy(self.comum)
        valor["mapa_erros"]["limite_taxa"]["espera_segundos"] = [True, 2, 4]
        self._reprova(valor)
        valor = copy.deepcopy(self.comum)
        valor["mapa_erros"]["limite_taxa"]["tentativas_max"] = 3.0
        self.assertEqual(esquema.validar(valor, self.schema), [],
                         "3.0 e 3 são o mesmo número no JSON")

    def test_campos_do_schema_iguais_aos_do_plano(self):
        comum = self.schema["$defs"]["comum"]
        self.assertEqual(set(comum["properties"]), CAMPOS_COMUM)
        self.assertEqual(set(comum["required"]), CAMPOS_COMUM)
        produto = self.schema["$defs"]["produto"]
        self.assertEqual(set(produto["properties"]), CAMPOS_PRODUTO)
        self.assertEqual(set(produto["required"]), CAMPOS_PRODUTO)

    def test_produto_conforme_passa(self):
        produto = _json(FIXTURES / "produto_conforme.json")
        self.assertEqual(esquema.validar(produto, self.schema, "#/$defs/produto"), [])
        self.assertEqual(esquema.validar(produto, self.schema), [])

    def test_produto_com_tool_sem_classe_reprova(self):
        produto = _json(FIXTURES / "produto_conforme.json")
        produto["alvos"][0]["tools"][0]["classes"] = []
        self._reprova(produto, "#/$defs/produto")

    def test_produto_com_classe_inventada_reprova(self):
        produto = _json(FIXTURES / "produto_conforme.json")
        produto["alvos"][0]["tools"][0]["classes"] = ["publica"]
        self._reprova(produto, "#/$defs/produto")

    def test_fixtures_cabem_em_4kb(self):
        for nome in ("comum_conforme.json", "produto_conforme.json"):
            with self.subTest(fixture=nome):
                valor = _json(FIXTURES / nome)
                tamanho = len(json.dumps(valor, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))
                self.assertLessEqual(tamanho, LIMITE_BYTES)


class TestContratoNoPlan(unittest.TestCase):
    """O output `contrato_v1` e o parâmetro `comum` no plan com mock do módulo (TT-C01)."""

    @classmethod
    def setUpClass(cls):
        cls.schema = _json(SCHEMA)
        cls.doc = plano.documento_do_diretorio(CONTRATO)
        cls.saidas = cls.doc["plano"]["output_changes"]
        cls.parametros = [r["change"]["after"] for r in cls.doc["plano"]["resource_changes"]
                          if r.get("type") == "aws_ssm_parameter"
                          and "create" in r.get("change", {}).get("actions", [])]

    def _contrato(self) -> dict:
        self.assertIn("contrato_v1", self.saidas, "o módulo publica o output contrato_v1 (RF-007)")
        return self.saidas["contrato_v1"]["after"]

    def test_output_passa_no_schema(self):
        self.assertEqual(esquema.validar(self._contrato(), self.schema, "#/$defs/comum"), [])
        self.assertEqual(esquema.validar(self._contrato(), self.schema), [])

    def test_versao_e_campos_do_plano(self):
        contrato = self._contrato()
        self.assertEqual(contrato["versao_contrato"], "1.0.0")
        self.assertEqual(set(contrato), CAMPOS_COMUM)
        self.assertEqual(contrato["grupo_spans"], "aws/spans")

    def test_mapa_erros_igual_ao_rf_011(self):
        mapa = self._contrato()["mapa_erros"]
        self.assertEqual({c: v["retentavel"] for c, v in mapa.items()}, RF_011)
        for categoria, v in mapa.items():
            if v["retentavel"]:
                self.assertEqual(v["tentativas_max"], 3, categoria)
                self.assertEqual(v["espera_segundos"], [1, 2, 4], categoria)

    def test_um_parametro_comum_string_standard_ate_4kb(self):
        self.assertEqual(len(self.parametros), 1, "o módulo cria só o parâmetro comum")
        p = self.parametros[0]
        self.assertEqual(p["name"], NOME_COMUM)
        self.assertEqual(p["type"], "String")
        self.assertEqual(p["tier"], "Standard")
        self.assertFalse(p.get("key_id"), "String sem KMS do cliente (ADR-0002)")
        valor = p.get("insecure_value")
        self.assertIsInstance(valor, str, "valor legível no plan (insecure_value, ADR-0002)")
        self.assertLessEqual(len(valor.encode("utf-8")), LIMITE_BYTES)
        self.assertEqual(json.loads(valor), self._contrato(),
                         "o parâmetro guarda o mesmo objeto do output contrato_v1")

    def test_sem_violacoes_do_t003(self):
        self.assertEqual(plano.violacoes(self.doc), [])


if __name__ == "__main__":
    unittest.main()
