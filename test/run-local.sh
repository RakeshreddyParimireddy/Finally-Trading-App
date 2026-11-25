#!/usr/bin/env bash
# Build the frontend, start the backend locally with LLM_MOCK=true and a fresh DB,
# wait for /api/health, run the Playwright suite, then stop the server.
#
# Usage:  test/run-local.sh [playwright args...]
#   e.g.  test/run-local.sh
#         test/run-local.sh e2e/03-trading.spec.ts --headed
#
# Env:
#   PORT=8000          port for the backend (E2E_BASE_URL is derived from it)
#   SKIP_BUILD=1       reuse an existing frontend/out instead of rebuilding
#   KEEP_DB=1          keep the temp DB directory after the run (path is printed)
set -euo pipefail

TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$TEST_DIR/.." && pwd)"
PORT="${PORT:-8000}"
BASE_URL="http://localhost:${PORT}"
LOG="$TEST_DIR/.server.log"

log() { printf '\n[run-local] %s\n' "$*"; }

if curl -fsS "$BASE_URL/api/health" >/dev/null 2>&1; then
  echo "[run-local] Something is already serving $BASE_URL. Stop it (or set PORT=...) first." >&2
  exit 1
fi

# 1. Frontend static export
if [[ "${SKIP_BUILD:-}" != "1" ]]; then
  log "Building frontend (frontend/out)"
  (cd "$ROOT/frontend" && { [[ -d node_modules ]] || npm ci || npm install; } && npm run build)
fi
if [[ ! -f "$ROOT/frontend/out/index.html" ]]; then
  echo "[run-local] frontend/out/index.html not found; build the frontend first." >&2
  exit 1
fi

# 2. Fresh DB in a throwaway directory inside test/ (gitignored)
DB_DIR="$TEST_DIR/.e2e-db/run-$(date +%s)"
mkdir -p "$DB_DIR"

# 3. Backend
log "Starting backend on $BASE_URL (LLM_MOCK=true, DB=$DB_DIR/finally.db)"
(
  cd "$ROOT/backend"
  export LLM_MOCK=true
  export MASSIVE_API_KEY=""            # force the simulator (empty value beats .env, see load_dotenv)
  export FINALLY_DB_PATH="$DB_DIR/finally.db"
  export FINALLY_STATIC_DIR="$ROOT/frontend/out"
  exec uv run uvicorn app.main:app --host 127.0.0.1 --port "$PORT"
) >"$LOG" 2>&1 &
SERVER_PID=$!

cleanup() {
  local code=$?
  log "Stopping backend (pid $SERVER_PID)"
  if [[ -r "/proc/$SERVER_PID/winpid" ]] && command -v taskkill >/dev/null 2>&1; then
    # Git Bash on Windows: kill the whole native process tree (uv -> python).
    taskkill //PID "$(cat "/proc/$SERVER_PID/winpid")" //T //F >/dev/null 2>&1 || true
  fi
  kill "$SERVER_PID" >/dev/null 2>&1 || true
  pkill -P "$SERVER_PID" >/dev/null 2>&1 || true
  wait "$SERVER_PID" 2>/dev/null || true
  if [[ "${KEEP_DB:-}" == "1" ]]; then
    echo "[run-local] DB kept at $DB_DIR"
  else
    rm -rf "$DB_DIR"
  fi
  exit "$code"
}
trap cleanup EXIT INT TERM

# 4. Wait for health
log "Waiting for $BASE_URL/api/health"
for i in $(seq 1 90); do
  if curl -fsS "$BASE_URL/api/health" >/dev/null 2>&1; then
    echo "[run-local] Backend is up after ${i}s"
    break
  fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "[run-local] Backend exited early. Log:" >&2
    cat "$LOG" >&2
    exit 1
  fi
  if [[ "$i" == 90 ]]; then
    echo "[run-local] Backend did not become healthy in 90s. Log:" >&2
    cat "$LOG" >&2
    exit 1
  fi
  sleep 1
done

# 5. Playwright
cd "$TEST_DIR"
[[ -d node_modules ]] || npm ci || npm install
npx playwright install chromium >/dev/null
log "Running Playwright"
set +e
E2E_BASE_URL="$BASE_URL" npx playwright test "$@"
RESULT=$?
set -e
if [[ $RESULT -ne 0 ]]; then
  echo "[run-local] Tests failed. Backend log: $LOG ; HTML report: (cd test && npx playwright show-report)"
fi
exit $RESULT
