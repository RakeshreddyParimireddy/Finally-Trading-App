# FinAlly — Shared Build Contract

This is the binding contract for the agent team. It adopts **all suggested resolutions in PLAN.md §13**. When this file and PLAN.md disagree, this file wins. If you need to change something here, tell the team lead first. Don't change the contract silently.

---

## 1. Ownership (who may edit what)

| Teammate | Owns (exclusive write access) |
|---|---|
| **database-engineer** | `backend/app/db/**`, `backend/tests/db/**` |
| **backend-engineer** | `backend/app/main.py`, `backend/app/context.py`, `backend/app/services/**`, `backend/app/api/**`, `backend/app/market/**` (extensions only), `backend/tests/{api,services,market}/**`, `backend/pyproject.toml`/`uv.lock` |
| **llm-engineer** | `backend/app/llm/**`, `backend/tests/llm/**` |
| **frontend-engineer** | `frontend/**` |
| **devops-engineer** | `Dockerfile`, `.dockerignore`, `docker-compose.yml`, `scripts/**`, `.env.example`, `db/.gitkeep`, root `.gitignore`, root `README.md` run instructions |
| **integration-tester** | `test/**` |

- Need a change in someone else's area? Message the owner (or the team lead). Don't edit their files.
- Dependencies: only the backend-engineer runs `uv add`. `litellm` and `python-dotenv` are already added. The Python version is pinned to **3.12** (`backend/.python-version`). Don't use 3.13 or later: wheels are missing.
- Run backend tests with `cd backend && uv run --extra dev pytest -q`. The existing 73 market tests must stay green.
- Don't commit. The team lead handles git.

---

## 2. Global rules (from §13)

- **Ticker format:** trim and upper-case, then it must match `^[A-Z.]{1,10}$`. Otherwise return 400.
- **Quantity:** `quantity > 0`, rounded to 4 decimals. If it's 0 after rounding, return 400.
- **Full sell** (remaining quantity < 0.0001): delete the `positions` row. Never store a zero-quantity row.
- **Tracked tickers** = watchlist ∪ held positions. The market data source tracks exactly this set.
  - Removing a watched ticker that's still held: remove it from the watchlist only, and keep it tracked.
  - Fully selling a ticker that isn't on the watchlist: stop tracking it (`market_source.remove_ticker`, `price_cache.remove`).
- **Unknown tickers under the simulator:** already handled (seed $100-ish random, default volatility). The Massive source is best-effort and simulator-first: accept the ticker, and it shows no price until a poll returns data.
- **Trade with no cached price:** `409 {"detail": "Price unavailable for XYZ"}`.
- **Error format:** always `{"detail": "..."}`. Use 400 for validation, 404 for not found, 409 for no price.
- **Timestamps** in DB/API: ISO-8601 UTC strings (`datetime.now(timezone.utc).isoformat()`).
- **user_id** is always `"default"`.
- **Session change %** (replaces "daily change"): `PriceCache` stores `session_open` per ticker, which is the first price ever seen for that ticker in this process. The UI column is labelled **"Chg %"**.

---

## 3. Environment

| Var | Default | Notes |
|---|---|---|
| `OPENROUTER_API_KEY` | – | Missing and not mock: chat returns a friendly assistant message (HTTP 200), not a 500 |
| `MASSIVE_API_KEY` | empty | Empty means the simulator |
| `LLM_MOCK` | `false` | `true` means a deterministic mock (§7) |
| `FINALLY_DB_PATH` | `<repo-root>/db/finally.db` | Docker sets `/app/db/finally.db` |
| `FINALLY_STATIC_DIR` | `backend/static` | Docker sets `/app/static`. If the directory doesn't exist, skip mounting |

The backend calls `load_dotenv()` on the repo-root `.env` if it exists (it never overrides real env vars).

---

## 4. Backend module layout and internal interfaces

