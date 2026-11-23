"""Atributos de fim de linha: hooks do git e scripts .sh sempre com LF (.gitattributes).

Com CRLF (checkout no Windows com core.autocrlf), o bash do Git Bash falha no shebang e no
corpo do `.githooks/pre-commit`, e todo commit trava.
"""
from __future__ import annotations

from comum import *  # noqa: F401,F403

RAIZ = AQUI.parent


def eol(caminhos: list[str]) -> dict[str, str]:
    saida = subprocess.run(["git", "check-attr", "eol", "--", *caminhos], cwd=RAIZ, check=True,
                           capture_output=True, text=True).stdout
    return {linha.split(": ")[0]: linha.split(": ")[-1] for linha in saida.splitlines()}


class TestAtributosDeFimDeLinha(unittest.TestCase):
    def test_hooks_do_git_com_lf(self):
        self.assertEqual(eol([".githooks/pre-commit", ".githooks/pre-push"]),
                         {".githooks/pre-commit": "lf", ".githooks/pre-push": "lf"})

    def test_scripts_sh_versionados_com_lf(self):
        sh_versionados = subprocess.run(["git", "ls-files", "*.sh"], cwd=RAIZ, check=True,
                                        capture_output=True, text=True).stdout.split()
        self.assertTrue(sh_versionados, "nenhum .sh versionado encontrado")
        self.assertEqual({a: v for a, v in eol(sh_versionados).items() if v != "lf"}, {})


if __name__ == "__main__":
    unittest.main()
