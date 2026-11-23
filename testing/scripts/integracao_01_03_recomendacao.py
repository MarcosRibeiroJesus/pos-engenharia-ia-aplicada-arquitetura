#!/usr/bin/env python3
"""Integração da unidade 01.03 (recomendação) contra o Floci.

Fluxo, com o projeto concluído:
  1. bootstrap do state remoto no emulador (bucket S3);
  2. init do stack com backend S3 + use_lockfile apontando para o emulador;
  3. apply com o provider apontando para o emulador;
  4. asserts nos recursos criados, cada um ligado a uma regra (R1..R9, ADRs);
  5. componente com Claude contra o bedrock-runtime do emulador (fallback sem explicação);
  6. destroy (sempre) e verificação de sobras por tag;
  7. relatório HTML em testing/reports/<run-id>/relatorio.html e testing/reports/latest.html.

Sem conta AWS real: credenciais fixas "test" e endpoint local.
Uso: python3 testing/scripts/integracao_01_03_recomendacao.py
"""
import datetime
import html
import json
import os
import pathlib
import shutil
import subprocess
import tempfile
import time

REPO = pathlib.Path(__file__).resolve().parents[2]
UNIT = REPO / "modulos/01-fundamentos-ia-llms/unidades/03-recomendacao"
TF_DIR = UNIT / "infra/terraform"
BOOT_DIR = UNIT / "infra/bootstrap"
REPORTS = REPO / "testing/reports"
ENDPOINT = os.environ.get("AWS_ENDPOINT_URL", "http://localhost:4566")
EMULATOR = os.environ.get("EMULATOR_NAME", "Floci")
PROJECT, ENVIRONMENT = "01-recomendacao", "lab"  # PROJECT é a tag project (D-031); os nomes vêm do output prefixo_dos_nomes
STATE_BUCKET = "01-recomendacao-tfstate-floci"
STATE_KEY = "01-recomendacao/lab.tfstate"  # mesma chave dos workflows (STATE_KEY)
RUN_ID = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
OUT = REPORTS / f"{RUN_ID}-01-03-recomendacao"

ENV = {
    **os.environ,
    "AWS_ACCESS_KEY_ID": "test",
    "AWS_SECRET_ACCESS_KEY": "test",
    "AWS_DEFAULT_REGION": "us-east-1",
    "AWS_REGION": "us-east-1",
    "AWS_ENDPOINT_URL": ENDPOINT,
    "TF_IN_AUTOMATION": "1",
    "CHECKPOINT_DISABLE": "1",
}

# Lacunas conhecidas do emulador: só entram aqui com evidência (ver ADR-0006).
results = []
blocked = {"on": False}

SERVICES = [
    "acm", "athena", "budgets", "cloudwatch", "dynamodb", "ec2", "ecr", "ecs", "elbv2", "glue",
    "iam", "kms", "lakeformation", "logs", "memorydb", "mwaa", "resourcegroupstaggingapi", "s3", "s3control",
    "sagemaker", "sns", "sqs", "sts",
]


def provider_override(default_tags: bool) -> str:
    endpoints = "\n".join(f'    {s} = "{ENDPOINT}"' for s in SERVICES)
    tags = ""
    if default_tags:
        tags = """
  default_tags {
    tags = local.tags_padrao
  }"""
    return f"""# Gerado pelo harness de integração; apagado ao final. Não versionar.
provider "aws" {{
  region                      = "us-east-1"
  access_key                  = "test"
  secret_key                  = "test"
  skip_credentials_validation = true
  skip_metadata_api_check     = true
  s3_use_path_style           = true

  endpoints {{
{endpoints}
  }}{tags}
}}
"""


