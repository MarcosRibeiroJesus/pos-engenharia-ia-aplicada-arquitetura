#!/usr/bin/env python3
"""Roda o Claude Code em modo headless com saída validada por JSON Schema.

Se a saída vier inválida, repete uma vez mandando o erro de validação de volta ao modelo
(validação com retentativa). Uso: claude_estruturado.py <schema> <saida> <ferramentas> <prompt>
"""
import json
import os
import subprocess
import sys

import jsonschema

schema_path, saida, ferramentas, prompt = sys.argv[1:5]
schema = json.load(open(schema_path, encoding="utf-8"))


def rodar(texto):
    proc = subprocess.run(
        ["claude", "-p", texto, "--model", os.environ.get("MODELO_CLAUDE", "sonnet"), "--output-format", "json", "--json-schema", json.dumps(schema),
         "--allowedTools", ferramentas, "--max-turns", "20",
         # a configuração do projeto vem do PR (não confiável): só a do usuário vale aqui
         "--setting-sources", "user", "--disallowedTools", "Bash,Edit,Write,WebFetch,WebSearch"],
        capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr[-2000:])
    envelope = json.loads(proc.stdout)
    dado = envelope.get("structured_output")
    if dado is None:
        dado = json.loads(envelope.get("result") or "{}")
    return dado


erro = None
for tentativa in range(2):
    texto = prompt if erro is None else (
        f"{prompt}\n\nSua resposta anterior não passou na validação do schema: {erro}. "
        "Corrija só o formato; não invente dados que não estejam nas entradas.")
    try:
        dado = rodar(texto)
        jsonschema.validate(dado, schema)
        json.dump(dado, open(saida, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
        print(f"ok na tentativa {tentativa + 1}: {len(dado.get('achados', []))} achado(s)")
        sys.exit(0)
    except (jsonschema.ValidationError, json.JSONDecodeError) as exc:
        erro = str(exc).splitlines()[0][:500]
print(f"saída inválida após retentativa: {erro}")
sys.exit(1)
