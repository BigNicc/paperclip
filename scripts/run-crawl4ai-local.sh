#!/usr/bin/env bash
set -euo pipefail

IMAGE="${CRAWL4AI_IMAGE:-unclecode/crawl4ai:latest}"
CONTAINER_NAME="${CRAWL4AI_CONTAINER_NAME:-crawl4ai}"
PORT="${CRAWL4AI_PORT:-11235}"
HOST="${CRAWL4AI_HOST:-127.0.0.1}"
HEALTH_URL="http://${HOST}:${PORT}/health"
DOCKER_BIN="${DOCKER_BIN:-}"

if [[ -z "$DOCKER_BIN" ]]; then
  if command -v docker >/dev/null 2>&1; then
    DOCKER_BIN="$(command -v docker)"
  elif [[ -x "/Applications/Docker.app/Contents/Resources/bin/docker" ]]; then
    DOCKER_BIN="/Applications/Docker.app/Contents/Resources/bin/docker"
  fi
fi

if [[ -z "$DOCKER_BIN" ]]; then
  echo "Docker is required to run Crawl4AI locally." >&2
  exit 1
fi

export PATH="$(dirname "$DOCKER_BIN"):$PATH"

if ! "$DOCKER_BIN" info >/dev/null 2>&1 && [[ -d "/Applications/Docker.app" ]]; then
  open -a Docker || true
  for _ in {1..60}; do
    if "$DOCKER_BIN" info >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done
fi

if ! "$DOCKER_BIN" info >/dev/null 2>&1; then
  echo "Docker daemon is not available." >&2
  exit 1
fi

if "$DOCKER_BIN" ps --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
  echo "Crawl4AI container is already running: $CONTAINER_NAME"
else
  if "$DOCKER_BIN" ps -a --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
    "$DOCKER_BIN" start "$CONTAINER_NAME" >/dev/null
  else
    "$DOCKER_BIN" run -d \
      --name "$CONTAINER_NAME" \
      -p "${PORT}:11235" \
      --shm-size=1g \
      "$IMAGE" >/dev/null
  fi
fi

for _ in {1..20}; do
  if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
    echo "Crawl4AI is ready at http://${HOST}:${PORT}"
    exit 0
  fi
  sleep 1
done

echo "Crawl4AI container started but health check did not pass at $HEALTH_URL" >&2
exit 1
