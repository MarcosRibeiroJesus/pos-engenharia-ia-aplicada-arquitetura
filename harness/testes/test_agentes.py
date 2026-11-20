"""Troca de agente, especialistas e sincronização das skills (D-018, D-026)."""
from __future__ import annotations

from comum import *  # noqa: F401,F403


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


class TestEspecialistas(unittest.TestCase):
    """D-026: um especialista por tarefa fim, com modelo do nível, skills existentes e sem subagentes."""
    cat = json.loads((AQUI / "especialistas.json").read_text())
    cfg = agente.config()
    NIVEL_DO_MODELO = {"opus": "maximo", "sonnet": "equilibrado", "haiku": "rapido"}

    def test_toda_tarefa_tem_um_unico_especialista(self):
        donos = {}
        for nome, e in self.cat["especialistas"].items():
            for tarefa in e["tarefas"]:
                self.assertNotIn(tarefa, donos, f"{tarefa} em {donos.get(tarefa)} e {nome}")
                donos[tarefa] = nome
        self.assertEqual(set(donos), set(self.cfg["tarefas"]))

    def test_modelo_segue_o_nivel_da_tarefa(self):
        for nome, e in self.cat["especialistas"].items():
            for tarefa in e["tarefas"]:
                self.assertEqual(self.NIVEL_DO_MODELO[e["modelo"]], self.cfg["tarefas"][tarefa], nome)

    def test_skills_citadas_existem(self):
        skills = {p.parent.name for p in (AQUI.parent / ".claude" / "skills").glob("*/SKILL.md")}
        for nome, e in self.cat["especialistas"].items():
            self.assertLessEqual(set(self.cat["comum"]["skills"] + e["skills"]), skills, nome)

    def test_plugins_vem_de_marketplaces_conhecidos(self):
        mercados = set(self.cat["plugins_marketplaces"])
        todos = [p for e in self.cat["especialistas"].values() for p in e["plugins"]] + self.cat["plugins_ligados_no_projeto"]
        for plugin in todos:
            self.assertIn(plugin.split("@")[1], mercados, plugin)

    def test_settings_liga_so_os_plugins_do_catalogo_e_impede_subagente_aninhado(self):
        st = json.loads((AQUI.parent / ".claude" / "settings.json").read_text())
        self.assertEqual(set(st["enabledPlugins"]), set(self.cat["plugins_ligados_no_projeto"]))
        self.assertEqual(st["env"]["CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH"], "1")
        for nome in st["extraKnownMarketplaces"]:
            self.assertIn(nome, self.cat["plugins_marketplaces"])

    def test_agentes_gerados_tem_frontmatter_valido_e_sem_ferramenta_de_subagente(self):
        for nome in self.cat["especialistas"]:
            texto = (AQUI.parent / ".claude" / "agents" / f"{nome}.md").read_text()
            fm = texto.split("---", 2)[1]
            self.assertIn(f"name: {nome}", fm)
            self.assertIn("disallowedTools:\n  - Agent", fm)
            self.assertIn("  - regras-do-especialista", fm)
            self.assertNotIn("Agent\n", fm.split("disallowedTools")[0])
            self.assertTrue((AQUI.parent / ".github" / "agents" / f"{nome}.agent.md").exists())

    def test_descricoes_entre_aspas_para_o_yaml(self):
        for nome in self.cat["especialistas"]:
            fm = (AQUI.parent / ".claude" / "agents" / f"{nome}.md").read_text().split("---", 2)[1]
            self.assertRegex(fm, r'description: ".+"')

    def test_roteamento_pelo_agente_py(self):
        self.assertEqual(agente.especialista("mcp", self.cat), "engenheiro-mcp")
        self.assertEqual(agente.especialista("mecanica", self.cat), "operador-harness")
        self.assertIn(".github/agents/avaliador-llm.agent.md", agente.instrucao_do_papel("copilot", "avaliador-llm"))
        self.assertIn("engenheiro-mcp", agente.prompt_de_passagem("antigravity", "mcp", "03-mcp-regras-cdb"))

    def test_arquivos_gerados_em_dia(self):
        self.assertEqual(sincronizar_agentes.diferencas_agentes(self.cat), [])


class TestSincronizarSkills(unittest.TestCase):
    def test_copia_do_antigravity_igual_as_skills_do_claude(self):
        self.assertEqual(sincronizar_agentes.diferencas(), [])

