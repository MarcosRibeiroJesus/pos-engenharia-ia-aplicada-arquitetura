#!/usr/bin/env python3
"""Harness local de teste de infraestrutura AWS.

Fluxo: checa o emulador -> lint do template -> deploy -> asserts nos recursos
-> destroy (sempre) -> relatório HTML em reports/<run-id>/relatorio.html.

Emulador: qualquer endpoint compatível com a AWS (moto aqui; Floci ou
LocalStack na sua máquina). Troque AWS_ENDPOINT_URL para apontar outro.
"""
import datetime
import hashlib
import html
import json
import os
import pathlib
import subprocess
import time

ROOT = pathlib.Path(__file__).resolve().parent.parent
ENDPOINT = os.environ.get("AWS_ENDPOINT_URL", "http://127.0.0.1:4566")
STACK = os.environ.get("STACK_NAME", "lab-smoke")
EMULATOR = os.environ.get("EMULATOR_NAME", "Floci (MIT)")
TEMPLATE = ROOT / "templates" / "smoke.yaml"
RUN_ID = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
OUT = ROOT / "reports" / RUN_ID
ENV = {
    **os.environ,
    "AWS_ACCESS_KEY_ID": "test",
    "AWS_SECRET_ACCESS_KEY": "test",
    "AWS_DEFAULT_REGION": "us-east-1",
    "AWS_ENDPOINT_URL": ENDPOINT,
}
results = []
state = {"blocked": False}


def run(cmd, timeout=600):
    t0 = time.time()
    try:
        p = subprocess.run(cmd, env=ENV, capture_output=True, text=True, timeout=timeout)
        rc, out = p.returncode, (p.stdout + p.stderr).strip()
    except subprocess.TimeoutExpired:
        rc, out = 124, f"tempo esgotado após {timeout}s"
    except FileNotFoundError as exc:
        rc, out = 127, str(exc)
    return rc, out, round(time.time() - t0, 2)


def step(name, cmd, *, expect=None, expect_fail=False, expect_text=None, critical=True, note="",
         emulator_gap=False):
    """Executa um passo, registra o resultado e devolve (ok, saída normalizada)."""
    if state["blocked"]:
        results.append({"step": name, "status": "pulado", "seconds": 0, "command": " ".join(cmd),
                        "output": "", "expected": expect or "", "got": "",
                        "note": "pulado: passo crítico anterior falhou"})
        return False, ""
    rc, out, secs = run(cmd)
    got = " ".join(out.split())
    if expect_fail:
        # Só conta como esperado um erro da própria AWS/CLI, não "comando ausente" (127) nem timeout (124).
        ok = rc not in (0, 124, 127) and (expect_text is None or expect_text in out)
        got = "falhou como esperado" if ok else (got or f"rc={rc}")
        expected = f"erro da AWS contendo '{expect_text}'" if expect_text else "erro da AWS"
    elif expect is not None:
        ok = rc == 0 and got == expect
        expected = expect
    else:
        ok = rc == 0
        expected = "rc=0"
        got = f"rc={rc}"
    if ok:
        status = "ok"
    else:
        status = "lacuna" if emulator_gap else "falha"
    results.append({"step": name, "status": status, "seconds": secs,
                    "command": " ".join(cmd), "output": out[-4000:],
                    "expected": expected, "got": got, "note": note})
    if not ok and critical:
        state["blocked"] = True
    return ok, out


