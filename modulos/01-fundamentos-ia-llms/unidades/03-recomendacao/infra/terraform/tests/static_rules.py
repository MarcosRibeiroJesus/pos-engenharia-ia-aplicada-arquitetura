#!/usr/bin/env python3
"""Regras que o `terraform test` não enxerga por serem estruturais (tipo de recurso, backend).

R5: nenhum recurso de custo fixo ocioso sem ADR que o cite.
R8: state remoto em S3 com lock nativo.
ADR-0005: workflows com OIDC, ambiente protegido, confirmação e verificação de sobras.
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

# ADR-0005: workflows da unidade na raiz do repositório.
WF = UNIT.parents[3] / ".github" / "workflows"
wf = {name: (WF / name).read_text(encoding="utf-8") if (WF / name).exists() else ""
      for name in ("recsys-01-03-ci.yml", "recsys-01-03-apply.yml", "recsys-01-03-destroy.yml")}
for name, text in wf.items():
    if not text:
        failures.append(f"ADR-0005: falta .github/workflows/{name}")
        continue
    if re.search(r"AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|aws-access-key-id", text):
        failures.append(f"ADR-0005: {name} usa chave estática; use OIDC")
    # CLAUDE.md (supply chain): toda action fixada por SHA de commit, com a tag em comentário.
    for ref in re.findall(r"uses:\s*([^\s#]+)", text):
        if ref.startswith("./") or ref.startswith("docker://"):
            continue
        if not re.fullmatch(r"[^@]+@[0-9a-f]{40}", ref):
            failures.append(f"Supply chain: {name} usa {ref} sem SHA fixo")
for name in ("recsys-01-03-apply.yml", "recsys-01-03-destroy.yml"):
    text = wf[name]
    if text and not re.search(r"^\s+environment:\s*aws-lab\s*$", text, flags=re.M):
        failures.append(f"ADR-0005: {name} precisa rodar no ambiente protegido aws-lab")
    if text and "id-token: write" not in text:
        failures.append(f"ADR-0005: {name} precisa de id-token: write (OIDC)")
    if text and "workflow_dispatch" not in text:
        failures.append(f"ADR-0005: {name} só por disparo manual")
d = wf["recsys-01-03-destroy.yml"]
if d and not ('"$CONFIRM" != "$STACK_NAME"' in d and "STACK_NAME: recsys-lab" in d):
    failures.append("ADR-0005: destroy precisa confirmar digitando o nome do stack")
if d and "resourcegroupstaggingapi get-resources" not in d:
    failures.append("ADR-0005: destroy precisa verificar sobras pela tag do projeto")
if wf["recsys-01-03-apply.yml"] and "TF_VAR_enable_mwaa" not in wf["recsys-01-03-apply.yml"]:
    failures.append("ADR-0005: apply precisa repassar enable_mwaa")
ci = wf["recsys-01-03-ci.yml"]
for needle, why in [("modulos/01-fundamentos-ia-llms/unidades/03-recomendacao/**", "filtro de caminho"),
                    ("terraform test", "terraform test"), ("checkov", "checkov"), ("tflint", "tflint"),
                    ("floci/floci", "Floci como container de serviço"), ("createComment", "plan comentado no PR"),
                    ("infracost", "Infracost")]:
    if ci and needle not in ci:
        failures.append(f"ADR-0005: CI sem {why}")

for f in failures:
    print("FALHA", f)
print(f"static_rules: {len(failures)} falha(s)")
sys.exit(1 if failures else 0)
