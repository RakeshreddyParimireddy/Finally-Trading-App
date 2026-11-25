"""SQLite connection management with lazy, idempotent initialization.

Each call opens its own short-lived connection, so the module is safe to use from
FastAPI's threadpool and from background tasks. Write transactions use
``BEGIN IMMEDIATE`` plus a busy timeout to serialize writers.
"""

from __future__ import annotations

import os
import sqlite3
import threading
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

DEFAULT_USER_ID = "default"
DEFAULT_CASH = 10000.0
DEFAULT_TICKERS = ["AAPL", "GOOGL", "MSFT", "AMZN", "TSLA", "NVDA", "META", "JPM", "V", "NFLX"]

_SCHEMA_PATH = Path(__file__).with_name("schema.sql")
# backend/app/db/connection.py -> parents[3] is the repo root
_DEFAULT_DB_PATH = Path(__file__).resolve().parents[3] / "db" / "finally.db"

_lock = threading.Lock()
_path_override: Path | None = None
_initialized: set[str] = set()


def now_iso() -> str:
    """Current time as an ISO-8601 UTC string."""
    return datetime.now(timezone.utc).isoformat()


def _normalize(path: str | os.PathLike[str]) -> Path:
    p = Path(path)
    if p.is_dir():
        p = p / "finally.db"
    return p


def set_db_path(path: str | os.PathLike[str] | None) -> None:
    """Override the DB path for this process (None = use FINALLY_DB_PATH / default)."""
    global _path_override
    _path_override = _normalize(path) if path is not None else None


def get_db_path() -> Path:
    """Resolve the DB path at call time: explicit override, then env var, then default."""
    if _path_override is not None:
        return _path_override
    env = os.environ.get("FINALLY_DB_PATH", "").strip()
    if env:
        return _normalize(env)
    return _DEFAULT_DB_PATH


def _open(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path), timeout=10.0, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout = 10000")
    conn.execute("PRAGMA foreign_keys = ON")
    # NORMAL sync (with WAL, set at init) is durable enough for a demo app and avoids
    # an fsync per statement, which is very slow on Windows.
    conn.execute("PRAGMA synchronous = NORMAL")
    return conn


def _create_and_seed(conn: sqlite3.Connection, user_id: str = DEFAULT_USER_ID) -> None:
    conn.execute("PRAGMA journal_mode = WAL")  # persistent per DB file
    conn.executescript(_SCHEMA_PATH.read_text(encoding="utf-8"))
    conn.execute("BEGIN IMMEDIATE")
    try:
        exists = conn.execute(
            "SELECT 1 FROM users_profile WHERE id = ?", (user_id,)
        ).fetchone()
        if exists is None:
            ts = now_iso()
            conn.execute(
                "INSERT INTO users_profile (id, cash_balance, created_at) VALUES (?, ?, ?)",
                (user_id, DEFAULT_CASH, ts),
            )
            # Seed the watchlist only together with a brand-new profile, so a user
            # who empties their watchlist doesn't get it re-seeded on restart.
            conn.executemany(
                "INSERT OR IGNORE INTO watchlist (user_id, ticker, added_at) VALUES (?, ?, ?)",
                [(user_id, t, ts) for t in DEFAULT_TICKERS],
            )
        conn.execute("COMMIT")
    except BaseException:
        conn.execute("ROLLBACK")
        raise


def init_db(path: str | os.PathLike[str] | None = None) -> None:
    """Create tables if missing and seed default data if empty. Idempotent.

    If ``path`` is given (a file, or a directory that gets ``finally.db``), it becomes
    the DB path for this process. ``None`` reverts to ``FINALLY_DB_PATH`` / the default.
    """
    set_db_path(path)
    db_path = get_db_path()
    with _lock:
        conn = _open(db_path)
        try:
            _create_and_seed(conn)
        finally:
            conn.close()
        _initialized.add(str(db_path.resolve()))


def _ensure_initialized(db_path: Path) -> None:
    key = str(db_path.resolve())
    if key in _initialized and db_path.exists():
        return
    with _lock:
        if key in _initialized and db_path.exists():
            return
        conn = _open(db_path)
        try:
            _create_and_seed(conn)
        finally:
            conn.close()
        _initialized.add(key)


@contextmanager
def get_connection() -> Iterator[sqlite3.Connection]:
    """Yield a connection to the (lazily initialized) DB; closed on exit (autocommit mode)."""
    db_path = get_db_path()
    _ensure_initialized(db_path)
    conn = _open(db_path)
    try:
        yield conn
    finally:
        conn.close()


@contextmanager
def transaction() -> Iterator[sqlite3.Connection]:
    """Yield a connection inside a ``BEGIN IMMEDIATE`` transaction; rolls back on error."""
    with get_connection() as conn:
        conn.execute("BEGIN IMMEDIATE")
        try:
            yield conn
        except BaseException:
            conn.execute("ROLLBACK")
            raise
        conn.execute("COMMIT")
