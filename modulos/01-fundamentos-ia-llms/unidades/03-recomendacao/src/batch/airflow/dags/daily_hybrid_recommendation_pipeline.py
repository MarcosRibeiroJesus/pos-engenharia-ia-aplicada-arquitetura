"""Apache Airflow DAG for Daily Hybrid Recommendation Batch Pipeline.
Runs on Amazon MWAA (mw1.small). Coordinates S3 Sensor, Athena, Glue, SageMaker, and publishing.
"""
import json
import os
from datetime import datetime, timedelta
from pathlib import Path
from string import Template

try:
    from airflow import DAG
    from airflow.operators.empty import EmptyOperator
    from airflow.providers.amazon.aws.operators.athena import AthenaOperator
    from airflow.providers.amazon.aws.operators.glue import GlueJobOperator
    from airflow.providers.amazon.aws.operators.sagemaker import SageMakerTrainingOperator
    from airflow.providers.amazon.aws.sensors.s3 import S3KeySensor
except ImportError:
    # Stub classes for local validation and testing when airflow packages are not in global python
    class DAG:
        def __init__(self, *args, **kwargs):
            pass
        def __enter__(self):
            return self
        def __exit__(self, *args):
            pass

    class BaseOperatorStub:
        def __init__(self, *args, **kwargs):
            pass
        def __rshift__(self, other):
            return other

    EmptyOperator = BaseOperatorStub
    AthenaOperator = BaseOperatorStub
    GlueJobOperator = BaseOperatorStub
    SageMakerTrainingOperator = BaseOperatorStub
    S3KeySensor = BaseOperatorStub

# Nomes por configuração (RF-107, PY-01): bucket, banco, tabelas, workgroup, jobs e role vêm de
# dags/config/01-recomendacao.json, que a T063 gera a partir das saídas do Terraform. A variável
# RECOMENDACAO_DAG_CONFIG aponta para outro arquivo (testes e execução local).
_DIRETORIO_DO_DAG = Path(__file__).resolve().parent
_CAMINHO_DA_CONFIG = Path(os.environ.get("RECOMENDACAO_DAG_CONFIG", _DIRETORIO_DO_DAG / "config" / "01-recomendacao.json"))
# O SQL fica em sql_features (relativo ao diretório do DAG) no MWAA; o padrão é o layout do repositório.
_SQL_PADRAO = _DIRETORIO_DO_DAG.parents[1] / "athena" / "extract_curated_features.sql"


CHAVES_OBRIGATORIAS = (
    "bucket_golden",
    "prefixo_interacoes",
    "banco",
    "tabelas.interacoes",
    "tabelas.catalogo",
    "workgroup_athena",
    "jobs_glue.features",
    "jobs_glue.publicar_dynamodb",
    "jobs_glue.publicar_memorydb",
    "treino.prefixo_do_job",
    "treino.role_arn",
    "treino.imagem",
)


def carregar_config(caminho: Path) -> dict:
    """Lê a configuração do lote; chave obrigatória faltando falha no carregamento do DAG (KeyError)."""
    config = json.loads(Path(caminho).read_text(encoding="utf-8"))
    # Falha cedo, no parse do DAG, e não no meio da execução; a mensagem diz o arquivo e a chave.
    faltando = []
    for chave in CHAVES_OBRIGATORIAS:
        valor = config
        for parte in chave.split("."):
            if not isinstance(valor, dict) or parte not in valor:
                faltando.append(chave)
                break
            valor = valor[parte]
    if faltando:
        raise KeyError(f"Configuração do lote {caminho} sem as chaves {', '.join(faltando)}")
    return config


def renderizar_sql(caminho: Path, config: dict) -> str:
    """Preenche os marcadores ${banco} e ${tabela_*} com os mesmos valores do templatefile do Terraform."""
    return Template(Path(caminho).read_text(encoding="utf-8")).substitute(
        banco=config["banco"],
        tabela_interacoes=config["tabelas"]["interacoes"],
        tabela_catalogo=config["tabelas"]["catalogo"],
    )


