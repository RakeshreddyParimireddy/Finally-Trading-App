"""Data-access functions (planning/API_CONTRACT.md §4.2).

All functions are synchronous and take ``user_id`` as the last argument.
Inputs are assumed to be validated by the service layer (ticker format, quantity, etc.).
"""

from __future__ import annotations

import json
import sqlite3
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from .connection import DEFAULT_CASH, DEFAULT_USER_ID, get_connection, now_iso, transaction

ZERO_QUANTITY = 1e-4


# --- Cash -----------------------------------------------------------------------------------


def get_cash(user_id: str = DEFAULT_USER_ID) -> float:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT cash_balance FROM users_profile WHERE id = ?", (user_id,)
        ).fetchone()
    return float(row["cash_balance"]) if row else DEFAULT_CASH


# --- Watchlist ------------------------------------------------------------------------------


def get_watchlist(user_id: str = DEFAULT_USER_ID) -> list[str]:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT ticker FROM watchlist WHERE user_id = ? ORDER BY added_at, rowid",
            (user_id,),
        ).fetchall()
    return [r["ticker"] for r in rows]


def add_to_watchlist(ticker: str, user_id: str = DEFAULT_USER_ID) -> bool:
    """Add a ticker. Returns False if it was already present."""
    with get_connection() as conn:
        cur = conn.execute(
            "INSERT OR IGNORE INTO watchlist (user_id, ticker, added_at) VALUES (?, ?, ?)",
            (user_id, ticker, now_iso()),
        )
        return cur.rowcount > 0


def remove_from_watchlist(ticker: str, user_id: str = DEFAULT_USER_ID) -> bool:
    """Remove a ticker. Returns False if it was absent."""
    with get_connection() as conn:
        cur = conn.execute(
            "DELETE FROM watchlist WHERE user_id = ? AND ticker = ?", (user_id, ticker)
        )
        return cur.rowcount > 0


# --- Positions ------------------------------------------------------------------------------


def _position_dict(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "ticker": row["ticker"],
        "quantity": float(row["quantity"]),
        "avg_cost": float(row["avg_cost"]),
        "updated_at": row["updated_at"],
    }


def get_positions(user_id: str = DEFAULT_USER_ID) -> list[dict[str, Any]]:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT ticker, quantity, avg_cost, updated_at FROM positions "
            "WHERE user_id = ? ORDER BY ticker",
            (user_id,),
        ).fetchall()
    return [_position_dict(r) for r in rows]


def get_position(ticker: str, user_id: str = DEFAULT_USER_ID) -> dict[str, Any] | None:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT ticker, quantity, avg_cost, updated_at FROM positions "
            "WHERE user_id = ? AND ticker = ?",
            (user_id, ticker),
        ).fetchone()
    return _position_dict(row) if row else None


def get_tracked_tickers(user_id: str = DEFAULT_USER_ID) -> list[str]:
    """Watchlist (in watchlist order) followed by held tickers not on it; deduped."""
    tickers = get_watchlist(user_id)
    seen = set(tickers)
    for p in get_positions(user_id):
        if p["ticker"] not in seen:
            seen.add(p["ticker"])
            tickers.append(p["ticker"])
    return tickers


# --- Trades ---------------------------------------------------------------------------------


