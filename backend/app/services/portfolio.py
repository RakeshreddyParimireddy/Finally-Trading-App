"""Portfolio valuation and trade execution."""

from __future__ import annotations

import logging

from app import db
from app.context import AppContext

from .errors import (
    MIN_QUANTITY,
    ServiceError,
    fmt_money,
    fmt_qty,
    normalize_quantity,
    normalize_side,
    normalize_ticker,
)

logger = logging.getLogger(__name__)

_EPS = 1e-9


def _position_view(ctx: AppContext, pos: dict) -> dict:
    ticker = pos["ticker"]
    quantity = float(pos["quantity"])
    avg_cost = float(pos["avg_cost"])
    price = ctx.price_cache.get_price(ticker)
    current_price = float(price) if price is not None else avg_cost
    market_value = quantity * current_price
    cost_basis = quantity * avg_cost
    pnl = market_value - cost_basis
    pnl_pct = (pnl / cost_basis * 100) if cost_basis else 0.0
    return {
        "ticker": ticker,
        "quantity": round(quantity, 4),
        "avg_cost": round(avg_cost, 4),
        "current_price": round(current_price, 4),
        "market_value": round(market_value, 2),
        "cost_basis": round(cost_basis, 2),
        "unrealized_pnl": round(pnl, 2),
        "unrealized_pnl_percent": round(pnl_pct, 4),
    }


def get_portfolio(ctx: AppContext) -> dict:
    """Cash, positions valued at cached prices (avg_cost if no price), totals."""
    cash = float(db.get_cash())
    positions = [_position_view(ctx, p) for p in db.get_positions()]
    positions_value = sum((p["market_value"] for p in positions), 0.0)
    unrealized = sum((p["unrealized_pnl"] for p in positions), 0.0)
    return {
        "cash_balance": round(cash, 2),
        "positions": positions,
        "positions_value": round(positions_value, 2),
        "total_value": round(cash + positions_value, 2),
        "unrealized_pnl": round(unrealized, 2),
    }


def _is_tracked_elsewhere(ticker: str) -> bool:
    """True if the ticker belongs in the tracked set (watched or held)."""
    return ticker in db.get_tracked_tickers()


async def _untrack(ctx: AppContext, ticker: str) -> None:
    await ctx.market_source.remove_ticker(ticker)
    ctx.price_cache.remove(ticker)


async def execute_trade(ctx: AppContext, ticker: object, side: object, quantity: object) -> dict:
    """Validate and execute a market order at the cached price.

    Returns ``{"trade": {...}, "portfolio": {...}}``. Raises ServiceError.
    """
    ticker = normalize_ticker(ticker)
    side = normalize_side(side)
    qty = normalize_quantity(quantity)

    # Price check first (before cash/shares): untracked or not-yet-priced -> 409.
    # No awaits from here until record_trade, so read-validate-write is atomic
    # with respect to other coroutines on the event loop.
    price = ctx.price_cache.get_price(ticker)
    if price is None:
        raise ServiceError(f"Price unavailable for {ticker}", 409)
    price = float(price)

    cash = float(db.get_cash())
    pos = db.get_position(ticker)
    held = float(pos["quantity"]) if pos else 0.0
    avg_cost = float(pos["avg_cost"]) if pos else 0.0
    notional = qty * price

    if side == "buy":
        if notional > cash + _EPS:
            raise ServiceError(
                f"Insufficient cash: need {fmt_money(notional)}, have {fmt_money(cash)}"
            )
        new_cash = cash - notional
        new_qty = held + qty
        new_avg = (held * avg_cost + notional) / new_qty
    else:
        if qty > held + _EPS:
            raise ServiceError(f"Insufficient shares: have {fmt_qty(held)} {ticker}")
        new_cash = cash + notional
        new_qty = held - qty
        if new_qty < MIN_QUANTITY:
            new_qty = 0.0
        new_avg = avg_cost

    trade = db.record_trade(
        ticker,
        side,
        qty,
        price,
        round(new_cash, 6),
        round(new_qty, 4),
        new_avg if new_qty else 0.0,
    )

    # Tracked tickers = watchlist ∪ positions.
    if side == "sell" and new_qty == 0.0 and not _is_tracked_elsewhere(ticker):
        await _untrack(ctx, ticker)

    portfolio = get_portfolio(ctx)
    try:
        db.insert_snapshot(portfolio["total_value"])
    except Exception:  # a snapshot failure must not fail an executed trade
        logger.exception("Failed to record post-trade snapshot")

    return {"trade": trade, "portfolio": portfolio}
