#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEFAULT_COMPANY_REPO="$(cd "$ROOT_DIR/.." && pwd)/MIGA Consulting AI Company"

COMPANY_REPO="${PAPERCLIP_COMPANY_REPO:-$DEFAULT_COMPANY_REPO}"
PAPERCLIP_HOME="${PAPERCLIP_HOME:-$COMPANY_REPO/.paperclip}"
HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-3100}"
NODE_BIN="${NODE_BIN:-}"
PNPM_BIN="${PNPM_BIN:-}"
HEALTH_URL="http://${HOST}:${PORT}/api/health"

export PATH="$HOME/.local/node-v20.20.1/bin:$HOME/.local/bin:$PATH"

if [[ ! -d "$COMPANY_REPO" ]]; then
  echo "Company repo not found: $COMPANY_REPO" >&2
  echo "Set PAPERCLIP_COMPANY_REPO to the correct path and retry." >&2
  exit 1
fi

mkdir -p "$PAPERCLIP_HOME"

if curl -fsS --max-time 2 "$HEALTH_URL" >/dev/null 2>&1; then
  echo "Paperclip is already running at $HEALTH_URL"
  exit 0
fi

if LISTENER_PID="$(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null | head -n 1)"; [[ -n "${LISTENER_PID:-}" ]]; then
  LISTENER_COMMAND="$(ps -o command= -p "$LISTENER_PID" 2>/dev/null || true)"
  if [[ "$LISTENER_COMMAND" == *"paperclip"* || "$LISTENER_COMMAND" == *"server/src/index.ts"* || "$LISTENER_COMMAND" == *"tsx/dist/loader.mjs"* ]]; then
    echo "Stopping stale Paperclip listener on port $PORT (pid=$LISTENER_PID)"
    kill "$LISTENER_PID" >/dev/null 2>&1 || true
    for _ in {1..20}; do
      if ! lsof -tiTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
        break
      fi
      sleep 0.5
    done
  else
    echo "Port $PORT is already in use by another process: ${LISTENER_COMMAND:-unknown}" >&2
    exit 1
  fi
fi

if [[ -z "$NODE_BIN" ]]; then
  if command -v node >/dev/null 2>&1; then
    NODE_BIN="$(command -v node)"
  elif [[ -x "$HOME/.local/node-v20.20.1/bin/node" ]]; then
    NODE_BIN="$HOME/.local/node-v20.20.1/bin/node"
  else
    echo "Node binary not found. Install Node 20+ or set NODE_BIN." >&2
    exit 1
  fi
fi

if [[ -z "$PNPM_BIN" ]]; then
  if command -v pnpm >/dev/null 2>&1; then
    PNPM_BIN="$(command -v pnpm)"
  elif [[ -x "$HOME/.local/bin/pnpm" ]]; then
    PNPM_BIN="$HOME/.local/bin/pnpm"
  else
    echo "pnpm binary not found. Install pnpm or set PNPM_BIN." >&2
    exit 1
  fi
fi

if [[ ! -f "$ROOT_DIR/server/ui-dist/index.html" ]]; then
  "$PNPM_BIN" --filter @paperclipai/server prepare:ui-dist
fi

cd "$ROOT_DIR"
exec env \
  HOST="$HOST" \
  PORT="$PORT" \
  SERVE_UI=true \
  PAPERCLIP_HOME="$PAPERCLIP_HOME" \
  "$NODE_BIN" \
  --import ./server/node_modules/tsx/dist/loader.mjs \
  server/src/index.ts