```
backend/app/
  main.py              # backend-engineer: create_app(), lifespan, routers, static mount; `app = create_app()`
  context.py           # backend-engineer: AppContext dataclass
  market/              # existing (backend-engineer may extend: session_open)
  db/                  # database-engineer
    __init__.py        # re-exports the functions below
    schema.sql
    connection.py
    repository.py
  services/            # backend-engineer
    errors.py          # ServiceError(detail: str, status_code: int)
    portfolio.py
    watchlist.py
    snapshots.py       # background snapshot task
  api/                 # backend-engineer: routers for health, portfolio, watchlist
  llm/                 # llm-engineer
    router.py          # `router = APIRouter()` with POST /api/chat, GET /api/chat/history
    ...
```

### 4.1 AppContext (`app/context.py`)
```python
@dataclass
class AppContext:
    price_cache: PriceCache
    market_source: MarketDataSource
```
Stored at `app.state.ctx`. Routers fetch it with `request.app.state.ctx`.

### 4.2 DB layer (`app.db`, sync `sqlite3`, all functions take `user_id: str = "default"` last)
```python
init_db(path: str | None = None) -> None      # idempotent: create tables if missing, seed if empty
get_cash() -> float
get_watchlist() -> list[str]                    # ordered by added_at
add_to_watchlist(ticker) -> bool                # False if already present
remove_from_watchlist(ticker) -> bool           # False if absent
get_positions() -> list[dict]                   # {ticker, quantity, avg_cost, updated_at}
get_position(ticker) -> dict | None
get_tracked_tickers() -> list[str]              # watchlist ∪ positions, deduped
record_trade(ticker, side, quantity, price, new_cash, new_quantity, new_avg_cost) -> dict
    # ATOMIC: sets cash, upserts the position (or deletes it if new_quantity < 1e-4), appends to trades.
    # returns trade dict {id, ticker, side, quantity, price, executed_at}
insert_snapshot(total_value: float) -> dict     # {total_value, recorded_at}
get_snapshots(limit: int = 2880) -> list[dict]  # ascending by recorded_at
prune_snapshots(keep_hours: int = 24) -> int
insert_chat_message(role: str, content: str, actions: dict | None) -> dict
    # returns {id, role, content, actions (parsed dict|None), created_at}
get_chat_messages(limit: int = 50) -> list[dict]  # the most recent `limit`, returned ascending
```
- The DB path resolves from `FINALLY_DB_PATH` at call time, so tests can monkeypatch it or call `init_db(tmp_path)`. A module-level setter is fine.
- Schema per PLAN §7 plus §13 #21: `watchlist` and `positions` use `PRIMARY KEY (user_id, ticker)` (no UUID). `trades`, `chat_messages` and `portfolio_snapshots` keep UUID `id`. `users_profile.id` is the user id.
- Seed: cash 10000.0 and the 10 default tickers.

### 4.3 Services (`app.services`, used by the API routers AND the llm-engineer)
```python
class ServiceError(Exception): detail: str; status_code: int

def get_portfolio(ctx) -> dict                         # shape = GET /api/portfolio
async def execute_trade(ctx, ticker, side, quantity) -> dict  # shape = POST /api/portfolio/trade response
    # validates (format, qty, side in {"buy","sell"}, price available, cash, shares), calls db.record_trade,
    # records a snapshot, handles tracking/untracking. Raises ServiceError.
def get_watchlist(ctx) -> list[dict]                   # shape = GET /api/watchlist
async def add_ticker(ctx, ticker) -> list[dict]        # returns the updated watchlist; raises ServiceError
async def remove_ticker(ctx, ticker) -> list[dict]     # raises ServiceError(404) if not watched
```

### 4.4 Startup (lifespan)
`init_db()`, then `market_source.start(get_tracked_tickers())`, then take one snapshot immediately, then the snapshot task runs every 30s (insert, then `prune_snapshots(24)`). On shutdown, stop both.

---

## 5. HTTP API

### `GET /api/health` → `{"status": "ok"}`

### `GET /api/stream/prices` (SSE)
The existing implementation: a single event carrying a dict of **all tracked tickers**, sent only when the cache version changes:
```
data: {"AAPL": {"ticker":"AAPL","price":190.5,"previous_price":190.42,"timestamp":1764000000.1,
                "change":0.08,"change_percent":0.042,"direction":"up",
                "session_open":189.0,"session_change_percent":0.7937}, "MSFT": {...}}
```
`session_open` and `session_change_percent` are new fields, added by the backend-engineer to `PriceUpdate.to_dict()`.

