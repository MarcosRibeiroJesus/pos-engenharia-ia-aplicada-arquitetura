#!/usr/bin/env python3
"""Regras que o `terraform test` não enxerga por serem estruturais (tipo de recurso, backend, workflows).

R5: nenhum recurso de custo fixo ocioso sem ADR que o cite.
R8: state remoto em S3 com lock nativo.
ADR-0005: workflows com OIDC, ambiente protegido, confirmação e verificação de sobras.
ST-01 (RNF-103): nenhum workflow cujo filtro de caminho cobre a unidade roda Infracost; o gate de
custo do PR é só o de seguranca.yml (gate_custo.py, teto diário do harness/estado.json).
ST-04 (RNF-108, ADR-0014): toda exceção de tests/excecoes_de_nome.json tem motivo, fonte e um ADR que
existe em adr/, vale para um tipo de recurso e tem padrão ancorado na chave do projeto.
ST-T01 (RNF-107, achado A1 da revisão da T011): todo recurso de modules/ com atributo tags usa o
local.tags do módulo e aparece no output tags_dos_recursos dele.
ST-T02 (RNF-108, revisão da T012): todo recurso de modules/ com atributo de nome próprio aparece no
output nomes_dos_recursos dele (o TT-T02 só confere o que está nesse output).
ST-K01 (D-022, T013): todo aws_budgets_budget do stack é diário (`time_unit = "DAILY"` literal); o
limite mensal da conta fica só no infra/conta.
ST-07 (RNF-002, Art. V, T014): todo recurso cobrado por hora do root da base (endpoint de interface,
ALB, MemoryDB, serviço ECS) é citado entre crases num ADR da unidade, cada endpoint de interface pelo
nome do serviço; a base não declara NAT Gateway nem MWAA (o MWAA vive na raiz da janela, ADR-0007).
TH-06 (RNF-102, D-021, T013): o padrão de teto_diario_usd no variables.tf, o "Teto diário: US$ X,YZ"
do README da unidade e o teto_diario_usd do harness/estado.json são o mesmo valor.
Roda sem rede e sem credenciais: `python3 tests/static_rules.py`. Importável (os testes do harness
usam `st01_infracost`, `st04_excecoes_de_nome`, `st_t01_tags_dos_modulos`, `st_t02_nomes_dos_modulos`,
`st_k01_budgets_diarios`, `st07_custo_fixo_citado` e `th06_teto_nos_tres_lugares` com fixtures); a verificação só roda no
`__main__`.
"""
import json
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


EXCECOES = ROOT / "tests" / "excecoes_de_nome.json"


def st04_excecoes_de_nome(dados: dict, adrs: set) -> list:
    """ST-04: conteúdo de excecoes_de_nome.json -> falhas. `adrs` são os ids existentes (ex.: 'ADR-0014')."""
    falhas = []
    if dados.get("prefixo") != f"{CHAVE}-":
        falhas.append(f"ST-04: o prefixo da lista precisa ser '{CHAVE}-'")
    ids = []
    for i, e in enumerate(dados.get("excecoes", [])):
        rotulo = e.get("id") or f"#{i}"
        ids.append(e.get("id"))
        for campo in ("id", "recurso", "padrao", "motivo", "fonte", "adr"):
            if not str(e.get(campo, "")).strip():
                falhas.append(f"ST-04: exceção {rotulo} sem '{campo}'")
        if e.get("recurso") and not re.fullmatch(r"aws_[a-z0-9_]+", e["recurso"]):
            falhas.append(f"ST-04: exceção {rotulo} precisa valer para um tipo de recurso aws_* só")
        padrao = str(e.get("padrao", ""))
        # Ancorado no início e com a chave: uma exceção não pode virar curinga (".*") nem servir a outro projeto.
        # Depois da chave vem hífen, sublinhado ou a barra da hierarquia do SSM (/01-recomendacao/, T052).
        if padrao and not (padrao.startswith("^") and re.search(r"01[-_]recomendacao[-_/]", padrao)):
            falhas.append(f"ST-04: exceção {rotulo} com padrão '{padrao}' fora da chave ou sem âncora '^'")
        adr = str(e.get("adr", ""))
        if adr and adr not in adrs:
            falhas.append(f"ST-04: exceção {rotulo} cita {adr}, que não existe em adr/")
        if e.get("fonte") and "http" not in e["fonte"]:
            falhas.append(f"ST-04: exceção {rotulo} sem link da fonte")
    if len([i for i in ids if i]) != len(set(i for i in ids if i)):
        falhas.append("ST-04: ids de exceção repetidos")
    # Item que saiu da lista precisa de fonte com link que trate da regra em si (revisão da T012).
    for v in dados.get("verificados_sem_excecao", []):
        if "http" not in str(v.get("fonte", "")):
            falhas.append(f"ST-04: verificação de {v.get('recurso', '?')} sem link da fonte")
    return falhas


