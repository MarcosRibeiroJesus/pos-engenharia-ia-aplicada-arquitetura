"""PY-07 (gerador sintético, T040): Art. VIII, RNF-007, RF-012, RNF-104.

O gerador do lote precisa ser reprodutível (mesma semente, mesmos bytes), marcar
todo registro como sintético, usar só categorias no padrão do RNF-104, dar
`inStock` a todo item e tirar os títulos da lista versionada de nomes fictícios
(`tests/fixtures/nomes-ficticios.json`), a mesma que o VT-14 (T077) usa. Cada título
tem uma categoria fixa na lista, e o item gerado leva essa categoria (T077, achado A2
da revisão da T040: categoria sorteada sem relação com o título).
"""
import hashlib
import json
import re
import socket
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

UNIDADE = Path(__file__).resolve().parents[2]
GERADOR = UNIDADE / "src" / "batch" / "gerar_dados_sinteticos.py"
NOMES = UNIDADE / "tests" / "fixtures" / "nomes-ficticios.json"
PADRAO_CATEGORIA = re.compile(r"^[A-Za-z0-9_]{1,40}$")
ENTIDADES = ("usuarios", "itens", "estoque", "interacoes")
VOLUME = {"usuarios": 7, "itens": 13, "interacoes": 90, "dias": 3}


def _rodar(destino, semente=42, **volume):
    vol = {**VOLUME, **volume}
    cmd = [
        sys.executable, "-I", str(GERADOR),
        "--destino", str(destino),
        "--semente", str(semente),
        "--usuarios", str(vol["usuarios"]),
        "--itens", str(vol["itens"]),
        "--interacoes", str(vol["interacoes"]),
        "--dias", str(vol["dias"]),
        "--data", "2026-01-15",
    ]
    subprocess.run(cmd, check=True, capture_output=True, text=True)


def _arvore(destino):
    """Mapa caminho relativo -> sha256 de todos os arquivos gerados."""
    base = Path(destino)
    return {
        str(p.relative_to(base)): hashlib.sha256(p.read_bytes()).hexdigest()
        for p in sorted(base.rglob("*")) if p.is_file()
    }


def _registros(destino, entidade):
    linhas = []
    for arquivo in sorted((Path(destino) / entidade).rglob("*.jsonl")):
        linhas.extend(json.loads(l) for l in arquivo.read_text(encoding="utf-8").splitlines() if l)
    return linhas


def _titulos_estranhos(itens, permitidos):
    return sorted({i.get("title") for i in itens} - set(permitidos))


