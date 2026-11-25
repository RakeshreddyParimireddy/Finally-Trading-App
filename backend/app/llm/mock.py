"""Deterministic mock LLM (API_CONTRACT §7), used when LLM_MOCK=true."""

from __future__ import annotations

import re

from .schema import LLMResponse, TradeAction, WatchlistChange

GREETING = "Hello! I'm FinAlly, your AI trading assistant (mock mode)."

_TICKER = r"([A-Za-z.]{1,10})"
_QTY = r"(\d+(?:\.\d+)?)"
_SHARES = r"(?:shares?\s+(?:of\s+)?)?"

_TRADE_RE = {
    side: re.compile(rf"\b{side}\s+{_QTY}\s+{_SHARES}{_TICKER}(?![A-Za-z.])", re.IGNORECASE)
    for side in ("buy", "sell")
}
_BARE_RE = {side: re.compile(rf"\b{side}\b", re.IGNORECASE) for side in ("buy", "sell")}
_ADD_RE = re.compile(rf"\b(?:watch|add)\s+{_TICKER}(?![A-Za-z.])", re.IGNORECASE)
_REMOVE_RE = re.compile(rf"\b(?:unwatch|remove)\s+{_TICKER}(?![A-Za-z.])", re.IGNORECASE)


def format_qty(quantity: float) -> str:
    """5.0 -> '5', 0.5 -> '0.5', 1.23456 -> '1.2346'."""
    return f"{float(quantity):.4f}".rstrip("0").rstrip(".")


def _trade(side: str, qty: float, ticker: str) -> LLMResponse:
    return LLMResponse(
        message=f"Mock: executing {side} {format_qty(qty)} {ticker}.",
        trades=[TradeAction(ticker=ticker, side=side, quantity=qty)],
    )


def _watch(action: str, ticker: str) -> LLMResponse:
    return LLMResponse(
        message=f"Mock: executing {action} {ticker}.",
        watchlist_changes=[WatchlistChange(ticker=ticker, action=action)],
    )


def mock_response(user_message: str) -> LLMResponse:
    """Return the deterministic mock response; the first matching rule wins."""
    text = user_message or ""
    for side in ("buy", "sell"):
        m = _TRADE_RE[side].search(text)
        if m:
            return _trade(side, float(m.group(1)), m.group(2).upper())
        if _BARE_RE[side].search(text):
            return _trade(side, 1.0, "AAPL")
    m = _ADD_RE.search(text)
    if m:
        return _watch("add", m.group(1).upper())
    m = _REMOVE_RE.search(text)
    if m:
        return _watch("remove", m.group(1).upper())
    return LLMResponse(message=GREETING)
