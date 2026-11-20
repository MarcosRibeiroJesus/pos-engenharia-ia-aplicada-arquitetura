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
import novo_projeto  # noqa: E402
import infra  # noqa: E402
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
            for k, v in (("user.email", "t@t"), ("user.name", "t"), ("commit.gpgsign", "false")):
                sh(b, "git", "config", k, v)  # o runner do CI não tem identidade global do git
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


DESTROY_OK = """
on:
  workflow_dispatch:
    inputs:
      confirm_stack:
        required: true
permissions:
  id-token: write
jobs:
  destroy:
    environment: aws-lab
    steps:
      - run: terraform destroy -auto-approve
      - run: aws resourcegroupstaggingapi get-resources --tag-filters Key=project,Values=x
      - run: python3 harness/infra.py remover p
"""

APPLY_OK = """
on:
  workflow_dispatch:
    inputs:
      prazo_horas:
        default: 24
jobs:
  prazo:
    steps:
      - run: python3 harness/infra.py registrar p --stack s --horas 24
"""


class TestInfraReal(unittest.TestCase):
    """D-021: teto de um dia de execução e workflow de destroy obrigatório."""
    fases = estado.carregar()["fases"]

    def projeto(self, fase, **extra):
        base = {"chave": "p", "fase": fase, "infra_real": True, "apply_workflow": "ap.yml",
                "destroy_workflow": "wf.yml", "teto_diario_usd": None}
        base.update(extra)
        return base

    def checar(self, p, raiz):
        return estado.problemas_infra({"fases": self.fases}, p, raiz)

    def test_sem_infra_real_nao_exige_nada(self):
        self.assertEqual(self.checar({"chave": "d", "fase": "publicar", "infra_real": False}, AQUI), [])

    def test_infra_real_precisa_declarar_os_campos(self):
        erros = self.checar({"chave": "p", "fase": "especificar", "infra_real": True}, AQUI)
        self.assertEqual(len(erros), 3)

    def test_teto_pode_ficar_pendente_ate_o_plano(self):
        self.assertEqual(self.checar(self.projeto("planejar"), AQUI), [])

    def test_teto_diario_obrigatorio_a_partir_de_tarefas(self):
        self.assertTrue(any("teto_diario_usd" in e for e in self.checar(self.projeto("tarefas"), AQUI)))
        self.assertEqual(self.checar(self.projeto("tarefas", teto_diario_usd=1.8), AQUI), [])

    def test_destroy_obrigatorio_na_verificacao(self):
        with tempfile.TemporaryDirectory() as t:
            erros = self.checar(self.projeto("verificar", teto_diario_usd=2), Path(t))
            self.assertTrue(any("destroy_workflow" in e for e in erros))
            (Path(t) / "wf.yml").write_text(DESTROY_OK)
            self.assertTrue(any("apply_workflow" in e for e in self.checar(self.projeto("verificar", teto_diario_usd=2), Path(t))))
            (Path(t) / "ap.yml").write_text(APPLY_OK)
            self.assertEqual(self.checar(self.projeto("verificar", teto_diario_usd=2), Path(t)), [])

    def test_destroy_incompleto_e_reprovado(self):
        for trecho in ("workflow_dispatch", "environment", "confirm_stack", "id-token", "resourcegroupstaggingapi",
                       "infra.py remover"):
            with self.subTest(sem=trecho):
                incompleto = "\n".join(l for l in DESTROY_OK.splitlines() if trecho not in l)
                self.assertTrue(estado.checar_destroy(incompleto))

    def test_destroy_completo_passa(self):
        self.assertEqual(estado.checar_destroy(DESTROY_OK), [])

    def test_apply_sem_prazo_e_reprovado(self):
        self.assertEqual(estado.checar_apply(APPLY_OK), [])
        self.assertEqual(len(estado.checar_apply("on: workflow_dispatch")), 2)

    def test_modelos_do_harness_cumprem_as_regras(self):
        modelos = AQUI / "modelos"
        self.assertEqual(estado.checar_apply((modelos / "apply.yml").read_text()), [])
        self.assertEqual(estado.checar_destroy((modelos / "destroy.yml").read_text()), [])

    def test_projetos_de_arquitetura_do_repositorio_sao_infra_real(self):
        for p in estado.carregar()["projetos"]:
            if p["tipo"] == "arquitetura":
                self.assertTrue(p.get("infra_real"), p["chave"])


