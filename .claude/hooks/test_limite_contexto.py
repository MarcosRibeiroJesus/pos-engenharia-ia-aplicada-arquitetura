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
        self.handoff = self.pasta / "handoff"

    def escrever(self, *linhas):
        self.transcript.write_text("\n".join(linhas) + "\n", encoding="utf-8")

    def evento(self, sessao="s1"):
        return {"session_id": sessao, "transcript_path": str(self.transcript)}

    def decidir(self, sessao="s1"):
        # raiz e estado_dir apontam para a pasta temporária: o teste nunca escreve no repositório
        return hook.decidir(self.evento(sessao), marca_dir=self.pasta, estado_dir=self.handoff, raiz=self.pasta)

    def test_soma_entrada_e_cache_da_ultima_requisicao(self):
        self.escrever(linha(1000, 50_000, 2_000), linha(3_000, 120_000, 5_000))
        self.assertEqual(hook.tamanho_contexto(self.transcript), 3_000 + 120_000 + 5_000)

    def test_linha_sem_usage_e_ignorada(self):
        self.escrever(linha(1000), json.dumps({"message": {"role": "user"}}), "lixo nao json")
        self.assertEqual(hook.tamanho_contexto(self.transcript), 1000)

    def test_abaixo_do_limite_nao_fala_nada_nem_grava(self):
        self.escrever(linha(10_000, 100_000))
        self.assertIsNone(self.decidir())
        self.assertFalse(self.handoff.exists())

    def test_cruzar_o_limite_avisa_uma_vez_por_sessao(self):
        self.escrever(linha(10_000, 230_000))
        primeiro = self.decidir("s2")
        self.assertIsNotNone(primeiro)
        self.assertIn("acima de 230000", primeiro["hookSpecificOutput"]["additionalContext"])
        self.assertIsNone(self.decidir("s2"))

    def test_marca_e_por_sessao(self):
        self.escrever(linha(240_000))
        self.assertIsNotNone(self.decidir("a"))
        self.assertIsNotNone(self.decidir("b"))

    def test_sem_caminho_de_transcript_nao_faz_nada(self):
        self.assertIsNone(hook.decidir({"session_id": "x"}, marca_dir=self.pasta))

    def test_cruzar_o_limite_grava_o_estado_da_sessao(self):
        self.escrever(linha(10_000, 230_000))
        self.decidir("s3")
        estado = json.loads((self.handoff / "s3.json").read_text(encoding="utf-8"))
        self.assertEqual(estado["sessao"], "s3")
        self.assertEqual(estado["tokens"], 240_000)
        self.assertEqual(estado["limite"], 230_000)
        self.assertIn("resumo_estruturado", estado)

    def test_aviso_aponta_o_arquivo_de_estado_e_pede_a_decisao_do_dono(self):
        self.escrever(linha(240_000))
        texto = self.decidir("s4")["hookSpecificOutput"]["additionalContext"]
        self.assertIn(str(self.handoff / "s4.json"), texto)
        self.assertIn("fechar a sessão agora ou continuar", texto)

    def test_fora_de_repositorio_o_estado_sai_como_desconhecido(self):
        self.escrever(linha(240_000))
        self.decidir("s5")
        estado = json.loads((self.handoff / "s5.json").read_text(encoding="utf-8"))
        self.assertEqual(estado["branch"], "desconhecido")
        self.assertEqual(estado["ultimo_commit"], "desconhecido")


if __name__ == "__main__":
    unittest.main()
