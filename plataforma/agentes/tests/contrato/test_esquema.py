"""O validador `esquema.py` segue a semântica do JSON Schema onde o Python difere (revisão da T018).

- `pattern`: o dialeto é o ECMA-262, em que `$` (sem a flag multiline) casa só no fim do valor.
  O `$` do `re` do Python também casa antes de um `\\n` final.
- `const` e `enum`: igualdade de valores JSON. No Python, `True == 1` e `False == 0`; no JSON,
  booleano e número são tipos diferentes. Já `1` e `1.0` são o mesmo número.
"""
from __future__ import annotations

import unittest

from . import esquema


def _ok(valor, sch) -> bool:
    return esquema.validar(valor, sch) == []


class TestPattern(unittest.TestCase):
    def test_dolar_nao_aceita_quebra_de_linha_final(self):
        sch = {"type": "string", "pattern": "^a$"}
        self.assertTrue(_ok("a", sch))
        self.assertFalse(_ok("a\n", sch))

    def test_dolar_dentro_de_alternativa(self):
        sch = {"type": "string", "pattern": "^(a$|b)"}
        self.assertTrue(_ok("a", sch))
        self.assertTrue(_ok("bc", sch))
        self.assertFalse(_ok("a\n", sch))

    def test_dolar_escapado_e_literal(self):
        self.assertTrue(_ok("custa $", {"type": "string", "pattern": "\\$"}))
        self.assertTrue(_ok("[$]", {"type": "string", "pattern": "[$]"}))

    def test_sem_ancora_continua_busca(self):
        self.assertTrue(_ok("xxabcxx", {"type": "string", "pattern": "abc"}))


class TestConstEnum(unittest.TestCase):
    def test_booleano_nao_e_numero(self):
        self.assertFalse(_ok(True, {"const": 1}))
        self.assertFalse(_ok(1, {"const": True}))
        self.assertFalse(_ok(0, {"const": False}))
        self.assertFalse(_ok(True, {"enum": [1, 2]}))
        self.assertFalse(_ok(1, {"enum": [True]}))

    def test_listas_e_objetos_recursivos(self):
        self.assertFalse(_ok([True, 2, 4], {"const": [1, 2, 4]}))
        self.assertFalse(_ok({"a": [False]}, {"const": {"a": [0]}}))
        self.assertTrue(_ok({"a": [1, 2]}, {"const": {"a": [1, 2]}}))
        self.assertFalse(_ok([1, 2], {"const": [1, 2, 4]}))

    def test_inteiro_e_decimal_iguais(self):
        self.assertTrue(_ok(3.0, {"const": 3}))
        self.assertTrue(_ok(3, {"enum": [3.0]}))

    def test_unique_items_pela_igualdade_json(self):
        sch = {"type": "array", "uniqueItems": True}
        self.assertFalse(_ok([1, 1.0], sch))
        self.assertTrue(_ok([True, 1], sch))

    def test_bool_igual_a_bool(self):
        self.assertTrue(_ok(False, {"const": False}))
        self.assertTrue(_ok(True, {"enum": [True]}))


if __name__ == "__main__":
    unittest.main()
