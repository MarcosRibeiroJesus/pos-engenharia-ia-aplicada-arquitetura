import json
import subprocess
import sys
from pathlib import Path

HOOK = Path(__file__).with_name("sem_suposicoes.py")


def rodar(evento):
    r = subprocess.run([sys.executable, str(HOOK)], input=json.dumps(evento), capture_output=True, text=True, check=True)
    return json.loads(r.stdout) if r.stdout.strip() else None


PERGUNTAS = {"questions": [{"question": "Produto?"}, {"question": "Opções da D01?"}]}


def test_bloqueia_quando_falta_resposta():
    saida = rodar({"tool_name": "AskUserQuestion", "tool_input": PERGUNTAS,
                   "tool_response": {"answers": {"Produto?": "CDB"}}})
    assert saida["decision"] == "block"
    assert "Opções da D01?" in saida["reason"]
    assert "Produto?" not in saida["reason"].split("Perguntas sem resposta:")[1]


def test_bloqueia_quando_a_resposta_manda_assumir():
    saida = rodar({"tool_name": "AskUserQuestion", "tool_input": PERGUNTAS,
                   "tool_response": "The user did not answer this question. Make a reasonable assumption and carry on."})
    assert saida["decision"] == "block"


def test_nao_interfere_com_tudo_respondido():
    assert rodar({"tool_name": "AskUserQuestion", "tool_input": PERGUNTAS,
                  "tool_response": {"answers": {"Produto?": "CDB", "Opções da D01?": "02-S"}}}) is None


def test_ignora_outras_tools():
    assert rodar({"tool_name": "Bash", "tool_input": {}, "tool_response": "did not answer"}) is None
