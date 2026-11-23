"""Assunto: workflows da D01 (01-recomendacao) gerados dos modelos do harness (T010, TH-07 e ST-01).

TH-07: o apply e o destroy da D01 contêm todos os jobs do modelo preenchido por
`novo_projeto.preencher_modelo`, com o mesmo `environment` e os mesmos passos, na mesma ordem.
As extensões do projeto (T056, T057) entram como passos a mais, nunca no lugar dos do modelo.
ST-01: a regra estática da unidade reprova workflow cujo filtro de caminho cobre a unidade e roda
Infracost (o gate de custo é só o de seguranca.yml, RNF-103).

Só biblioteca padrão: o leitor de YAML abaixo entende apenas o formato dos workflows deste repositório
(jobs com 2 espaços, chaves do job com 4, itens de `steps` com 6).
"""
import importlib.util
import json
import re
import unittest
from pathlib import Path

from comum import AQUI
import novo_projeto

RAIZ = AQUI.parent
WF = RAIZ / ".github" / "workflows"
CHAVE = "01-recomendacao"
STACK = "01-recomendacao-lab"
PASTA = "modulos/01-fundamentos-ia-llms/unidades/03-recomendacao/"
STATIC_RULES = RAIZ / PASTA / "infra" / "terraform" / "tests" / "static_rules.py"


def jobs_do_workflow(texto: str) -> dict:
    """{job: {"environment": str|None, "passos": [id do passo]}}. O id é o `name`, ou o `uses` sem o SHA."""
    corpo = texto.split("\njobs:\n", 1)[1]
    jobs, atual, passo_aberto = {}, None, False
    for linha in corpo.splitlines():
        if not linha.strip() or linha.lstrip().startswith("#"):
            continue
        m = re.match(r"^  ([\w-]+):\s*$", linha)
        if m:
            atual = jobs.setdefault(m.group(1), {"environment": None, "passos": []})
            passo_aberto = False
            continue
        if atual is None:
            continue
        m = re.match(r"^    environment:\s*(\S+)", linha)
        if m:
            atual["environment"] = m.group(1)
            continue
        m = re.match(r"^      - (name|uses):\s*(.+?)\s*(#.*)?$", linha)
        if m:
            atual["passos"].append(_id_do_passo(m.group(1), m.group(2)))
            passo_aberto = m.group(1) == "uses"
            continue
        if re.match(r"^      - ", linha):
            atual["passos"].append("(passo sem name nem uses)")
            passo_aberto = False
            continue
        m = re.match(r"^        name:\s*(.+?)\s*$", linha)
        if m and passo_aberto:
            # passo que começa por `uses:` e tem `name:` depois: o name identifica
            atual["passos"][-1] = _id_do_passo("name", m.group(1))
            passo_aberto = False
    return jobs


def _id_do_passo(chave: str, valor: str) -> str:
    valor = valor.strip().strip('"').strip("'")
    return f"uses:{valor.split('@', 1)[0]}" if chave == "uses" else valor


def divergencias(modelo: str, atual: str) -> list[str]:
    """O que falta no workflow do projeto em relação ao modelo preenchido."""
    esperado, real = jobs_do_workflow(modelo), jobs_do_workflow(atual)
    erros = []
    for nome, job in esperado.items():
        if nome not in real:
            erros.append(f"falta o job {nome}")
            continue
        if real[nome]["environment"] != job["environment"]:
            erros.append(f"job {nome}: environment {real[nome]['environment']} em vez de {job['environment']}")
        restantes = iter(real[nome]["passos"])
        for passo in job["passos"]:
            if passo not in restantes:   # subsequência: passos a mais são extensões, a ordem se mantém
                erros.append(f"job {nome}: falta o passo '{passo}' (ou está fora da ordem do modelo)")
                break
    return erros


def modelo_preenchido(qual: str) -> str:
    texto = (AQUI / "modelos" / f"{qual}.yml").read_text(encoding="utf-8")
    return novo_projeto.preencher_modelo(texto, CHAVE, STACK, CHAVE, PASTA)