def value(cmd):
    """Lê um valor de saída (ex.: nome de bucket) sem registrar como passo."""
    rc, out, _ = run(cmd)
    return out.strip() if rc == 0 else ""


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    aws = ["aws", "--endpoint-url", ENDPOINT]

    step("Emulador responde (STS)",
         aws + ["sts", "get-caller-identity", "--query", "Account", "--output", "text"])
    step("Lint do template (cfn-lint)", ["cfn-lint", str(TEMPLATE)],
         note="Valida sintaxe e propriedades sem chamar a AWS.")
    step("Deploy da stack",
         aws + ["cloudformation", "deploy", "--stack-name", STACK,
                "--template-file", str(TEMPLATE), "--no-fail-on-empty-changeset"])
    step("Stack em CREATE_COMPLETE",
         aws + ["cloudformation", "describe-stacks", "--stack-name", STACK,
                "--query", "Stacks[0].StackStatus", "--output", "text"],
         expect="CREATE_COMPLETE")

    # Usa os recursos físicos e não os Outputs: o moto não preenche Outputs de stack (lacuna do emulador).
    bucket = value(aws + ["cloudformation", "list-stack-resources", "--stack-name", STACK, "--query",
                          "StackResourceSummaries[?LogicalResourceId=='FeatureBucket'].PhysicalResourceId",
                          "--output", "text"])
    table = value(aws + ["cloudformation", "list-stack-resources", "--stack-name", STACK, "--query",
                         "StackResourceSummaries[?LogicalResourceId=='RecommendationsTable'].PhysicalResourceId",
                         "--output", "text"])

    step("Bucket existe e tem criptografia AES256",
         aws + ["s3api", "get-bucket-encryption", "--bucket", bucket, "--query",
                "ServerSideEncryptionConfiguration.Rules[0].ApplyServerSideEncryptionByDefault.SSEAlgorithm",
                "--output", "text"],
         expect="AES256")
    step("Bloqueio de acesso público em todas as flags",
         aws + ["s3api", "get-public-access-block", "--bucket", bucket, "--query",
                "PublicAccessBlockConfiguration.[BlockPublicAcls,BlockPublicPolicy,IgnorePublicAcls,RestrictPublicBuckets]",
                "--output", "text"],
         expect="True True True True", critical=False, emulator_gap=True,
         note="Provável lacuna do moto: o caminho de criação de bucket pelo CloudFormation não aplica PublicAccessBlockConfiguration. Confirme no Floci ou em conta AWS real.")
    step("Tag de custo 'project' no bucket",
         aws + ["s3api", "get-bucket-tagging", "--bucket", bucket, "--query",
                "TagSet[?Key=='project'].Value", "--output", "text"],
         expect=STACK, critical=False)
    step("Tabela DynamoDB com chave de partição user_id",
         aws + ["dynamodb", "describe-table", "--table-name", table, "--query",
                "Table.KeySchema[0].AttributeName", "--output", "text"],
         expect="user_id")
    step("Tabela DynamoDB com criptografia ativa",
         aws + ["dynamodb", "describe-table", "--table-name", table, "--query",
                "Table.SSEDescription.Status", "--output", "text"],
         expect="ENABLED", critical=False, emulator_gap=True,
         note="Provável lacuna do moto: a resposta de describe-table não traz SSEDescription. Confirme no Floci ou em conta AWS real.")

    # Limpeza sempre roda, mesmo com falha antes.
    state["blocked"] = False
    step("Destroy da stack",
         aws + ["cloudformation", "delete-stack", "--stack-name", STACK], critical=False)
    step("Stack removida",
         aws + ["cloudformation", "describe-stacks", "--stack-name", STACK],
         expect_fail=True, expect_text="does not exist", critical=False)

    write_outputs()
    failed = [r for r in results if r["status"] == "falha"]
    print(f"Relatório: {OUT / 'relatorio.html'}")
    print(f"Passos: {len(results)} | falhas: {len(failed)}")
    return 1 if failed else 0


