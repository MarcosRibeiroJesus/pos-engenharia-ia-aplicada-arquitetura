"""Estado compartilhado em branch, memória e decisões do dono (D-025)."""
from __future__ import annotations

from comum import *  # noqa: F401,F403


class TestRamoCompartilhado(unittest.TestCase):
    def test_gravar_e_ler_sem_tocar_a_arvore_de_trabalho(self):
        with tempfile.TemporaryDirectory() as t:
            clone = repo_com_remoto(Path(t))
            self.assertIsNone(ramo.ler(clone, "agentes-status", "disponibilidade.json"))
            ramo.gravar(clone, "agentes-status", "disponibilidade.json", '{"a": 1}\n', "primeiro")
            ramo.gravar(clone, "agentes-status", "outro.txt", "x\n", "segundo")
            self.assertEqual(ramo.ler(clone, "agentes-status", "disponibilidade.json"), '{"a": 1}\n')
            self.assertEqual(ramo.ler(clone, "agentes-status", "outro.txt"), "x\n")
            self.assertEqual(list(Path(clone).iterdir()), [Path(clone) / ".git"])

    def test_segundo_clone_ve_o_que_o_primeiro_gravou(self):
        with tempfile.TemporaryDirectory() as t:
            a = repo_com_remoto(Path(t))
            b = Path(t) / "b"
            sh(Path(t), "git", "clone", "-q", str(Path(t) / "remoto.git"), str(b))
            for k, v in (("user.email", "t@t"), ("user.name", "t"), ("commit.gpgsign", "false")):
                sh(b, "git", "config", k, v)  # o runner do CI não tem identidade global do git
            ramo.gravar(a, "agentes-status", "d.json", "1\n", "a")
            ramo.gravar(b, "agentes-status", "d.json", "2\n", "b")
            self.assertEqual(ramo.ler(a, "agentes-status", "d.json"), "2\n")
            self.assertEqual(len(sh(a, "git", "log", "--oneline", "origin/agentes-status").splitlines()), 2)


class TestMemoria(unittest.TestCase):
    def test_verificar_bloqueia_ate_ler_a_versao_nova(self):
        with tempfile.TemporaryDirectory() as t:
            clone = repo_com_remoto(Path(t))
            ramo.gravar(clone, "memoria-compartilhada", "DECISOES.md", "v1\n", "v1")
            self.assertEqual(memoria.main(["verificar"], clone), 1)
            self.assertEqual(memoria.main(["ler"], clone), 0)
            self.assertEqual(memoria.main(["verificar"], clone), 0)
            ramo.gravar(clone, "memoria-compartilhada", "DECISOES.md", "v2\n", "v2")
            self.assertEqual(memoria.main(["verificar"], clone), 1)

    def test_sem_ramo_nao_bloqueia(self):
        with tempfile.TemporaryDirectory() as t:
            self.assertEqual(memoria.main(["verificar"], repo_com_remoto(Path(t))), 0)


class TestDecisaoDoDono(unittest.TestCase):
    """D-025: decisão do dono registra onde foi aplicada."""
    HIST = """### 2026-11-19 · D-030 · Algo · fonte: Marcos
Texto.
**Aplicado em:** CLAUDE.md, skill x.

### 2026-11-19 · D-029 · Outra · fonte: Marcos
Sem aplicação.

### 2026-11-19 · D-028 · Técnica · fonte: delegada
Sem aplicação, mas delegada.

### 2026-11-19 · D-020 · Antiga · fonte: Marcos
Antes da regra.
"""

    def test_auditoria_aponta_so_decisao_do_dono_recente_sem_aplicacao(self):
        self.assertEqual(memoria.sem_aplicacao(self.HIST), ["D-029"])