# Lacunas do Floci 2.5 com evidência (mensagem do próprio emulador; ver ADR-0006). O harness troca
# só esses recursos por substitutos durante o apply; o plan completo continua validando o código real.
EMULATOR_GAPS = {
    "memorydb_cluster": {
        "evidence": ("CreateSubnetGroup e CreateParameterGroup devolvem UnknownOperationException; "
                     "DescribeClusters com ShowShardDetails devolve Shards: null e o provider falha em "
                     "'no available shards found'"),
        "resources": ["aws_memorydb_subnet_group.main", "aws_memorydb_parameter_group.redis7",
                      "aws_memorydb_cluster.vector_cluster"],
        "override": """resource "aws_memorydb_subnet_group" "main" {
  count = 0
}
resource "aws_memorydb_parameter_group" "redis7" {
  count = 0
}
resource "aws_memorydb_cluster" "vector_cluster" {
  count                = 0
  subnet_group_name    = null
  parameter_group_name = null
}
output "cluster_endpoint" {
  value = "memorydb-lacuna-do-emulador:6379"
}
output "cluster_arn" {
  value = "arn:aws:memorydb:us-east-1:000000000000:cluster/lacuna-do-emulador"
}
""",
    },
    "lake_formation": {
        "evidence": ("RevokePermissions de permissão inexistente devolve 200 no Floci; a AWS devolve "
                     "InvalidInputException 'No permissions revoked. Grantee has no permissions', que o provider "
                     "v6.73.0 exige para confirmar o delete (internal/service/lakeformation/permissions.go, "
                     "linhas 699-705), senão aborta com 'empty retryable error'"),
        "resources": ["aws_lakeformation_permissions.database_permissions", "aws_lakeformation_permissions.data_location"],
        "override": """resource "aws_lakeformation_permissions" "database_permissions" {
  count = 0
}
resource "aws_lakeformation_permissions" "data_location" {
  count = 0
}
""",
    },
    "sagemaker_endpoint": {
        "evidence": "endpoint vai a Failed: java.net.SocketException (o Floci tenta subir o container do modelo via Docker)",
        "resources": ["aws_sagemaker_endpoint.reranker"],
        "override": """resource "aws_sagemaker_endpoint" "reranker" {
  count = 0
}
output "endpoint_name" {
  value = local.endpoint_name
}
output "endpoint_arn" {
  value = "arn:${local.partition}:sagemaker:${local.region}:000000000000:endpoint/${local.endpoint_name}"
}
""",
    },
}


def write_gap_overrides():
    paths = []
    for module, gap in EMULATOR_GAPS.items():
        path = TF_DIR / "modules" / module / "zz_floci_override.tf"
        path.write_text("# Gerado pelo harness de integração (lacuna do emulador). Não versionar.\n" + gap["override"],
                        encoding="utf-8")
        paths.append(path)
    return paths


_log_seq = [0]


def run(cmd, cwd=None, timeout=1800):
    """Roda um comando gravando a saída em arquivo enquanto ele corre (útil quando algo trava)."""
    t0 = time.time()
    OUT.mkdir(parents=True, exist_ok=True)
    _log_seq[0] += 1
    log = OUT / f"cmd-{_log_seq[0]:02d}.log"
    try:
        with open(log, "w", encoding="utf-8") as fh:
            fh.write("$ " + " ".join(cmd) + "\n")
            fh.flush()
            p = subprocess.run(cmd, cwd=cwd, env=ENV, stdout=fh, stderr=subprocess.STDOUT, text=True, timeout=timeout)
        rc = p.returncode
    except subprocess.TimeoutExpired:
        rc = 124
    except FileNotFoundError as exc:
        log.write_text(str(exc), encoding="utf-8")
        rc = 127
    out = log.read_text(encoding="utf-8").split("\n", 1)[-1].strip()
    if rc == 124:
        out = f"tempo esgotado após {timeout}s\n\n" + out[-8000:]
    return rc, out, round(time.time() - t0, 2)


def record(name, ok, *, rule="", expected="", got="", output="", command="", secs=0.0, gap=False,
           critical=False, note=""):
    if blocked["on"]:
        results.append(dict(step=name, rule=rule, status="pulado", expected=expected, got="",
                            output="", command=command, seconds=0, note="pulado: passo crítico anterior falhou"))
        return False
    status = "ok" if ok else ("lacuna" if gap else "falha")
    results.append(dict(step=name, rule=rule, status=status, expected=str(expected), got=str(got),
                        output=output[-16000:], command=command, seconds=secs, note=note))
    if not ok and critical and not gap:
        blocked["on"] = True
    return ok


