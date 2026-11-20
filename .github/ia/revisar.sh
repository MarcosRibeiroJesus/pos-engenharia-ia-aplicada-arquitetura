#!/usr/bin/env bash
# Agentes revisores: segurança e FinOps, cada um numa instância independente do Claude Code.
set -euo pipefail
npm install -g --silent @anthropic-ai/claude-code
python3 -m pip install --quiet jsonschema

mkdir -p /tmp/revisao
python3 .github/ia/resumir_sarif.py achados > /tmp/revisao/achados.md
git diff --unified=3 "$BASE"...HEAD -- . ':(exclude)**/package-lock.json' | head -c 120000 > /tmp/revisao/diff.patch
python3 .github/ia/comentario.py anterior > /tmp/revisao/anterior.md

ENTRADAS="Entradas (somente leitura): /tmp/revisao/diff.patch (diff do PR), /tmp/revisao/achados.md (achados das ferramentas e custo), /tmp/revisao/anterior.md (revisão anterior). Reporte só achados novos ou ainda não resolvidos."

MODELO_CLAUDE=opus python3 .github/ia/claude_estruturado.py .github/ia/schema-revisao.json /tmp/revisao/seguranca.json "Read,Grep,Glob" \
  "Você é o agente definido em .claude/agents/revisor-seguranca.md; siga essas instruções. $ENTRADAS"
MODELO_CLAUDE=sonnet python3 .github/ia/claude_estruturado.py .github/ia/schema-revisao.json /tmp/revisao/finops.json "Read,Grep,Glob" \
  "Você é o agente definido em .claude/agents/revisor-finops.md; siga essas instruções. Uso: demonstração de um dia (subir, gravar, destruir). Teto de cada projeto: teto_diario_usd em harness/estado.json. Limite mensal da conta: US\$ ${CUSTO_MAX_MENSAL_USD}. $ENTRADAS"

python3 .github/ia/comentario.py publicar /tmp/revisao/seguranca.json /tmp/revisao/finops.json
