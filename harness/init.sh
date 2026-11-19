#!/usr/bin/env bash
# Ritual de orientação: o que toda sessão roda ao começar (e o agente inicializador valida).
# Mostra o ambiente, a memória compartilhada, o estado SDD e o que mudou no git. Não altera nada.
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"

echo "== Ambiente"
for t in git python3 terraform docker node; do
  printf '  %-10s %s\n' "$t" "$(command -v "$t" >/dev/null && ("$t" --version 2>/dev/null | head -1) || echo 'ausente')"
done
if curl -fsS -m 3 "${AWS_ENDPOINT_URL:-http://localhost:4566}" >/dev/null 2>&1; then
  echo "  floci      respondendo em ${AWS_ENDPOINT_URL:-http://localhost:4566}"
else
  echo "  floci      parado (suba com: docker run -d -p 4566:4566 \"\${FLOCI_IMAGE:-floci/floci:latest}\")"
fi

echo "== Git"
echo "  branch: $(git branch --show-current)"
git log --oneline -5 | sed 's/^/  /'
[ -n "$(git status --porcelain)" ] && echo "  (há alterações não commitadas)"

echo "== Memória compartilhada (estado e pendências)"
if git fetch -q origin memoria-compartilhada 2>/dev/null; then
  git show origin/memoria-compartilhada:DECISOES.md | sed -n '/^## Pendências/,$p' | sed 's/^/  /'
else
  echo "  indisponível (sem rede); siga com o que está no repositório"
fi

echo "== Estado SDD"
python3 harness/estado.py status | sed 's/^/  /'
python3 harness/estado.py validar | sed 's/^/  /'

echo "== Últimas sessões"
tail -n 12 harness/progresso.md 2>/dev/null | sed 's/^/  /'