class TestPrazoDaInfra(unittest.TestCase):
    """D-022: prazo de vida registrado no apply e destroy automático quando vence."""
    p = {"chave": "x", "infra_real": True, "destroy_workflow": ".github/workflows/x-destroy.yml"}

    def ativo(self, horas=24):
        return infra.registrar({}, self.p, "x-lab", horas, AGORA)

    def test_registrar_calcula_o_prazo(self):
        reg = self.ativo()["x"]
        self.assertEqual(datetime.fromisoformat(reg["expira_em"]), AGORA + timedelta(hours=24))
        self.assertEqual(reg["destroy_workflow"], self.p["destroy_workflow"])

    def test_prazo_fora_dos_limites_e_recusado(self):
        for horas in (0, -1, 25):
            with self.subTest(horas=horas), self.assertRaises(ValueError):
                infra.registrar({}, self.p, "x-lab", horas, AGORA)

    def test_avisa_uma_hora_antes_e_so_uma_vez(self):
        ativos = self.ativo(1)
        self.assertEqual([i["projeto"] for i in infra.vencidos(ativos, AGORA + timedelta(minutes=5))["avisar"]], ["x"])
        ativos["x"]["avisado"] = True
        self.assertEqual(infra.vencidos(ativos, AGORA + timedelta(minutes=5))["avisar"], [])

    def test_nada_a_fazer_longe_do_prazo(self):
        self.assertEqual(infra.vencidos(self.ativo(), AGORA + timedelta(hours=2)),
                         {"avisar": [], "destruir": [], "aguardando": []})

    def test_vencido_e_destruido_com_o_stack_para_confirmacao(self):
        v = infra.vencidos(self.ativo(), AGORA + timedelta(hours=24))
        self.assertEqual(v["destruir"][0]["stack"], "x-lab")

    def test_disparado_aguarda_e_redispara_se_continuar_no_ar(self):
        ativos = self.ativo()
        ativos["x"]["destroy_disparado_em"] = (AGORA + timedelta(hours=24)).isoformat()
        self.assertEqual(len(infra.vencidos(ativos, AGORA + timedelta(hours=25))["aguardando"]), 1)
        self.assertEqual(len(infra.vencidos(ativos, AGORA + timedelta(hours=28))["destruir"]), 1)

    def test_estender_adia_e_respeita_o_maximo(self):
        ativos = infra.estender(self.ativo(12), "x", 2, AGORA + timedelta(hours=11))
        self.assertEqual(datetime.fromisoformat(ativos["x"]["expira_em"]), AGORA + timedelta(hours=14))
        self.assertFalse(ativos["x"]["avisado"])
        with self.assertRaises(ValueError):  # D-024: nunca passa de 24 h desde o apply
            infra.estender(ativos, "x", 11, AGORA + timedelta(hours=13))

    def test_destroy_dos_modelos_roda_sem_aprovacao(self):
        self.assertIn("environment: aws-lab-destroy", (AQUI / "modelos" / "destroy.yml").read_text())

    def test_registro_vai_para_o_branch_compartilhado(self):
        with tempfile.TemporaryDirectory() as t:
            clone = repo_com_remoto(Path(t))
            infra.gravar(self.ativo(), "registrar x", clone)
            self.assertIn("x", infra.ler(clone))

    def test_agendador_dispara_o_destroy_com_confirm_stack(self):
        wf = (AQUI.parent / ".github" / "workflows" / "expirar-infra.yml").read_text()
        for trecho in ("cron:", "gh workflow run", "confirm_stack=", "marcar-disparado", "actions: write"):
            self.assertIn(trecho, wf)


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


