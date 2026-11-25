"""Execute the trades and watchlist changes requested by the LLM."""

from __future__ import annotations

import logging
from typing import Any

from . import deps
from .mock import format_qty
from .schema import LLMResponse

logger = logging.getLogger(__name__)

FAILURE_HEADER = "\n\nSome actions could not be completed:"


def _error_text(exc: Exception) -> str:
    detail = getattr(exc, "detail", None)
    return str(detail) if detail else (str(exc) or exc.__class__.__name__)


async def execute_actions(ctx: Any, response: LLMResponse) -> tuple[dict, list[str]]:
    """Run every action in order, independently (non-atomic).

    Returns ``(actions, failures)`` where ``actions`` matches the contract's
    ``actions`` object and ``failures`` are summary lines like
    ``"- buy 5 NVDA: Insufficient cash ..."``.
    """
    services = deps.services()
    trades: list[dict] = []
    changes: list[dict] = []
    failures: list[str] = []

    for t in response.trades:
        ticker = t.ticker.strip().upper()
        entry: dict = {"ticker": ticker, "side": t.side, "quantity": t.quantity}
        try:
            result = await services.execute_trade(ctx, ticker, t.side, t.quantity)
            trade = (result or {}).get("trade") or {}
            entry["status"] = "executed"
            entry["price"] = trade.get("price")
            if trade.get("quantity") is not None:
                entry["quantity"] = trade["quantity"]
        except Exception as exc:
            if getattr(exc, "detail", None) is None:
                logger.exception("Unexpected error executing LLM trade")
            err = _error_text(exc)
            entry.update(status="failed", error=err)
            failures.append(f"- {t.side} {format_qty(t.quantity)} {ticker}: {err}")
        trades.append(entry)

    for c in response.watchlist_changes:
        ticker = c.ticker.strip().upper()
        entry = {"ticker": ticker, "action": c.action}
        fn = services.add_ticker if c.action == "add" else services.remove_ticker
        try:
            await fn(ctx, ticker)
            entry["status"] = "executed"
        except Exception as exc:
            if getattr(exc, "detail", None) is None:
                logger.exception("Unexpected error applying LLM watchlist change")
            err = _error_text(exc)
            entry.update(status="failed", error=err)
            failures.append(f"- {c.action} {ticker}: {err}")
        changes.append(entry)

    return {"trades": trades, "watchlist_changes": changes}, failures


def append_failure_summary(content: str, failures: list[str]) -> str:
    if not failures:
        return content
    return content + FAILURE_HEADER + "\n" + "\n".join(failures)
