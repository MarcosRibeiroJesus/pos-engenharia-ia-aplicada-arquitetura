import json
import shutil
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).parent))
sys.path.insert(0, str(RAIZ / "harness"))
import estado as est  # noqa: E402
import gate_sdd  # noqa: E402
import registrar_uso  # noqa: E402


def repo(tmp_path, fase="especificar"):
    (tmp_path / "harness").mkdir()
    e = est.carregar(RAIZ / "harness" / "estado.json")
    for p in e["projetos"]:
        p["fase"] = fase
    (tmp_path / "harness" / "estado.json").write_text(json.dumps(e))
    return tmp_path


def test_estado_real_e_valido():
    assert est.problemas(est.carregar()) == []


def test_gate_nega_codigo_antes_da_fase_implementar(tmp_path):
    raiz = repo(tmp_path)
    motivo = gate_sdd.decidir(str(raiz / "modulos/03-mcp/arquitetura/src/server.ts"), raiz)
    assert "03-mcp-regras-cdb" in motivo and "sdd-especificar" in motivo and "retroativa" in motivo


def test_gate_libera_specs_docs_e_fora_de_projeto(tmp_path):
    raiz = repo(tmp_path)
    for c in ("specs/03-mcp-regras-cdb/spec.md", "harness/progresso.md", "docs/x.md", "README.md"):
        assert gate_sdd.decidir(str(raiz / c), raiz) is None


def test_gate_libera_codigo_na_fase_implementar(tmp_path):
    raiz = repo(tmp_path, fase="implementar")
    assert gate_sdd.decidir(str(raiz / "modulos/03-mcp/arquitetura/src/server.ts"), raiz) is None


def test_avancar_exige_artefatos(tmp_path):
    e = est.carregar()
    p = next(x for x in e["projetos"] if x["chave"] == "03-mcp-regras-cdb")
    p["fase"] = "implementar"
    assert any("analise.md" in erro for erro in est.problemas(e, tmp_path))
    pasta = tmp_path / p["specs"]
    pasta.mkdir(parents=True)
    for arq in ("spec.md", "plan.md", "tasks.md", "analise.md"):
        (pasta / arq).write_text("x")
    assert any("teto_diario_usd" in x for x in est.problemas(e, tmp_path))  # D-021: teto calculado no plano
    p["teto_diario_usd"] = 1.5
    assert [x for x in est.problemas(e, tmp_path) if "03-mcp" in x] == []


def test_tarefas_feitas_e_proxima(tmp_path):
    p = {"specs": "specs/x/"}
    (tmp_path / "specs/x").mkdir(parents=True)
    (tmp_path / "specs/x/tasks.md").write_text("- [x] T001 a\n- [ ] T002 b\n- [ ] T003 c\n")
    assert est.tarefas(tmp_path, p) == (1, 3, "T002 b")


def test_registro_de_uso_por_sessao_sem_duplicar(tmp_path):
    t = tmp_path / "s.jsonl"
    linhas = [{"message": {"id": "m1", "model": "claude-opus-5-5", "usage": {"input_tokens": 1, "output_tokens": 3}}},
              {"message": {"id": "m1", "model": "claude-opus-5-5", "usage": {"input_tokens": 1, "output_tokens": 9}}},
              {"message": {"id": "m2", "model": "claude-haiku-5-5", "usage": {"output_tokens": 2, "cache_read_input_tokens": 50}}}]
    t.write_text("\n".join(json.dumps(x) for x in linhas))
    destino = registrar_uso.registrar({"transcript_path": str(t), "session_id": "abc"}, tmp_path)
    dados = json.loads(destino.read_text())
    assert destino.name == "abc.json"
    assert dados["modelos"]["claude-opus-5-5"] == {"requisicoes": 1, "input": 1, "cache_write": 0, "cache_read": 0, "output": 9}
    assert dados["modelos"]["claude-haiku-5-5"]["cache_read"] == 50


def test_registro_sem_transcript_nao_faz_nada(tmp_path):
    assert registrar_uso.registrar({"transcript_path": str(tmp_path / "nao.jsonl")}, tmp_path) is None
