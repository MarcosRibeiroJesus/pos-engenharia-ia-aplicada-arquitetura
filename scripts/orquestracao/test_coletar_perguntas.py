import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from coletar_perguntas import extrair  # noqa: E402

CORPO = """Resumo do PR.

## Perguntas ao dono
| id | pergunta | bloqueia | opções | recomendação |
|---|---|---|---|---|
| D02-P1 | Langfuse ou gate no CI? | camada 6 | a; b; c | b |
| D02-P2 | Teto do lab? | README e Budgets | US$ 10; US$ 20 | US$ 10 |

## Testes
| x | y |
"""


def test_extrai_so_a_secao_de_perguntas():
    ps = extrair(CORPO)
    assert [p["id"] for p in ps] == ["D02-P1", "D02-P2"]
    assert ps[0]["bloqueia"] == "camada 6" and ps[1]["recomendacao"] == "US$ 10"


def test_pr_sem_secao_nao_tem_perguntas():
    assert extrair("só texto") == [] and extrair(None) == []
