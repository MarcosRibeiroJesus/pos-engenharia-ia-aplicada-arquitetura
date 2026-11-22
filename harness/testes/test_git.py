"""Travas do git: branch já mergeado (D-032)."""
from __future__ import annotations

from comum import *  # noqa: F401,F403


class TestBranchMergeado(unittest.TestCase):
    """D-032: commit novo em branch já mergeado é barrado no pre-push."""

    def cenario(self, t):
        clone = repo_com_remoto(Path(t))
        sh(clone, "git", "commit", "-q", "--allow-empty", "-m", "base")
        sh(clone, "git", "push", "-q", "origin", "HEAD:refs/heads/main")
        sh(clone, "git", "switch", "-q", "-c", "recurso")
        sh(clone, "git", "commit", "-q", "--allow-empty", "-m", "recurso 1")
        sh(clone, "git", "push", "-q", "origin", "recurso")
        return clone, sh(clone, "git", "rev-parse", "HEAD").strip()

    def linha(self, clone, remoto):
        local = sh(clone, "git", "rev-parse", "HEAD").strip()
        return [f"refs/heads/recurso {local} refs/heads/recurso {remoto}"]

    def test_branch_ainda_aberto_passa(self):
        with tempfile.TemporaryDirectory() as t:
            clone, topo = self.cenario(t)
            sh(clone, "git", "commit", "-q", "--allow-empty", "-m", "recurso 2")
            self.assertEqual(branch_mergeado.mergeados(clone, self.linha(clone, topo)), [])

    def test_branch_mergeado_e_barrado(self):
        with tempfile.TemporaryDirectory() as t:
            clone, topo = self.cenario(t)
            # o dono mergeia pelo botão do GitHub: commit de merge no main
            sh(clone, "git", "switch", "-q", "main")
            sh(clone, "git", "merge", "-q", "--no-ff", "-m", "Merge pull request #1", "recurso")
            sh(clone, "git", "push", "-q", "origin", "main")
            sh(clone, "git", "switch", "-q", "recurso")
            sh(clone, "git", "commit", "-q", "--allow-empty", "-m", "recurso 2 depois do merge")
            self.assertEqual(branch_mergeado.mergeados(clone, self.linha(clone, topo)), ["recurso"])

    def test_branch_novo_e_ramos_de_estado_passam(self):
        with tempfile.TemporaryDirectory() as t:
            clone, topo = self.cenario(t)
            zero = "0" * 40
            linhas = [f"refs/heads/x {topo} refs/heads/novo {zero}",
                      f"refs/heads/y {topo} refs/heads/memoria-compartilhada {topo}"]
            self.assertEqual(branch_mergeado.mergeados(clone, linhas), [])

