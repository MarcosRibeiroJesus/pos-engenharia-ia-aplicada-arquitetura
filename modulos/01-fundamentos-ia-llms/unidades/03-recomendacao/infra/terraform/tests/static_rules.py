#!/usr/bin/env python3
"""Regras que o `terraform test` não enxerga por serem estruturais (tipo de recurso, backend).

R5: nenhum recurso de custo fixo ocioso sem ADR que o cite.
R8: state remoto em S3 com lock nativo.
Roda sem rede e sem credenciais: `python3 tests/static_rules.py`.
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent          # infra/terraform
UNIT = ROOT.parent.parent                                      # unidade
ADR_TEXT = "\n".join(p.read_text(encoding="utf-8") for p in (UNIT / "adr").glob("*.md"))

# Recursos com custo por hora mesmo sem tráfego. Cada um precisa ser citado em um ADR.
IDLE_COST = ["aws_nat_gateway", "aws_vpc_endpoint", "aws_memorydb_cluster", "aws_lb",
             "aws_mwaa_environment", "aws_kms_key", "aws_ecs_service", "aws_eks_cluster",
             "aws_db_instance", "aws_rds_cluster", "aws_elasticache_cluster", "aws_instance"]

failures = []
tf_files = [p for p in ROOT.rglob("*.tf") if ".terraform" not in p.parts]
declared = set()
for p in tf_files:
    for m in re.finditer(r'resource\s+"([a-z0-9_]+)"', p.read_text(encoding="utf-8")):
        declared.add(m.group(1))

for rtype in IDLE_COST:
    if rtype in declared and rtype not in ADR_TEXT:
        failures.append(f"R5: {rtype} tem custo fixo e não é citado em nenhum ADR de adr/")

if "aws_nat_gateway" in declared:
    failures.append("R5/ADR-0002: o padrão escolhido é endpoints de interface, não NAT Gateway")

versions = (ROOT / "versions.tf").read_text(encoding="utf-8")
if not re.search(r'backend\s+"s3"\s*\{', versions):
    failures.append("R8: versions.tf precisa declarar backend \"s3\"")
example = (ROOT / "backend.hcl.example").read_text(encoding="utf-8")
if not re.search(r"^use_lockfile\s*=\s*true", example, flags=re.M):
    failures.append("R8: backend.hcl.example precisa de use_lockfile = true")
if "dynamodb_table" in example:
    failures.append("R8: lock por DynamoDB está obsoleto; use use_lockfile")

for f in failures:
    print("FALHA", f)
print(f"static_rules: {len(failures)} falha(s)")
sys.exit(1 if failures else 0)