def step(name, cmd, *, cwd=None, rule="", critical=False, note="", gap=False, timeout=1800):
    if blocked["on"]:
        return record(name, False, rule=rule, command=" ".join(cmd)), ""
    rc, out, secs = run(cmd, cwd=cwd, timeout=timeout)
    ok = rc == 0
    if not ok and "Error:" in out:
        # Guarda todos os blocos de erro do Terraform, não só o fim da saída.
        errors = [b for b in out.split("\n\n") if "Error:" in b]
        out = "\n\n".join(errors)[:12000] + "\n\n[...]\n" + out[-2000:]
    record(name, ok, rule=rule, expected="rc=0", got=f"rc={rc}", output=out, command=" ".join(cmd),
           secs=secs, critical=critical, note=note, gap=gap)
    return ok, out


def aws(*args):
    rc, out, _ = run(["aws", "--endpoint-url", ENDPOINT, "--output", "json", *args])
    if rc != 0:
        return None, out
    try:
        return (json.loads(out) if out else {}), out
    except json.JSONDecodeError:
        return out, out


def check(name, fn, *, rule, expected, gap_note=None, note=""):
    """Executa uma verificação Python; gap_note marca lacuna do emulador (com evidência no ADR-0006)."""
    t0 = time.time()
    try:
        got, ok, detail = fn()
    except Exception as exc:  # noqa: BLE001 - qualquer erro vira falha registrada
        got, ok, detail = f"erro: {exc}", False, repr(exc)
    record(name, ok, rule=rule, expected=expected, got=got, output=detail,
           secs=round(time.time() - t0, 2), gap=bool(gap_note) and not ok,
           note=(gap_note if (gap_note and not ok) else note))


# ---------------------------------------------------------------- asserts

def outputs():
    rc, out, _ = run(["terraform", "output", "-json"], cwd=TF_DIR)
    return json.loads(out) if rc == 0 else {}


