"""Teto diário de custo: uma fonte só entre o Terraform e o estado do harness (TH-06, Art. V).

O `teto_diario_usd` do `harness/estado.json` é o custo estimado de um dia de demonstração,
calculado no plano (D-021). O Budgets diário do stack usa o padrão da variável `teto_diario_usd`
do root. Os dois têm de ser o mesmo número: mudar o teto num lugar só reprova este teste.
"""
from __future__ import annotations

from comum import *  # noqa: F401,F403

# chave do projeto -> root Terraform que declara o teto. Cada projeto com Budgets diário entra aqui.
ROOTS = {"00-plataforma-agentes": AQUI.parent / "plataforma" / "agentes" / "infra" / "terraform"}


def _sem_comentarios(texto: str) -> str:
    return "\n".join(re.sub(r"\s*(#|//).*$", "", l) for l in texto.splitlines())


def teto_do_variables(texto: str) -> float | None:
    """Padrão numérico de `variable "teto_diario_usd"`, ou None se faltar a variável ou o padrão."""
    sem_coment = _sem_comentarios(texto)
    m = re.search(r'variable\s+"teto_diario_usd"\s*\{', sem_coment)
    if m is None:
        return None
    nivel, inicio = 0, m.end() - 1
    corpo = sem_coment[inicio:]
    for i, c in enumerate(corpo):
        nivel += c == "{"
        nivel -= c == "}"
        if nivel == 0:
            corpo = corpo[1:i]
            break
    # só o padrão no nível do bloco da variável, não um default dentro de validation
    d = re.search(r"^\s*default\s*=\s*([0-9]+(?:\.[0-9]+)?)\s*$", corpo, re.M)
    return None if d is None else float(d.group(1))


def teto_do_estado(chave: str) -> float | None:
    for p in estado.carregar()["projetos"]:
        if p["chave"] == chave:
            return p.get("teto_diario_usd")
    return None


class TestTetoDiario(unittest.TestCase):
    """TH-06: o padrão de teto_diario_usd no root é o teto_diario_usd do estado.json."""

    def test_regra_le_o_padrao(self):
        self.assertIsNone(teto_do_variables('variable "regiao" {\n  default = "us-east-1"\n}\n'))
        self.assertIsNone(teto_do_variables('variable "teto_diario_usd" {\n  type = number\n}\n'))
        self.assertIsNone(teto_do_variables('variable "teto_diario_usd" {\n  # default = 1.2\n}\n'))
        self.assertEqual(teto_do_variables(
            'variable "teto_diario_usd" {\n  type    = number\n  default = 1.2 # D-021\n'
            '  validation {\n    condition     = var.teto_diario_usd > 0\n'
            '    error_message = "x"\n  }\n}\n'), 1.2)

    def test_regra_reprova_teto_divergente(self):
        # o divergente é derivado do estado, para o teste valer com qualquer teto aprovado
        no_estado = float(teto_do_estado("00-plataforma-agentes"))
        texto = f'variable "teto_diario_usd" {{\n  default = {no_estado + 1}\n}}\n'
        self.assertEqual(teto_do_variables(texto), no_estado + 1)
        self.assertNotEqual(teto_do_variables(texto), no_estado)

    def test_root_e_estado_tem_o_mesmo_teto(self):
        for chave, root in ROOTS.items():
            with self.subTest(projeto=chave):
                no_estado = teto_do_estado(chave)
                self.assertIsNotNone(no_estado, f"{chave} sem teto_diario_usd no estado.json")
                arq = root / "variables.tf"
                no_root = teto_do_variables(arq.read_text(encoding="utf-8"))
                self.assertIsNotNone(no_root, f"{arq} sem variable teto_diario_usd com default numérico")
                self.assertEqual(no_root, float(no_estado),
                                 "o teto do root e o do estado.json divergem: mude os dois juntos, "
                                 "com o plano aprovado (D-021)")
