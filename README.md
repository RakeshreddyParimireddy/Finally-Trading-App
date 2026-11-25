# FinAlly — AI Trading Workstation

A visually stunning AI-powered trading workstation that streams live market data, simulates portfolio trading, and integrates an LLM chat assistant that can analyze positions and execute trades via natural language.

Built entirely by coding agents as a capstone project for an agentic AI coding course.

## Features

- **Live price streaming** via SSE with green/red flash animations
- **Simulated portfolio** — $10k virtual cash, market orders, instant fills
- **Portfolio visualizations** — heatmap (treemap), P&L chart, positions table
- **AI chat assistant** — analyzes holdings, suggests and auto-executes trades
- **Watchlist management** — track tickers manually or via AI
- **Dark terminal aesthetic** — Bloomberg-inspired, data-dense layout

## Architecture

Single Docker container serving everything on port 8000:

- **Frontend**: Next.js (static export) with TypeScript and Tailwind CSS
- **Backend**: FastAPI (Python/uv) with SSE streaming
- **Database**: SQLite with lazy initialization
- **AI**: LiteLLM → OpenRouter (Cerebras inference) with structured outputs
- **Market data**: Built-in GBM simulator (default) or Massive API (optional)

## Running FinAlly

Prerequisite: Docker (Docker Desktop on macOS/Windows) with Compose v2.

```bash
# 1. Configure (optional: without a key, everything except AI chat works)
cp .env.example .env        # then set OPENROUTER_API_KEY
```

```bash
# 2. Start (macOS/Linux). Builds the image on first run; pass --build to rebuild.
./scripts/start_mac.sh            # add --no-open to skip opening the browser
./scripts/stop_mac.sh             # stops the container, keeps your data
```

```powershell
# 2. Start (Windows PowerShell)
.\scripts\start_windows.ps1       # -Build to rebuild, -NoOpen to skip the browser
.\scripts\stop_windows.ps1
```

The start scripts are idempotent, wait until `/api/health` responds, then print the URL and open **http://localhost:8000**.

The scripts are thin wrappers around Docker Compose, so you can also run it directly:

```bash
docker compose up -d --build   # start (or rebuild)
docker compose down            # stop; the finally-data volume is kept
docker compose down -v         # stop AND delete all data (fresh $10k portfolio next time)
```

Or with plain Docker:

```bash
docker build -t finally .
docker run -d --name finally -v finally-data:/app/db -p 8000:8000 --env-file .env finally
```

(`--env-file .env` requires the file to exist; Compose and the scripts treat it as optional.)

The SQLite database lives in the `finally-data` volume at `/app/db/finally.db` and is created and seeded on first start. For deterministic AI responses with no API key (e.g. for E2E tests), set `LLM_MOCK=true` in `.env`.

On Windows, if script execution is blocked, run `powershell -ExecutionPolicy Bypass -File .\scripts\start_windows.ps1`.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `OPENROUTER_API_KEY` | For AI chat | OpenRouter API key; without it chat returns a friendly error and the rest of the app works |
| `MASSIVE_API_KEY` | No | Massive (Polygon.io) key for real market data; omit to use simulator |
| `LLM_MOCK` | No | Set `true` for deterministic mock LLM responses (testing) |

## Project Structure

```
finally/
├── frontend/    # Next.js static export
├── backend/     # FastAPI uv project
├── planning/    # Project documentation and agent contracts
├── test/        # Playwright E2E tests
├── db/          # SQLite volume mount (runtime)
└── scripts/     # Start/stop helpers
```

## License

See [LICENSE](LICENSE).