class TestDecisaoDoDono(unittest.TestCase):
    """D-025: decisão do dono registra onde foi aplicada."""
    HIST = """### 2026-11-19 · D-030 · Algo · fonte: Marcos
Texto.
**Aplicado em:** CLAUDE.md, skill x.

### 2026-11-19 · D-029 · Outra · fonte: Marcos
Sem aplicação.

### 2026-11-19 · D-028 · Técnica · fonte: delegada
Sem aplicação, mas delegada.

### 2026-11-19 · D-020 · Antiga · fonte: Marcos
Antes da regra.
"""

    def test_auditoria_aponta_so_decisao_do_dono_recente_sem_aplicacao(self):
        self.assertEqual(memoria.sem_aplicacao(self.HIST), ["D-029"])


class TestCaminhoPadrao(unittest.TestCase):
    """D-030: todo projeto novo entra pela mesma esteira com um comando."""

    def raiz(self, t: str) -> Path:
        r = Path(t)
        import shutil
        for rel in ("harness/estado.json", ".specify/templates/spec-template.md",
                    "harness/modelos/apply.yml", "harness/modelos/destroy.yml"):
            (r / rel).parent.mkdir(parents=True, exist_ok=True)
            shutil.copy(AQUI.parent / rel, r / rel)
        return r

    def novo(self, r: Path, **kw):
        args = dict(chave="09-produto-teste", titulo="Produto de teste", tipo="arquitetura",
                    pasta="modulos/09-teste/arquitetura/", branch="modulo/09-teste/produto", disciplina="09")
        args.update(kw)
        return novo_projeto.criar(r, **args)

    def test_projeto_com_infra_sai_valido_e_com_apply_e_destroy_que_passam_nos_gates(self):
        with tempfile.TemporaryDirectory() as t:
            r = self.raiz(t)
            self.novo(r)
            est = estado.carregar(r / "harness" / "estado.json")
            p = next(x for x in est["projetos"] if x["chave"] == "09-produto-teste")
            self.assertEqual((p["fase"], p["infra_real"], p["teto_diario_usd"]), ("especificar", True, None))
            self.assertEqual(estado.checar_apply((r / p["apply_workflow"]).read_text()), [])
            destroy = (r / p["destroy_workflow"]).read_text()
            self.assertEqual(estado.checar_destroy(destroy), [])
            self.assertNotIn("TROCAR", destroy)
            self.assertIn("modulos/09-teste/arquitetura/infra/terraform", destroy)
            self.assertIn("# Spec: Produto de teste", (r / "specs/09-produto-teste/spec.md").read_text())
            self.assertEqual([e for e in estado.problemas(est, r) if "09-produto" in e], [])

    def test_projeto_sem_infra_nao_gera_workflows(self):
        with tempfile.TemporaryDirectory() as t:
            r = self.raiz(t)
            criados = self.novo(r, infra_real=False, tipo="ia-aplicada")
            self.assertFalse(any(c.suffix == ".yml" for c in criados))

    def test_recusa_chave_repetida_invalida_ou_pasta_que_cruza_outro_projeto(self):
        with tempfile.TemporaryDirectory() as t:
            r = self.raiz(t)
            self.novo(r)
            casos = [dict(), dict(chave="Produto"), dict(chave="09-outro", pasta="modulos/09-teste/"),
                     dict(chave="09-outro", pasta="sem-barra")]
            for kw in casos:
                with self.subTest(**kw), self.assertRaises(novo_projeto.ErroProjeto):
                    self.novo(r, **kw)

    def test_regex_de_project_do_modelo_de_tags_e_o_da_chave_do_projeto(self):
        # D-031: a política do Infracost, o modelo de teste e o caminho padrão usam o mesmo padrão.
        modelo = (AQUI / "modelos" / "tags.tftest.hcl").read_text()
        self.assertIn(novo_projeto.CHAVE_VALIDA.pattern, modelo)
        for p in estado.carregar()["projetos"]:
            self.assertRegex(p["chave"], novo_projeto.CHAVE_VALIDA)

    def test_nao_cria_codigo_na_pasta_do_projeto(self):
        with tempfile.TemporaryDirectory() as t:
            r = self.raiz(t)
            self.novo(r)
            self.assertFalse((r / "modulos/09-teste").exists())


class TestSincronizarSkills(unittest.TestCase):
    def test_copia_do_antigravity_igual_as_skills_do_claude(self):
        self.assertEqual(sincronizar_agentes.diferencas(), [])


if __name__ == "__main__":
    unittest.main()
