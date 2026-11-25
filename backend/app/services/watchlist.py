"""Watchlist service: CRUD plus keeping the market data source in sync."""

from __future__ import annotations

from app import db
from app.context import AppContext

from .errors import ServiceError, normalize_ticker


def _row(ctx: AppContext, ticker: str) -> dict:
    u = ctx.price_cache.get(ticker)
    if u is None:
        return {
            "ticker": ticker,
            "price": None,
            "previous_price": None,
            "session_open": None,
            "session_change_percent": None,
            "direction": None,
        }
    return {
        "ticker": ticker,
        "price": u.price,
        "previous_price": u.previous_price,
        "session_open": u.open_price,
        "session_change_percent": u.session_change_percent,
        "direction": u.direction,
    }


def get_watchlist(ctx: AppContext) -> list[dict]:
    """Watched tickers (ordered by added_at) with latest cached prices (null if none)."""
    return [_row(ctx, t) for t in db.get_watchlist()]


async def add_ticker(ctx: AppContext, ticker: object) -> list[dict]:
    """Add a ticker (idempotent) and start tracking it. Returns the updated watchlist."""
    t = normalize_ticker(ticker)
    db.add_to_watchlist(t)
    await ctx.market_source.add_ticker(t)  # no-op if already tracked
    return get_watchlist(ctx)


async def remove_ticker(ctx: AppContext, ticker: object) -> list[dict]:
    """Remove a watched ticker (404 if absent). Stops tracking unless a position is held."""
    t = normalize_ticker(ticker)
    if not db.remove_from_watchlist(t):
        raise ServiceError(f"{t} is not on the watchlist", 404)
    if db.get_position(t) is None:
        await ctx.market_source.remove_ticker(t)
        ctx.price_cache.remove(t)
    return get_watchlist(ctx)