class TestGeradorSintetico(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not GERADOR.exists():
            raise AssertionError(f"gerador ausente: {GERADOR}")
        cls._tmp = tempfile.TemporaryDirectory()
        cls.a = Path(cls._tmp.name) / "a"
        cls.b = Path(cls._tmp.name) / "b"
        _rodar(cls.a)
        _rodar(cls.b)
        lista = json.loads(NOMES.read_text(encoding="utf-8"))
        cls.categoria_do_titulo = {i["titulo"]: i["categoria"] for i in lista["itens"]}
        cls.permitidos = list(cls.categoria_do_titulo)

    @classmethod
    def tearDownClass(cls):
        cls._tmp.cleanup()

    def test_mesma_semente_mesmos_bytes(self):
        arvore_a = _arvore(self.a)
        self.assertTrue(arvore_a, "nenhum arquivo gerado")
        self.assertEqual(arvore_a, _arvore(self.b))

    def test_semente_diferente_muda_os_dados(self):
        with tempfile.TemporaryDirectory() as tmp:
            _rodar(tmp, semente=7)
            self.assertNotEqual(_arvore(self.a), _arvore(tmp))

    def test_gera_as_quatro_entidades_no_volume_pedido(self):
        self.assertEqual(len(_registros(self.a, "usuarios")), VOLUME["usuarios"])
        self.assertEqual(len(_registros(self.a, "itens")), VOLUME["itens"])
        self.assertEqual(len(_registros(self.a, "estoque")), VOLUME["itens"])
        self.assertEqual(len(_registros(self.a, "interacoes")), VOLUME["interacoes"])

    def test_interacoes_particionadas_pelos_dias_pedidos(self):
        particoes = {p.parent.relative_to(self.a / "interacoes").as_posix()
                     for p in (self.a / "interacoes").rglob("*.jsonl")}
        self.assertEqual(particoes, {
            "year=2026/month=01/day=13", "year=2026/month=01/day=14", "year=2026/month=01/day=15",
        })

    def test_todo_registro_e_sintetico(self):
        for entidade in ENTIDADES:
            for r in _registros(self.a, entidade):
                self.assertIs(r.get("sintetico"), True, f"{entidade}: {r}")

    def test_categorias_no_padrao_do_rnf_104(self):
        for item in _registros(self.a, "itens"):
            self.assertRegex(item["category"], PADRAO_CATEGORIA)

    def test_todo_item_tem_in_stock_booleano(self):
        estoque = {e["itemId"]: e["inStock"] for e in _registros(self.a, "estoque")}
        for item in _registros(self.a, "itens"):
            self.assertIsInstance(item.get("inStock"), bool, item)
            self.assertEqual(item["inStock"], estoque[item["itemId"]])

    def test_titulos_so_da_lista_de_nomes_ficticios(self):
        self.assertEqual(_titulos_estranhos(_registros(self.a, "itens"), self.permitidos), [])

    def test_checagem_de_titulos_reprova_nome_fora_da_lista(self):
        # Prova que a checagem morde: um título que não está na lista precisa aparecer.
        falso = [{"title": "Produto Que Nao Esta Na Lista"}]
        self.assertEqual(_titulos_estranhos(falso, self.permitidos), ["Produto Que Nao Esta Na Lista"])

    def test_categoria_e_a_do_titulo_na_lista(self):
        for item in _registros(self.a, "itens"):
            self.assertEqual(item["category"], self.categoria_do_titulo[item["title"]], item)

    def test_lista_com_categoria_fora_do_padrao_e_recusada(self):
        sys.path.insert(0, str(GERADOR.parent))
        try:
            import gerar_dados_sinteticos as gerador
        finally:
            sys.path.pop(0)
        ruins = (
            {"categorias": ["Casa"], "itens": [{"titulo": "Cesto", "categoria": "Casa & Mesa"}]},
            {"categorias": ["Casa"], "itens": [{"titulo": "Cesto", "categoria": "Jardim"}]},
            {"categorias": ["Casa"], "itens": [{"titulo": "Cesto", "categoria": "Casa"},
                                               {"titulo": "Cesto", "categoria": "Casa"}]},
            {"categorias": ["Casa"], "itens": []},
        )
        with tempfile.TemporaryDirectory() as tmp:
            for n, conteudo in enumerate(ruins):
                arquivo = Path(tmp) / f"lista-{n}.json"
                arquivo.write_text(json.dumps(conteudo), encoding="utf-8")
                with self.subTest(conteudo=conteudo), self.assertRaises(ValueError):
                    gerador.carregar_catalogo(arquivo)

    def test_interacoes_referenciam_usuarios_e_itens_gerados(self):
        usuarios = {u["userId"] for u in _registros(self.a, "usuarios")}
        itens = {i["itemId"] for i in _registros(self.a, "itens")}
        for r in _registros(self.a, "interacoes"):
            self.assertIn(r["userId"], usuarios)
            self.assertIn(r["itemId"], itens)
            self.assertIn(r["eventType"], {"view", "click", "add_to_cart", "purchase"})

    def test_roda_sem_rede(self):
        sys.path.insert(0, str(GERADOR.parent))
        try:
            import gerar_dados_sinteticos as gerador
        finally:
            sys.path.pop(0)

        def _sem_rede(*_a, **_k):
            raise AssertionError("o gerador tentou abrir conexão de rede")

        with tempfile.TemporaryDirectory() as tmp, \
                mock.patch.object(socket, "socket", _sem_rede), \
                mock.patch.object(socket, "create_connection", _sem_rede):
            gerador.main(["--destino", tmp, "--usuarios", "2", "--itens", "3",
                          "--interacoes", "5", "--dias", "1", "--data", "2026-01-15"])
            self.assertTrue(_arvore(tmp))

    def test_volume_invalido_e_recusado(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(subprocess.CalledProcessError):
                _rodar(tmp, usuarios=0)


if __name__ == "__main__":
    unittest.main()
