"""Organização dos testes do harness: um arquivo por assunto (D-043)."""
from __future__ import annotations

import ast

from comum import *  # noqa: F401,F403

PASTA = AQUI / "testes"


class TestUmArquivoPorAssunto(unittest.TestCase):
    """PRs paralelos não podem disputar o mesmo trecho de um arquivo único de testes."""

    def test_ponto_de_entrada_nao_tem_testes(self):
        arv = ast.parse((AQUI / "test_harness.py").read_text(encoding="utf-8"))
        self.assertEqual([n.name for n in arv.body if isinstance(n, ast.ClassDef)], [],
                         "escreva testes em harness/testes/test_<assunto>.py, não no test_harness.py")

    def test_so_arquivos_de_assunto_e_a_base_comum(self):
        for arq in PASTA.glob("*.py"):
            self.assertTrue(arq.name == "comum.py" or arq.name.startswith("test_"), arq.name)

    def test_todo_arquivo_diz_o_seu_assunto(self):
        for arq in PASTA.glob("test_*.py"):
            self.assertTrue(ast.get_docstring(ast.parse(arq.read_text(encoding="utf-8"))), f"{arq.name} sem docstring de assunto")

    def test_base_comum_nao_tem_testes(self):
        arv = ast.parse((PASTA / "comum.py").read_text(encoding="utf-8"))
        self.assertEqual([n.name for n in arv.body if isinstance(n, ast.ClassDef)], [])
