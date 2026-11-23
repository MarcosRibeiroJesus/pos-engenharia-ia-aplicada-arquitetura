"""Assunto: economia de tokens com rtk e headroom (D-067).

O rtk reescreve comandos do Bash para devolver saída compacta. O hook original dele aprova sozinho o
comando reescrito (`permissionDecision: allow`), inclusive `git push`. O wrapper do projeto só repassa a
reescrita de comandos simples de leitura e de teste; o resto segue o fluxo normal de permissão. O
headroom roda só onde o `claude` é um processo comum (máquina do dono), com a telemetria desligada.
"""
from __future__ import annotations

import json
import os
import stat

from comum import *  # noqa: F401,F403

RAIZ = AQUI.parent
WRAPPER = RAIZ / ".claude/hooks/rtk_rewrite.py"


def rodar_wrapper(comando: str, rtk_reescreve_para: str | None, sem_rtk: bool = False) -> tuple[int, str]:
    with tempfile.TemporaryDirectory() as t:
        bin_dir = Path(t)
        if not sem_rtk:
            falso = bin_dir / "rtk"
            saida = "" if rtk_reescreve_para is None else json.dumps({"hookSpecificOutput": {
                "hookEventName": "PreToolUse", "permissionDecision": "allow",
                "permissionDecisionReason": "RTK auto-rewrite", "updatedInput": {"command": rtk_reescreve_para}}})
            falso.write_text(f"#!/bin/sh\ncat >/dev/null\nprintf '%s' '{saida}'\n", encoding="utf-8")
            falso.chmod(falso.stat().st_mode | stat.S_IEXEC)
        env = {**os.environ, "PATH": f"{bin_dir}:/usr/bin:/bin"}
        evento = json.dumps({"tool_name": "Bash", "tool_input": {"command": comando}})
        r = subprocess.run([sys.executable, str(WRAPPER)], input=evento, capture_output=True, text=True, env=env)
        return r.returncode, r.stdout.strip()


class TestWrapperDoRtk(unittest.TestCase):
    def test_sem_rtk_instalado_nao_atrapalha(self):
        self.assertEqual(rodar_wrapper("git status", None, sem_rtk=True), (0, ""))

    def test_leitura_simples_passa_a_reescrita(self):
        codigo, saida = rodar_wrapper("git status", "rtk git status")
        self.assertEqual(codigo, 0)
        self.assertEqual(json.loads(saida)["hookSpecificOutput"]["updatedInput"]["command"], "rtk git status")

    def test_teste_simples_passa_a_reescrita(self):
        self.assertIn("rtk pytest", rodar_wrapper("pytest -q", "rtk pytest -q")[1])

    def test_push_nao_ganha_aprovacao_automatica(self):
        self.assertEqual(rodar_wrapper("git push origin x", "rtk git push origin x"), (0, ""))

    def test_comando_composto_nao_ganha_aprovacao_automatica(self):
        self.assertEqual(rodar_wrapper("git status && rm -rf x", "rtk git status && rm -rf x"), (0, ""))

    def test_rtk_que_nao_reescreve_fica_quieto(self):
        self.assertEqual(rodar_wrapper("python3 harness/estado.py validar", None), (0, ""))


class TestConfiguracao(unittest.TestCase):
    def test_hook_no_settings_do_projeto(self):
        s = json.loads((RAIZ / ".claude/settings.json").read_text(encoding="utf-8"))
        comandos = [h["command"] for b in s["hooks"]["PreToolUse"] if b["matcher"] == "Bash" for h in b["hooks"]]
        self.assertTrue(any("rtk_rewrite.py" in c for c in comandos), comandos)

    def test_setup_fixa_o_rtk_do_repositorio_oficial(self):
        texto = (RAIZ / "scripts/setup-ambiente.sh").read_text(encoding="utf-8")
        self.assertIn("https://github.com/rtk-ai/rtk", texto)
        self.assertIn("--tag", texto)
        self.assertIn("rtk gain", texto)

    def test_headroom_local_com_telemetria_desligada_e_versao_fixa(self):
        texto = (RAIZ / "scripts/headroom-local.sh").read_text(encoding="utf-8")
        self.assertIn("HEADROOM_TELEMETRY=off", texto)
        self.assertIn("HEADROOM_BEACON=off", texto)
        self.assertRegex(texto, r'HEADROOM_VERSAO="\$\{HEADROOM_VERSAO:-\d+\.\d+\.\d+\}"')
        self.assertIn('headroom-ai[proxy]==${HEADROOM_VERSAO}', texto)
        codigo = "\n".join(l for l in texto.splitlines() if not l.lstrip().startswith("#"))
        self.assertNotIn("learn", codigo)

    def test_plugin_do_antigravity(self):
        hooks = json.loads((RAIZ / ".agents/plugins/rtk/hooks.json").read_text(encoding="utf-8"))
        self.assertIn("rtk hook antigravity", json.dumps(hooks))


if __name__ == "__main__":
    unittest.main()