def assertions(o):
    bucket = o.get("s3_golden_dataset_bucket", {}).get("value", "")
    table = o.get("dynamodb_table_name", {}).get("value", "")
    # Prefixo dos nomes lido do próprio stack: a tag project (PROJECT) e o prefixo dos nomes são
    # coisas diferentes até a T012, e o harness não repete a regra de nomes do Terraform.
    nome = o.get("prefixo_dos_nomes", {}).get("value", "")

    def s3_kms():
        d, raw = aws("s3api", "get-bucket-encryption", "--bucket", bucket)
        alg = d["ServerSideEncryptionConfiguration"]["Rules"][0]["ApplyServerSideEncryptionByDefault"]["SSEAlgorithm"] if d else None
        return alg, alg == "aws:kms", raw
    check("S3: SSE-KMS no golden dataset", s3_kms, rule="R2", expected="aws:kms")

    def s3_pab():
        d, raw = aws("s3api", "get-public-access-block", "--bucket", bucket)
        flags = list(d["PublicAccessBlockConfiguration"].values()) if d else []
        return flags, len(flags) == 4 and all(flags), raw
    check("S3: bloqueio de acesso público completo", s3_pab, rule="R1", expected="4 flags true")

    def s3_tls():
        d, raw = aws("s3api", "get-bucket-policy", "--bucket", bucket)
        pol = json.loads(d["Policy"]) if d else {"Statement": []}
        ok = any(s.get("Effect") == "Deny" and s.get("Condition", {}).get("Bool", {}).get("aws:SecureTransport") == "false"
                 for s in pol["Statement"])
        return "Deny sem TLS" if ok else "ausente", ok, raw
    check("S3: política nega acesso sem TLS", s3_tls, rule="R2", expected="Deny aws:SecureTransport=false")

    def ddb_sse():
        d, raw = aws("dynamodb", "describe-table", "--table-name", table)
        sse = (d or {}).get("Table", {}).get("SSEDescription", {})
        return sse.get("SSEType"), sse.get("Status") in ("ENABLED", "ENABLING") and sse.get("SSEType") == "KMS", raw
    check("DynamoDB: SSE com KMS", ddb_sse, rule="R2", expected="KMS / ENABLED")

    def memdb_tls():
        d, raw = aws("memorydb", "describe-clusters", "--cluster-name", f"{nome}-vec")
        c = (d or {}).get("Clusters", [{}])[0]
        return c.get("TLSEnabled"), c.get("TLSEnabled") is True, raw
    check("MemoryDB: TLS em trânsito", memdb_tls, rule="R2", expected=True,
          gap_note="Cluster fora do apply (lacuna do Floci, ADR-0006); TLS verificado no plan por terraform test memorydb_tls")

    def alb_internal():
        d, raw = aws("elbv2", "describe-load-balancers", "--names", f"{nome}-alb")
        scheme = (d or {}).get("LoadBalancers", [{}])[0].get("Scheme")
        return scheme, scheme == "internal", raw
    check("ALB interno por padrão", alb_internal, rule="R1", expected="internal")

    def ecs_private():
        d, raw = aws("ecs", "describe-services", "--cluster", f"{nome}-cluster",
                     "--services", f"{nome}-service")
        s = (d or {}).get("services", [{}])[0]
        ip = s.get("networkConfiguration", {}).get("awsvpcConfiguration", {}).get("assignPublicIp")
        return f"assignPublicIp={ip}, desired={s.get('desiredCount')}", ip == "DISABLED" and s.get("desiredCount") == 1, raw
    check("ECS: tasks sem IP público, 1 task no lab", ecs_private, rule="R1/R5", expected="DISABLED, 1")

    def endpoints():
        d, raw = aws("ec2", "describe-vpc-endpoints", "--filters", f"Name=tag:project,Values={PROJECT}")
        eps = (d or {}).get("VpcEndpoints", [])
        kinds = sorted((e["VpcEndpointType"], e["ServiceName"].split(".")[-1] if e["VpcEndpointType"] == "Gateway" else ".".join(e["ServiceName"].split(".")[3:])) for e in eps)
        n_if = sum(1 for k in kinds if k[0] == "Interface")
        n_gw = sum(1 for k in kinds if k[0] == "Gateway")
        return f"{n_if} interface, {n_gw} gateway", n_if == 6 and n_gw == 2, json.dumps(kinds)
    check("Rede: 6 endpoints de interface e 2 de gateway", endpoints, rule="ADR-0002", expected="6 interface, 2 gateway")

    def no_nat():
        d, raw = aws("ec2", "describe-nat-gateways")
        n = len([g for g in (d or {}).get("NatGateways", []) if g.get("State") != "deleted"])
        return n, n == 0, raw
    check("Rede: nenhum NAT Gateway", no_nat, rule="R5", expected=0)

    def no_igw():
        d, raw = aws("ec2", "describe-internet-gateways", "--filters", f"Name=tag:project,Values={PROJECT}")
        n = len((d or {}).get("InternetGateways", []))
        return n, n == 0, raw
    check("Rede: sem internet gateway sem opt-in", no_igw, rule="R1", expected=0)

    def task_policy():
        d, raw = aws("iam", "list-policies", "--scope", "Local")
        arn = next(p["Arn"] for p in d["Policies"] if p["PolicyName"] == f"{nome}-ecs-task-policy")
        meta, _ = aws("iam", "get-policy", "--policy-arn", arn)
        ver, raw2 = aws("iam", "get-policy-version", "--policy-arn", arn, "--version-id", meta["Policy"]["DefaultVersionId"])
        doc = ver["PolicyVersion"]["Document"]
        doc = json.loads(doc) if isinstance(doc, str) else doc
        bad = [s.get("Sid") for s in doc["Statement"] if s.get("Resource") == "*" and "Condition" not in s]
        return bad or "nenhum", not bad, raw2
    check("IAM: task role sem Resource \"*\" incondicional", task_policy, rule="R3", expected="nenhum")

    def tags():
        d, raw = aws("resourcegroupstaggingapi", "get-resources", "--tag-filters", f"Key=project,Values={PROJECT}")
        res = (d or {}).get("ResourceTagMappingList", [])
        missing = [r["ResourceARN"] for r in res
                   if not {"project", "module", "managed-by"} <= {t["Key"] for t in r.get("Tags", [])}]
        return f"{len(res)} recursos, {len(missing)} sem as 3 tags", len(res) > 0 and not missing, json.dumps(missing[:20])
    check("Tags project, module e managed-by", tags, rule="R4", expected=">0 recursos, 0 sem tags")

    def alarms():
        d, raw = aws("cloudwatch", "describe-alarms", "--alarm-name-prefix", f"{nome}-")
        al = (d or {}).get("MetricAlarms", [])
        no_action = [a["AlarmName"] for a in al if not a.get("AlarmActions")]
        return f"{len(al)} alarmes, {len(no_action)} sem ação", len(al) >= 7 and not no_action, raw
    check("Alarmes com ação no SNS", alarms, rule="R6", expected=">=7 alarmes, todos com ação")

    def logs():
        d, raw = aws("logs", "describe-log-groups")
        groups = (d or {}).get("logGroups", [])
        mine = [g for g in groups if nome and nome in g["logGroupName"]]
        no_kms = [g["logGroupName"] for g in mine if not g.get("kmsKeyId")]
        no_ret = [g["logGroupName"] for g in mine if not g.get("retentionInDays")]
        return f"{len(mine)} log groups, {len(no_kms)} sem KMS, {len(no_ret)} sem retenção", len(mine) >= 4 and not no_kms and not no_ret, raw
    check("Log groups com KMS e retenção", logs, rule="R6/R2", expected=">=4, todos com KMS e retenção")

    def budget():
        acct, _ = aws("sts", "get-caller-identity")
        d, raw = aws("budgets", "describe-budget", "--account-id", acct["Account"], "--budget-name", f"{nome}-monthly")
        lim = (d or {}).get("Budget", {}).get("BudgetLimit", {})
        return f"{lim.get('Amount')} {lim.get('Unit')}", float(lim.get("Amount", 0)) == 10.0 and lim.get("Unit") == "USD", raw
    check("AWS Budgets com teto de US$ 10", budget, rule="R9", expected="10 USD")

    def remote_state():
        d, raw = aws("s3api", "list-objects-v2", "--bucket", STATE_BUCKET)
        keys = [o["Key"] for o in (d or {}).get("Contents", [])]
        ok = STATE_KEY in keys and f"{STATE_KEY}.tflock" not in keys
        return keys, ok, raw
    check("State remoto no S3 e lock liberado após o apply", remote_state, rule="R8", expected=f"{STATE_KEY} sem .tflock")