### `GET /api/watchlist` → 200
```json
[{"ticker":"AAPL","price":190.5,"previous_price":190.42,"session_open":189.0,
  "session_change_percent":0.79,"direction":"up"}]
```
Price-related fields are `null` if no price is cached yet. Ordered by `added_at`.

### `POST /api/watchlist` `{"ticker":"pypl"}` → 200 with the full updated watchlist (same shape as GET)
Idempotent: adding an existing ticker returns 200 unchanged. A bad format returns 400.

### `DELETE /api/watchlist/{ticker}` → 200 with the full updated watchlist; 404 if not on the watchlist

### `GET /api/portfolio` → 200
```json
{
  "cash_balance": 8095.0,
  "positions": [
    {"ticker":"AAPL","quantity":10.0,"avg_cost":190.5,"current_price":191.2,
     "market_value":1912.0,"cost_basis":1905.0,"unrealized_pnl":7.0,"unrealized_pnl_percent":0.3675}
  ],
  "positions_value": 1912.0,
  "total_value": 10007.0,
  "unrealized_pnl": 7.0
}
```
If there's no cached price, `current_price = avg_cost`. Percentages are in percent units (0.37 means 0.37%).

### `POST /api/portfolio/trade` `{"ticker":"AAPL","side":"buy","quantity":10}` → 200
```json
{"trade": {"id":"uuid","ticker":"AAPL","side":"buy","quantity":10.0,"price":190.5,"executed_at":"..."},
 "portfolio": { ...same shape as GET /api/portfolio... }}
```
Errors: 400 (bad ticker/side/qty, `"Insufficient cash: need $X, have $Y"`, `"Insufficient shares: have N AAPL"`), 409 (no price).

### `GET /api/portfolio/history` → 200 `[{"total_value": 10000.0, "recorded_at": "..."}]`, ascending, at most 2880 rows (24h at 30s)

### `POST /api/chat` `{"message":"buy 5 NVDA"}` → 200
```json
{"id":"uuid","role":"assistant","content":"Bought 5 NVDA ...","created_at":"...",
 "actions": {
   "trades": [{"ticker":"NVDA","side":"buy","quantity":5,"status":"executed","price":880.1}],
   "watchlist_changes": [{"ticker":"PYPL","action":"add","status":"failed","error":"..."}]
 }}
```
- Each action has `status` = `"executed"` | `"failed"`. Failed ones have `error`; executed trades have `price`.
- Actions run **in order and independently** (non-atomic). There's **no second LLM call**. If any action failed, a deterministic summary is appended to `content`: `"\n\nSome actions could not be completed:\n- buy 5 NVDA: Insufficient cash ..."`.
- Both the user and assistant messages are stored. The prompt includes the **last 20** messages plus a portfolio context (cash, positions with P&L, watchlist with live prices, total value).
- Empty message returns 400. An LLM/network error or missing key returns 200 with a friendly assistant `content` and empty `actions`.
- Model: `openrouter/openai/gpt-oss-120b`, Cerebras provider, structured output (use the `cerebras` skill).

### `GET /api/chat/history` → 200 with the last 50 messages ascending: `[{id, role, content, actions, created_at}]`

### Static
FastAPI mounts `StaticFiles(directory=FINALLY_STATIC_DIR, html=True)` at `/` **after** all `/api` routers. The frontend has a single route, `/`.

---

## 6. Frontend requirements

- Next.js + TypeScript + Tailwind, `output: 'export'`, built to `frontend/out/`. Single page. No rewrites, API routes or dynamic routes.
- **Recharts everywhere** (sparklines, main chart, P&L line, treemap) as the single chart dependency.
- One per-ticker ring buffer (the last 300 points) in a frontend store, fed by SSE and shared by the sparklines and the main chart.
- Header total value = cash + Σ(qty × live SSE price), computed client-side. Refetch `/api/portfolio` after trades and chat actions.
- Heatmap colour = unrealized P&L %, clamped at ±5% for full saturation. Size = market value.
- Price flash: about 300ms, only when the change is ≥ $0.01.
- On page load, the chat panel loads `GET /api/chat/history`.
- Dev: `next.config` can proxy `/api` to `http://localhost:8000` in dev only, or use `NEXT_PUBLIC_API_BASE` (default `""`).
- Colours: bg `#0d1117`, accent yellow `#ecad0a`, blue `#209dd7`, purple `#753991` (submit buttons).

