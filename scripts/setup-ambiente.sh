#!/usr/bin/env bash
# Setup script do ambiente de nuvem "pos-arquitetura".
# Roda antes de cada thread; o cache do ambiente guarda o que for instalado aqui.
# Requer Network access = Custom, com a lista padrão incluída + floci.io e registry.terraform.io.
set -euo pipefail

TF_VERSION="${TF_VERSION:-1.9.8}"   # >= 1.7 para `terraform test` com mock providers. Atualize quando quiser.

# Terraform (releases.hashicorp.com está na lista padrão)
if ! command -v terraform >/dev/null || ! terraform version | grep -q "v${TF_VERSION}"; then
  curl -fsSL -o /tmp/tf.zip "https://releases.hashicorp.com/terraform/${TF_VERSION}/terraform_${TF_VERSION}_linux_amd64.zip"
  python3 -c "import zipfile; zipfile.ZipFile('/tmp/tf.zip').extract('terraform', '/usr/local/bin')"
  chmod +x /usr/local/bin/terraform && rm -f /tmp/tf.zip
fi

# Ferramentas Python (PyPI está na lista padrão)
pip install --break-system-packages -q --upgrade checkov cfn-lint awscli

# tflint vem de release do GitHub, que pode não passar pelo proxy; não bloqueia o setup.
if ! command -v tflint >/dev/null; then
  curl -fsSL -o /tmp/tflint.zip \
    "https://github.com/terraform-linters/tflint/releases/latest/download/tflint_linux_amd64.zip" \
    && python3 -c "import zipfile; zipfile.ZipFile('/tmp/tflint.zip').extract('tflint', '/usr/local/bin')" \
    && chmod +x /usr/local/bin/tflint || echo "AVISO: tflint indisponível; o CI no GitHub Actions cobre essa etapa."
  rm -f /tmp/tflint.zip
fi

# Docker + imagem do Floci (Docker Hub está na lista padrão). O cache guarda a imagem, não o processo.
if ! docker info >/dev/null 2>&1; then
  (nohup dockerd >/tmp/dockerd.log 2>&1 &)
  for _ in $(seq 1 20); do docker info >/dev/null 2>&1 && break; sleep 1; done
fi
# Mesma versão do CI: defina FLOCI_IMAGE nas variáveis do ambiente (ex.: floci/floci:2.5.0).
FLOCI_IMAGE="${FLOCI_IMAGE:-floci/floci:latest}"
docker pull -q "$FLOCI_IMAGE" || echo "AVISO: não foi possível baixar $FLOCI_IMAGE."

terraform version | head -1
docker images floci/floci --format '{{.Repository}}:{{.Tag}} {{.Size}}' || true
