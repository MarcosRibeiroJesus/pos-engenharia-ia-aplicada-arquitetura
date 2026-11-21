"""Assunto: branch defasado em relação ao harness do main.

Um branch criado antes de uma mudança no harness não carrega os hooks, skills e especialistas novos,
e o agente que trabalha nele passa por fora dos gates (aconteceu no PR #8). O CI reprova o PR quando
o main mudou o harness depois que o branch saiu dele.
"""
from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from comum import sh
import branch_defasado


def novo_repo(tmp: Path) -> Path:
    repo = tmp / "repo"
    sh(tmp, "git", "init", "-q", "-b", "main", str(repo))
    for k, v in (("user.email", "t@t"), ("user.name", "t"), ("commit.gpgsign", "false")):
        sh(repo, "git", "config", k, v)
    return repo


def commit(repo: Path, arquivos: dict[str, str], msg: str) -> None:
    for caminho, conteudo in arquivos.items():
        p = repo / caminho
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(conteudo, encoding="utf-8")
    sh(repo, "git", "add", "-A")
    sh(repo, "git", "commit", "-q", "-m", msg)


class BranchDefasado(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.repo = novo_repo(Path(self._tmp.name))
        commit(self.repo, {"README.md": "x", "harness/gate.py": "v1"}, "base")
        sh(self.repo, "git", "switch", "-q", "-c", "opcoes")
        commit(self.repo, {"modulos/01/OPCOES.md": "opções"}, "trabalho do branch")
        sh(self.repo, "git", "switch", "-q", "main")

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def defasados(self) -> list[str]:
        return branch_defasado.defasados(self.repo, "main", "opcoes")

    def test_main_sem_mudanca_no_harness_passa(self) -> None:
        commit(self.repo, {"modulos/02/x.md": "y"}, "outra disciplina")
        self.assertEqual(self.defasados(), [])

    def test_main_mudou_o_harness_depois_do_branch_reprova(self) -> None:
        commit(self.repo, {"harness/gate.py": "v2"}, "gate novo")
        self.assertEqual(self.defasados(), ["harness/gate.py"])

    def test_branch_anterior_ao_harness_reprova(self) -> None:
        commit(self.repo, {".githooks/pre-push": "gate", ".claude/skills/a/SKILL.md": "s"}, "harness chega")
        self.assertEqual(self.defasados(), [".claude/skills/a/SKILL.md", ".githooks/pre-push"])

    def test_branch_atualizado_com_o_main_passa(self) -> None:
        commit(self.repo, {"harness/gate.py": "v2"}, "gate novo")
        sh(self.repo, "git", "switch", "-q", "opcoes")
        sh(self.repo, "git", "merge", "-q", "--no-edit", "main")
        self.assertEqual(self.defasados(), [])

    def test_mudanca_identica_no_branch_passa(self) -> None:
        commit(self.repo, {"harness/gate.py": "v2"}, "gate novo")
        sh(self.repo, "git", "switch", "-q", "opcoes")
        commit(self.repo, {"harness/gate.py": "v2"}, "mesma mudança")
        self.assertEqual(self.defasados(), [])

    def test_main_removeu_arquivo_que_o_branch_ainda_tem_reprova(self) -> None:
        sh(self.repo, "git", "rm", "-q", "harness/gate.py")
        sh(self.repo, "git", "commit", "-q", "-m", "remove gate")
        self.assertEqual(self.defasados(), ["harness/gate.py"])

    def test_main_retorna_1_e_explica_a_correcao(self) -> None:
        commit(self.repo, {"harness/gate.py": "v2"}, "gate novo")
        codigo, mensagem = branch_defasado.verificar(self.repo, "main", "opcoes")
        self.assertEqual(codigo, 1)
        self.assertIn("harness/gate.py", mensagem)
        self.assertIn("git merge", mensagem)


if __name__ == "__main__":
    unittest.main()
