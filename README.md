# Engenharia de IA Aplicada e Arquitetura

Arquiteturas AWS de nível enterprise e projetos de IA aplicada, implementados em Terraform, testados localmente no [Floci](https://floci.io/) e com uma versão equivalente em outra cloud. Cada projeto vira um post.

Site: https://marcosribeirojesus.github.io/pos-engenharia-ia-aplicada-arquitetura/

## Estrutura

| Pasta | Conteúdo |
|---|---|
| `modulos/NN-slug/` | Notas, Terraform, testes, ADRs, design doc e post de cada módulo |
| `docs/curso/PROGRESSO.md` | Status dos projetos |
| `site/` | Site estático publicado no GitHub Pages |
| `testing/` | Harness de teste contra emulador AWS e relatórios |
| `scripts/setup-ambiente.sh` | Setup do ambiente (Terraform, checkov, Floci) |

## Testar localmente

Pré-requisitos: Docker, Python 3 e AWS CLI.

```bash
docker run -d --name floci -p 4566:4566 -v /var/run/docker.sock:/var/run/docker.sock floci/floci:latest
pip install cfn-lint awscli
python3 testing/scripts/run_tests.py   # relatório em testing/reports/latest.html
```

Sem custo na AWS: tudo roda contra o emulador local, com credenciais fictícias.
