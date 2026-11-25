"""FinAlly persistence layer (SQLite). See planning/API_CONTRACT.md §4.2."""

from .connection import (
    DEFAULT_CASH,
    DEFAULT_TICKERS,
    DEFAULT_USER_ID,
    get_connection,
    get_db_path,
    init_db,
    set_db_path,
)
from .repository import (
    add_to_watchlist,
    get_cash,
    get_chat_messages,
    get_position,
    get_positions,
    get_snapshots,
    get_tracked_tickers,
    get_watchlist,
    insert_chat_message,
    insert_snapshot,
    prune_snapshots,
    record_trade,
    remove_from_watchlist,
)

__all__ = [
    "DEFAULT_CASH",
    "DEFAULT_TICKERS",
    "DEFAULT_USER_ID",
    "add_to_watchlist",
    "get_cash",
    "get_chat_messages",
    "get_connection",
    "get_db_path",
    "get_position",
    "get_positions",
    "get_snapshots",
    "get_tracked_tickers",
    "get_watchlist",
    "init_db",
    "insert_chat_message",
    "insert_snapshot",
    "prune_snapshots",
    "record_trade",
    "remove_from_watchlist",
    "set_db_path",
]
