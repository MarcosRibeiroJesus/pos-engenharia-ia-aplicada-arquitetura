"""Uso em todo commit: o pre-commit inclui sozinho o registro de uso de harness/uso/ (D-074).

O registro de uso (`harness/uso/<sessao>.json`) é regravado a cada resposta pelo hook
`registrar_uso.py` e se perde se a sessão ou o container acabar antes do commit. O gate
programático do `.githooks/pre-commit` põe esses arquivos no commit, sem nunca bloquear.
Testado em repositório git temporário, com `core.hooksPath` numa cópia de `.githooks/`.
"""
from __future__ import annotations

import os
import shutil

from comum import *  # noqa: F401,F403

HOOKS = AQUI.parent / ".githooks"

# Substituto do harness/estado.py: o teste isola o trecho novo, mas confere que o gate SDD continua
# rodando depois dele (bloqueia qualquer caminho em proibido/).
ESTADO_FALSO = """import sys
bloqueados = [l for l in sys.stdin.read().splitlines() if l.startswith("proibido/")]
sys.exit(1 if bloqueados else 0)
"""


def git(repo: Path, *args: str, check: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(("git", *args), cwd=repo, check=check, capture_output=True, text=True)


def no_commit(repo: Path, rev: str = "HEAD") -> list[str]:
    return git(repo, "show", "--name-only", "--format=", rev).stdout.split()


class TestUsoEmTodoCommit(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.repo = Path(self._tmp.name) / "repo"
        self.repo.mkdir()
        git(self.repo, "init", "-q")
        for k, v in (("user.email", "t@t"), ("user.name", "t"), ("commit.gpgsign", "false"),
                     ("core.hooksPath", "ganchos")):
            git(self.repo, "config", k, v)
        shutil.copytree(HOOKS, self.repo / "ganchos")
        (self.repo / "harness").mkdir()
        (self.repo / "harness" / "estado.py").write_text(ESTADO_FALSO, encoding="utf-8")
        self.escrever("a.txt", "1")
        git(self.repo, "add", ".")
        git(self.repo, "commit", "-qm", "base")

    def tearDown(self):
        self._tmp.cleanup()

    def escrever(self, caminho: str, texto: str) -> None:
        arq = self.repo / caminho
        arq.parent.mkdir(parents=True, exist_ok=True)
        arq.write_text(texto, encoding="utf-8")

    def commitar_a(self, texto: str, *extra: str) -> subprocess.CompletedProcess:
        self.escrever("a.txt", texto)
        git(self.repo, "add", "a.txt")
        return git(self.repo, "commit", "-qm", "mudanca", *extra, check=False)

    def limpo(self) -> str:
        return git(self.repo, "status", "--porcelain").stdout

    def test_inclui_o_registro_novo(self):
        self.escrever("harness/uso/s1.json", '{"n": 1}')
        r = self.commitar_a("2")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("harness/uso/s1.json", no_commit(self.repo))
        self.assertEqual(self.limpo(), "")

    def test_inclui_o_registro_modificado(self):
        self.escrever("harness/uso/s1.json", '{"n": 1}')
        self.commitar_a("2")
        self.escrever("harness/uso/s1.json", '{"n": 2}')
        r = self.commitar_a("3")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("harness/uso/s1.json", no_commit(self.repo))
        self.assertEqual(git(self.repo, "show", "HEAD:harness/uso/s1.json").stdout, '{"n": 2}')

    def test_inclui_o_registro_de_outra_sessao(self):
        self.escrever("harness/uso/minha.json", "{}")
        self.escrever("harness/uso/outra.json", "{}")
        self.commitar_a("2")
        self.assertTrue({"harness/uso/minha.json", "harness/uso/outra.json"} <= set(no_commit(self.repo)))

    def test_sem_registro_nao_inclui_nada(self):
        (self.repo / "harness" / "uso").mkdir()
        r = self.commitar_a("2")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(no_commit(self.repo), ["a.txt"])

    def test_sem_a_pasta_de_uso_o_hook_nao_falha(self):
        r = self.commitar_a("2")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(no_commit(self.repo), ["a.txt"])

    def test_nao_apaga_registro_removido_do_disco(self):
        self.escrever("harness/uso/s1.json", "{}")
        self.commitar_a("2")
        (self.repo / "harness" / "uso" / "s1.json").unlink()
        r = self.commitar_a("3")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertNotIn("harness/uso/s1.json", no_commit(self.repo))
        self.assertIn("harness/uso/s1.json", git(self.repo, "ls-tree", "-r", "--name-only", "HEAD").stdout)

    def test_amend_inclui_o_registro(self):
        self.commitar_a("2")
        self.escrever("harness/uso/s1.json", "{}")
        r = git(self.repo, "commit", "-q", "--amend", "--no-edit", check=False)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("harness/uso/s1.json", no_commit(self.repo))

    def test_commit_vazio_leva_o_registro(self):
        self.escrever("harness/uso/s1.json", "{}")
        r = git(self.repo, "commit", "-q", "--allow-empty", "-m", "vazio", check=False)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(no_commit(self.repo), ["harness/uso/s1.json"])

    def test_commit_com_a_inclui_o_registro(self):
        self.escrever("harness/uso/s1.json", "{}")
        self.escrever("a.txt", "2")
        r = git(self.repo, "commit", "-qam", "tudo", check=False)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("harness/uso/s1.json", no_commit(self.repo))
        self.assertEqual(self.limpo(), "")

    def test_commit_com_caminhos_explicitos_nao_quebra(self):
        """`git commit -- caminho` usa índice temporário: o hook pula sem deixar o índice inconsistente."""
        self.escrever("harness/uso/s1.json", "{}")
        self.escrever("a.txt", "2")
        r = git(self.repo, "commit", "-qm", "so a", "--", "a.txt", check=False)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(no_commit(self.repo), ["a.txt"])
        # O índice real continua igual ao HEAD para a.txt e o registro segue fora, para o próximo commit.
        self.assertEqual(self.limpo(), "?? harness/uso/\n")
        r = self.commitar_a("3")
        self.assertIn("harness/uso/s1.json", no_commit(self.repo))

    def test_registro_ignorado_pelo_gitignore_fica_fora(self):
        self.escrever(".gitignore", "harness/uso/\n")
        self.escrever("harness/uso/s1.json", "{}")
        git(self.repo, "add", ".gitignore")
        r = self.commitar_a("2")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertNotIn("harness/uso/s1.json", no_commit(self.repo))

    def test_merge_automatico_nao_roda_o_hook_e_o_registro_vai_no_proximo_commit(self):
        """O git não roda o pre-commit no merge sem conflito: o registro entra no commit seguinte."""
        principal = git(self.repo, "branch", "--show-current").stdout.strip()
        git(self.repo, "checkout", "-qb", "lado")
        self.escrever("b.txt", "b")
        git(self.repo, "add", "b.txt")
        git(self.repo, "commit", "-qm", "lado")
        git(self.repo, "checkout", "-q", principal)
        self.escrever("harness/uso/s1.json", "{}")
        r = git(self.repo, "merge", "-q", "--no-ff", "-m", "merge", "lado", check=False)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertNotIn("harness/uso/s1.json", git(self.repo, "ls-tree", "-r", "--name-only", "HEAD").stdout)
        self.commitar_a("2")
        self.assertIn("harness/uso/s1.json", no_commit(self.repo))

    def conflito(self, comando: str) -> subprocess.CompletedProcess:
        """Cria um conflito em a.txt entre o ramo principal e `lado` e roda `comando` (merge, rebase, cherry-pick)."""
        principal = git(self.repo, "branch", "--show-current").stdout.strip()
        git(self.repo, "checkout", "-qb", "lado")
        self.commitar_a("lado")
        git(self.repo, "checkout", "-q", principal)
        self.commitar_a("principal")
        if comando == "rebase":
            git(self.repo, "checkout", "-q", "lado")
            r = git(self.repo, "rebase", principal, check=False)
        elif comando == "merge":
            r = git(self.repo, "merge", "-q", "-m", "merge", "lado", check=False)
        else:
            r = git(self.repo, "cherry-pick", "lado", check=False)
        self.assertNotEqual(r.returncode, 0, "o cenário precisa de conflito")
        self.escrever("a.txt", "resolvido")
        git(self.repo, "add", "a.txt")
        self.escrever("harness/uso/s1.json", "{}")
        return subprocess.run(("git", comando, "--continue"), cwd=self.repo, capture_output=True, text=True,
                              env={**os.environ, "GIT_EDITOR": "true"})

    def test_merge_continue_inclui_o_registro(self):
        r = self.conflito("merge")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("harness/uso/s1.json", git(self.repo, "diff-tree", "-r", "--name-only", "HEAD^1", "HEAD").stdout)

    def test_cherry_pick_continue_inclui_o_registro(self):
        r = self.conflito("cherry-pick")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("harness/uso/s1.json", no_commit(self.repo))

    def test_rebase_continue_nao_roda_o_hook_e_o_registro_vai_no_proximo_commit(self):
        r = self.conflito("rebase")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertNotIn("harness/uso/s1.json", git(self.repo, "ls-tree", "-r", "--name-only", "HEAD").stdout)
        self.commitar_a("depois")
        self.assertIn("harness/uso/s1.json", no_commit(self.repo))

    def test_commit_so_com_registro_aborta_mas_deixa_o_registro_no_indice(self):
        """Sem outra mudança, o git aborta (avisa que não há nada para commitar, porque calcula o status antes do hook), mas deixa o registro no índice; a segunda tentativa leva o registro."""
        self.escrever("harness/uso/s1.json", "{}")
        r = git(self.repo, "commit", "-qm", "so uso", check=False)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("harness/uso/s1.json", git(self.repo, "diff", "--cached", "--name-only").stdout)
        r = git(self.repo, "commit", "-qm", "so uso", check=False)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(no_commit(self.repo), ["harness/uso/s1.json"])

    def test_gate_sdd_continua_bloqueando(self):
        self.escrever("harness/uso/s1.json", "{}")
        self.escrever("proibido/x.py", "x")
        git(self.repo, "add", "proibido/x.py")
        r = git(self.repo, "commit", "-qm", "bloqueado", check=False)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("SDD", r.stdout + r.stderr)
        self.assertEqual(git(self.repo, "log", "-1", "--format=%s").stdout.strip(), "base")


class TestRegistroNuncaBloqueiaOGateSdd(unittest.TestCase):
    """Com o harness/estado.py real: o auto-stage de harness/uso/ nunca faz o gate SDD travar o commit."""

    def test_estado_real_libera_o_registro(self):
        r = subprocess.run([sys.executable, str(AQUI / "estado.py"), "checar-arquivos"],
                           input="harness/uso/qualquer-sessao.json\n", cwd=AQUI.parent,
                           capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)

    def test_libera_mesmo_com_todo_projeto_antes_de_implementar(self):
        dados = json.loads((AQUI / "estado.json").read_text(encoding="utf-8"))
        for p in dados["projetos"]:
            p["fase"] = "especificar"
        self.assertEqual(estado.bloqueios(dados, ["harness/uso/qualquer-sessao.json"]), [])


if __name__ == "__main__":
    unittest.main()
