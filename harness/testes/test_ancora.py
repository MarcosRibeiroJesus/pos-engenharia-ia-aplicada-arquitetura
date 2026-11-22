"""Assunto: arquitetura âncora oficial da AWS de cada projeto de arquitetura (D-065).

Todo projeto de arquitetura parte de uma arquitetura publicada pela AWS e escolhida pelo dono. Sem a
âncora registrada no estado, o projeto não passa do planejar: o plano e o ADR-0001 dependem dela.
"""
from __future__ import annotations

from comum import *  # noqa: F401,F403

ANCORA = {"url": "https://aws.amazon.com/blogs/architecture/x", "titulo": "X", "data": "2026-09-01",
          "fonte": "Marcos no chat: aceito"}


def est(fase: str, tipo: str = "arquitetura", ancora: dict | None = None) -> dict:
    p = {"chave": "p", "disciplina": "01", "tipo": tipo, "titulo": "t", "branch": "b", "pastas": ["modulos/x/"],
         "specs": "specs/p/", "fase": fase}
    if ancora is not None:
        p["ancora"] = ancora
    return {"fases": estado.carregar()["fases"], "projetos": [p]}


def erros_de_ancora(e: dict) -> list[str]:
    with tempfile.TemporaryDirectory() as t:
        raiz = Path(t)
        (raiz / "specs/p").mkdir(parents=True)
        for arq in ("spec.md", "plan.md", "tasks.md", "analise.md"):
            (raiz / "specs/p" / arq).write_text("x", encoding="utf-8")
        return [x for x in estado.problemas(e, raiz) if "ancora" in x]


class TestAncora(unittest.TestCase):
    def test_arquitetura_antes_do_plano_pode_nao_ter_ancora(self):
        self.assertEqual(erros_de_ancora(est("especificar")), [])

    def test_arquitetura_depois_do_planejar_exige_ancora(self):
        self.assertTrue(erros_de_ancora(est("tarefas")))

    def test_ancora_completa_passa(self):
        self.assertEqual(erros_de_ancora(est("implementar", ancora=ANCORA)), [])

    def test_ancora_sem_fonte_do_dono_ou_fora_da_aws_reprova(self):
        self.assertTrue(erros_de_ancora(est("implementar", ancora={**ANCORA, "fonte": ""})))
        self.assertTrue(erros_de_ancora(est("implementar", ancora={**ANCORA, "url": "https://exemplo.com/x"})))

    def test_ia_aplicada_nao_exige_ancora(self):
        self.assertEqual(erros_de_ancora(est("implementar", tipo="ia-aplicada")), [])

    def test_estado_real_traz_as_tres_ancoras(self):
        projetos = {p["chave"]: p for p in estado.carregar()["projetos"]}
        for chave in ("01-recomendacao", "02-assistente-agendamento", "03-mcp-regras-cdb"):
            self.assertIn("aws.amazon.com", projetos[chave]["ancora"]["url"], chave)


if __name__ == "__main__":
    unittest.main()