CONFIG = carregar_config(_CAMINHO_DA_CONFIG)
SQL_FEATURES = renderizar_sql(
    _DIRETORIO_DO_DAG / CONFIG["sql_features"] if "sql_features" in CONFIG else _SQL_PADRAO, CONFIG
)
JOBS_GLUE = CONFIG["jobs_glue"]
TREINO = CONFIG["treino"]

default_args = {
    "owner": "data-platform",
    "depends_on_past": False,
    "email_on_failure": False,
    "email_on_retry": False,
    "retries": 1,
    "retry_delay": timedelta(minutes=5),
}

with DAG(
    dag_id="daily_hybrid_recommendation_pipeline",
    default_args=default_args,
    description="Daily automated batch retraining and publishing pipeline for hybrid recommendations",
    schedule_interval="@daily",
    start_date=datetime(2026, 1, 1),
    catchup=False,
    max_active_runs=1,
    tags=["recommendations", "hybrid", "aws", "batch"],
) as dag:

    # 1. Wait for daily interactions partition to arrive in S3 Golden Dataset
    wait_for_daily_interactions = S3KeySensor(
        task_id="wait_for_daily_interactions",
        bucket_name=CONFIG["bucket_golden"],
        bucket_key=CONFIG["prefixo_interacoes"] + "/year={{ ds_nodash[:4] }}/month={{ ds_nodash[4:6] }}/day={{ ds_nodash[6:8] }}/_SUCCESS",
        timeout=3600,
        poke_interval=60,
        mode="reschedule",
    )

    # 2. Extract and pre-aggregate curated interaction features via Athena
    athena_extract_curated_features = AthenaOperator(
        task_id="athena_extract_curated_features",
        query=SQL_FEATURES,
        database=CONFIG["banco"],
        # Sem output_location: o workgroup impõe o local e a chave KMS (enforce_workgroup_configuration).
        workgroup=CONFIG["workgroup_athena"],
    )

    # 3. AWS Glue PySpark ETL Feature Engineering with Job Bookmarks
    glue_feature_engineering = GlueJobOperator(
        task_id="glue_feature_engineering",
        # O job, o script, a role e os argumentos são do Terraform; o DAG só dispara pelo nome.
        job_name=JOBS_GLUE["features"],
        num_of_dpus=2,
    )

    # 4. SageMaker Spot Instance Collaborative Filtering Training & 128-dim Embedding Generation
    sagemaker_train_model = SageMakerTrainingOperator(
        task_id="sagemaker_train_model",
        config={
            "TrainingJobName": TREINO["prefixo_do_job"] + "-{{ ds_nodash }}",
            "AlgorithmSpecification": {
                "TrainingImage": TREINO["imagem"],
                "TrainingInputMode": "File",
            },
            "RoleArn": TREINO["role_arn"],
            "ResourceConfig": {
                "InstanceCount": 1,
                "InstanceType": "ml.m5.xlarge",
                "VolumeSizeInGB": 30,
            },
            "StoppingCondition": {
                "MaxRuntimeInSeconds": 3600,
                "MaxWaitTimeInSeconds": 7200,
            },
            "EnableManagedSpotTraining": True,
        },
    )

    # 5a. Publish Top-50 precomputed batch recommendations to DynamoDB with 7-day TTL
    glue_publish_dynamodb = GlueJobOperator(
        task_id="glue_publish_dynamodb",
        job_name=JOBS_GLUE["publicar_dynamodb"],
        num_of_dpus=2,
    )

    # 5b. Publish 128-dim Float32 item embeddings to MemoryDB Redis vector index item_idx
    glue_publish_memorydb_vectors = GlueJobOperator(
        task_id="glue_publish_memorydb_vectors",
        job_name=JOBS_GLUE["publicar_memorydb"],
        num_of_dpus=2,
    )

    # Execution dependency chain
    (
        wait_for_daily_interactions
        >> athena_extract_curated_features
        >> glue_feature_engineering
        >> sagemaker_train_model
        >> [glue_publish_dynamodb, glue_publish_memorydb_vectors]
    )
