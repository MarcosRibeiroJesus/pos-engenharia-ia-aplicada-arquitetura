"""PY-01 (RF-107, T041 e A13 da análise 2): nenhum nome de recurso fixo nos scripts do lote.

Os nomes de bucket, banco, tabela, job, cluster e workgroup vêm do Terraform (T012) e chegam aos
scripts por argumento do job (getResolvedOptions no Glue), pela configuração do DAG
(dags/config/01-recomendacao.json, T046 e T063) e, no SQL, por marcadores ${...} preenchidos com
os mesmos valores (templatefile no Terraform e string.Template no DAG).

A varredura cobre todo artefato do lote que pode citar um recurso: U/src/batch/**/*.py (o DAG está
dentro) e U/src/batch/**/*.sql. Cada tipo de arquivo tem uma fixture vermelha.
"""
import importlib.util
import json
import os
import re
import sys
import tempfile
import unittest
from pathlib import Path
from string import Template
from unittest import mock

UNIDADE = Path(__file__).resolve().parents[2]
LOTE = UNIDADE / "src" / "batch"
DAG = LOTE / "airflow" / "dags" / "daily_hybrid_recommendation_pipeline.py"
SQL = LOTE / "athena" / "extract_curated_features.sql"
CONFIG_EXEMPLO = UNIDADE / "tests" / "fixtures" / "config-do-lote.json"

# Padrões do PY-01 (T041) mais os da A13; os prefixos de exceção do ADR-0014 (p01_recomendacao_ e
# p01-recomendacao-) entram porque o banco real do stack os usa; arn:aws entra porque um ARN escrito à
# mão também é nome fixo.
PADROES = [
    "s3://", "ecommerce-", "recsys-", "01-recomendacao-", "ecommerce_", "_golden_db",
    "p01_recomendacao_", "p01-recomendacao-", "arn:aws",
]
GLUE = LOTE / "glue"
SCRIPTS_DO_GLUE = ["feature_engineering.py", "publish_dynamodb.py", "publish_memorydb_vectors.py"]
MARCADORES_DO_SQL = {"banco", "tabela_interacoes", "tabela_catalogo"}
EXTENSOES = (".py", ".sql")


def achados_no_texto(texto: str) -> list:
    """Cada ocorrência de padrão proibido, como 'linha N: padrão'."""
    achados = []
    for numero, linha in enumerate(texto.splitlines(), start=1):
        for padrao in PADROES:
            if padrao in linha:
                achados.append(f"linha {numero}: {padrao}")
    return achados


def arquivos_do_lote(raiz: Path) -> list:
    return sorted(p for p in raiz.rglob("*") if p.is_file() and p.suffix in EXTENSOES and "__pycache__" not in p.parts)


def achados_na_arvore(raiz: Path) -> dict:
    resultado = {}
    for arquivo in arquivos_do_lote(raiz):
        achados = achados_no_texto(arquivo.read_text(encoding="utf-8"))
        if achados:
            resultado[str(arquivo.relative_to(raiz))] = achados
    return resultado


def achados_de_sintaxe_do_sql(texto: str) -> list:
    """Sintaxe que templatefile e string.Template tratam diferente, ou marcador fora do contrato."""
    # {{, {% e {# porque o AthenaOperator passa a query pelo Jinja do Airflow.
    achados = [s for s in ("$$", "%{", "{{", "{%", "{#") if s in texto]
    for marcador in re.finditer(r"\$(\{([^}]*)\})?", texto):
        nome = marcador.group(2)
        if nome not in MARCADORES_DO_SQL:
            achados.append(marcador.group(0) or "$")
    return achados


def carregar_modulo(caminho: Path, nome: str):
    spec = importlib.util.spec_from_file_location(nome, caminho)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


