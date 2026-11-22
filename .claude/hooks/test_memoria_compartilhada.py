import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import memoria_compartilhada as m  # noqa: E402


def sh(*args, cwd):
    subprocess.run(args, cwd=cwd, check=True, capture_output=True)


def montar(tmp_path):
    """Remoto com o branch de memória e um clone de trabalho (a sessão)."""
    remoto = tmp_path / "remoto.git"
    autor = tmp_path / "autor"
    sessao = tmp_path / "sessao"
    sh("git", "init", "-q", "--bare", str(remoto), cwd=tmp_path)
    sh("git", "init", "-q", str(autor), cwd=tmp_path)
    for k, v in (("user.email", "a@a"), ("user.name", "a")):
        sh("git", "config", k, v, cwd=autor)
    sh("git", "checkout", "-q", "-b", m.RAMO, cwd=autor)
    (autor / m.ARQUIVO).write_text("# Decisões\n- D-001 primeira\n")
    sh("git", "add", ".", cwd=autor)
    sh("git", "commit", "-qm", "1", cwd=autor)
    sh("git", "remote", "add", "origin", str(remoto), cwd=autor)
    sh("git", "push", "-q", "origin", m.RAMO, cwd=autor)
    sh("git", "clone", "-q", str(remoto), str(sessao), cwd=tmp_path)
    (sessao / ".claude").mkdir()
    return autor, sessao


def publicar(autor, linha):
    with open(autor / m.ARQUIVO, "a") as f:
        f.write(linha + "\n")
    sh("git", "commit", "-qam", "nova", cwd=autor)
    sh("git", "push", "-q", "origin", m.RAMO, cwd=autor)


def test_inicio_da_sessao_recebe_o_arquivo_inteiro(tmp_path):
    _, sessao = montar(tmp_path)
    texto = m.contexto("SessionStart", sessao, agora=1000)
    assert "MEMÓRIA COMPARTILHADA" in texto and "D-001 primeira" in texto


def test_so_avisa_de_novo_quando_ha_decisao_nova(tmp_path):
    autor, sessao = montar(tmp_path)
    m.contexto("SessionStart", sessao, agora=1000)
    assert m.contexto("UserPromptSubmit", sessao, agora=1001) is None
    publicar(autor, "- D-002 segunda")
    texto = m.contexto("UserPromptSubmit", sessao, agora=1002)
    assert "ATUALIZADA" in texto and "D-002 segunda" in texto and "D-001" not in texto


def test_post_tool_use_respeita_o_intervalo(tmp_path):
    autor, sessao = montar(tmp_path)
    m.contexto("SessionStart", sessao, agora=1000)
    publicar(autor, "- D-002 segunda")
    assert m.contexto("PostToolUse", sessao, agora=1000 + 10) is None
    assert "D-002" in m.contexto("PostToolUse", sessao, agora=1000 + m.INTERVALO + 1)


def test_sem_remoto_sai_em_silencio(tmp_path):
    (tmp_path / ".claude").mkdir()
    sh("git", "init", "-q", str(tmp_path), cwd=tmp_path)
    assert m.contexto("SessionStart", tmp_path, agora=1) is None


def test_saida_do_hook_no_formato_do_claude_code(tmp_path):
    _, sessao = montar(tmp_path)
    r = subprocess.run([sys.executable, str(Path(m.__file__))], input=json.dumps({"hook_event_name": "SessionStart"}),
                       capture_output=True, text=True, env={"CLAUDE_PROJECT_DIR": str(sessao), "PATH": "/usr/bin:/bin"})
    saida = json.loads(r.stdout)
    assert saida["hookSpecificOutput"]["hookEventName"] == "SessionStart"
    assert "D-001" in saida["hookSpecificOutput"]["additionalContext"]
