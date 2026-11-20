"""Leitura do plan com mock provider e regras transversais sobre ele (T003).

Como o plan é obtido sem credencial: o `terraform plan` comum precisa de credencial da AWS para o
provider e para os data sources. O mock provider só existe no `terraform test`, então o root (e,
a partir da T030, o módulo `registro-produto`) tem o arquivo `tests/plan_json.tftest.hcl`, com
`mock_provider "aws"` e `override_during = plan`, e este módulo roda
`terraform test -json -verbose` só nele. Com `-verbose`, o Terraform emite uma mensagem
`test_plan` com o plan em JSON (`resource_changes` e `output_changes`), o mesmo formato do
`terraform show -json`.

O `test_plan` não traz as variáveis de entrada, então elas são lidas dos arquivos `.tf` do
diretório (nome, `default` literal e `sensitive`).

O documento que as regras recebem é o mesmo para o root e para as fixtures:
`{"variaveis": {nome: {...}}, "plano": {"resource_changes": [...], "output_changes": {...}}}`.
"""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
from pathlib import Path

ARQUIVO_TFTEST = "plan_json.tftest.hcl"
RUN_DO_PLANO = "plano_para_regras"


# ---------------------------------------------------------------- leitura do plan

def terraform() -> str:
    """Binário do Terraform: `TERRAFORM` no ambiente ou o do PATH. Sem ele, erro explícito."""
    exe = os.environ.get("TERRAFORM") or shutil.which("terraform")
    if not exe:
        raise RuntimeError(
            "terraform não encontrado: defina TERRAFORM ou ponha o binário no PATH. "
            "O teste não passa em silêncio sem rodar o plan.")
    return exe


def _rodar(args: list[str], cwd: Path) -> subprocess.CompletedProcess:
    env = dict(os.environ)
    # sem credencial: o mock provider não chama a AWS, e nenhuma variável de ambiente da AWS entra
    for chave in list(env):
        if chave.startswith("AWS_"):
            env.pop(chave)
    env["TF_IN_AUTOMATION"] = "1"
    return subprocess.run(args, cwd=cwd, env=env, capture_output=True, text=True,
                          encoding="utf-8", errors="replace", timeout=600)


def plano_com_mock(diretorio: Path) -> dict:
    """Plan em JSON do diretório, com mock provider, sem backend e sem credencial."""
    diretorio = Path(diretorio)
    arq = diretorio / "tests" / ARQUIVO_TFTEST
    if not arq.is_file():
        raise RuntimeError(f"falta {arq}: é ele que gera o plan com mock para as regras")
    exe = terraform()
    init = _rodar([exe, "init", "-backend=false", "-input=false", "-no-color"], diretorio)
    if init.returncode != 0:
        raise RuntimeError(f"terraform init falhou em {diretorio}:\n{init.stdout}\n{init.stderr}")
    filtro = os.path.join("tests", ARQUIVO_TFTEST)
    teste = _rodar([exe, "test", "-json", "-verbose", "-no-color", f"-filter={filtro}"], diretorio)
    plano = None
    for linha in teste.stdout.splitlines():
        try:
            msg = json.loads(linha)
        except json.JSONDecodeError:
            continue
        if "test_plan" in msg and msg.get("@testrun") == RUN_DO_PLANO:
            plano = msg["test_plan"]
    if teste.returncode != 0 or plano is None:
        raise RuntimeError(
            f"terraform test não devolveu o plan do run {RUN_DO_PLANO} em {diretorio} "
            f"(código {teste.returncode}):\n{teste.stdout[-4000:]}\n{teste.stderr[-2000:]}")
    return {
        "resource_changes": plano.get("resource_changes", []),
        "output_changes": plano.get("output_changes", {}),
    }


def _bloco(texto: str, inicio: int) -> str:
    """Texto entre a chave que abre em `inicio` e a que fecha, contando o aninhamento."""
    nivel = 0
    for i in range(inicio, len(texto)):
        if texto[i] == "{":
            nivel += 1
        elif texto[i] == "}":
            nivel -= 1
            if nivel == 0:
                return texto[inicio + 1:i]
    return texto[inicio + 1:]


def variaveis_dos_tf(diretorio: Path) -> dict:
    """Variáveis declaradas nos .tf do diretório e dos módulos dele (fora de .terraform e tests)."""
    variaveis = {}
    for arq in sorted(Path(diretorio).rglob("*.tf")):
        partes = arq.relative_to(diretorio).parts
        if ".terraform" in partes or "tests" in partes:
            continue
        texto = arq.read_text(encoding="utf-8")
        for m in re.finditer(r'(?m)^\s*variable\s+"([^"]+)"\s*\{', texto):
            corpo = _bloco(texto, m.end() - 1)
            default = re.search(r'(?m)^\s*default\s*=\s*"((?:[^"\\]|\\.)*)"', corpo)
            nome = m.group(1)
            if arq.parent != Path(diretorio):
                nome = f"{arq.parent.relative_to(diretorio).as_posix()}:{nome}"
            variaveis[nome] = {
                "arquivo": arq.relative_to(diretorio).as_posix(),
                "default": default.group(1) if default else None,
                "sensitive": bool(re.search(r"(?m)^\s*sensitive\s*=\s*true\b", corpo)),
            }
    return variaveis


