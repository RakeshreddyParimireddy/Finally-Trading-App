"""Service layer shared by the API routers and the LLM chat flow."""

from .errors import ServiceError
from .portfolio import execute_trade, get_portfolio
from .snapshots import get_history, record_snapshot
from .watchlist import add_ticker, get_watchlist, remove_ticker

__all__ = [
    "ServiceError",
    "get_portfolio",
    "execute_trade",
    "get_watchlist",
    "add_ticker",
    "remove_ticker",
    "record_snapshot",
    "get_history",
]
