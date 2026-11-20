"""Ponto de entrada dos testes do harness (D-043).

Os testes ficam em `harness/testes/test_<assunto>.py`, um arquivo por assunto, para que PRs
paralelos não editem o mesmo trecho. Este arquivo só os reúne, para que
`python3 -m unittest harness/test_harness.py` continue funcionando. Não escreva testes aqui.
"""
from pathlib import Path

PASTA = Path(__file__).resolve().parent / "testes"


def load_tests(loader, tests, pattern):
    return loader.discover(str(PASTA), pattern="test_*.py", top_level_dir=str(PASTA))
