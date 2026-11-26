"""Execução autônoma: executor, revisão por tarefa, comandos liberados e o que nunca roda sozinho (D-047)."""
from __future__ import annotations

from comum import *  # noqa: F401,F403

sys.path.insert(0, str(AQUI.parent / ".claude" / "hooks"))
import gate_execucao  # noqa: E402

RAIZ = AQUI.parent


import push_seguro  # noqa: E402


class TestGateExecucao(unittest.TestCase):
    """Casos da revisão automática do #34: opções globais do git, aspas, gh api que escreve, -chdir e código inline."""

    NEGA = ("git push --force origin x", "git push -f", "git push origin +x", "git push --force-with-lease",
            "git push origin main", "git push origin HEAD:main", "git -C . push --force", "git -c x=y push -f origin x",
            "git push origin 'main'", 'git push origin "main"', "git push origin --force x", "git push -uf origin x",
            "gh pr merge 31 --squash", "gh api -X PUT repos/o/r/pulls/31/merge", "gh api repos/o/r/merges -f base=main -f head=x",
            "gh api graphql -f query=x", "gh api -X PATCH repos/o/r/git/refs/heads/main -F force=true",
            "terraform apply -auto-approve", "terraform -chdir=infra apply -var env=floci",
            "terraform -chdir=plataforma/agentes/infra/terraform destroy",
            "python3 -c \"import os;os.system('git push -f origin main')\"", "bash -c 'git push -f'", "ls && git push origin main")
    LIBERA = ("git push -u origin plataforma/00-plataforma-agentes-impl", "git push origin feat/x", "terraform test",
              "terraform plan -out=p", "terraform -chdir=plataforma/agentes/tests/floci apply -auto-approve",
              "gh pr create --title x", "git commit -m 'feat: main page'", "python3 harness/estado.py validar",
              "gh api repos/o/r/pulls/31", "gh pr view 31")

    def test_nega_o_irreversivel(self):
        for cmd in self.NEGA:
            self.assertIsNotNone(gate_execucao.decidir(cmd), cmd)

    def test_libera_o_trabalho_normal(self):
        for cmd in self.LIBERA:
            self.assertIsNone(gate_execucao.decidir(cmd), cmd)


class TestPushSeguroNoGit(unittest.TestCase):
    """A trava do pre-push vale por qualquer caminho de invocação (D-047)."""

    def _repo(self, t: Path) -> tuple[Path, str, str]:
        r = t / "r"
        sh(t, "git", "init", "-q", str(r))
        for k, v in (("user.email", "t@t"), ("user.name", "t"), ("commit.gpgsign", "false")):
            sh(r, "git", "config", k, v)
        (r / "a").write_text("1")
        sh(r, "git", "add", "a"); sh(r, "git", "commit", "-qm", "1")
        um = sh(r, "git", "rev-parse", "HEAD").strip()
        (r / "a").write_text("2")
        sh(r, "git", "commit", "-qam", "2")
        dois = sh(r, "git", "rev-parse", "HEAD").strip()
        return r, um, dois

    def test_regras(self):
        with tempfile.TemporaryDirectory() as t:
            r, um, dois = self._repo(Path(t))
            z = push_seguro.ZERO
            self.assertEqual(push_seguro.problemas(str(r), [f"refs/heads/x {dois} refs/heads/x {um}"]), [])
            self.assertEqual(push_seguro.problemas(str(r), [f"refs/heads/x {dois} refs/heads/x {z}"]), [])
            self.assertTrue(push_seguro.problemas(str(r), [f"refs/heads/x {um} refs/heads/x {dois}"]))   # força
            self.assertTrue(push_seguro.problemas(str(r), [f"refs/heads/x {dois} refs/heads/main {um}"]))  # main
            self.assertTrue(push_seguro.problemas(str(r), [f"(delete) {z} refs/heads/x {um}"]))             # apagar
            self.assertTrue(push_seguro.problemas(str(r), [f"refs/heads/x {dois} refs/heads/x {'1' * 40}"]))  # remoto desconhecido

    def test_pre_push_chama_a_trava(self):
        self.assertIn("harness/push_seguro.py", (AQUI.parent / ".githooks" / "pre-push").read_text(encoding="utf-8"))


