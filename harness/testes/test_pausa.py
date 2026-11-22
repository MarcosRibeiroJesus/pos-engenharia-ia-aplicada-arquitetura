"""Assunto: projeto pausado pelo dono.

Pausar não é cancelar: o projeto continua no estado, com spec e plano, mas nenhuma sessão o retoma
nem delega tarefas dele sem uma nova decisão do dono (D-060, a recomendação da D01 pausada).
"""
from __future__ import annotations

from comum import *  # noqa: F401,F403


def est_com(p_extra: dict) -> dict:
    p = {"chave": "p", "disciplina": "01", "tipo": "arquitetura", "titulo": "t", "branch": "b",
         "pastas": ["modulos/x/"], "specs": "specs/p/", "fase": "especificar"}
    p.update(p_extra)
    return {"fases": estado.carregar()["fases"], "projetos": [p]}


class TestPausa(unittest.TestCase):
    def test_projeto_pausado_nao_delega_nem_antes_do_plano(self):
        est = est_com({"pausado": {"data": "2026-11-21", "fonte": "Marcos no chat: pausar a recomendação"}})
        ok, motivo = estado.pode_delegar(est, "p")
        self.assertFalse(ok)
        self.assertIn("pausado", motivo)
        self.assertIn("2026-11-21", motivo)

    def test_projeto_sem_pausa_segue_a_regra_de_antes(self):
        self.assertEqual(estado.pode_delegar(est_com({}), "p"), (True, ""))

    def test_pausa_sem_fonte_e_invalida(self):
        with tempfile.TemporaryDirectory() as t:
            raiz = Path(t)
            (raiz / "specs/p").mkdir(parents=True)
            erros = estado.problemas(est_com({"pausado": {"data": "2026-11-21"}}), raiz)
            self.assertTrue(any("pausado" in e for e in erros), erros)

    def test_status_mostra_a_pausa(self):
        linha = estado.linha_status(Path("."), est_com({"pausado": {"data": "2026-11-21", "fonte": "x"}})["projetos"][0])
        self.assertIn("PAUSADO", linha)


if __name__ == "__main__":
    unittest.main()
