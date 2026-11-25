"""Service-layer errors and shared input validation."""

from __future__ import annotations

import math
import re

TICKER_RE = re.compile(r"^[A-Z.]{1,10}$")
MIN_QUANTITY = 1e-4


class ServiceError(Exception):
    """A user-facing error. Routers map it to ``{"detail": detail}`` with ``status_code``."""

    def __init__(self, detail: str, status_code: int = 400) -> None:
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code


def normalize_ticker(ticker: object) -> str:
    """Trim and upper-case a ticker, then validate ``^[A-Z.]{1,10}$`` (400 otherwise)."""
    if not isinstance(ticker, str):
        raise ServiceError("Ticker must be a string")
    t = ticker.strip().upper()
    if not TICKER_RE.match(t):
        raise ServiceError(f"Invalid ticker: {ticker!r}")
    return t


def normalize_quantity(quantity: object) -> float:
    """Coerce to float, require finite and > 0, round to 4 decimals (400 otherwise)."""
    if isinstance(quantity, bool):
        raise ServiceError("Quantity must be a number")
    try:
        q = float(quantity)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        raise ServiceError("Quantity must be a number") from None
    if not math.isfinite(q):
        raise ServiceError("Quantity must be a finite number")
    q = round(q, 4)
    if q <= 0:
        raise ServiceError("Quantity must be greater than 0")
    return q


def normalize_side(side: object) -> str:
    """Lower-case side; must be 'buy' or 'sell' (400 otherwise)."""
    s = side.strip().lower() if isinstance(side, str) else ""
    if s not in ("buy", "sell"):
        raise ServiceError(f"Invalid side: {side!r} (expected 'buy' or 'sell')")
    return s


def fmt_money(value: float) -> str:
    return f"${value:,.2f}"


def fmt_qty(value: float) -> str:
    s = f"{value:,.4f}".rstrip("0").rstrip(".")
    return s or "0"
