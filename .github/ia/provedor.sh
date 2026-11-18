#!/usr/bin/env bash
# Escolhe como os agentes falam com o Claude: Bedrock via OIDC (preferido) ou API da Anthropic.
set -euo pipefail
if [ -n "${AWS_BEDROCK_ROLE_ARN:-}" ]; then
  echo "provedor=bedrock" >> "$GITHUB_OUTPUT"
  echo "CLAUDE_CODE_USE_BEDROCK=1" >> "$GITHUB_ENV"
elif [ -n "${ANTHROPIC_API_KEY:-}" ]; then
  echo "provedor=anthropic" >> "$GITHUB_OUTPUT"
else
  echo "::warning::Sem AWS_BEDROCK_ROLE_ARN (variável) nem ANTHROPIC_API_KEY (secret): agentes de IA pulados."
  echo "provedor=nenhum" >> "$GITHUB_OUTPUT"
fi
