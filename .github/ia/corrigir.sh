#!/usr/bin/env bash
# Agente corretor: edita o código para corrigir achados. Roda sem token do GitHub.
# Nunca toca em workflows, agentes, segredos ou state; commit e push ficam no passo seguinte.
set -euo pipefail
npm install -g --silent @anthropic-ai/claude-code
python3 .github/ia/resumir_sarif.py achados > /tmp/achados.md

claude -p "Você é o agente definido em .claude/agents/corretor-seguranca.md; siga essas instruções. Achados a corrigir: /tmp/achados.md." \
  --allowedTools "Read,Edit,Grep,Glob,Bash(terraform fmt:*),Bash(terraform validate:*),Bash(terraform init -backend=false:*)" \
  --max-turns 40 --output-format json > /tmp/correcao.json || { echo "::error::agente corretor falhou"; exit 1; }

mudados=$(git diff --name-only)
proibidos=$(printf '%s\n' "$mudados" | grep -E '^(\.github/|\.claude/)|\.tfstate|(^|/)\.env|secret|credential' || true)
if [ -n "$proibidos" ]; then
  echo "::error::o agente alterou arquivos proibidos; a correção foi descartada:"; echo "$proibidos"
  git checkout -- .
  exit 1
fi
for d in $(printf '%s\n' "$mudados" | grep '\.tf$' | xargs -r -n1 dirname | sort -u); do
  terraform -chdir="$d" fmt -check
done
