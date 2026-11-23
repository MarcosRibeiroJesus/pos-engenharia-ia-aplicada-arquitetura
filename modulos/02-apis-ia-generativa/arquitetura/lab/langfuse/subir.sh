#!/usr/bin/env bash
# Sobe o Langfuse local e cria o bucket no S3 (Floci) que ele usa.
set -euo pipefail
cd "$(dirname "$0")"
[ -f .env ] || { echo "Crie lab/langfuse/.env a partir de .env.example"; exit 1; }
docker compose up -d
for _ in $(seq 1 60); do curl -fs -o /dev/null http://127.0.0.1:4567/_floci/health && break; sleep 2; done
AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test AWS_DEFAULT_REGION=us-east-1 \
  aws --endpoint-url http://127.0.0.1:4567 s3 mb s3://langfuse 2>/dev/null || true
for _ in $(seq 1 90); do curl -fs -o /dev/null http://127.0.0.1:3000/api/public/health && { echo "Langfuse em http://localhost:3000"; exit 0; }; sleep 3; done
echo "Langfuse não respondeu; veja: docker compose logs langfuse-web"; exit 1
