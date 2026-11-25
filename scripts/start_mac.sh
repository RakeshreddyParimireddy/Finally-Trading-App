#!/usr/bin/env bash
# Start FinAlly (macOS/Linux). Idempotent: safe to run repeatedly.
# Usage: scripts/start_mac.sh [--build] [--no-open]
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

URL="http://localhost:8000"
BUILD=0
OPEN=1
for arg in "$@"; do
  case "$arg" in
    --build) BUILD=1 ;;
    --no-open) OPEN=0 ;;
    -h|--help) echo "Usage: $0 [--build] [--no-open]"; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; exit 1 ;;
  esac
done

if ! docker info >/dev/null 2>&1; then
  echo "Docker does not appear to be running. Start Docker and try again." >&2
  exit 1
fi

if [ ! -f .env ]; then
  echo "Note: no .env file found. Copy .env.example to .env and set OPENROUTER_API_KEY for AI chat."
fi

# Build if requested or if the image doesn't exist yet
if [ "$BUILD" -eq 1 ] || ! docker image inspect finally:latest >/dev/null 2>&1; then
  docker compose up -d --build
else
  docker compose up -d
fi

# Wait for the app to report healthy (up to ~60s) before opening the browser
printf "Waiting for FinAlly to start"
for _ in $(seq 1 60); do
  if curl -fsS "$URL/api/health" >/dev/null 2>&1; then
    echo
    echo "FinAlly is running at $URL"
    break
  fi
  printf "."
  sleep 1
done
if ! curl -fsS "$URL/api/health" >/dev/null 2>&1; then
  echo
  echo "FinAlly did not become healthy in time. Check logs with: docker compose logs finally" >&2
  exit 1
fi

if [ "$OPEN" -eq 1 ]; then
  if command -v open >/dev/null 2>&1; then
    open "$URL" >/dev/null 2>&1 || true
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$URL" >/dev/null 2>&1 || true
  fi
fi
