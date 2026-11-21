"""Root Terraform dos stacks: state remoto S3 com backend parcial e lock nativo (TH-08, Art. VI)."""
from __future__ import annotations

from comum import *  # noqa: F401,F403

# Roots que o harness confere. Cada projeto com Terraform entra aqui quando o root nasce.
ROOTS = [AQUI.parent / "plataforma" / "agentes" / "infra" / "terraform"]


def bloco_backend_s3(texto: str) -> str | None:
    """Corpo do bloco `backend "s3" { ... }`, ou None. Ignora comentários de linha."""
    sem_coment = "\n".join(re.sub(r"\s*(#|//).*$", "", l) for l in texto.splitlines())
    m = re.search(r'backend\s+"s3"\s*\{([^{}]*)\}', sem_coment)
    return None if m is None else m.group(1)


def problemas_do_backend(texto: str) -> list[str]:
    corpo = bloco_backend_s3(texto)
    if corpo is None:
        return ['sem backend "s3"']
    erros = []
    if not re.search(r"^\s*use_lockfile\s*=\s*true\s*$", corpo, re.M):
        erros.append("sem use_lockfile = true (lock nativo do S3)")
    for chave in ("bucket", "key", "region", "access_key", "secret_key", "profile"):
        if re.search(rf"^\s*{chave}\s*=", corpo, re.M):
            erros.append(f"backend não é parcial: {chave} vem do -backend-config no init")
    return erros


class TestStateRemotoComLock(unittest.TestCase):
    """TH-08: state remoto com lock, sem conta, bucket ou credencial no repositório."""

    def test_regra_reprova_backend_sem_lock_ou_completo(self):
        self.assertTrue(problemas_do_backend('terraform {\n  backend "local" {}\n}\n'))
        self.assertTrue(problemas_do_backend('terraform {\n  backend "s3" {}\n}\n'))
        self.assertTrue(problemas_do_backend('terraform {\n  backend "s3" {\n    # use_lockfile = true\n  }\n}\n'))
        self.assertTrue(problemas_do_backend(
            'terraform {\n  backend "s3" {\n    bucket = "x"\n    use_lockfile = true\n  }\n}\n'))
        self.assertEqual(problemas_do_backend('terraform {\n  backend "s3" {\n    use_lockfile = true\n  }\n}\n'), [])

    def test_roots_tem_backend_s3_parcial_com_lock(self):
        for root in ROOTS:
            arq = root / "versions.tf"
            with self.subTest(root=str(root.relative_to(AQUI.parent))):
                self.assertTrue(arq.is_file(), f"{arq} não existe")
                self.assertEqual(problemas_do_backend(arq.read_text(encoding="utf-8")), [])