class TestConfiguracaoDaExecucao(unittest.TestCase):
    cfg = json.loads((RAIZ / ".claude" / "settings.json").read_text(encoding="utf-8"))

    def test_hook_registrado(self):
        self.assertTrue(any("gate_execucao.py" in h["command"] and m["matcher"] == "Bash"
                            for m in self.cfg["hooks"]["PreToolUse"] for h in m["hooks"]))

    def test_comandos_necessarios_liberados(self):
        allow = set(self.cfg["permissions"]["allow"])
        for regra in ("Bash(python3 harness/*)", "Bash(terraform test*)", "Bash(git commit *)", "Bash(git push*)",
                      "Bash(gh pr create *)", "Bash(tflint*)", "Bash(checkov*)", "Edit", "Write"):
            self.assertIn(regra, allow)
        # revisão do #34: nada de interpretador genérico, gh api livre ou docker livre
        for generico in ("Bash(python3:*)", "Bash(python3*)", "Bash(node:*)", "Bash(docker:*)", "Bash(gh api:*)", "WebFetch"):
            self.assertNotIn(generico, allow)
        deny = set(self.cfg["permissions"]["deny"])
        for regra in ("Bash(gh pr merge*)", "Bash(gh api*)", "WebFetch"):
            self.assertIn(regra, deny)

    def test_skill_do_executor_com_revisao_no_ci_e_escalonamento(self):
        # D-075: a revisão de código é do CI (CodeRabbit), não de um revisor por tarefa
        texto = (RAIZ / ".claude" / "skills" / "executar-tarefas" / "SKILL.md").read_text(encoding="utf-8")
        for trecho in ("CodeRabbit", "2 rodadas", "um commit por tarefa", "Quando interromper o dono", "[DONO]"):
            self.assertIn(trecho, texto)
        self.assertNotIn("revisor-independente", texto)

    def test_coderabbit_e_o_unico_revisor_de_codigo_em_portugues(self):
        # D-075: CodeRabbit é o revisor de código (um só), em pt-BR, com instruções por caminho
        cfg = (RAIZ / ".coderabbit.yaml").read_text(encoding="utf-8")
        self.assertIn('language: "pt-BR"', cfg)
        self.assertIn("path_instructions:", cfg)

    def test_revisores_da_esteira_usam_o_token_da_assinatura_so_no_passo(self):
        wf = (RAIZ / ".github" / "workflows" / "seguranca.yml").read_text(encoding="utf-8")
        self.assertEqual(wf.count("TEM_ASSINATURA: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN != '' }}"), 2)
        # o segredo só aparece com 10 espaços (env de passo), nunca com 6 (env de job)
        self.assertEqual(wf.count("\n          CLAUDE_CODE_OAUTH_TOKEN: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}"), 2)
        self.assertNotIn("\n      CLAUDE_CODE_OAUTH_TOKEN:", wf)
        provedor = (RAIZ / ".github" / "ia" / "provedor.sh").read_text(encoding="utf-8")
        self.assertLess(provedor.index("TEM_ASSINATURA"), provedor.index("AWS_BEDROCK_ROLE_ARN"))

    def test_agentes_da_esteira_nao_carregam_a_configuracao_do_pr(self):
        ia = RAIZ / ".github" / "ia"
        self.assertIn('"--setting-sources", "user"', (ia / "claude_estruturado.py").read_text(encoding="utf-8"))
        self.assertIn("--setting-sources user", (ia / "corrigir.sh").read_text(encoding="utf-8"))
        wf = (RAIZ / ".github" / "workflows" / "seguranca.yml").read_text(encoding="utf-8")
        for script in ("provedor.sh", "revisar.sh", "corrigir.sh", "publicar_correcao.sh"):
            self.assertIn(f"bash .base/.github/ia/{script}", wf)

    def test_revisar_nao_usa_pipe_git_diff_para_head_com_pipefail(self):
        # Evita SIGPIPE (exit 141) sob `set -o pipefail` quando o diff do PR excede 120 KB.
        revisar = (RAIZ / ".github" / "ia" / "revisar.sh").read_text(encoding="utf-8")
        self.assertNotIn("| head -c", revisar)
        self.assertIn("head -c 120000", revisar)
