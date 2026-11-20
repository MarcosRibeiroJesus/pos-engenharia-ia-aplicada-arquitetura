"""CI de código do projeto 00-plataforma-agentes (TH-12; Art. III, RNF-005, RNF-007).

O workflow de CI roda, a cada PR que toca a plataforma, a conta ou o harness, os testes que não
precisam de credencial: fmt, validate e terraform test no root e em cada módulo com tests/, e os
testes Python da plataforma. Ele é CI de código: sem OIDC, sem credencial da AWS e sem Bedrock.
"""
from __future__ import annotations

from comum import *  # noqa: F401,F403

WF = AQUI.parent / ".github" / "workflows" / "00-plataforma-agentes-ci.yml"
ROOT = "plataforma/agentes/infra/terraform"


class TestCiDoProjeto(unittest.TestCase):
    def setUp(self):
        self.assertTrue(WF.exists(), f"falta {WF.name}")
        self.txt = WF.read_text(encoding="utf-8")
        self.topo = self.txt.split("\njobs:", 1)[0]
        # só as linhas de código: comentário não conta como comando executado
        self.cod = "\n".join(l for l in self.txt.splitlines() if not l.lstrip().startswith("#"))

    def test_gatilho_pull_request_com_filtro_de_caminho(self):
        self.assertRegex(self.topo, r"\n\s*pull_request:")
        for caminho in ("plataforma/agentes/**", "infra/conta/**", "harness/**"):
            self.assertIn(f'"{caminho}"', self.topo, caminho)
        self.assertNotRegex(self.topo, r"\n\s*push:", "CI de código só em pull_request")

    def test_permissao_minima(self):
        self.assertRegex(self.topo, r"permissions:\s*\n\s+contents:\s*read\s*\n")
        self.assertNotRegex(self.txt, r"(?m)^\s*[\w-]+:\s*write(-all)?\s*$", "nenhuma permissão de escrita")

    def test_terraform_no_root_e_nos_modulos_com_tests(self):
        self.assertIn(ROOT, self.cod)
        # init sem backend e sem credencial vem antes de validate e test (achado da T001)
        cod =re.sub(r"-chdir=\S+ ", "", self.cod)
        for cmd in ("terraform fmt -check", "terraform init -backend=false", "terraform validate",
                    "terraform test"):
            self.assertIn(cmd, cod, cmd)
        self.assertLess(cod.index("terraform init -backend=false"), cod.index("terraform validate"))
        self.assertLess(cod.index("terraform validate"), cod.index("terraform test"))
        # módulos descobertos pela pasta tests/, para módulo novo entrar sem editar o workflow
        self.assertIn("modules/*/tests", self.cod)

    def test_testes_python_da_plataforma_condicionais(self):
        self.assertIn("python3 -m unittest discover -s plataforma/agentes/tests", self.cod)
        # a pasta pode não existir ainda: o passo só roda quando ela existe
        self.assertRegex(self.cod, r"\[ -d plataforma/agentes/tests \]")

    def test_actions_fixadas_por_sha(self):
        usos = re.findall(r"uses:\s*(\S+)", self.txt)
        self.assertTrue(usos)
        for uso in usos:
            self.assertRegex(uso, r"@[0-9a-f]{40}$", uso)

    def test_sem_oidc_sem_credencial_sem_bedrock(self):
        self.assertNotIn("id-token", self.txt)
        self.assertNotIn("configure-aws-credentials", self.txt)
        self.assertNotRegex(self.txt, r"AWS_(ACCESS_KEY_ID|SECRET_ACCESS_KEY|SESSION_TOKEN|ROLE)")
        self.assertNotRegex(self.txt, r"secrets\.")
        # TH-11: CI de código não cita Bedrock nem Converse
        self.assertNotRegex(self.txt.lower(), r"bedrock|converse")


if __name__ == "__main__":
    unittest.main()