class TestVerificadorDeNomesFixos(unittest.TestCase):
    """O próprio verificador reprova as fixtures vermelhas de cada tipo de arquivo."""

    def _arvore(self, arquivos: dict) -> dict:
        with tempfile.TemporaryDirectory() as tmp:
            raiz = Path(tmp)
            for nome, conteudo in arquivos.items():
                destino = raiz / nome
                destino.parent.mkdir(parents=True, exist_ok=True)
                destino.write_text(conteudo, encoding="utf-8")
            return achados_na_arvore(raiz)

    def test_fixture_python_com_bucket_fixo_reprova(self):
        achados = self._arvore({"glue/job.py": 'df = spark.read.parquet("s3://ecommerce-golden/interactions/")\n'})
        self.assertIn("glue/job.py", achados)
        self.assertIn("linha 1: s3://", achados["glue/job.py"])

    def test_fixture_sql_com_banco_fixo_reprova(self):
        achados = self._arvore({"athena/q.sql": "SELECT * FROM ecommerce_golden_db.interactions i\n"})
        self.assertIn("athena/q.sql", achados)
        self.assertIn("linha 1: _golden_db", achados["athena/q.sql"])

    def test_fixture_no_dag_aninhado_reprova(self):
        achados = self._arvore({"airflow/dags/d.py": 'job_name="recsys-features"\n'})
        self.assertIn("airflow/dags/d.py", achados)

    def test_arquivo_fora_das_extensoes_nao_entra(self):
        # A configuração de exemplo é dado, não script: nela os nomes são esperados.
        self.assertEqual(self._arvore({"config.json": '{"bucket": "01-recomendacao-lab-golden"}'}), {})

    def test_fixture_sql_com_banco_real_do_stack_reprova(self):
        achados = self._arvore({"athena/q.sql": "SELECT * FROM p01_recomendacao_lab_golden.interactions\n"})
        self.assertIn("linha 1: p01_recomendacao_", achados["athena/q.sql"])

    def test_fixture_python_com_banco_real_do_stack_reprova(self):
        achados = self._arvore({"airflow/dags/d.py": 'database="p01_recomendacao_lab_golden"\n'})
        self.assertIn("linha 1: p01_recomendacao_", achados["airflow/dags/d.py"])

    def test_fixture_python_com_prefixo_de_excecao_hifenizado_reprova(self):
        achados = self._arvore({"airflow/dags/d.py": 'env="p01-recomendacao-lab-mwaa"\n'})
        self.assertIn("linha 1: p01-recomendacao-", achados["airflow/dags/d.py"])

    def test_padroes_da_a13_presentes(self):
        for padrao in ("s3://", "ecommerce-", "recsys-", "01-recomendacao-", "ecommerce_", "_golden_db",
                       "p01_recomendacao_", "p01-recomendacao-"):
            self.assertIn(padrao, PADROES)


class TestScriptsDoLoteSemNomesFixos(unittest.TestCase):
    """PY-01 sobre a árvore real do lote."""

    def test_varredura_cobre_dag_glue_e_sql(self):
        arquivos = {str(p.relative_to(LOTE)) for p in arquivos_do_lote(LOTE)}
        self.assertIn(str(DAG.relative_to(LOTE)), arquivos)
        self.assertIn(str(SQL.relative_to(LOTE)), arquivos)
        self.assertTrue(any(a.startswith("glue/") for a in arquivos))

    def test_nenhum_nome_fixo_nos_scripts_do_lote(self):
        achados = achados_na_arvore(LOTE)
        self.assertEqual(achados, {}, f"Nomes de recurso fixos nos scripts do lote (RF-107, PY-01): {json.dumps(achados, indent=2)}")


class TestSqlPorMarcadores(unittest.TestCase):
    """O SQL recebe banco e tabelas por marcadores, preenchidos com a mesma configuração do DAG."""

    def test_sql_usa_marcadores_de_banco_e_tabelas(self):
        texto = SQL.read_text(encoding="utf-8")
        for marcador in ("${banco}", "${tabela_interacoes}", "${tabela_catalogo}"):
            self.assertIn(marcador, texto)

    def test_sql_so_tem_os_marcadores_do_contrato(self):
        # templatefile e string.Template só dão o mesmo texto se o SQL não tiver escape nem diretiva
        # de nenhum dos dois: sem $$, sem %{, sem {{ e sem $ fora de ${banco} e ${tabela_*}.
        texto = SQL.read_text(encoding="utf-8")
        self.assertEqual(achados_de_sintaxe_do_sql(texto), [])

    def test_verificador_de_sintaxe_reprova_fixtures(self):
        for ruim in ("SELECT $$x", "%{ if a }", "{{ ds }}", "WHERE a = $b", "${outro}", "${ banco }",
                     "{% if a %}", "{# comentario #}"):
            self.assertNotEqual(achados_de_sintaxe_do_sql(ruim), [], ruim)
        self.assertEqual(achados_de_sintaxe_do_sql("FROM ${banco}.${tabela_catalogo} c"), [])

    def test_sql_renderizado_por_string_template_nao_tem_marcador(self):
        texto = Template(SQL.read_text(encoding="utf-8")).substitute(
            banco="b", tabela_interacoes="ti", tabela_catalogo="tc"
        )
        self.assertNotIn("$", texto)
        self.assertNotIn("{", texto)
        self.assertIn("b.ti i", texto)
        self.assertIn("b.tc c", texto)

    def test_sql_renderizado_com_a_configuracao_cita_o_banco_do_stack(self):
        config = json.loads(CONFIG_EXEMPLO.read_text(encoding="utf-8"))
        texto = Template(SQL.read_text(encoding="utf-8")).substitute(
            banco=config["banco"],
            tabela_interacoes=config["tabelas"]["interacoes"],
            tabela_catalogo=config["tabelas"]["catalogo"],
        )
        self.assertIn(f'{config["banco"]}.{config["tabelas"]["interacoes"]}', texto)
        self.assertNotIn("${", texto)


