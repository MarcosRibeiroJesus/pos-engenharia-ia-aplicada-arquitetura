"""AWS Glue / Python Batch Publisher to Amazon DynamoDB.
Populates user_recommendations table with Top-50 batch profiles and 7-day TTL (604800 seconds).
"""
import sys
import time
from decimal import Decimal
import boto3

try:
    from awsglue.utils import getResolvedOptions
except ImportError:
    # Execução e testes locais sem as bibliotecas do Glue
    getResolvedOptions = None

# Nomes por argumento do job (RF-107, PY-01): a tabela vem do Terraform, nunca escrita aqui.
ARGUMENTOS = ["tabela_recomendacoes", "regiao"]


def ler_argumentos(argv):
    """getResolvedOptions no Glue; fora dele, o mesmo contrato (argumento faltando encerra o job)."""
    if getResolvedOptions is not None:
        return getResolvedOptions(argv, ARGUMENTOS)
    import argparse

    parser = argparse.ArgumentParser()
    for nome in ARGUMENTOS:
        parser.add_argument(f"--{nome}", required=True)
    conhecidos, _ = parser.parse_known_args(argv[1:])
    return vars(conhecidos)


def publish_batch_recommendations(table_name, region):
    print(f"Connecting to DynamoDB table: {table_name}")
    dynamodb = boto3.resource("dynamodb", region_name=region)
    table = dynamodb.Table(table_name)

    now = int(time.time())
    ttl = now + 604800  # 7 days in seconds: 7 * 86400 = 604800

    # Sample batch profile generator conforming to dynamodb-batch-recs-contract.json
    sample_users = [f"u-{1000 + i}" for i in range(10)]

    with table.batch_writer() as batch:
        for user_id in sample_users:
            recs = [
                {
                    "itemId": f"SKU-{9000 + r}",
                    "score": Decimal(str(round(0.95 - (r * 0.015), 3))),
                    "rank": r + 1,
                    "modelId": "cf-spot-v1.0",
                    "category": "Electronics",
                    "title": f"Top Batch Pick {r + 1}",
                    "priceCents": 1999 + (r * 500),
                }
                for r in range(20)  # Top 20 precomputed batch items
            ]

            item = {
                "userId": user_id,
                "generatedAt": now,
                "ttlTimestamp": ttl,
                "recommendations": recs,
            }

            batch.put_item(Item=item)

    print(f"Successfully published batch recommendation profiles with TTL={ttl} to DynamoDB.")

if __name__ == "__main__":
    args = ler_argumentos(sys.argv)
    publish_batch_recommendations(args["tabela_recomendacoes"], args["regiao"])
