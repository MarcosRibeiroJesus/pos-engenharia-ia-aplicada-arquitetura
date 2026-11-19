"""Testes do harness agnóstico de agente: troca de agente, estado compartilhado em branch,
memória, gate SDD por arquivos e sincronização das skills.  python3 -m unittest harness/test_harness.py"""
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))
import agente  # noqa: E402
import estado  # noqa: E402
import memoria  # noqa: E402
import ramo  # noqa: E402
import sincronizar_agentes  # noqa: E402

FUSO = timezone(timedelta(hours=-3))
AGORA = datetime(2026, 11, 19, 12, 0, tzinfo=FUSO)


def sh(cwd: Path, *args: str) -> str:
    return subprocess.run(args, cwd=cwd, check=True, capture_output=True, text=True).stdout


def repo_com_remoto(tmp: Path) -> Path:
    remoto, clone = tmp / "remoto.git", tmp / "clone"
    sh(tmp, "git", "init", "-q", "--bare", str(remoto))
    sh(tmp, "git", "init", "-q", str(clone))
    for k, v in (("user.email", "t@t"), ("user.name", "t"), ("commit.gpgsign", "false")):
        sh(clone, "git", "config", k, v)
    sh(clone, "git", "remote", "add", "origin", str(remoto))
    return clone


class TestEscolhaDeAgente(unittest.TestCase):
    cfg = agente.config()

    def test_todo_agente_tem_modelo_para_todo_nivel(self):
        for nome, info in self.cfg["agentes"].items():
            for nivel in self.cfg["niveis"]:
                self.assertTrue(info["modelos"].get(nivel), f"{nome} sem modelo {nivel}")

    def test_toda_ordem_cobre_os_tres_agentes(self):
        for nivel, ordem in self.cfg["ordem"].items():
            self.assertEqual(sorted(ordem), sorted(self.cfg["agentes"]), nivel)

    def test_arquitetura_vai_para_claude_code_quando_disponivel(self):
        self.assertEqual(agente.escolher(self.cfg, {}, "arquitetura", AGORA)[0], "claude-code")

    def test_mecanica_prefere_copilot_para_poupar_a_janela_do_claude(self):
        self.assertEqual(agente.escolher(self.cfg, {}, "mecanica", AGORA)[0], "copilot")

    def test_cota_esgotada_passa_para_o_proximo_com_modelo_do_mesmo_nivel(self):
        disp = {"claude-code": {"status": "esgotado", "ate": (AGORA + timedelta(hours=3)).isoformat()}}
        nome, nivel, modelo = agente.escolher(self.cfg, disp, "codigo", AGORA)
        self.assertEqual((nome, nivel), (self.cfg["ordem"]["maximo"][1], "maximo"))
        self.assertEqual(modelo, self.cfg["agentes"][nome]["modelos"]["maximo"])

    def test_cota_volta_sozinha_depois_do_horario(self):
        reg = {"status": "esgotado", "ate": (AGORA - timedelta(minutes=1)).isoformat()}
        self.assertTrue(agente.disponivel(reg, AGORA))

    def test_esgotado_sem_horario_continua_indisponivel(self):
        self.assertFalse(agente.disponivel({"status": "esgotado"}, AGORA))

    def test_todos_esgotados_devolve_nada(self):
        ate = (AGORA + timedelta(hours=1)).isoformat()
        disp = {n: {"status": "esgotado", "ate": ate} for n in self.cfg["agentes"]}
        self.assertIsNone(agente.escolher(self.cfg, disp, "post", AGORA))

    def test_tarefa_desconhecida_e_erro(self):
        with self.assertRaises(ValueError):
            agente.escolher(self.cfg, {}, "inventada", AGORA)

    def test_prompt_de_passagem_traz_o_ritual(self):
        p = agente.prompt_de_passagem("copilot", "codigo", "03-mcp-regras-cdb")
        for trecho in ("AGENTS.md", "harness/init.sh", "memoria.py ler", "03-mcp-regras-cdb", "progresso.md"):
            self.assertIn(trecho, p)


