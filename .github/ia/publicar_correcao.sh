#!/usr/bin/env bash
# Commita e publica a correção validada; só este passo recebe o token do GitHub.
set -euo pipefail
mudados=$(git diff --name-only)
if [ -z "$mudados" ]; then
  gh api -X POST "repos/$REPO/issues/$PR/comments" -f body="Agente corretor: nada a corrigir automaticamente."
else
  git config user.name "corretor-seguranca[bot]"
  git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
  git add -A
  git commit -q -m "fix(seguranca): correções do agente corretor" -m "Arquivos: $(printf '%s ' $mudados)"
  git push -q "https://x-access-token:${GH_TOKEN}@github.com/${REPO}.git" "HEAD:${BRANCH}"
  gh api -X POST "repos/$REPO/issues/$PR/comments" \
    -f body="Agente corretor aplicou correções em: $(printf '`%s` ' $mudados). Revise o commit. Pushes do bot não disparam a esteira de novo; faça um novo push ou re-run."
fi
gh api -X DELETE "repos/$REPO/issues/$PR/labels/auto-fix" >/dev/null || true