def claude_against_emulator():
    """O explainer real (adaptador AnthropicBedrock) contra o bedrock-runtime do emulador."""
    script = r"""
const { BedrockClaudeClient } = require('./src/serving/dist/infrastructure/bedrock/bedrock-claude.client');
const { RecommendationExplainer } = require('./src/serving/dist/application/recommendation-explainer');
(async () => {
  const explainer = new RecommendationExplainer(new BedrockClaudeClient(), { modelId: 'anthropic.claude-haiku-5-5', timeoutMs: 5000 });
  const out = await explainer.explain({ userId: 'u-1', items: [{ itemId: 'SKU-1', title: 'Fone', provenance: 'batch', batchScore: 0.8 }] });
  console.log(JSON.stringify(out));
})().catch((e) => { console.log(JSON.stringify({ thrown: String(e) })); process.exit(2); });
"""
    env_extra = {"BEDROCK_ENDPOINT_URL": ENDPOINT, "LOG_LEVEL": "fatal"}
    t0 = time.time()
    try:
        p = subprocess.run(["node", "-e", script], cwd=UNIT, env={**ENV, **env_extra}, capture_output=True,
                           text=True, timeout=120)
        out = (p.stdout + p.stderr).strip()
        rc = p.returncode
    except Exception as exc:  # noqa: BLE001
        out, rc = str(exc), 1
    secs = round(time.time() - t0, 2)
    try:
        res = json.loads(out.splitlines()[-1])
    except Exception:  # noqa: BLE001
        res = {"thrown": out}
    ok_no_throw = rc == 0 and "status" in res
    record("Claude via bedrock-runtime do emulador: nunca lança, devolve estado explícito", ok_no_throw,
           rule="ADR-0004 (5.3)", expected="status ok ou unavailable, sem exceção",
           got=res.get("status", "exceção") + (f" / {res.get('errorCategory')}" if res.get("errorCategory") else ""),
           output=out, command="node -e <explainer contra o emulador>", secs=secs)
    return res


# ---------------------------------------------------------------- fluxo