def documento_do_diretorio(diretorio: Path) -> dict:
    return {"variaveis": variaveis_dos_tf(diretorio), "plano": plano_com_mock(diretorio)}


def documento_da_fixture(arquivo: Path) -> dict:
    return json.loads(Path(arquivo).read_text(encoding="utf-8"))


# ---------------------------------------------------------------- regras

# Condições que prendem um Principal "*" à conta (TT-S01). Sem Organizations (RNF-004), então
# aws:PrincipalOrgID não conta. Operadores *IfExists não contam: sem a chave, a condição passa.
CHAVES_DE_CONTA = {"aws:sourceaccount", "aws:sourceowner", "aws:principalaccount",
                   "aws:resourceaccount", "aws:sourcearn", "aws:principalarn"}
OPERADORES_DE_CONTA = re.compile(r"^(ForAnyValue:|ForAllValues:)?(StringEquals|StringLike|ArnEquals|ArnLike)$")

# Recurso cuja razão de existir é a política: se ela está desconhecida no plan, a regra não a lê
# e reprova (falha fechada). Fora destes, política desconhecida é atributo computado opcional.
ATRIBUTOS_DE_POLITICA = ("policy", "assume_role_policy", "policy_document")

# TT-K02: custo fixo por hora mesmo ocioso (Art. V). Endpoint só o de interface; o Gateway é grátis.
CUSTO_FIXO = {
    "aws_nat_gateway", "aws_instance", "aws_db_instance", "aws_rds_cluster",
    "aws_rds_cluster_instance", "aws_eks_cluster", "aws_eks_node_group", "aws_elasticache_cluster",
    "aws_elasticache_replication_group", "aws_msk_cluster", "aws_redshift_cluster",
    "aws_opensearch_domain", "aws_docdb_cluster", "aws_neptune_cluster", "aws_emr_cluster",
}
# TT-K03: conta única, sem Organizations nem Control Tower (RNF-004, D-029)
PREFIXOS_DE_CONTA = ("aws_organizations_", "aws_controltower_")

# TT-S05: nomes e valores que denunciam credencial. O valor nunca é repetido na mensagem.
NOME_DE_CREDENCIAL = re.compile(
    r"(senha|password|passwd|secret|segredo|token|api[_-]?key|apikey|access[_-]?key|"
    r"private[_-]?key|credencial|credential)", re.I)