class TestWorkflowsDaD01IguaisAoModelo(unittest.TestCase):
    """TH-07: apply e destroy da D01 nascem do modelo (RNF-101)."""

    def test_estado_aponta_para_os_workflows_novos(self):
        estado = json.loads((AQUI / "estado.json").read_text(encoding="utf-8"))
        p = next(x for x in estado["projetos"] if x["chave"] == CHAVE)
        self.assertEqual(p["apply_workflow"], f".github/workflows/{CHAVE}-apply.yml")
        self.assertEqual(p["destroy_workflow"], f".github/workflows/{CHAVE}-destroy.yml")

    def test_apply_e_destroy_contem_o_modelo_preenchido(self):
        for qual in ("apply", "destroy"):
            with self.subTest(qual=qual):
                arq = WF / f"{CHAVE}-{qual}.yml"
                self.assertTrue(arq.exists(), f"falta {arq.name}")
                self.assertEqual(divergencias(modelo_preenchido(qual), arq.read_text(encoding="utf-8")), [])

    def test_fixture_sem_verificacao_de_sobras_reprova(self):
        modelo = modelo_preenchido("destroy")
        inicio = modelo.index("      - name: Verificar sobras pela tag do projeto")
        fim = modelo.index("\n  prazo:", inicio)
        fixture = modelo[:inicio] + modelo[fim:]
        erros = divergencias(modelo, fixture)
        self.assertTrue(any("Verificar sobras" in e for e in erros), erros)

    def test_fixture_com_destroy_no_ambiente_do_apply_reprova(self):
        modelo = modelo_preenchido("destroy")
        fixture = modelo.replace("environment: aws-lab-destroy", "environment: aws-lab")
        self.assertTrue(any("environment" in e for e in divergencias(modelo, fixture)))

    def test_passo_a_mais_e_extensao_permitida(self):
        modelo = modelo_preenchido("apply")
        extra = "      - name: Build dos artefatos\n        run: echo build\n      - name: Init com state remoto"
        fixture = modelo.replace("      - name: Init com state remoto", extra, 1)
        self.assertEqual(divergencias(modelo, fixture), [])

    def test_workflows_antigos_da_unidade_sairam(self):
        self.assertEqual(sorted(p.name for p in WF.glob("recsys-01-03-*.yml")), [])

    def test_floci_so_pela_variavel(self):
        """D-013: a imagem do Floci vem de vars.FLOCI_IMAGE, com fallback; nunca escrita direto."""
        for arq in WF.glob(f"{CHAVE}-*.yml"):
            texto = arq.read_text(encoding="utf-8")
            for linha in texto.splitlines():
                if "floci/floci:" in linha:
                    self.assertIn("${{ vars.FLOCI_IMAGE || 'floci/floci:latest' }}", linha, arq.name)


def _carregar_static_rules():
    spec = importlib.util.spec_from_file_location("static_rules_01_recomendacao", STATIC_RULES)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)   # o módulo só verifica no __main__
    return mod


class TestST01InfracostForaDaUnidade(unittest.TestCase):
    """ST-01: nenhum workflow que cobre a unidade roda Infracost (RNF-103)."""

    @classmethod
    def setUpClass(cls):
        cls.sr = _carregar_static_rules()

    def test_fixture_com_job_infracost_reprova(self):
        fixture = ('on:\n  pull_request:\n    paths:\n      - "' + PASTA + '**"\n'
                   "jobs:\n  infracost:\n    runs-on: ubuntu-latest\n    steps:\n"
                   "      - run: infracost breakdown --path=.\n")
        self.assertTrue(self.sr.st01_infracost({"fixture.yml": fixture}))

    def test_fixture_com_lista_inline_reprova(self):
        fixture = ('on:\n  pull_request:\n    paths: ["modulos/**"]\n'
                   "jobs:\n  custo:\n    runs-on: ubuntu-latest\n    steps:\n"
                   "      - uses: infracost/actions/setup@0000000000000000000000000000000000000000 # v5\n")
        self.assertTrue(self.sr.st01_infracost({"fixture.yml": fixture}))

    def test_workflow_sem_filtro_da_unidade_nao_conta(self):
        outro = ('on:\n  pull_request:\n    paths: ["infra/conta/**"]\n'
                 "jobs:\n  custo:\n    steps:\n      - run: infracost breakdown --path=.\n")
        sem_filtro = "on:\n  pull_request:\njobs:\n  custo:\n    steps:\n      - run: infracost breakdown\n"
        self.assertEqual(self.sr.st01_infracost({"outro.yml": outro, "seguranca.yml": sem_filtro}), [])

    def test_workflows_do_repositorio_passam(self):
        wfs = {p.name: p.read_text(encoding="utf-8") for p in WF.glob("*.yml")}
        self.assertEqual(self.sr.st01_infracost(wfs), [])


if __name__ == "__main__":
    unittest.main()
