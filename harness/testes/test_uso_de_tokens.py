"""Uso de tokens: subagentes no registro, total medido sem divisão e Sonnet no mecânico (D-058)."""
from __future__ import annotations

from comum import *  # noqa: F401,F403

RAIZ = AQUI.parent
sys.path.insert(0, str(RAIZ / ".claude" / "hooks"))
import registrar_uso  # noqa: E402


class TestUsoDeTokens(unittest.TestCase):
    def test_hook_soma_os_subagentes(self):
        with tempfile.TemporaryDirectory() as t:
            t = Path(t)
            principal = t / "s1.jsonl"
            principal.write_text(json.dumps({"message": {"id": "a", "model": "claude-opus-5-5",
                                                         "usage": {"input_tokens": 10, "output_tokens": 1}}}))
            (t / "s1" / "subagents").mkdir(parents=True)
            (t / "s1" / "subagents" / "agent-x.jsonl").write_text(json.dumps(
                {"message": {"id": "b", "model": "claude-sonnet-5-5", "usage": {"input_tokens": 5, "output_tokens": 2}}}))
            soma = registrar_uso.somar_sessao(principal)
            self.assertEqual(soma["claude-opus-5-5"]["input"], 10)
            self.assertEqual(soma["claude-sonnet-5-5"]["output"], 2)

    def test_ledger_tem_a_coluna_total(self):
        cab = (RAIZ / "docs" / "uso" / "uso-tokens.csv").read_text(encoding="utf-8").splitlines()[0]
        self.assertIn(",total,", cab)

    def test_regras_no_claude_md_e_no_executor(self):
        self.assertIn("D-058", (RAIZ / "CLAUDE.md").read_text(encoding="utf-8"))
        skill = (RAIZ / ".claude" / "skills" / "executar-tarefas" / "SKILL.md").read_text(encoding="utf-8")
        self.assertIn("model: sonnet", skill)
        self.assertIn("harness/uso/", skill)
