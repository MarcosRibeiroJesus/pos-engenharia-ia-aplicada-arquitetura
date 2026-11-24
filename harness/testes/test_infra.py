"""Infra real: apply, destroy, prazo e pré-requisitos da conta (D-021 a D-024, D-034, D-039)."""
from __future__ import annotations

from comum import *  # noqa: F401,F403


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
        self.assertEqual(len(estado.checar_apply("on: workflow_dispatch")), 3)

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

    def test_prazo_padrao_e_seis_horas_e_teto_continua_24(self):
        # decisão do dono: destroy automático 6 h após a subida; estender continua até o teto de D-024
        self.assertEqual(infra.PRAZO_PADRAO_H, 6)
        self.assertEqual(infra.PRAZO_MAXIMO_H, 24)

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


class TestPreRequisitosDaConta(unittest.TestCase):
    """D-034: tag de custo e Transaction Search por Terraform no infra/conta; o apply confere antes de subir."""

    def test_apply_sem_conferencia_da_tag_de_custo_reprova(self):
        self.assertIn("workflow de apply sem conferência da tag de custo project (D-034)", estado.checar_apply(APPLY_SEM_CONTA))

    def test_modelo_de_apply_confere_a_conta_sem_falhar(self):
        texto = (AQUI / "modelos" / "apply.yml").read_text(encoding="utf-8")
        self.assertIn("list-cost-allocation-tags", texto)
        self.assertIn("get-trace-segment-destination", texto)
        passo = texto.split("Pré-requisitos da conta", 1)[1].split("- name:", 1)[0]
        self.assertIn("::warning::", passo)
        self.assertNotIn("exit 1", passo)  # aviso, nunca bloqueio: a role pode não ter a permissão de leitura

    def test_skills_trazem_a_checagem_antes_da_demonstracao(self):
        for skill in ("ciclo-demonstracao", "plataforma-agentes"):
            self.assertIn("D-034", (AQUI.parent / ".claude" / "skills" / skill / "SKILL.md").read_text(encoding="utf-8"), skill)

    def test_ativacao_da_tag_de_custo_e_unica_na_conta(self):
        # D-039: nenhuma demonstração espera 48 h; a ativação é feita uma vez, assim que a chave aparece.
        skill = (AQUI.parent / ".claude" / "skills" / "ciclo-demonstracao" / "SKILL.md").read_text(encoding="utf-8")
        self.assertIn("D-039", skill)
        modelo = (AQUI / "modelos" / "apply.yml").read_text(encoding="utf-8")
        self.assertIn("D-039", modelo)
        self.assertNotIn("48 h antes da demonstração", modelo)

