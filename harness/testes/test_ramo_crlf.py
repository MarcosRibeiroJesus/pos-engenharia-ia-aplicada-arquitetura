"""Regressão: o ramo compartilhado grava nome e conteúdo sem \r no Windows (ramo.git usa bytes)."""
from __future__ import annotations

from comum import *  # noqa: F401,F403


class TestRamoSemCarriageReturn(unittest.TestCase):
    def test_nome_de_arquivo_e_conteudo_sem_cr(self):
        with tempfile.TemporaryDirectory() as t:
            clone = repo_com_remoto(Path(t))
            ramo.gravar(clone, "agentes-status", "d.json", "1\n", "a")
            arvore = sh(clone, "git", "ls-tree", "--name-only", "origin/agentes-status")
            self.assertEqual(arvore.splitlines(), ["d.json"])
            self.assertEqual(ramo.ler(clone, "agentes-status", "d.json"), "1\n")

    def test_conteudo_multilinha_preservado(self):
        with tempfile.TemporaryDirectory() as t:
            clone = repo_com_remoto(Path(t))
            texto = "linha 1\nlinha 2\n"
            ramo.gravar(clone, "agentes-status", "x.txt", texto, "b")
            self.assertEqual(ramo.ler(clone, "agentes-status", "x.txt"), texto)
