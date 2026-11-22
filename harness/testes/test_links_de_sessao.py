"""Regra de privacidade: nenhum arquivo rastreado pode conter link de sessão do Claude (repositório público)."""
from __future__ import annotations

from comum import *  # noqa: F401,F403

PADRAO = re.compile(r"claude\.ai/(code/session_|chat/)")


class TestLinksDeSessao(unittest.TestCase):
    def test_nenhum_arquivo_rastreado_tem_link_de_sessao(self):
        achados = []
        for caminho in sh(AQUI.parent, "git", "ls-files").splitlines():
            arq = AQUI.parent / caminho
            if caminho.replace("\\", "/") == "harness/testes/test_links_de_sessao.py":
                continue  # o próprio teste contém o exemplo que reprova
            if not arq.is_file() or arq.suffix.lower() in {".png", ".jpg", ".pdf", ".zip", ".gif", ".ico"}:
                continue
            texto = arq.read_bytes().decode("utf-8", errors="ignore")
            for n, linha in enumerate(texto.splitlines(), 1):
                if PADRAO.search(linha):
                    achados.append(f"{caminho}:{n}")
        self.assertEqual(achados, [], "link de sessão do Claude no repositório (público)")

    def test_o_proprio_teste_detecta_o_padrao(self):
        self.assertTrue(PADRAO.search("https://claude.ai/code/session_014gRS84KdKZYfAaL6x75RNK"))
        self.assertFalse(PADRAO.search("https://claude.com/claude-code"))
