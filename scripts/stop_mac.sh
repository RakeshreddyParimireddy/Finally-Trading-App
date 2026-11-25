#!/usr/bin/env bash
# Stop FinAlly (macOS/Linux). Idempotent. The data volume (finally-data) is kept.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

docker compose down
echo "FinAlly stopped. Data volume 'finally-data' was kept."