### Required `data-testid`s (the E2E tests depend on these exactly)
| testid | Element / notes |
|---|---|
| `header-total-value` | Total portfolio value text |
| `header-cash` | Cash balance text |
| `connection-status` | Dot; attribute `data-status="connected|reconnecting|disconnected"` |
| `watchlist` | Watchlist container |
| `watchlist-row-{TICKER}` | One row per ticker; clicking it selects the ticker |
| `watchlist-price-{TICKER}` | Price cell |
| `watchlist-add-input` / `watchlist-add-button` | Add-ticker form |
| `watchlist-remove-{TICKER}` | Remove button in the row |
| `main-chart` | Main chart container; attribute `data-ticker="{TICKER}"` |
| `trade-ticker-input` / `trade-quantity-input` | Trade bar inputs |
| `trade-buy-button` / `trade-sell-button` | Trade buttons |
| `trade-error` | Visible error message after a failed trade |
| `positions-table` | Positions table |
| `position-row-{TICKER}` | One row per position |
| `heatmap` / `heatmap-cell-{TICKER}` | Treemap and its cells |
| `pnl-chart` | P&L chart container; attribute `data-points="{n}"` (number of snapshots) |
| `chat-panel` / `chat-input` / `chat-send` | Chat |
| `chat-message` | Each message; attribute `data-role="user|assistant"` |
| `chat-loading` | Visible while waiting for the LLM |
| `chat-action` | Each inline trade/watchlist confirmation in an assistant message |

Money is displayed as `$10,000.00` (en-US, 2 decimals).

---

## 7. LLM mock (`LLM_MOCK=true`), deterministic

Match against the user message (case-insensitive), first rule wins:
1. `buy <qty> <TICKER>` gives a buy trade of qty × TICKER. A bare "buy" with no match gives a buy of 1 AAPL.
2. `sell <qty> <TICKER>` gives a sell trade. A bare "sell" gives a sell of 1 AAPL.
3. `(watch|add) <TICKER>` gives a watchlist add.
4. `(unwatch|remove) <TICKER>` gives a watchlist remove.
5. Otherwise, a reply with no actions: `"Hello! I'm FinAlly, your AI trading assistant (mock mode)."`

Mock `message` for rules 1–4: `"Mock: executing {side|action} {qty} {TICKER}."` (no qty for watchlist rules). The actions then run through the real services, exactly like a real LLM response.

---

## 8. DevOps

- Multi-stage Dockerfile: `node:20-slim` builds `frontend/` into `out/`; `python:3.12-slim` with uv runs `uv sync --frozen --no-dev`, copies `out/` to `/app/static`, sets `FINALLY_DB_PATH=/app/db/finally.db` and `FINALLY_STATIC_DIR=/app/static`, then runs `uvicorn app.main:app --host 0.0.0.0 --port 8000`.
- `docker-compose.yml`: service `finally`, port 8000, `env_file: .env` (required: false), named volume `finally-data:/app/db`.
- Scripts (§13 #17) are thin, idempotent wrappers around compose: `start_*` runs `docker compose up -d` (adding `--build` if `--build`/`-Build` is passed or the image is missing), prints `http://localhost:8000`, and opens the browser. `stop_*` runs `docker compose down` (keeping the volume).
- `.env.example` is committed. `.env` and `db/*.db` are gitignored. `db/.gitkeep` exists.

## 9. E2E (§13 #20, #23)

- Playwright lives in `test/`, with its own `package.json` and `playwright.config.ts`. `baseURL` comes from `E2E_BASE_URL` (default `http://localhost:8000`). Tests run locally against a running app with `LLM_MOCK=true`. There's no Playwright container.
- SSE resilience is covered by a frontend unit test of the connection-status hook, not by E2E.
- Tests must tolerate a non-fresh DB (use relative assertions, or reset by restarting with a fresh `FINALLY_DB_PATH`).
