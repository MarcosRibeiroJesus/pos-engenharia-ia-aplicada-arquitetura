"""Base comum dos testes do harness: caminhos, módulos do harness e auxiliares (D-043).

Os testes ficam em um arquivo por assunto (`test_<assunto>.py`) nesta pasta; este arquivo só
reúne o que mais de um assunto usa.
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

AQUI = Path(__file__).resolve().parents[1]  # a pasta harness/
sys.path.insert(0, str(AQUI))
import agente  # noqa: E402
import estado  # noqa: E402
import branch_mergeado  # noqa: E402
import memoria  # noqa: E402
import novo_projeto  # noqa: E402
import infra  # noqa: E402
import ramo  # noqa: E402
import sincronizar_agentes  # noqa: E402

FUSO = timezone(timedelta(hours=-3))
AGORA = datetime(2026, 11, 19, 12, 0, tzinfo=FUSO)

def sh(cwd: Path, *args: str) -> str:
    return subprocess.run(args, cwd=cwd, check=True, capture_output=True, text=True).stdout

def repo_com_remoto(tmp: Path) -> Path:
    remoto, clone = tmp / "remoto.git", tmp / "clone"
    sh(tmp, "git", "init", "-q", "--bare", str(remoto))
    sh(tmp, "git", "init", "-q", str(clone))
    for k, v in (("user.email", "t@t"), ("user.name", "t"), ("commit.gpgsign", "false")):
        sh(clone, "git", "config", k, v)
    sh(clone, "git", "remote", "add", "origin", str(remoto))
    return clone

DESTROY_OK = """
on:
  workflow_dispatch:
    inputs:
      confirm_stack:
        required: true
permissions:
  id-token: write
jobs:
  destroy:
    environment: aws-lab
    steps:
      - run: terraform destroy -auto-approve
      - run: aws resourcegroupstaggingapi get-resources --tag-filters Key=project,Values=x
      - run: python3 harness/infra.py remover p
"""

APPLY_OK = """
on:
  workflow_dispatch:
    inputs:
      prazo_horas:
        default: 24
jobs:
  prazo:
    steps:
      - run: python3 harness/infra.py registrar p --stack s --horas 24
      - run: aws ce list-cost-allocation-tags --tag-keys project
"""

APPLY_SEM_CONTA = APPLY_OK.replace("      - run: aws ce list-cost-allocation-tags --tag-keys project\n", "")
sys.path.insert(0, str(AQUI.parent / ".claude" / "hooks"))
import gate_delegacao  # noqa: E402

def repo_com_plano(tmp: Path, fase: str = "tarefas", plano: str = "# Plano\n") -> tuple[Path, dict]:
    (tmp / "harness").mkdir()
    (tmp / "specs" / "p").mkdir(parents=True)
    for arq in ("spec.md", "plan.md", "tasks.md", "analise.md"):
        (tmp / "specs" / "p" / arq).write_text(plano if arq == "plan.md" else "x\n", encoding="utf-8")
    est = {"fases": estado.carregar()["fases"],
           "projetos": [{"chave": "p", "fase": fase, "pastas": ["modulos/p/"], "specs": "specs/p/"}]}
    (tmp / "harness" / "estado.json").write_text(json.dumps(est), encoding="utf-8")
    import shutil
    shutil.copy(AQUI / "especialistas.json", tmp / "harness" / "especialistas.json")
    return tmp, est
sys.path.insert(0, str(AQUI.parent / ".claude" / "hooks"))
import gate_pergunta  # noqa: E402

if __name__ == "__main__":
    unittest.main()

