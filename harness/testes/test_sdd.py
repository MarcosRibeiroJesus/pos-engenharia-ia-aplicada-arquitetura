"""Gate SDD por arquivo e delegação dentro do plano aprovado (Artigo I, D-033)."""
from __future__ import annotations

from comum import *  # noqa: F401,F403


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


class TestDelegacaoNoPlanoAprovado(unittest.TestCase):
    """D-033: dentro de um plano SDD aprovado pelo dono, a orquestração delega sem aprovar cada disparo."""

    def test_sem_aprovacao_do_plano_nao_delega(self):
        with tempfile.TemporaryDirectory() as t:
            raiz, est = repo_com_plano(Path(t))
            ok, motivo = estado.pode_delegar(est, "p", raiz)
            self.assertFalse(ok)
            self.assertIn("aprovar-plano", motivo)

    def test_plano_aprovado_libera_as_fases_dentro_dele(self):
        with tempfile.TemporaryDirectory() as t:
            raiz, est = repo_com_plano(Path(t))
            self.assertEqual(estado.aprovar_plano(est, "p", "Marcos no chat: aprovo o plano", "2026-11-20", raiz), "")
            for fase in ("tarefas", "analisar", "implementar", "verificar"):
                est["projetos"][0]["fase"] = fase
                self.assertEqual(estado.pode_delegar(est, "p", raiz), (True, ""), fase)

    def test_fora_do_plano_continua_com_o_dono(self):
        with tempfile.TemporaryDirectory() as t:
            raiz, est = repo_com_plano(Path(t))
            estado.aprovar_plano(est, "p", "Marcos no chat", "2026-11-20", raiz)
            for fase in ("especificar", "planejar", "publicar"):
                est["projetos"][0]["fase"] = fase
                ok, motivo = estado.pode_delegar(est, "p", raiz)
                self.assertFalse(ok, fase)
                self.assertIn(fase, motivo)

    def test_plano_alterado_depois_da_aprovacao_exige_nova_aprovacao(self):
        with tempfile.TemporaryDirectory() as t:
            raiz, est = repo_com_plano(Path(t))
            estado.aprovar_plano(est, "p", "Marcos no chat", "2026-11-20", raiz)
            (raiz / "specs" / "p" / "plan.md").write_text("# Plano com escopo novo\n", encoding="utf-8")
            ok, motivo = estado.pode_delegar(est, "p", raiz)
            self.assertFalse(ok)
            self.assertIn("mudou", motivo)

    def test_aprovar_exige_plano_escrito_e_fonte(self):
        with tempfile.TemporaryDirectory() as t:
            raiz, est = repo_com_plano(Path(t))
            self.assertIn("fonte", estado.aprovar_plano(est, "p", "  ", "2026-11-20", raiz))
            (raiz / "specs" / "p" / "plan.md").unlink()
            self.assertIn("plan.md", estado.aprovar_plano(est, "p", "Marcos", "2026-11-20", raiz))

    def test_validar_confere_o_registro_da_aprovacao(self):
        with tempfile.TemporaryDirectory() as t:
            raiz, est = repo_com_plano(Path(t))
            est["projetos"][0].update({"disciplina": "00", "tipo": "x", "titulo": "x", "branch": "b"})
            est["projetos"][0]["plano_aprovado"] = {"data": "2026-11-20"}
            self.assertTrue(any("plano_aprovado" in e for e in estado.problemas(est, raiz)))

    def _evento(self, tipo: str, prompt: str) -> dict:
        return {"tool_name": "Agent", "tool_input": {"subagent_type": tipo, "prompt": prompt}}

    def test_hook_nega_especialista_sem_plano_aprovado(self):
        with tempfile.TemporaryDirectory() as t:
            raiz, _ = repo_com_plano(Path(t))
            motivo = gate_delegacao.decidir(self._evento("arquiteto-aws", "Projeto: p\nObjetivo: tarefas"), raiz)
            self.assertIn("D-033", motivo)

    def test_hook_libera_dentro_do_plano_aprovado(self):
        with tempfile.TemporaryDirectory() as t:
            raiz, est = repo_com_plano(Path(t))
            estado.aprovar_plano(est, "p", "Marcos no chat", "2026-11-20", raiz)
            (raiz / "harness" / "estado.json").write_text(json.dumps(est), encoding="utf-8")
            self.assertIsNone(gate_delegacao.decidir(self._evento("arquiteto-aws", "Projeto: p\nObjetivo: tarefas"), raiz))

    def test_hook_exige_projeto_no_briefing(self):
        with tempfile.TemporaryDirectory() as t:
            raiz, _ = repo_com_plano(Path(t))
            self.assertIn("Projeto:", gate_delegacao.decidir(self._evento("pesquisador", "pesquise X"), raiz))

    def test_hook_aceita_aprovacao_do_dono_para_este_disparo(self):
        with tempfile.TemporaryDirectory() as t:
            raiz, _ = repo_com_plano(Path(t), fase="planejar")
            prompt = "Projeto: p\nAprovação do dono: Marcos no chat em 2026-11-20, disparo do plano\n"
            self.assertIsNone(gate_delegacao.decidir(self._evento("arquiteto-aws", prompt), raiz))

    def test_hook_ignora_agentes_que_nao_sao_especialistas(self):
        with tempfile.TemporaryDirectory() as t:
            raiz, _ = repo_com_plano(Path(t))
            self.assertIsNone(gate_delegacao.decidir(self._evento("Explore", "ache X"), raiz))

    def test_hook_registrado_no_settings(self):
        cfg = json.loads((AQUI.parent / ".claude" / "settings.json").read_text(encoding="utf-8"))
        pre = cfg["hooks"]["PreToolUse"]
        self.assertTrue(any("gate_delegacao.py" in h["command"] and "Agent" in m["matcher"]
                            for m in pre for h in m["hooks"]))