def ensure_s3control_host():
    """S3 Control prefixa o host com o id da conta; o emulador usa 000000000000."""
    import socket
    host = "000000000000.localhost"
    try:
        socket.gethostbyname(host)
        return True, "resolve"
    except OSError:
        pass
    try:
        with open("/etc/hosts", "a", encoding="utf-8") as fh:
            fh.write(f"\n127.0.0.1 {host}\n")
        return True, "adicionado em /etc/hosts"
    except OSError as exc:
        return False, f"adicione '127.0.0.1 {host}' em /etc/hosts ({exc})"


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    ok_host, how = ensure_s3control_host()
    record("Host do S3 Control do emulador resolve", ok_host, expected="000000000000.localhost -> 127.0.0.1",
           got=how, critical=True)
    override = TF_DIR / "zz_floci_override.tf"
    boot_tmp = pathlib.Path(tempfile.mkdtemp(prefix="01-recomendacao-boot-"))
    applied = False

    try:
        ok, _ = step("Emulador responde (STS)",
                     ["aws", "--endpoint-url", ENDPOINT, "sts", "get-caller-identity"], critical=True)

        # 1. Bootstrap do state (state local, em diretório temporário)
        for f in BOOT_DIR.glob("*.tf"):
            shutil.copy(f, boot_tmp / f.name)
        (boot_tmp / "zz_floci_override.tf").write_text(provider_override(default_tags=False), encoding="utf-8")
        step("Bootstrap: init", ["terraform", "init", "-input=false", "-no-color"], cwd=boot_tmp, rule="R8", critical=True)
        rc, _, _ = run(["aws", "--endpoint-url", ENDPOINT, "s3api", "head-bucket", "--bucket", STATE_BUCKET])
        if rc == 0:
            record("Bootstrap: bucket de state já existe no emulador (execução anterior)", True, rule="R8",
                   expected="bucket existente", got=STATE_BUCKET)
        else:
            step("Bootstrap: apply do bucket de state",
                 ["terraform", "apply", "-auto-approve", "-input=false", "-no-color", f"-var=state_bucket_name={STATE_BUCKET}"],
                 cwd=boot_tmp, rule="R8", critical=True)

        # 2. Stack com backend remoto no emulador
        override.write_text(provider_override(default_tags=True), encoding="utf-8")
        shutil.rmtree(TF_DIR / ".terraform", ignore_errors=True)
        stack_initialized, _ = step("Stack: init com backend S3 + use_lockfile",
             ["terraform", "init", "-input=false", "-no-color", "-reconfigure",
              f"-backend-config=bucket={STATE_BUCKET}", f"-backend-config=key={STATE_KEY}",
              "-backend-config=region=us-east-1", "-backend-config=use_lockfile=true",
              f"-backend-config=endpoints={{s3=\"{ENDPOINT}\"}}", "-backend-config=use_path_style=true",
              "-backend-config=skip_credentials_validation=true", "-backend-config=skip_requesting_account_id=true",
              "-backend-config=skip_metadata_api_check=true", "-backend-config=skip_s3_checksum=true"],
             cwd=TF_DIR, rule="R8", critical=True)
        applied = bool(stack_initialized)

        # 3a. Plan completo, sem substitutos: prova que os recursos sem cobertura estão no plano.
        ok, plan_out = step("Stack: plan completo (código real, sem substitutos)",
                            ["terraform", "plan", "-input=false", "-no-color", "-lock=false"], cwd=TF_DIR, critical=True)
        for module, gap in EMULATOR_GAPS.items():
            for res in gap["resources"]:
                addr = f"module.{module}.{res}"
                record(f"Coberto só no plan: {addr}", addr in plan_out, rule="ADR-0006",
                       expected="presente no plan", got="presente no plan" if addr in plan_out else "ausente",
                       note=f"Lacuna do Floci 2.5: {gap['evidence']}")
                if addr in plan_out:
                    results[-1]["status"] = "lacuna"
        write_gap_overrides()

        # 3b. Apply
        ok, out = step("Stack: terraform apply", ["terraform", "apply", "-auto-approve", "-input=false", "-no-color"],
                       cwd=TF_DIR, critical=True, timeout=2400)

        # 4. Asserts
        if ok:
            assertions(outputs())

        # 5. Claude
        if not blocked["on"]:
            step("Serviço: build para o teste do componente com Claude", ["npm", "run", "build", "--silent"], cwd=UNIT)
            claude_against_emulator()

    finally:
        # 6. Destroy sempre
        blocked["on"] = False
        if applied:
            step("Stack: terraform destroy", ["terraform", "destroy", "-auto-approve", "-input=false", "-no-color"],
                 cwd=TF_DIR, rule="R7", timeout=2400)

            def leftovers():
                d, raw = aws("resourcegroupstaggingapi", "get-resources", "--tag-filters",
                             f"Key=project,Values={PROJECT}")
                arns = [r["ResourceARN"] for r in (d or {}).get("ResourceTagMappingList", [])]
                real = []
                for a in arns:
                    if a.startswith("arn:aws:kms:"):
                        k, _ = aws("kms", "describe-key", "--key-id", a)
                        if k and k["KeyMetadata"].get("KeyState") == "PendingDeletion":
                            continue
                    if a.startswith("arn:aws:ecs:") and ":service/" in a:
                        # Serviço apagado fica INACTIVE e ainda aparece no índice de tags (na AWS também).
                        cluster, service = a.split(":service/")[1].split("/", 1)
                        s, _ = aws("ecs", "describe-services", "--cluster", cluster, "--services", service)
                        status = ((s or {}).get("services") or [{}])[0].get("status")
                        if status not in ("ACTIVE", "DRAINING"):
                            continue
                    real.append(a)
                return f"{len(real)} sobras", not real, json.dumps(real, indent=1)
            check("Destroy sem sobras (tag project; ignora KMS em PendingDeletion e serviço ECS inativo)", leftovers,
                  rule="R7", expected="0 sobras")

            def state_kept():
                d, raw = aws("s3api", "list-objects-v2", "--bucket", STATE_BUCKET)
                keys = [o["Key"] for o in (d or {}).get("Contents", [])]
                return keys, STATE_KEY in keys and f"{STATE_KEY}.tflock" not in keys, raw
            check("State remoto preservado e lock liberado após o destroy", state_kept, rule="R8", expected="state sem .tflock")

        override.unlink(missing_ok=True)
        for module in EMULATOR_GAPS:
            (TF_DIR / "modules" / module / "zz_floci_override.tf").unlink(missing_ok=True)
        shutil.rmtree(TF_DIR / ".terraform", ignore_errors=True)
        shutil.rmtree(boot_tmp, ignore_errors=True)
        write_report()

    failed = [r for r in results if r["status"] in ("falha", "pulado")]
    print(f"Relatório: {OUT / 'relatorio.html'}")
    print(f"Passos: {len(results)} | ok: {sum(r['status'] == 'ok' for r in results)} | "
          f"falhas: {sum(r['status'] == 'falha' for r in results)} | lacunas: {sum(r['status'] == 'lacuna' for r in results)}")
    return 1 if failed else 0


