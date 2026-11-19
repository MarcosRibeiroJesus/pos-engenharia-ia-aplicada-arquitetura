import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import uso  # noqa: E402


def _transcript(tmp_path: Path) -> Path:
    eventos = [
        {"message": {"id": "m1", "model": "claude-opus-5-5",
                     "usage": {"input_tokens": 10, "output_tokens": 5,
                               "cache_read_input_tokens": 100, "cache_creation_input_tokens": 20}}},
        # a mesma mensagem aparece de novo (streaming): não pode contar duas vezes
        {"message": {"id": "m1", "model": "claude-opus-5-5",
                     "usage": {"input_tokens": 10, "output_tokens": 5}}},
        {"message": {"id": "m2", "model": "claude-haiku-5-5", "usage": {"input_tokens": 1, "output_tokens": 2}}},
        {"type": "user", "message": {"role": "user", "content": "oi"}},
        "linha inválida",
    ]
    t = tmp_path / "sessao.jsonl"
    t.write_text("\n".join(e if isinstance(e, str) else json.dumps(e) for e in eventos))
    return t


def test_soma_por_modelo_sem_duplicar(tmp_path):
    soma = uso.somar_transcript(_transcript(tmp_path))
    assert soma["claude-opus-5-5"] == {"requisicoes": 1, "input": 10, "cache_write": 20,
                                       "cache_read": 100, "output": 5}
    assert soma["claude-haiku-5-5"]["output"] == 2


def test_ledger_nao_duplica_sessao_e_modelo(tmp_path):
    ledger = tmp_path / "uso.csv"
    linha = {"data": "2026-11-18", "sessao": "s1", "projeto": "p", "tarefa": "t", "modelo": "m",
             "requisicoes": 1, "input": 1, "cache_write": 0, "cache_read": 0, "output": 1, "fonte": "medido"}
    uso.gravar_linhas([linha], ledger)
    uso.gravar_linhas([linha], ledger)
    assert len(uso.ler_ledger(ledger)) == 1


def test_equivalente_pondera_tipos():
    linha = {"input": 10, "cache_write": 10, "cache_read": 100, "output": 10}
    assert uso.equivalente(linha) == 10 + 20 + 10 + 50


def test_painel_atualiza_widget_do_post(tmp_path):
    (tmp_path / "posts").mkdir()
    post = tmp_path / "posts" / "x.html"
    post.write_text("<p>a</p><!-- uso:projeto=01.03-recomendacao -->velho<!-- /uso --><p>b</p>")
    linhas = [{"projeto": "01.03-recomendacao", "modelo": "claude-opus-5-5", "tarefa": "t", "fonte": "medido",
               "requisicoes": 2, "input": 1000, "cache_write": 0, "cache_read": 0, "output": 1000}]
    uso.gerar_painel(linhas, tmp_path)
    texto = post.read_text()
    assert "velho" not in texto and "Uso de IA neste projeto" in texto and "<p>b</p>" in texto
    assert "Por modelo" in (tmp_path / "uso.html").read_text()


def test_widget_sem_registro_diz_pendente(tmp_path):
    assert "Ainda sem uso registrado" in uso.widget([], "01.04-doom", "../")
