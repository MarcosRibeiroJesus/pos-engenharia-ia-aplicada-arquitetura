#!/usr/bin/env python3
"""Descobre alvos da esteira: diretórios raiz de Terraform, Dockerfiles e alvos de DAST.

Saída no formato do GITHUB_OUTPUT (chave=valor JSON).
DAST: uma unidade declara alvo com `dast/compose.yml` e `dast/alvo.txt` (URL).
"""
import json
import pathlib
import subprocess

arquivos = subprocess.run(["git", "ls-files"], capture_output=True, text=True, check=True).stdout.split()

tf_dirs = sorted({str(pathlib.Path(f).parent) for f in arquivos
                  if f.endswith(".tf") and "/modules/" not in f"/{f}" and "/.terraform/" not in f})
dockerfiles = sorted(f for f in arquivos if pathlib.Path(f).name.startswith("Dockerfile"))

dast = []
for f in arquivos:
    p = pathlib.Path(f)
    if p.name == "compose.yml" and p.parent.name == "dast":
        alvo = p.parent / "alvo.txt"
        if alvo.exists():
            dast.append({"nome": str(p.parent.parent), "compose": f, "url": alvo.read_text().strip()})

print(f"terraform={json.dumps(tf_dirs)}")
print(f"dockerfiles={json.dumps(dockerfiles)}")
print(f"dast={json.dumps(dast)}")
