"""Execução autônoma: executor, revisão por tarefa, comandos liberados e o que nunca roda sozinho (D-047)."""
from __future__ import annotations

from comum import *  # noqa: F401,F403

sys.path.insert(0, str(AQUI.parent / ".claude" / "hooks"))
import gate_execucao  # noqa: E402

RAIZ = AQUI.parent


class TestGateExecucao(unittest.TestCase):
    def test_nega_o_irreversivel(self):
        for cmd in ("git push --force origin x", "git push -f", "git push origin +x", "git push --force-with-lease",
                    "git push origin main", "git push origin HEAD:main", "gh pr merge 31 --squash",
                    "gh api -X PUT repos/o/r/pulls/31/merge", "terraform apply -auto-approve",
                    "terraform -chdir=plataforma/agentes/infra/terraform destroy"):
            self.assertIsNotNone(gate_execucao.decidir(cmd), cmd)

    def test_libera_o_trabalho_normal(self):
        for cmd in ("git push -u origin plataforma/00-plataforma-agentes-impl", "git push origin feat/x",
                    "terraform test", "terraform plan -out=p", "terraform -chdir=plataforma/agentes/tests/floci apply -auto-approve",
                    "gh pr create --title x", "git commit -m 'feat: main page'", "python3 harness/estado.py validar"):
            self.assertIsNone(gate_execucao.decidir(cmd), cmd)


class TestConfiguracaoDaExecucao(unittest.TestCase):
    cfg = json.loads((RAIZ / ".claude" / "settings.json").read_text(encoding="utf-8"))

    def test_hook_registrado(self):
        self.assertTrue(any("gate_execucao.py" in h["command"] and m["matcher"] == "Bash"
                            for m in self.cfg["hooks"]["PreToolUse"] for h in m["hooks"]))

    def test_comandos_necessarios_liberados(self):
        allow = set(self.cfg["permissions"]["allow"])
        for regra in ("Bash(python3:*)", "Bash(terraform:*)", "Bash(git commit:*)", "Bash(git push:*)",
                      "Bash(gh pr create:*)", "Bash(tflint:*)", "Bash(checkov:*)", "Edit", "Write"):
            self.assertIn(regra, allow)
        self.assertIn("Bash(gh pr merge:*)", self.cfg["permissions"]["deny"])

    def test_skill_do_executor_com_revisao_por_tarefa_e_escalonamento(self):
        texto = (RAIZ / ".claude" / "skills" / "executar-tarefas" / "SKILL.md").read_text(encoding="utf-8")
        for trecho in ("revisor-independente", "2 rodadas", "um commit por tarefa", "Quando interromper o dono", "[DONO]"):
            self.assertIn(trecho, texto)

    def test_revisores_da_esteira_usam_o_token_da_assinatura(self):
        wf = (RAIZ / ".github" / "workflows" / "seguranca.yml").read_text(encoding="utf-8")
        self.assertEqual(wf.count("CLAUDE_CODE_OAUTH_TOKEN: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}"), 2)
        provedor = (RAIZ / ".github" / "ia" / "provedor.sh").read_text(encoding="utf-8")
        self.assertLess(provedor.index("CLAUDE_CODE_OAUTH_TOKEN"), provedor.index("AWS_BEDROCK_ROLE_ARN"))
