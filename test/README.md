# FinAlly E2E tests

Playwright tests that drive the real app (static frontend served by FastAPI) through a browser.
They depend only on the `data-testid`s and API shapes in `planning/API_CONTRACT.md` (§5, §6, §7).

The backend **must** run with `LLM_MOCK=true`: the chat specs rely on the deterministic mock (contract §7).
The tests run serially (`workers: 1`) because they share one database. They are written to tolerate a
non-fresh DB, but a fresh one is recommended: `01-fresh-start` only checks the exact `$10,000.00` and the
10 seeded rows when the DB is untouched.

| Spec | Covers |
|---|---|
| `e2e/01-fresh-start.spec.ts` | Health, 10 default tickers, cash (`$10,000.00` on a fresh DB), live prices change, `connection-status=connected` |
| `e2e/02-watchlist.spec.ts` | Add a unique ticker via the UI, it gets a price and persists across reload, remove it |
| `e2e/03-trading.spec.ts` | Buy (cash drops, position row appears), partial and full sell (cash rises, row updates then disappears), `trade-error` on failed trades |
| `e2e/04-portfolio-viz.spec.ts` | Heatmap cell for a held position, P&L chart `data-points >= 1` |
| `e2e/05-chart-selection.spec.ts` | Clicking a watchlist row sets `main-chart[data-ticker]` |
| `e2e/06-chat.spec.ts` | Mock chat: greeting, `buy 1 AAPL` (inline `chat-action`, position appears), `watch PYPL` (watchlist row appears), history reload |
| `e2e/07-api.spec.ts` | API shapes and status codes: 400 / 404 / 409, rounding, full-sell removal, chat failure summary, history |

SSE disconnect/reconnect is intentionally not an E2E test (contract §9); it is covered by a frontend unit test.

## Setup (once)

```bash
cd test
npm install
npx playwright install chromium
```

## Option 1: one command (recommended)

```bash
bash test/run-local.sh                 # build frontend, start backend (mock LLM, fresh DB), run all tests, stop
bash test/run-local.sh e2e/03-trading.spec.ts --headed   # extra args go to `playwright test`
SKIP_BUILD=1 bash test/run-local.sh    # reuse an existing frontend/out
PORT=8010 bash test/run-local.sh       # use another port
```

The script builds `frontend/out`, starts `uv run uvicorn app.main:app` with `LLM_MOCK=true`,
`MASSIVE_API_KEY=` (simulator), `FINALLY_STATIC_DIR=frontend/out` and a throwaway
`FINALLY_DB_PATH` under `test/.e2e-db/`, waits for `/api/health`, runs Playwright, then stops the server.
The server log is written to `test/.server.log`.

## Option 2: start the app yourself

```bash
# Terminal 1: build the frontend and start the backend with a fresh DB
cd frontend && npm run build && cd ..
cd backend
LLM_MOCK=true MASSIVE_API_KEY= FINALLY_DB_PATH=/tmp/finally-e2e.db FINALLY_STATIC_DIR=../frontend/out \
  uv run uvicorn app.main:app --port 8000
# (alternatively copy frontend/out to backend/static and omit FINALLY_STATIC_DIR)

# Terminal 2
cd test && npx playwright test
```

PowerShell equivalent for terminal 1:

```powershell
cd frontend; npm run build; cd ../backend
$env:LLM_MOCK="true"; $env:MASSIVE_API_KEY=""; $env:FINALLY_DB_PATH="$env:TEMP\finally-e2e.db"; $env:FINALLY_STATIC_DIR="..\frontend\out"
uv run uvicorn app.main:app --port 8000
```

## Option 3: Docker

```bash
# from the repo root; set LLM_MOCK=true in .env first (or pass -e LLM_MOCK=true with docker run)
docker compose up -d --build
cd test && npx playwright test
docker compose down
```

To start from a fresh DB with Docker, remove the volume first: `docker compose down -v`.

## Pointing at another URL

```bash
E2E_BASE_URL=http://localhost:8010 npx playwright test
```

## Useful commands

```bash
npx playwright test --list      # list tests (compile check)
npx tsc --noEmit                # type-check
npx playwright show-report      # open the HTML report after a run
npx playwright test --ui        # interactive mode
```
