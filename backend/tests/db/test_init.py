"""Initialization, seeding and path resolution."""

import sqlite3

from app import db


def _tables(path):
    conn = sqlite3.connect(path)
    try:
        return {
            r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
        }
    finally:
        conn.close()


def test_init_creates_all_tables(db_path):
    assert db_path.exists()
    assert {
        "users_profile",
        "watchlist",
        "positions",
        "trades",
        "portfolio_snapshots",
        "chat_messages",
    } <= _tables(db_path)


def test_seed_defaults(db_path):
    assert db.get_cash() == 10000.0
    assert db.get_watchlist() == db.DEFAULT_TICKERS
    assert len(db.get_watchlist()) == 10
    assert db.get_positions() == []
    assert db.get_snapshots() == []
    assert db.get_chat_messages() == []


def test_init_is_idempotent(db_path):
    db.add_to_watchlist("PYPL")
    db.record_trade("AAPL", "buy", 1, 100.0, 9900.0, 1, 100.0)
    db.init_db()
    db.init_db()
    assert db.get_cash() == 9900.0
    assert db.get_watchlist().count("AAPL") == 1
    assert "PYPL" in db.get_watchlist()
    assert len(db.get_watchlist()) == 11


def test_emptied_watchlist_is_not_reseeded(db_path):
    for t in list(db.get_watchlist()):
        db.remove_from_watchlist(t)
    db.init_db()
    assert db.get_watchlist() == []


def test_init_with_explicit_directory(tmp_path):
    try:
        db.init_db(tmp_path)
        assert db.get_db_path() == tmp_path / "finally.db"
        assert (tmp_path / "finally.db").exists()
        assert db.get_cash() == 10000.0
    finally:
        db.set_db_path(None)


def test_init_with_explicit_file_creates_parent_dirs(tmp_path):
    target = tmp_path / "nested" / "deeper" / "x.db"
    try:
        db.init_db(str(target))
        assert target.exists()
        assert len(db.get_watchlist()) == 10
    finally:
        db.set_db_path(None)


def test_path_resolved_from_env_at_call_time(tmp_path, monkeypatch):
    db.set_db_path(None)
    a = tmp_path / "a.db"
    b = tmp_path / "b.db"
    monkeypatch.setenv("FINALLY_DB_PATH", str(a))
    db.add_to_watchlist("PYPL")  # lazy init of a.db
    monkeypatch.setenv("FINALLY_DB_PATH", str(b))
    assert db.get_db_path() == b
    assert "PYPL" not in db.get_watchlist()  # lazy init of b.db
    assert b.exists()
    monkeypatch.setenv("FINALLY_DB_PATH", str(a))
    assert "PYPL" in db.get_watchlist()


def test_lazy_init_recreates_deleted_file(db_path):
    db_path.unlink()
    assert db.get_cash() == 10000.0
    assert db_path.exists()


def test_default_path_is_repo_db(monkeypatch):
    db.set_db_path(None)
    monkeypatch.delenv("FINALLY_DB_PATH", raising=False)
    p = db.get_db_path()
    assert p.name == "finally.db"
    assert p.parent.name == "db"
    assert (p.parent.parent / "backend").is_dir()