# ---------------------------------------------------------------- relatório

def write_report():
    (OUT / "resultados.json").write_text(json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8")
    total = len(results)
    n = {k: sum(r["status"] == k for r in results) for k in ("ok", "falha", "lacuna", "pulado")}
    secs = round(sum(r["seconds"] for r in results), 1)
    verdict = "REPROVADO" if (n["falha"] or n["pulado"]) else ("APROVADO COM RESSALVAS" if n["lacuna"] else "APROVADO")
    vcls = "falha" if verdict == "REPROVADO" else ("lacuna" if n["lacuna"] else "ok")
    label = {"ok": "passou", "falha": "falhou", "pulado": "pulado", "lacuna": "lacuna do emulador"}
    rows = []
    for i, r in enumerate(results, 1):
        rows.append(f"""
        <tr>
          <td class="num">{i}</td>
          <td>{html.escape(r['step'])}<div class="note">{html.escape(r.get('note') or '')}</div></td>
          <td class="mono">{html.escape(r.get('rule') or '')}</td>
          <td><span class="badge {r['status']}">{label[r['status']]}</span></td>
          <td class="mono">{html.escape(r.get('expected') or '')}</td>
          <td class="mono">{html.escape(r.get('got') or '')}</td>
          <td class="num">{r['seconds']}s</td>
        </tr>
        <tr class="detail"><td></td><td colspan="6"><details><summary>comando e saída</summary>
          <pre>$ {html.escape(r.get('command') or '(verificação em Python)')}\n\n{html.escape(r.get('output') or '(sem saída)')}</pre>
        </details></td></tr>""")
    page = f"""<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Integração 01.03 · {RUN_ID}</title>
<style>
  :root {{ --bg:#0f1115; --card:#171a21; --ink:#e7e9ee; --mute:#9aa3b2; --line:#262b36;
          --ok:#3ecf8e; --fail:#ff6b6b; --warn:#f5c451; }}
  * {{ box-sizing:border-box }}
  body {{ margin:0; background:var(--bg); color:var(--ink); font:16px/1.55 Georgia,serif }}
  main {{ max-width:1080px; margin:0 auto; padding:40px 16px 64px }}
  h1 {{ font:700 26px/1.2 system-ui,sans-serif; margin:4px 0 6px }}
  .sub {{ color:var(--mute); font:14px system-ui,sans-serif; margin-bottom:24px }}
  .cards {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:12px; margin-bottom:24px }}
  .card {{ background:var(--card); border:1px solid var(--line); border-radius:10px; padding:12px 14px; font:14px system-ui,sans-serif }}
  .card b {{ display:block; font-size:22px; margin-top:4px }}
  .verdict {{ font:700 13px system-ui,sans-serif; letter-spacing:.08em }}
  .verdict.ok {{ color:var(--ok) }} .verdict.falha {{ color:var(--fail) }} .verdict.lacuna {{ color:var(--warn) }}
  .wrap {{ overflow-x:auto }}
  table {{ width:100%; border-collapse:collapse; background:var(--card); border:1px solid var(--line); font:14px system-ui,sans-serif }}
  th,td {{ text-align:left; padding:9px 11px; border-bottom:1px solid var(--line); vertical-align:top }}
  th {{ color:var(--mute); font-weight:600 }}
  tr.detail td {{ padding:0 11px 9px }}
  .note {{ color:var(--mute); font-size:12.5px; margin-top:3px }}
  .mono {{ font-family:ui-monospace,Menlo,Consolas,monospace; font-size:12.5px; word-break:break-word }}
  .num {{ text-align:right; white-space:nowrap; color:var(--mute) }}
  .badge {{ display:inline-block; padding:2px 9px; border-radius:999px; font:600 12px system-ui,sans-serif; white-space:nowrap }}
  .badge.ok {{ background:#173b2c; color:var(--ok) }} .badge.falha {{ background:#3d1d1f; color:var(--fail) }}
  .badge.pulado {{ background:#242832; color:var(--mute) }} .badge.lacuna {{ background:#3a3117; color:var(--warn) }}
  details summary {{ cursor:pointer; color:var(--mute); font:13px system-ui,sans-serif; padding:4px 0 }}
  pre {{ background:#0b0d11; padding:12px; border-radius:8px; overflow:auto; font-size:12px; white-space:pre-wrap; word-break:break-word; max-height:420px }}
  footer {{ margin-top:24px; color:var(--mute); font:13px system-ui,sans-serif }}
</style></head>
<body><main>
  <div class="verdict {vcls}">{verdict}</div>
  <h1>Integração · plataforma de recomendação</h1>
  <div class="sub">Execução {RUN_ID} · stack <code>{PROJECT}-{ENVIRONMENT}</code> · emulador {html.escape(EMULATOR)} · endpoint <code>{html.escape(ENDPOINT)}</code></div>
  <div class="cards">
    <div class="card">Passos<b>{total}</b></div>
    <div class="card">Passaram<b style="color:var(--ok)">{n['ok']}</b></div>
    <div class="card">Falharam<b style="color:var(--fail)">{n['falha']}</b></div>
    <div class="card">Lacunas do emulador<b style="color:var(--warn)">{n['lacuna']}</b></div>
    <div class="card">Pulados<b>{n['pulado']}</b></div>
    <div class="card">Tempo<b>{secs}s</b></div>
  </div>
  <div class="wrap"><table>
    <thead><tr><th>#</th><th>Passo</th><th>Regra</th><th>Status</th><th>Esperado</th><th>Obtido</th><th>Tempo</th></tr></thead>
    <tbody>{''.join(rows)}</tbody>
  </table></div>
  <footer>Lacuna do emulador só com evidência (código ou documentação do emulador), registrada no ADR-0006 do projeto. Código correto não é alterado para agradar o emulador.</footer>
</main></body></html>"""
    (OUT / "relatorio.html").write_text(page, encoding="utf-8")
    (REPORTS / "latest.html").write_text(page, encoding="utf-8")


if __name__ == "__main__":
    raise SystemExit(main())