VALOR_DE_CREDENCIAL = [
    ("chave de acesso da AWS", re.compile(r"\b(AKIA|ASIA)[0-9A-Z]{16}\b")),
    ("chave privada", re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----")),
    ("chave da API da Anthropic", re.compile(r"\bsk-ant-[A-Za-z0-9_-]{16,}")),
    ("token do GitHub", re.compile(r"\bgh[pousr]_[A-Za-z0-9]{20,}")),
    ("token do Slack", re.compile(r"\bxox[abprs]-[A-Za-z0-9-]{10,}")),
]


def _lista(valor) -> list:
    if valor is None:
        return []
    return valor if isinstance(valor, list) else [valor]


def _strings(valor, caminho=""):
    """(caminho, string) de cada string dentro de um valor JSON."""
    if isinstance(valor, str):
        yield caminho, valor
    elif isinstance(valor, dict):
        for k, v in valor.items():
            yield from _strings(v, f"{caminho}.{k}" if caminho else str(k))
    elif isinstance(valor, list):
        for i, v in enumerate(valor):
            yield from _strings(v, f"{caminho}[{i}]")


def _politicas(after: dict):
    """(caminho, documento) de cada string do recurso que é um documento de política IAM."""
    for caminho, texto in _strings(after):
        if '"Statement"' not in texto:
            continue
        try:
            doc = json.loads(texto)
        except json.JSONDecodeError:
            continue
        if isinstance(doc, dict) and "Statement" in doc:
            yield caminho, doc


def _principal_publico(declaracao: dict) -> bool:
    if "NotPrincipal" in declaracao:
        return True
    principal = declaracao.get("Principal")
    if principal == "*":
        return True
    if isinstance(principal, dict):
        return any("*" in _lista(v) for v in principal.values())
    return False


def _condicao_de_conta(declaracao: dict) -> bool:
    for operador, chaves in (declaracao.get("Condition") or {}).items():
        if not OPERADORES_DE_CONTA.match(operador) or not isinstance(chaves, dict):
            continue
        if any(k.lower() in CHAVES_DE_CONTA for k in chaves):
            return True
    return False


def _regras_de_politica(endereco: str, caminho: str, doc: dict) -> list[str]:
    erros = []
    for i, d in enumerate(_lista(doc.get("Statement"))):
        if not isinstance(d, dict) or d.get("Effect") != "Allow":
            continue
        sid = d.get("Sid") or f"#{i}"
        if _principal_publico(d) and not _condicao_de_conta(d):
            erros.append(f"TT-S01 {endereco} ({caminho}, declaração {sid}): Principal \"*\" sem "
                         "condição de conta (aws:SourceAccount, aws:SourceArn ou aws:PrincipalAccount)")
        acao_larga = "NotAction" in d or any(a in ("*", "*:*") for a in _lista(d.get("Action")))
        recurso_largo = "NotResource" in d or "*" in _lista(d.get("Resource"))
        if acao_larga and recurso_largo:
            erros.append(f"TT-S03 {endereco} ({caminho}, declaração {sid}): ação \"*\" e recurso "
                         "\"*\" na mesma declaração; nomeie as ações e os ARNs")
    return erros


def _credencial_no_valor(valor) -> str | None:
    for caminho, texto in _strings(valor):
        for nome, padrao in VALOR_DE_CREDENCIAL:
            if padrao.search(texto):
                return f"{nome} em {caminho or 'valor'}"
    return None


def _regras_do_recurso(r: dict) -> list[str]:
    endereco, tipo = r["address"], r["type"]
    mudanca = r.get("change") or {}
    if mudanca.get("actions") == ["delete"] or r.get("mode") != "managed":
        return []
    after = mudanca.get("after") or {}
    desconhecido = mudanca.get("after_unknown") or {}
    erros = []

    for caminho, doc in _politicas(after):
        erros += _regras_de_politica(endereco, caminho, doc)
    if tipo.endswith("_policy") or tipo == "aws_iam_role":
        for attr in ATRIBUTOS_DE_POLITICA:
            if desconhecido.get(attr) is True:
                erros.append(
                    f"TT-S01/TT-S03 {endereco}: {attr} desconhecido no plan, a regra não consegue "
                    "lê-lo; dê o arn ao mock (mock_resource) no tests/plan_json.tftest.hcl")
    if tipo == "aws_lambda_permission" and after.get("principal") == "*" \
            and not (after.get("source_account") or after.get("source_arn")):
        erros.append(f"TT-S01 {endereco}: principal \"*\" sem source_account nem source_arn")

    for attr in ("tags", "tags_all"):
        tags = after.get(attr) or {}
        if not isinstance(tags, dict):
            continue
        for chave in tags:
            if NOME_DE_CREDENCIAL.search(chave):
                erros.append(f"TT-S05 {endereco}: a tag {chave!r} parece guardar credencial")
        achado = _credencial_no_valor(tags)
        if achado:
            erros.append(f"TT-S05 {endereco}: {achado} ({attr})")
    if tipo == "aws_ssm_parameter":
        nome = str(after.get("name") or "")
        if after.get("type") == "SecureString":
            erros.append(f"TT-S05 {endereco}: parâmetro SecureString; credencial de alvo fica no "
                         "AgentCore Identity, nunca no SSM (RF-003, ADR-0002)")
        if NOME_DE_CREDENCIAL.search(nome.rsplit("/", 1)[-1]):
            erros.append(f"TT-S05 {endereco}: o nome do parâmetro parece de credencial")
        achado = _credencial_no_valor({"value": after.get("value"), "insecure_value": after.get("insecure_value")})
        if achado:
            erros.append(f"TT-S05 {endereco}: {achado}")

    if tipo in CUSTO_FIXO:
        erros.append(f"TT-K02 {endereco}: {tipo} tem custo fixo ocioso; só com ADR (Art. V)")
    if tipo == "aws_vpc_endpoint" and after.get("vpc_endpoint_type") == "Interface":
        erros.append(f"TT-K02 {endereco}: endpoint de interface tem custo por hora; só com ADR (Art. V)")
    if tipo.startswith(PREFIXOS_DE_CONTA):
        erros.append(f"TT-K03 {endereco}: {tipo} fora da conta única (RNF-004, D-029)")
    return erros


def violacoes(documento: dict) -> list[str]:
    """Todas as violações das regras transversais; lista vazia quando o plan está conforme."""
    plano = documento.get("plano") or {}
    erros = []
    for r in plano.get("resource_changes") or []:
        erros += _regras_do_recurso(r)
    for nome, saida in (plano.get("output_changes") or {}).items():
        if NOME_DE_CREDENCIAL.search(nome):
            erros.append(f"TT-S05 output.{nome}: o nome do output parece de credencial")
        achado = _credencial_no_valor(saida.get("after"))
        if achado:
            erros.append(f"TT-S05 output.{nome}: {achado}")
    for nome, var in (documento.get("variaveis") or {}).items():
        if NOME_DE_CREDENCIAL.search(nome.rsplit(":", 1)[-1]):
            erros.append(f"TT-S05 var.{nome}: o nome da variável parece de credencial; credencial de "
                         "alvo fica no AgentCore Identity (RF-003)")
        achado = _credencial_no_valor(var.get("default"))
        if achado:
            erros.append(f"TT-S05 var.{nome}: {achado} no default")
    return erros