def record_trade(
    ticker: str,
    side: str,
    quantity: float,
    price: float,
    new_cash: float,
    new_quantity: float,
    new_avg_cost: float,
    user_id: str = DEFAULT_USER_ID,
) -> dict[str, Any]:
    """Atomically set cash, upsert/delete the position and append the trade.

    The position row is deleted when ``new_quantity < 1e-4``.
    Returns ``{id, ticker, side, quantity, price, executed_at}``.
    """
    ts = now_iso()
    trade = {
        "id": str(uuid.uuid4()),
        "ticker": ticker,
        "side": side,
        "quantity": float(quantity),
        "price": float(price),
        "executed_at": ts,
    }
    with transaction() as conn:
        conn.execute(
            "INSERT INTO users_profile (id, cash_balance, created_at) VALUES (?, ?, ?) "
            "ON CONFLICT(id) DO UPDATE SET cash_balance = excluded.cash_balance",
            (user_id, float(new_cash), ts),
        )
        if new_quantity < ZERO_QUANTITY:
            conn.execute(
                "DELETE FROM positions WHERE user_id = ? AND ticker = ?", (user_id, ticker)
            )
        else:
            conn.execute(
                "INSERT INTO positions (user_id, ticker, quantity, avg_cost, updated_at) "
                "VALUES (?, ?, ?, ?, ?) "
                "ON CONFLICT(user_id, ticker) DO UPDATE SET quantity = excluded.quantity, "
                "avg_cost = excluded.avg_cost, updated_at = excluded.updated_at",
                (user_id, ticker, float(new_quantity), float(new_avg_cost), ts),
            )
        conn.execute(
            "INSERT INTO trades (id, user_id, ticker, side, quantity, price, executed_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (trade["id"], user_id, ticker, side, trade["quantity"], trade["price"], ts),
        )
    return trade


# --- Portfolio snapshots --------------------------------------------------------------------


def insert_snapshot(total_value: float, user_id: str = DEFAULT_USER_ID) -> dict[str, Any]:
    ts = now_iso()
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO portfolio_snapshots (id, user_id, total_value, recorded_at) "
            "VALUES (?, ?, ?, ?)",
            (str(uuid.uuid4()), user_id, float(total_value), ts),
        )
    return {"total_value": float(total_value), "recorded_at": ts}


def get_snapshots(limit: int = 2880, user_id: str = DEFAULT_USER_ID) -> list[dict[str, Any]]:
    """The most recent ``limit`` snapshots, ascending by recorded_at."""
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT total_value, recorded_at FROM portfolio_snapshots WHERE user_id = ? "
            "ORDER BY recorded_at DESC, rowid DESC LIMIT ?",
            (user_id, int(limit)),
        ).fetchall()
    return [
        {"total_value": float(r["total_value"]), "recorded_at": r["recorded_at"]}
        for r in reversed(rows)
    ]


def prune_snapshots(keep_hours: int = 24, user_id: str = DEFAULT_USER_ID) -> int:
    """Delete snapshots older than ``keep_hours``. Returns the number deleted."""
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=keep_hours)).isoformat()
    with get_connection() as conn:
        cur = conn.execute(
            "DELETE FROM portfolio_snapshots WHERE user_id = ? AND recorded_at < ?",
            (user_id, cutoff),
        )
        return cur.rowcount


# --- Chat -----------------------------------------------------------------------------------


def _chat_dict(row: sqlite3.Row) -> dict[str, Any]:
    actions = row["actions"]
    return {
        "id": row["id"],
        "role": row["role"],
        "content": row["content"],
        "actions": json.loads(actions) if actions is not None else None,
        "created_at": row["created_at"],
    }


def insert_chat_message(
    role: str,
    content: str,
    actions: dict[str, Any] | None,
    user_id: str = DEFAULT_USER_ID,
) -> dict[str, Any]:
    msg_id = str(uuid.uuid4())
    ts = now_iso()
    actions_json = json.dumps(actions) if actions is not None else None
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO chat_messages (id, user_id, role, content, actions, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (msg_id, user_id, role, content, actions_json, ts),
        )
    return {
        "id": msg_id,
        "role": role,
        "content": content,
        "actions": json.loads(actions_json) if actions_json is not None else None,
        "created_at": ts,
    }


def get_chat_messages(limit: int = 50, user_id: str = DEFAULT_USER_ID) -> list[dict[str, Any]]:
    """The most recent ``limit`` messages, returned in ascending order."""
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT id, role, content, actions, created_at FROM chat_messages "
            "WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?",
            (user_id, int(limit)),
        ).fetchall()
    return [_chat_dict(r) for r in reversed(rows)]
