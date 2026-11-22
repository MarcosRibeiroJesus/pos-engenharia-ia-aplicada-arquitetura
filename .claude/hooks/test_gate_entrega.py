import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import gate_entrega as gate  # noqa: E402
import memoria_compartilhada as m  # noqa: E402
from test_memoria_compartilhada import montar, publicar  # noqa: E402


def test_comandos_que_nao_entregam_passam(tmp_path):
    _, sessao = montar(tmp_path)
    for cmd in ("git status", "terraform test", "git commit -m 'x'", "npm test"):
        assert gate.decidir(cmd, sessao) is None


def test_push_bloqueado_ate_ler_a_decisao_nova(tmp_path):
    autor, sessao = montar(tmp_path)
    m.contexto("SessionStart", sessao, agora=1000)
    assert gate.decidir("git push origin modulo/03-mcp/x", sessao) is None
    publicar(autor, "- D-002 nova regra")
    motivo = gate.decidir("git push origin modulo/03-mcp/x", sessao)
    assert motivo and "D-002 nova regra" in motivo
    # depois de receber o delta, a próxima tentativa passa
    assert gate.decidir("git push origin modulo/03-mcp/x", sessao) is None


def test_abertura_de_pr_tambem_passa_pelo_gate(tmp_path):
    autor, sessao = montar(tmp_path)
    m.contexto("SessionStart", sessao, agora=1000)
    publicar(autor, "- D-003")
    assert gate.decidir("gh pr create --draft --title t", sessao)
    publicar(autor, "- D-004")
    assert gate.decidir("gh api repos/o/r/pulls -f title=t", sessao)


def test_so_a_orquestracao_escreve_na_memoria(tmp_path):
    _, sessao = montar(tmp_path)
    assert "orquestração" in gate.decidir("git push origin memoria-compartilhada", sessao)
    assert gate.decidir("MEMORIA_ESCRITOR=orquestracao git push origin memoria-compartilhada", sessao) is None
