#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_FILE="$ROOT_DIR/../MIGA Consulting AI Company/.paperclip/paperclip.log"
URL="http://127.0.0.1:3100"
CRAWL4AI_HEALTH_URL="http://127.0.0.1:11235/health"

mkdir -p "$(dirname "$LOG_FILE")"

if ! curl -fsS "$CRAWL4AI_HEALTH_URL" >/dev/null 2>&1; then
  nohup "$ROOT_DIR/scripts/run-crawl4ai-local.sh" >>"$LOG_FILE" 2>&1 < /dev/null &
fi

if curl -fsS "$URL/api/health" >/dev/null 2>&1; then
  open "$URL"
  exit 0
fi

nohup "$ROOT_DIR/scripts/run-miga-local.sh" >"$LOG_FILE" 2>&1 < /dev/null &

for _ in {1..20}; do
  if curl -fsS "$URL/api/health" >/dev/null 2>&1; then
    open "$URL"
    exit 0
  fi
  sleep 1
done

open -a Terminal "$LOG_FILE"
exit 1