def adrs_existentes() -> set:
    return {f"ADR-{m.group(1)}" for p in (UNIT / "adr").glob("*.md")
            if (m := re.match(r"(\d{4})-", p.name))}


def blocos_de_recurso(texto: str) -> list:
    """[(tipo, nome, corpo)] de cada bloco `resource` (casando chaves, fora de strings simples)."""
    blocos = []
    for m in re.finditer(r'^resource\s+"([a-z0-9_]+)"\s+"([A-Za-z0-9_-]+)"\s*\{', texto, flags=re.M):
        nivel, i = 1, m.end()
        while i < len(texto) and nivel:
            nivel += {"{": 1, "}": -1}.get(texto[i], 0)
            i += 1
        blocos.append((m.group(1), m.group(2), texto[m.end():i - 1]))
    return blocos


def st_t01_tags_dos_modulos(modulos: dict) -> list:
    """ST-T01: {modulo: {"main": texto dos .tf de recursos, "outputs": texto do outputs.tf}} -> falhas.

    Todo recurso com atributo `tags` de primeiro nível usa `local.tags` (direto ou num merge) e aparece
    no output `tags_dos_recursos` do módulo, para o TT-T01 não deixar recurso de fora em silêncio.
    """
    falhas = []
    for modulo, textos in sorted(modulos.items()):
        saida = textos.get("outputs", "")
        bloco = saida.split('output "tags_dos_recursos"', 1)
        tags_out = bloco[1].split("\noutput ", 1)[0] if len(bloco) == 2 else ""
        for tipo, nome, corpo in blocos_de_recurso(textos.get("main", "")):
            m = re.search(r"^  tags\s*=\s*(.+)$", corpo, flags=re.M)
            if not m:
                continue
            if not re.match(r"(local\.tags\s*$|merge\(\s*local\.tags\b)", m.group(1).strip()):
                falhas.append(f"ST-T01: {modulo}/{tipo}.{nome} tem tags sem local.tags")
            if not re.search(rf'"{tipo}\.{nome}(\[|")', tags_out):
                falhas.append(f"ST-T01: {modulo}/{tipo}.{nome} tem tags e falta em tags_dos_recursos")
    return falhas


# Atributos de primeiro nível que dão nome ao próprio recurso.
ATRIBUTOS_DE_NOME = ("name", "name_prefix", "bucket", "bucket_prefix", "family", "alarm_name",
                     "dashboard_name", "function_name", "identifier", "cluster_name", "role_name",
                     "repository_name", "topic_name", "table_name", "workgroup", "domain_name")
# (tipo, atributo) cujo valor não é nome no escopo da conta e por isso fica fora do TT-T02.
# Cada item diz o porquê; nenhum outro recurso nomeado pode faltar no nomes_dos_recursos.
FORA_DO_TT_T02 = {
    ("aws_iam_role_policy", "name"): "policy inline: o nome vale só dentro da role, sem ARN próprio",
    ("aws_s3_object", "bucket"): "bucket de destino do objeto, não o nome do objeto",
}


def st_t02_nomes_dos_modulos(modulos: dict) -> list:
    """ST-T02: {modulo: {"main", "outputs"}} -> falhas.

    Todo recurso com atributo de nome de primeiro nível cujo valor não é referência a outro recurso
    (aws_*, data.*) aparece no output `nomes_dos_recursos` do módulo, para o TT-T02 não deixar recurso
    esquecido de fora. Vale também para recurso sem `tags` (tabela do Glue, consulta do Athena).
    """
    falhas = []
    for modulo, textos in sorted(modulos.items()):
        bloco = textos.get("outputs", "").split('output "nomes_dos_recursos"', 1)
        nomes_out = bloco[1].split("\noutput ", 1)[0] if len(bloco) == 2 else ""
        for tipo, nome, corpo in blocos_de_recurso(textos.get("main", "")):
            for m in re.finditer(r"^  ([a-z_]+)\s*=\s*(.+)$", corpo, flags=re.M):
                attr, valor = m.group(1), m.group(2).strip()
                if attr not in ATRIBUTOS_DE_NOME or (tipo, attr) in FORA_DO_TT_T02:
                    continue
                if re.match(r"(aws_[a-z0-9_]+|data)\.", valor):
                    continue   # referência a outro recurso: o nome é do outro, que já é conferido
                if not re.search(rf'"{tipo}\.{nome}(\[|")', nomes_out):
                    falhas.append(f"ST-T02: {modulo}/{tipo}.{nome} tem {attr} e falta em nomes_dos_recursos")
                break
    return falhas


