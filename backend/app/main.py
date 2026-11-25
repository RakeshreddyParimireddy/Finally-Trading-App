"""FastAPI application entry point.

Run with: ``uv run uvicorn app.main:app --port 8000``
"""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles

_BACKEND_DIR = Path(__file__).resolve().parents[1]
_REPO_ROOT = _BACKEND_DIR.parent

# Load the repo-root .env before anything reads env vars (never overrides real env).
load_dotenv(_REPO_ROOT / ".env", override=False)

from app import db  # noqa: E402
from app.api import api_router, register_error_handlers  # noqa: E402
from app.context import AppContext  # noqa: E402
from app.market import PriceCache, create_market_data_source, create_stream_router  # noqa: E402
from app.services import snapshots  # noqa: E402

logger = logging.getLogger(__name__)


def _static_dir() -> Path:
    env = os.environ.get("FINALLY_STATIC_DIR", "").strip()
    return Path(env) if env else _BACKEND_DIR / "static"


def create_app(
    ctx: AppContext | None = None,
    snapshot_interval: float = snapshots.SNAPSHOT_INTERVAL_SECONDS,
    static_dir: str | os.PathLike[str] | None = None,
) -> FastAPI:
    """Build the app. ``ctx`` lets tests inject a price cache / market source."""
    if ctx is None:
        cache = PriceCache()
        ctx = AppContext(price_cache=cache, market_source=create_market_data_source(cache))

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        db.init_db()
        await ctx.market_source.start(db.get_tracked_tickers())
        try:
            snapshots.record_snapshot(ctx)
        except Exception:
            logger.exception("Initial snapshot failed")
        task = snapshots.start_snapshot_task(ctx, snapshot_interval)
        try:
            yield
        finally:
            await snapshots.stop_snapshot_task(task)
            await ctx.market_source.stop()

    app = FastAPI(title="FinAlly", lifespan=lifespan)
    app.state.ctx = ctx
    register_error_handlers(app)

    app.include_router(api_router)
    app.include_router(create_stream_router(ctx.price_cache))

    try:
        from app.llm.router import router as chat_router
    except ImportError as exc:
        logger.warning("Chat router unavailable (app.llm.router not importable): %s", exc)
    else:
        app.include_router(chat_router)

    # Unknown /api/* paths must 404 as JSON, not fall through to the static
    # frontend's 404.html. Registered after all API routers so it only catches misses.
    @app.api_route(
        "/api/{path:path}",
        methods=["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"],
        include_in_schema=False,
    )
    async def api_not_found(path: str) -> None:
        raise HTTPException(status_code=404, detail="Not Found")

    # Static frontend last, so /api/* routes take precedence.
    static = Path(static_dir) if static_dir is not None else _static_dir()
    if static.is_dir():
        app.mount("/", StaticFiles(directory=str(static), html=True), name="static")

    return app


app = create_app()
