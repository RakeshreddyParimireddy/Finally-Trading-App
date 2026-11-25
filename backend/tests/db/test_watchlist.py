"""Watchlist CRUD."""

from app import db


def test_add_new_ticker_appends_in_order(db_path):
    assert db.add_to_watchlist("PYPL") is True
    assert db.add_to_watchlist("AMD") is True
    assert db.get_watchlist()[-2:] == ["PYPL", "AMD"]


def test_add_duplicate_returns_false(db_path):
    assert db.add_to_watchlist("AAPL") is False
    assert db.add_to_watchlist("PYPL") is True
    assert db.add_to_watchlist("PYPL") is False
    assert db.get_watchlist().count("PYPL") == 1


def test_remove(db_path):
    assert db.remove_from_watchlist("AAPL") is True
    assert "AAPL" not in db.get_watchlist()
    assert db.remove_from_watchlist("AAPL") is False
    assert db.remove_from_watchlist("ZZZZ") is False


def test_readd_goes_to_end(db_path):
    db.remove_from_watchlist("AAPL")
    db.add_to_watchlist("AAPL")
    assert db.get_watchlist()[-1] == "AAPL"


def test_user_isolation(db_path):
    assert db.add_to_watchlist("PYPL", user_id="other") is True
    assert db.get_watchlist(user_id="other") == ["PYPL"]
    assert "PYPL" not in db.get_watchlist()