class TestDagLeNomesDaConfiguracao(unittest.TestCase):
    """O DAG lê todos os nomes do arquivo de configuração (com os stubs, sem Airflow instalado)."""

    def _carregar_dag(self, config: dict):
        with tempfile.TemporaryDirectory() as tmp:
            caminho = Path(tmp) / "config.json"
            caminho.write_text(json.dumps(config), encoding="utf-8")
            with mock.patch.dict(os.environ, {"RECOMENDACAO_DAG_CONFIG": str(caminho)}):
                return carregar_modulo(DAG, "dag_sob_teste")

    def test_configuracao_de_exemplo_tem_os_nomes_do_prefixo(self):
        config = json.loads(CONFIG_EXEMPLO.read_text(encoding="utf-8"))
        self.assertEqual(config["banco"], "p01_recomendacao_lab_golden")
        self.assertTrue(config["workgroup_athena"].startswith("01-recomendacao-lab-"))
        for job in config["jobs_glue"].values():
            self.assertTrue(job.startswith("01-recomendacao-lab-"), job)

    def test_valores_da_configuracao_chegam_ao_dag(self):
        config = json.loads(CONFIG_EXEMPLO.read_text(encoding="utf-8"))
        config["bucket_golden"] = "bucket-sintetico-xyz"
        config["banco"] = "banco_sintetico_xyz"
        dag = self._carregar_dag(config)
        self.assertEqual(dag.CONFIG["bucket_golden"], "bucket-sintetico-xyz")
        self.assertIn("banco_sintetico_xyz.", dag.SQL_FEATURES)
        self.assertNotIn("${", dag.SQL_FEATURES)

    def test_configuracao_incompleta_falha_ao_carregar(self):
        config = json.loads(CONFIG_EXEMPLO.read_text(encoding="utf-8"))
        del config["banco"]
        with self.assertRaises(KeyError):
            self._carregar_dag(config)

    def test_chave_aninhada_faltando_falha_com_arquivo_e_caminho(self):
        for grupo, chave in (("jobs_glue", "publicar_memorydb"), ("treino", "role_arn"), ("tabelas", "catalogo")):
            with self.subTest(chave=f"{grupo}.{chave}"):
                config = json.loads(CONFIG_EXEMPLO.read_text(encoding="utf-8"))
                del config[grupo][chave]
                with self.assertRaises(KeyError) as erro:
                    self._carregar_dag(config)
                self.assertIn(f"{grupo}.{chave}", str(erro.exception))
                self.assertIn("config.json", str(erro.exception))


class TestGlueLeNomesPorArgumento(unittest.TestCase):
    """Os jobs do Glue recebem os caminhos e nomes por argumento (getResolvedOptions)."""

    def test_feature_engineering_le_os_caminhos_do_argv(self):
        modulo = carregar_modulo(LOTE / "glue" / "feature_engineering.py", "fe_sob_teste")
        argv = ["job.py", "--JOB_NAME", "job-x", "--caminho_interacoes", "uri-i", "--caminho_catalogo", "uri-c", "--caminho_features", "uri-f"]
        args = modulo.ler_argumentos(argv)
        self.assertEqual(args["caminho_interacoes"], "uri-i")
        self.assertEqual(args["caminho_catalogo"], "uri-c")
        self.assertEqual(args["caminho_features"], "uri-f")
        self.assertEqual(args["JOB_NAME"], "job-x")

    def test_feature_engineering_sem_argumento_falha(self):
        modulo = carregar_modulo(LOTE / "glue" / "feature_engineering.py", "fe_sob_teste2")
        with self.assertRaises(SystemExit):
            modulo.ler_argumentos(["job.py", "--JOB_NAME", "job-x"])

    def test_publicadores_leem_destino_do_argv(self):
        sys.modules.setdefault("boto3", mock.MagicMock())
        sys.modules.setdefault("redis", mock.MagicMock())
        dynamo = carregar_modulo(LOTE / "glue" / "publish_dynamodb.py", "pd_sob_teste")
        args = dynamo.ler_argumentos(["job.py", "--tabela_recomendacoes", "tabela-x", "--regiao", "us-east-1"])
        self.assertEqual(args["tabela_recomendacoes"], "tabela-x")
        memorydb = carregar_modulo(LOTE / "glue" / "publish_memorydb_vectors.py", "pm_sob_teste")
        args = memorydb.ler_argumentos(["job.py", "--memorydb_host", "host-x", "--memorydb_port", "6379"])
        self.assertEqual(args["memorydb_host"], "host-x")

    def test_no_glue_usa_get_resolved_options_com_argumentos(self):
        sys.modules.setdefault("boto3", mock.MagicMock())
        sys.modules.setdefault("redis", mock.MagicMock())
        for indice, script in enumerate(SCRIPTS_DO_GLUE):
            with self.subTest(script=script):
                modulo = carregar_modulo(GLUE / script, f"glue_resolvido_{indice}")
                falso = mock.Mock(return_value={"ok": "sim"})
                argv = ["job.py", "--x", "y"]
                with mock.patch.object(modulo, "getResolvedOptions", falso):
                    self.assertEqual(modulo.ler_argumentos(argv), {"ok": "sim"})
                falso.assert_called_once_with(argv, modulo.ARGUMENTOS)
                self.assertTrue(modulo.ARGUMENTOS)


if __name__ == "__main__":
    unittest.main()
