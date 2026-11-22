"""Git com caminho acentuado no Windows: a saída do git é UTF-8, não cp1252 (D-043, marcador da memória)."""
from __future__ import annotations

from comum import *  # noqa: F401,F403


class TestCaminhoComAcento(unittest.TestCase):
    """Windows: o git devolve o caminho em UTF-8; decodificar em cp1252 quebra 'Pós' e o marcador de leitura."""

    def test_marcador_de_leitura_acha_o_git_dir_com_acento(self):
        with tempfile.TemporaryDirectory() as t:
            raiz = Path(t) / "Pós"
            raiz.mkdir()
            subprocess.run(["git", "init", "-q", str(raiz)], check=True)
            self.assertTrue(memoria.marca(raiz).parent.is_dir())
