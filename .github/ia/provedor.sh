#!/usr/bin/env bash
# Escolhe como os agentes falam com o Claude: assinatura do dono (D-028), Bedrock via OIDC ou API da Anthropic.
set -euo pipefail
# D-028: assinatura do dono primeiro (CLAUDE_CODE_OAUTH_TOKEN); depois Bedrock; por fim a API.
if [ "${TEM_ASSINATURA:-false}" = "true" ]; then
  echo "provedor=assinatura" >> "$GITHUB_OUTPUT"
elif [ -n "${AWS_BEDROCK_ROLE_ARN:-}" ]; then
  echo "provedor=bedrock" >> "$GITHUB_OUTPUT"
  echo "CLAUDE_CODE_USE_BEDROCK=1" >> "$GITHUB_ENV"
elif [ "${TEM_API:-false}" = "true" ]; then
  echo "provedor=anthropic" >> "$GITHUB_OUTPUT"
else
  echo "::warning::Sem CLAUDE_CODE_OAUTH_TOKEN (secret), AWS_BEDROCK_ROLE_ARN (variável) ou ANTHROPIC_API_KEY (secret): agentes de IA pulados."
  echo "provedor=nenhum" >> "$GITHUB_OUTPUT"
fi