def st_k01_budgets_diarios(textos: dict) -> list:
    """ST-K01: {arquivo: texto .tf} -> falhas. Budgets sem time_unit = "DAILY" literal reprova."""
    falhas = []
    for arquivo, texto in textos.items():
        for tipo, nome, corpo in blocos_de_recurso(texto):
            if tipo == "aws_budgets_budget" and not re.search(r'^\s*time_unit\s*=\s*"DAILY"\s*$', corpo, flags=re.M):
                falhas.append(f"ST-K01: {arquivo}: aws_budgets_budget.{nome} não é diário; o mensal fica no infra/conta (D-022)")
    return falhas


# ST-07: tipos cobrados por hora mesmo sem tráfego, e os que não podem existir na base.
COBRADO_POR_HORA = ("aws_vpc_endpoint", "aws_lb", "aws_memorydb_cluster", "aws_ecs_service", "aws_nat_gateway",
                    "aws_mwaa_environment", "aws_eks_cluster", "aws_db_instance", "aws_rds_cluster",
                    "aws_elasticache_cluster", "aws_instance")
FORA_DA_BASE = {
    "aws_nat_gateway": "a saída é por endpoints de interface (ADR-0002)",
    "aws_mwaa_environment": "o MWAA vive só na raiz da janela, com prazo próprio (ADR-0007, D-052)",
}


def st07_custo_fixo_citado(tipos: set, servicos_de_interface: list, texto_adrs: str) -> list:
    """ST-07: tipos declarados no root, serviços dos endpoints de interface e texto dos ADRs -> falhas."""
    falhas = []
    for tipo in sorted(set(tipos) & set(COBRADO_POR_HORA)):
        if tipo in FORA_DA_BASE:
            falhas.append(f"ST-07: {tipo} na base; {FORA_DA_BASE[tipo]}")
        elif f"`{tipo}`" not in texto_adrs:
            falhas.append(f"ST-07: {tipo} é cobrado por hora e não é citado (entre crases) em nenhum ADR de adr/")
    if "aws_vpc_endpoint" in tipos:
        for servico in sorted(servicos_de_interface):
            if f"`{servico}`" not in texto_adrs:
                falhas.append(f"ST-07: endpoint de interface {servico} é cobrado por hora e não é citado em nenhum ADR de adr/")
    return falhas


def tipos_do_root_de(main: str, modulos: dict) -> set:
    """Tipos de recurso do root: os do próprio main e os dos módulos que ele usa (source ./modules/<nome>)."""
    usados = set(re.findall(r'source\s*=\s*"\./modules/([A-Za-z0-9_-]+)"', main))
    tipos = set(re.findall(r'^resource\s+"([a-z0-9_]+)"', main, flags=re.M))
    for nome in usados & set(modulos):
        tipos |= set(re.findall(r'^resource\s+"([a-z0-9_]+)"', modulos[nome], flags=re.M))
    return tipos


def tipos_do_root() -> set:
    main = "\n".join(p.read_text(encoding="utf-8") for p in sorted(ROOT.glob("*.tf")))
    return tipos_do_root_de(main, {nome: textos["main"] for nome, textos in modulos_do_stack().items()})


def servicos_de_interface_da_base() -> list:
    """O padrão de interface_endpoint_services do módulo networking (o root não o sobrescreve)."""
    texto = (ROOT / "modules" / "networking" / "variables.tf").read_text(encoding="utf-8")
    m = re.search(r'variable\s+"interface_endpoint_services"\s*\{[^}]*?default\s*=\s*\[([^\]]*)\]', texto, flags=re.S)
    return re.findall(r'"([^"]+)"', m.group(1)) if m else []


def texto_dos_adrs() -> str:
    return "\n".join(p.read_text(encoding="utf-8") for p in sorted((UNIT / "adr").glob("*.md")))


