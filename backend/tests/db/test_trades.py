"""record_trade, positions and tracked tickers."""

import sqlite3

import pytest

from app import db


def _trade_count(path):
    conn = sqlite3.connect(path)
    try:
        return conn.execute("SELECT COUNT(*) FROM trades").fetchone()[0]
    finally:
        conn.close()


def test_buy_creates_position(db_path):
    trade = db.record_trade("AAPL", "buy", 10, 190.5, 8095.0, 10, 190.5)
    assert set(trade) == {"id", "ticker", "side", "quantity", "price", "executed_at"}
    assert trade["ticker"] == "AAPL"
    assert trade["side"] == "buy"
    assert trade["quantity"] == 10.0
    assert isinstance(trade["quantity"], float)
    assert trade["price"] == 190.5
    assert len(trade["id"]) == 36
    assert db.get_cash() == 8095.0
    pos = db.get_position("AAPL")
    assert pos is not None
    assert set(pos) == {"ticker", "quantity", "avg_cost", "updated_at"}
    assert pos["quantity"] == 10.0
    assert pos["avg_cost"] == 190.5
    assert db.get_positions() == [pos]
    assert _trade_count(db_path) == 1


def test_second_buy_updates_position(db_path):
    db.record_trade("AAPL", "buy", 10, 100.0, 9000.0, 10, 100.0)
    db.record_trade("AAPL", "buy", 10, 200.0, 7000.0, 20, 150.0)
    pos = db.get_position("AAPL")
    assert pos["quantity"] == 20.0
    assert pos["avg_cost"] == 150.0
    assert db.get_cash() == 7000.0
    assert len(db.get_positions()) == 1
    assert _trade_count(db_path) == 2


def test_partial_sell(db_path):
    db.record_trade("AAPL", "buy", 10, 100.0, 9000.0, 10, 100.0)
    trade = db.record_trade("AAPL", "sell", 4, 90.0, 9360.0, 6, 100.0)
    assert trade["side"] == "sell"
    pos = db.get_position("AAPL")
    assert pos["quantity"] == 6.0
    assert pos["avg_cost"] == 100.0
    assert db.get_cash() == 9360.0


def test_full_sell_deletes_row(db_path):
    db.record_trade("AAPL", "buy", 10, 100.0, 9000.0, 10, 100.0)
    db.record_trade("AAPL", "sell", 10, 110.0, 10100.0, 0, 0.0)
    assert db.get_position("AAPL") is None
    assert db.get_positions() == []
    assert db.get_cash() == 10100.0
    assert _trade_count(db_path) == 2


def test_near_zero_quantity_deletes_row(db_path):
    db.record_trade("AAPL", "buy", 1, 100.0, 9900.0, 1, 100.0)
    db.record_trade("AAPL", "sell", 0.99995, 100.0, 9999.995, 0.00005, 100.0)
    assert db.get_position("AAPL") is None


def test_fractional_quantities(db_path):
    db.record_trade("NVDA", "buy", 0.1234, 800.0, 9901.28, 0.1234, 800.0)
    assert db.get_position("NVDA")["quantity"] == pytest.approx(0.1234)


def test_get_position_missing(db_path):
    assert db.get_position("AAPL") is None


def test_record_trade_is_atomic(db_path):
    db.record_trade("AAPL", "buy", 10, 100.0, 9000.0, 10, 100.0)
    # An invalid side violates the trades CHECK constraint, which runs last;
    # the cash and position writes before it must be rolled back.
    with pytest.raises(sqlite3.IntegrityError):
        db.record_trade("AAPL", "hold", 5, 100.0, 1.0, 999, 1.0)
    assert db.get_cash() == 9000.0
    pos = db.get_position("AAPL")
    assert pos["quantity"] == 10.0
    assert pos["avg_cost"] == 100.0
    assert _trade_count(db_path) == 1


def test_atomic_rollback_of_delete(db_path):
    db.record_trade("AAPL", "buy", 10, 100.0, 9000.0, 10, 100.0)
    with pytest.raises(sqlite3.IntegrityError):
        db.record_trade("AAPL", "bogus", 10, 100.0, 10000.0, 0, 0.0)
    assert db.get_position("AAPL") is not None
    assert db.get_cash() == 9000.0


def test_positions_ordered_by_ticker(db_path):
    db.record_trade("TSLA", "buy", 1, 10.0, 9990.0, 1, 10.0)
    db.record_trade("AAPL", "buy", 1, 10.0, 9980.0, 1, 10.0)
    assert [p["ticker"] for p in db.get_positions()] == ["AAPL", "TSLA"]


def test_tracked_tickers_is_union(db_path):
    assert db.get_tracked_tickers() == db.DEFAULT_TICKERS
    db.record_trade("PYPL", "buy", 1, 50.0, 9950.0, 1, 50.0)
    db.record_trade("AAPL", "buy", 1, 50.0, 9900.0, 1, 50.0)
    tracked = db.get_tracked_tickers()
    assert tracked == db.DEFAULT_TICKERS + ["PYPL"]
    assert len(tracked) == len(set(tracked))


def test_tracked_keeps_held_ticker_removed_from_watchlist(db_path):
    db.record_trade("AAPL", "buy", 1, 50.0, 9950.0, 1, 50.0)
    db.remove_from_watchlist("AAPL")
    assert "AAPL" in db.get_tracked_tickers()
    db.record_trade("AAPL", "sell", 1, 50.0, 10000.0, 0, 0.0)
    assert "AAPL" not in db.get_tracked_tickers()
