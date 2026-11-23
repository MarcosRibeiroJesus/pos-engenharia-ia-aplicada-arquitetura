#!/usr/bin/env bash
# Headroom na máquina do dono (D-067): comprime o contexto que o Claude Code manda ao modelo.
#
# Só funciona onde o `claude` é um processo comum, que lê ANTHROPIC_BASE_URL ao iniciar (terminal
# local, Antigravity, CI depois de testado). Nas sessões de nuvem do Claude Code o tráfego do modelo
# não passa por um processo local, então ali vale só o rtk.
#
# Uso: bash scripts/headroom-local.sh [argumentos do claude]
#   ex.: bash scripts/headroom-local.sh --model claude-opus-5-5
set -euo pipefail

HEADROOM_VERSAO="${HEADROOM_VERSAO:-0.44.0}"   # versão fixa; suba de propósito, depois de ler o CHANGELOG
VENV="${HEADROOM_VENV:-$HOME/.local/share/headroom-venv}"

# Privacidade (D-001): o beacon anônimo do headroom vem ligado por padrão. Desligado aqui.
export HEADROOM_TELEMETRY=off
export HEADROOM_BEACON=off
export ORT_DISABLE_TELEMETRY=1

if [ ! -x "$VENV/bin/headroom" ] || ! "$VENV/bin/headroom" --version | grep -q "$HEADROOM_VERSAO"; then
  python3 -m venv "$VENV"
  "$VENV/bin/pip" install -q "headroom-ai[proxy]==${HEADROOM_VERSAO}"
fi

# Modo cache: preserva o cache de prefixo da Anthropic, que já é a maior economia das sessões longas.
# Não use o `headroom learn` neste repositório: ele escreve no CLAUDE.md e no AGENTS.md, que são
# regras do dono e só mudam por decisão registrada (D-025).
exec "$VENV/bin/headroom" wrap claude --mode cache -- "$@"
