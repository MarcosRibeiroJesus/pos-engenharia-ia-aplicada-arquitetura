"""Workflows de implantação e versões das actions."""
from __future__ import annotations

from comum import *  # noqa: F401,F403


class TestWorkflowsDeImplantacao(unittest.TestCase):
    """ADR 0002: a exceção ao CKV_GHA_7 só vale para apply e destroy registrados."""

    def test_excecao_ckv_gha_7_so_em_apply_e_destroy_registrados(self):
        registrados = set()
        for p in estado.carregar()["projetos"]:
            registrados |= {p.get("apply_workflow"), p.get("destroy_workflow")}
        for wf in (AQUI.parent / ".github" / "workflows").glob("*.yml"):
            if "checkov:skip=CKV_GHA_7" in wf.read_text():
                self.assertIn(f".github/workflows/{wf.name}", registrados, wf.name)

    def test_token_oidc_nunca_no_nivel_do_workflow(self):
        for wf in list((AQUI.parent / ".github" / "workflows").glob("*.yml")) + list((AQUI / "modelos").glob("*.yml")):
            topo = wf.read_text().split("\njobs:", 1)[0]
            self.assertNotRegex(topo, r"id-token\s*:\s*write", wf.name)


class TestVersoesDasActions(unittest.TestCase):
    """Supply chain: cada action fixada num único SHA em workflows e modelos. O Dependabot só
    atualiza .github/workflows; sem este teste, projeto novo nasceria com action antiga."""
    RX = re.compile(r"uses:\s*([\w.\-/]+)@([0-9a-f]{40})")

    def test_um_sha_por_action(self):
        shas = {}
        arqs = list((AQUI.parent / ".github" / "workflows").glob("*.yml")) + list((AQUI / "modelos").glob("*.yml"))
        for arq in arqs:
            for acao, sha in self.RX.findall(arq.read_text()):
                shas.setdefault(acao, {}).setdefault(sha, []).append(arq.name)
        divergentes = {a: s for a, s in shas.items() if len(s) > 1}
        self.assertEqual(divergentes, {}, "alinhe os SHAs (inclusive em harness/modelos)")

    def test_workflows_da_plataforma_iguais_ao_modelo(self):
        for qual in ("apply", "destroy"):
            modelo = (AQUI / "modelos" / f"{qual}.yml").read_text()
            esperado = novo_projeto.preencher_modelo(modelo, "00-plataforma-agentes", "plataforma-agentes-lab",
                                                     "00-plataforma-agentes", "plataforma/agentes/")
            atual = (AQUI.parent / ".github" / "workflows" / f"00-plataforma-agentes-{qual}.yml").read_text()
            self.assertEqual(atual, esperado, qual)