def th06_teto_nos_tres_lugares(variables: str, readme: str, estado_teto) -> list:
    """TH-06: textos do variables.tf e do README, e o teto_diario_usd do estado.json -> falhas."""
    falhas = []
    m = re.search(r'variable\s+"teto_diario_usd"\s*\{[^}]*?default\s*=\s*([0-9]+(?:\.[0-9]+)?)', variables, flags=re.S)
    r = re.search(r"Teto diário: US\$ ([0-9]+,[0-9]{2})", readme)
    if not m:
        falhas.append("TH-06: variables.tf sem padrão numérico de teto_diario_usd")
    if not r:
        falhas.append("TH-06: README sem 'Teto diário: US$ X,YZ'")
    if not isinstance(estado_teto, (int, float)):
        falhas.append("TH-06: harness/estado.json sem teto_diario_usd numérico")
    if falhas:
        return falhas
    valores = {"variables.tf": round(float(m.group(1)), 2), "README.md": round(float(r.group(1).replace(",", ".")), 2),
               "estado.json": round(float(estado_teto), 2)}
    if len(set(valores.values())) != 1:
        falhas.append(f"TH-06: teto diário diferente entre os três lugares: {valores}")
    return falhas


def teto_do_estado():
    estado = json.loads((REPO / "harness" / "estado.json").read_text(encoding="utf-8"))
    projetos = estado["projetos"]
    projetos = projetos.values() if isinstance(projetos, dict) else projetos
    return next((p.get("teto_diario_usd") for p in projetos if p.get("chave") == CHAVE), None)


def modulos_do_stack() -> dict:
    modulos = {}
    for d in sorted((ROOT / "modules").iterdir()):
        if not d.is_dir():
            continue
        main = "\n".join(p.read_text(encoding="utf-8") for p in sorted(d.glob("*.tf"))
                         if p.name not in ("outputs.tf", "variables.tf", "versions.tf"))
        out = (d / "outputs.tf").read_text(encoding="utf-8") if (d / "outputs.tf").exists() else ""
        modulos[d.name] = {"main": main, "outputs": out}
    return modulos


def regras_terraform() -> list:
    failures = []
    if not EXCECOES.exists():
        failures.append("ST-04: falta tests/excecoes_de_nome.json (RNF-108, ADR-0014)")
    else:
        failures += st04_excecoes_de_nome(json.loads(EXCECOES.read_text(encoding="utf-8")), adrs_existentes())
    failures += st_t01_tags_dos_modulos(modulos_do_stack())
    failures += st_t02_nomes_dos_modulos(modulos_do_stack())
    failures += st_k01_budgets_diarios({str(p.relative_to(ROOT)): p.read_text(encoding="utf-8")
                                        for p in ROOT.rglob("*.tf") if ".terraform" not in p.parts})
    failures += th06_teto_nos_tres_lugares((ROOT / "variables.tf").read_text(encoding="utf-8"),
                                           (UNIT / "README.md").read_text(encoding="utf-8"), teto_do_estado())
    adr_text = texto_dos_adrs()
    failures += st07_custo_fixo_citado(tipos_do_root(), servicos_de_interface_da_base(), adr_text)
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


SITE = REPO / "site"


def textos_do_site() -> dict:
    """{caminho relativo a site/: texto} de todo HTML do site."""
    return {p.relative_to(SITE).as_posix(): p.read_text(encoding="utf-8")
            for p in sorted(SITE.rglob("*.html"))} if SITE.exists() else {}


def st05_site_sem_post_gcp(site: dict) -> list:
    """ST-05 (RF-017, D-054): {caminho: texto} -> falhas. O post GCP não é publicado: nem página,
    nem href/url apontando para ele (HTML ou item de ITEMS em index.html)."""
    falhas = []
    for caminho, texto in site.items():
        if re.search(r"gcp", caminho, re.I):
            falhas.append(f"ST-05: {caminho} publica o post da cloud comparativa (GCP); D-054 só publica a AWS")
        for ref in re.findall(r"""(?:href|url|src)\s*[=:]\s*["']([^"']+)["']""", texto, re.I):
            if re.search(r"gcp", ref, re.I):
                falhas.append(f"ST-05: {caminho} aponta para {ref}; o post GCP não é publicado (D-054)")
    return falhas


def regras_site() -> list:
    return st05_site_sem_post_gcp(textos_do_site())


def main() -> int:
    failures = regras_terraform() + regras_workflows() + regras_site()
    for f in failures:
        print("FALHA", f)
    print(f"static_rules: {len(failures)} falha(s)")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
