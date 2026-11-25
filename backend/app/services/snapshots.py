"""Portfolio value snapshots: on demand and as a periodic background task."""

from __future__ import annotations

import asyncio
import contextlib
import logging

from app import db
from app.context import AppContext

from .portfolio import get_portfolio

logger = logging.getLogger(__name__)

SNAPSHOT_INTERVAL_SECONDS = 30.0
KEEP_HOURS = 24


def record_snapshot(ctx: AppContext) -> dict:
    """Insert a snapshot of the current total portfolio value."""
    return db.insert_snapshot(get_portfolio(ctx)["total_value"])


def get_history(limit: int = 2880) -> list[dict]:
    """Snapshots ascending by time, shaped ``{total_value, recorded_at}``."""
    return [
        {"total_value": s["total_value"], "recorded_at": s["recorded_at"]}
        for s in db.get_snapshots(limit)
    ]


async def run_snapshot_loop(
    ctx: AppContext, interval: float = SNAPSHOT_INTERVAL_SECONDS
) -> None:
    """Every ``interval`` seconds: insert a snapshot, then prune old ones."""
    while True:
        await asyncio.sleep(interval)
        try:
            record_snapshot(ctx)
            db.prune_snapshots(KEEP_HOURS)
        except Exception:
            logger.exception("Snapshot task iteration failed")


def start_snapshot_task(
    ctx: AppContext, interval: float = SNAPSHOT_INTERVAL_SECONDS
) -> asyncio.Task:
    return asyncio.create_task(run_snapshot_loop(ctx, interval), name="portfolio-snapshots")


async def stop_snapshot_task(task: asyncio.Task | None) -> None:
    if task is None or task.done():
        return
    task.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await task
