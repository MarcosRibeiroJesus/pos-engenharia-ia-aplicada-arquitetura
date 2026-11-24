"""Testes do hook de limite de contexto (D-076). Rodar: python3 -m unittest test_limite_contexto."""
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import limite_contexto as hook  # noqa: E402


def linha(input_tokens: int, cache_read: int = 0, cache_write: int = 0) -> str:
    return json.dumps({"message": {"role": "assistant", "usage": {
        "input_tokens": input_tokens, "cache_read_input_tokens": cache_read,
        "cache_creation_input_tokens": cache_write, "output_tokens": 10}}})


class TestLimiteDeContexto(unittest.TestCase):
    def setUp(self):
        self.pasta = Path(tempfile.mkdtemp())
        self.transcript = self.pasta / "sessao.jsonl"

    def escrever(self, *linhas):
        self.transcript.write_text("\n".join(linhas) + "\n", encoding="utf-8")

    def evento(self, sessao="s1"):
        return {"session_id": sessao, "transcript_path": str(self.transcript)}

    def test_soma_entrada_e_cache_da_ultima_requisicao(self):
        self.escrever(linha(1000, 50_000, 2_000), linha(3_000, 120_000, 5_000))
        self.assertEqual(hook.tamanho_contexto(self.transcript), 3_000 + 120_000 + 5_000)

    def test_linha_sem_usage_e_ignorada(self):
        self.escrever(linha(1000), json.dumps({"message": {"role": "user"}}), "lixo nao json")
        self.assertEqual(hook.tamanho_contexto(self.transcript), 1000)

    def test_abaixo_do_limite_nao_fala_nada(self):
        self.escrever(linha(10_000, 100_000))
        self.assertIsNone(hook.decidir(self.evento(), marca_dir=self.pasta))

    def test_cruzar_o_limite_avisa_uma_vez_por_sessao(self):
        self.escrever(linha(10_000, 230_000))
        primeiro = hook.decidir(self.evento("s2"), marca_dir=self.pasta)
        self.assertIsNotNone(primeiro)
        self.assertIn("acima de 230000", primeiro["hookSpecificOutput"]["additionalContext"])
        self.assertIsNone(hook.decidir(self.evento("s2"), marca_dir=self.pasta))

    def test_marca_e_por_sessao(self):
        self.escrever(linha(240_000))
        self.assertIsNotNone(hook.decidir(self.evento("a"), marca_dir=self.pasta))
        self.assertIsNotNone(hook.decidir(self.evento("b"), marca_dir=self.pasta))

    def test_sem_caminho_de_transcript_nao_faz_nada(self):
        self.assertIsNone(hook.decidir({"session_id": "x"}, marca_dir=self.pasta))


if __name__ == "__main__":
    unittest.main()
