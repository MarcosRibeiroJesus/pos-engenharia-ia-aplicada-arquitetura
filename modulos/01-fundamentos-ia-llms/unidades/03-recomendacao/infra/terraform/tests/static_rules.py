#!/usr/bin/env python3
"""Regras que o `terraform test` não enxerga por serem estruturais (tipo de recurso, backend, workflows).

R5: nenhum recurso de custo fixo ocioso sem ADR que o cite.
R8: state remoto em S3 com lock nativo.
ADR-0005: workflows com OIDC, ambiente protegido, confirmação e verificação de sobras.
ST-01 (RNF-103): nenhum workflow cujo filtro de caminho cobre a unidade roda Infracost; o gate de
custo do PR é só o de seguranca.yml (gate_custo.py, teto diário do harness/estado.json).
Roda sem rede e sem credenciais: `python3 tests/static_rules.py`. Importável (os testes do harness
usam `st01_infracost` com fixtures); a verificação só roda no `__main__`.
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent          # infra/terraform
UNIT = ROOT.parent.parent                                      # unidade
REPO = UNIT.parents[3]
UNIT_REL = UNIT.relative_to(REPO).as_posix() + "/"
WF = REPO / ".github" / "workflows"
CHAVE = "01-recomendacao"
STACK = "01-recomendacao-lab"

# Recursos com custo por hora mesmo sem tráfego. Cada um precisa ser citado em um ADR.
IDLE_COST = ["aws_nat_gateway", "aws_vpc_endpoint", "aws_memorydb_cluster", "aws_lb",
             "aws_mwaa_environment", "aws_kms_key", "aws_ecs_service", "aws_eks_cluster",
             "aws_db_instance", "aws_rds_cluster", "aws_elasticache_cluster", "aws_instance"]


def filtros_de_caminho(texto: str) -> list[str]:
    """Globs de `paths:` do bloco `on:` (lista em bloco ou inline). Negações (`!`) não ampliam a cobertura."""
    on = texto.split("\njobs:", 1)[0]
    globs = []
    linhas = on.splitlines()
    for i, linha in enumerate(linhas):
        m = re.match(r"^(\s*)paths:\s*(.*)$", linha)
        if not m:
            continue
        resto = m.group(2).strip()
        if resto.startswith("["):
            globs += [g.strip().strip('"').strip("'") for g in resto.strip("[]").split(",") if g.strip()]
            continue
        for seguinte in linhas[i + 1:]:
            item = re.match(r"^\s*-\s*(.+?)\s*$", seguinte)
            if not item:
                break
            globs.append(item.group(1).strip('"').strip("'"))
    return [g for g in globs if g and not g.startswith("!")]


def cobre_a_unidade(glob: str, unidade: str = UNIT_REL) -> bool:
    """O glob casa algum arquivo da unidade: o prefixo literal dele é prefixo da unidade, ou o contrário."""
    prefixo = re.split(r"[*?\[]", glob, maxsplit=1)[0]
    return unidade.startswith(prefixo) or prefixo.startswith(unidade)


def roda_infracost(texto: str) -> bool:
    sem_comentarios = "\n".join(l for l in texto.splitlines() if not l.lstrip().startswith("#"))
    return "infracost" in sem_comentarios.lower()


def st01_infracost(workflows: dict) -> list:
    """ST-01: {nome: texto} -> falhas. Workflow sem filtro de caminho (seguranca.yml) não é da unidade."""
    falhas = []
    for nome, texto in sorted(workflows.items()):
        if any(cobre_a_unidade(g) for g in filtros_de_caminho(texto)) and roda_infracost(texto):
            falhas.append(f"ST-01: {nome} cobre {UNIT_REL} e roda Infracost; o gate de custo é só o de seguranca.yml")
    return falhas


def regras_terraform() -> list:
    failures = []
    adr_text = "\n".join(p.read_text(encoding="utf-8") for p in (UNIT / "adr").glob("*.md"))
    tf_files = [p for p in ROOT.rglob("*.tf") if ".terraform" not in p.parts]
    declared = set()
    for p in tf_files:
        for m in re.finditer(r'resource\s+"([a-z0-9_]+)"', p.read_text(encoding="utf-8")):
            declared.add(m.group(1))
    for rtype in IDLE_COST:
        if rtype in declared and rtype not in adr_text:
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
    return failures


def regras_workflows() -> list:
    """ADR-0005 e RNF-101: workflows da unidade na raiz do repositório, nascidos dos modelos do harness."""
    failures = []
    nomes = (f"{CHAVE}-ci.yml", f"{CHAVE}-apply.yml", f"{CHAVE}-destroy.yml")
    wf = {n: (WF / n).read_text(encoding="utf-8") if (WF / n).exists() else "" for n in nomes}
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
        if re.search(r"id-token\s*:\s*write", text.split("\njobs:", 1)[0]):
            failures.append(f"RNF-106: {name} declara id-token: write no topo; só no job que assume a role")
        if "floci/floci:latest" in text.replace("${{ vars.FLOCI_IMAGE || 'floci/floci:latest' }}", ""):
            failures.append(f"D-013: {name} usa floci/floci:latest direto; use vars.FLOCI_IMAGE com fallback")
    for name, ambiente in ((f"{CHAVE}-apply.yml", "aws-lab"), (f"{CHAVE}-destroy.yml", "aws-lab-destroy")):
        text = wf[name]
        if text and not re.search(rf"^\s+environment:\s*{ambiente}\s*$", text, flags=re.M):
            failures.append(f"ADR-0005/D-024: {name} precisa rodar no ambiente {ambiente}")
        if text and "id-token: write" not in text:
            failures.append(f"ADR-0005: {name} precisa de id-token: write (OIDC)")
        if text and "workflow_dispatch" not in text:
            failures.append(f"ADR-0005: {name} só por disparo manual")
        if text and re.search(r"^\s*enable_mwaa\s*:", text, flags=re.M):
            failures.append(f"RNF-101: {name} não tem input enable_mwaa; o MWAA é a janela em stack próprio")
    d = wf[f"{CHAVE}-destroy.yml"]
    if d and not ('"$CONFIRM" != "$STACK_NAME"' in d and f"STACK_NAME: {STACK}" in d):
        failures.append("ADR-0005: destroy precisa confirmar digitando o nome do stack")
    if d and "resourcegroupstaggingapi get-resources" not in d:
        failures.append("ADR-0005: destroy precisa verificar sobras pela tag do projeto")
    ci = wf[f"{CHAVE}-ci.yml"]
    for needle, why in [(f"{UNIT_REL}**", "filtro de caminho"),
                        ("terraform test", "terraform test"), ("checkov", "checkov"), ("tflint", "tflint"),
                        ("static_rules.py", "regras estáticas"),
                        ("vars.FLOCI_IMAGE", "Floci como container de serviço"),
                        ("createComment", "plan comentado no PR")]:
        if ci and needle not in ci:
            failures.append(f"ADR-0005: CI sem {why}")
    todos = {p.name: p.read_text(encoding="utf-8") for p in WF.glob("*.yml")}
    failures += st01_infracost(todos)
    return failures


def main() -> int:
    failures = regras_terraform() + regras_workflows()
    for f in failures:
        print("FALHA", f)
    print(f"static_rules: {len(failures)} falha(s)")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