class TestRamoCompartilhado(unittest.TestCase):
    def test_gravar_e_ler_sem_tocar_a_arvore_de_trabalho(self):
        with tempfile.TemporaryDirectory() as t:
            clone = repo_com_remoto(Path(t))
            self.assertIsNone(ramo.ler(clone, "agentes-status", "disponibilidade.json"))
            ramo.gravar(clone, "agentes-status", "disponibilidade.json", '{"a": 1}\n', "primeiro")
            ramo.gravar(clone, "agentes-status", "outro.txt", "x\n", "segundo")
            self.assertEqual(ramo.ler(clone, "agentes-status", "disponibilidade.json"), '{"a": 1}\n')
            self.assertEqual(ramo.ler(clone, "agentes-status", "outro.txt"), "x\n")
            self.assertEqual(list(Path(clone).iterdir()), [Path(clone) / ".git"])

    def test_segundo_clone_ve_o_que_o_primeiro_gravou(self):
        with tempfile.TemporaryDirectory() as t:
            a = repo_com_remoto(Path(t))
            b = Path(t) / "b"
            sh(Path(t), "git", "clone", "-q", str(Path(t) / "remoto.git"), str(b))
            ramo.gravar(a, "agentes-status", "d.json", "1\n", "a")
            ramo.gravar(b, "agentes-status", "d.json", "2\n", "b")
            self.assertEqual(ramo.ler(a, "agentes-status", "d.json"), "2\n")
            self.assertEqual(len(sh(a, "git", "log", "--oneline", "origin/agentes-status").splitlines()), 2)


class TestMemoria(unittest.TestCase):
    def test_verificar_bloqueia_ate_ler_a_versao_nova(self):
        with tempfile.TemporaryDirectory() as t:
            clone = repo_com_remoto(Path(t))
            ramo.gravar(clone, "memoria-compartilhada", "DECISOES.md", "v1\n", "v1")
            self.assertEqual(memoria.main(["verificar"], clone), 1)
            self.assertEqual(memoria.main(["ler"], clone), 0)
            self.assertEqual(memoria.main(["verificar"], clone), 0)
            ramo.gravar(clone, "memoria-compartilhada", "DECISOES.md", "v2\n", "v2")
            self.assertEqual(memoria.main(["verificar"], clone), 1)

    def test_sem_ramo_nao_bloqueia(self):
        with tempfile.TemporaryDirectory() as t:
            self.assertEqual(memoria.main(["verificar"], repo_com_remoto(Path(t))), 0)


class TestGateSddPorArquivo(unittest.TestCase):
    est = {"fases": estado.carregar()["fases"], "projetos": [{"chave": "p", "fase": "planejar", "pastas": ["modulos/x/arquitetura/"]},
                        {"chave": "q", "fase": "implementar", "pastas": ["modulos/y/"]}]}

    def test_codigo_antes_de_implementar_e_bloqueado(self):
        b = estado.bloqueios(self.est, ["modulos/x/arquitetura/main.tf"])
        self.assertEqual(len(b), 1)
        self.assertIn("p", b[0])

    def test_fase_implementar_libera(self):
        self.assertEqual(estado.bloqueios(self.est, ["modulos/y/src/app.py"]), [])

    def test_specs_e_docs_ficam_livres(self):
        self.assertEqual(estado.bloqueios(self.est, ["specs/p/spec.md", "AGENTS.md"]), [])

    def test_estado_real_do_repositorio_e_valido(self):
        raiz = AQUI.parent
        r = subprocess.run([sys.executable, str(AQUI / "estado.py"), "validar"], cwd=raiz,
                           capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)


class TestSincronizarSkills(unittest.TestCase):
    def test_copia_do_antigravity_igual_as_skills_do_claude(self):
        self.assertEqual(sincronizar_agentes.diferencas(), [])


if __name__ == "__main__":
    unittest.main()