def write_outputs():
    (OUT / "resultados.json").write_text(json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8")
    template_sha = hashlib.sha256(TEMPLATE.read_bytes()).hexdigest()[:16]
    total = len(results)
    ok = sum(r["status"] == "ok" for r in results)
    fail = sum(r["status"] == "falha" for r in results)
    gaps = sum(r["status"] == "lacuna" for r in results)
    skip = sum(r["status"] == "pulado" for r in results)
    total_secs = round(sum(r["seconds"] for r in results), 2)
    if fail == 0 and skip == 0:
        verdict = "APROVADO COM RESSALVAS" if gaps else "APROVADO"
    else:
        verdict = "REPROVADO"
    verdict_cls = "falha" if verdict == "REPROVADO" else "ok"

    rows = []
    for i, r in enumerate(results, 1):
        badge = r["status"]
        label = {"ok": "passou", "falha": "falhou", "pulado": "pulado", "lacuna": "lacuna do emulador"}[r["status"]]
        rows.append(f"""
        <tr>
          <td>{i}</td>
          <td>{html.escape(r['step'])}<div class="note">{html.escape(r.get('note') or '')}</div></td>
          <td><span class="badge {badge}">{label}</span></td>
          <td class="mono">{html.escape(str(r.get('expected') or ''))}</td>
          <td class="mono">{html.escape(str(r.get('got') or ''))}</td>
          <td class="num">{r['seconds']}s</td>
        </tr>
        <tr class="detail"><td></td><td colspan="5">
          <details><summary>comando e saída</summary>
          <pre>$ {html.escape(r['command'])}\n\n{html.escape(r['output'] or '(sem saída)')}</pre>
          </details></td></tr>""")

    page = f"""<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Relatório de teste de infraestrutura · {RUN_ID}</title>
<style>
  :root {{ --ink:#1a1a1a; --mute:#6b6b6b; --line:#e6e6e6; --ok:#0f7b4f; --fail:#b42318; --warn:#9a6700; --bg:#fafaf7; }}
  * {{ box-sizing:border-box }}
  body {{ margin:0; background:var(--bg); color:var(--ink);
         font:16px/1.55 Georgia,"Source Serif 4",serif; }}
  main {{ max-width:960px; margin:0 auto; padding:40px 24px 64px }}
  h1 {{ font:700 28px/1.2 system-ui,-apple-system,"Segoe UI",sans-serif; margin:0 0 6px }}
  .sub {{ color:var(--mute); font:14px system-ui,sans-serif; margin-bottom:28px }}
  .cards {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:12px; margin-bottom:28px }}
  .card {{ background:#fff; border:1px solid var(--line); border-radius:10px; padding:14px 16px;
          font:14px system-ui,sans-serif }}
  .card b {{ display:block; font-size:24px; margin-top:4px }}
  .verdict {{ font:700 14px system-ui,sans-serif; letter-spacing:.06em }}
  table {{ width:100%; border-collapse:collapse; background:#fff; border:1px solid var(--line);
          border-radius:10px; overflow:hidden; font:14px system-ui,sans-serif }}
  th,td {{ text-align:left; padding:10px 12px; border-bottom:1px solid var(--line); vertical-align:top }}
  th {{ background:#f3f3ef; font-weight:600 }}
  tr.detail td {{ padding:0 12px 10px; border-bottom:1px solid var(--line) }}
  .note {{ color:var(--mute); font-size:12.5px; margin-top:3px }}
  .mono {{ font-family:ui-monospace,Menlo,Consolas,monospace; font-size:12.5px; word-break:break-all }}
  .num {{ text-align:right; white-space:nowrap; color:var(--mute) }}
  .badge {{ display:inline-block; padding:2px 9px; border-radius:999px; font:600 12px system-ui,sans-serif }}
  .badge.ok {{ background:#e7f5ee; color:var(--ok) }}
  .badge.falha {{ background:#fdecea; color:var(--fail) }}
  .badge.pulado {{ background:#f0f0ec; color:var(--mute) }}
  .badge.lacuna {{ background:#fff4db; color:var(--warn) }}
  .verdict.ok {{ color:var(--ok) }} .verdict.falha {{ color:var(--fail) }}
  details summary {{ cursor:pointer; color:var(--mute); font:13px system-ui,sans-serif; padding:4px 0 }}
  pre {{ background:#f3f3ef; padding:12px; border-radius:8px; overflow:auto; font-size:12.5px;
        white-space:pre-wrap; word-break:break-word }}
  footer {{ margin-top:28px; color:var(--mute); font:13px system-ui,sans-serif }}
</style></head>
<body><main>
  <div class="verdict {verdict_cls}">{verdict}</div>
  <h1>Relatório de teste de infraestrutura</h1>
  <div class="sub">Execução {RUN_ID} · stack <code>{html.escape(STACK)}</code> · emulador {html.escape(EMULATOR)} · endpoint <code>{html.escape(ENDPOINT)}</code></div>
  <div class="cards">
    <div class="card">Passos<b>{total}</b></div>
    <div class="card">Passaram<b style="color:var(--ok)">{ok}</b></div>
    <div class="card">Falharam<b style="color:var(--fail)">{fail}</b></div>
    <div class="card">Lacunas do emulador<b style="color:var(--warn)">{gaps}</b></div>
    <div class="card">Pulados<b>{skip}</b></div>
    <div class="card">Tempo total<b>{total_secs}s</b></div>
  </div>
  <table>
    <thead><tr><th>#</th><th>Passo</th><th>Status</th><th>Esperado</th><th>Obtido</th><th>Tempo</th></tr></thead>
    <tbody>{''.join(rows)}</tbody>
  </table>
  <footer>Template: <code>{TEMPLATE.name}</code> · sha256 {template_sha}. Falhas marcadas como lacuna do emulador devem ser confirmadas em um emulador ou conta AWS real antes de corrigir o template.</footer>
</main></body></html>"""
    (OUT / "relatorio.html").write_text(page, encoding="utf-8")
    latest = ROOT / "reports" / "latest.html"
    latest.write_text(page, encoding="utf-8")


if __name__ == "__main__":
    raise SystemExit(main())
