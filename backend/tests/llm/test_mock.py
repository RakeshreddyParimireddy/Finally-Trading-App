"""Deterministic mock rules (API_CONTRACT §7)."""

import pytest

from app.llm.mock import GREETING, mock_response


def _trade(r):
    assert len(r.trades) == 1 and r.watchlist_changes == []
    t = r.trades[0]
    return t.side, t.quantity, t.ticker


@pytest.mark.parametrize("msg,expected,text", [
    ("buy 5 NVDA", ("buy", 5.0, "NVDA"), "Mock: executing buy 5 NVDA."),
    ("Please BUY 2.5 msft now", ("buy", 2.5, "MSFT"), "Mock: executing buy 2.5 MSFT."),
    ("buy 3 shares of tsla", ("buy", 3.0, "TSLA"), "Mock: executing buy 3 TSLA."),
    ("buy", ("buy", 1.0, "AAPL"), "Mock: executing buy 1 AAPL."),
    ("I want to buy something", ("buy", 1.0, "AAPL"), "Mock: executing buy 1 AAPL."),
    ("sell 2 AAPL", ("sell", 2.0, "AAPL"), "Mock: executing sell 2 AAPL."),
    ("SELL", ("sell", 1.0, "AAPL"), "Mock: executing sell 1 AAPL."),
])
def test_trade_rules(msg, expected, text):
    r = mock_response(msg)
    assert _trade(r) == expected
    assert r.message == text


def test_buy_takes_precedence_over_sell():
    assert _trade(mock_response("sell 2 AAPL then buy 1 NVDA"))[0] == "buy"


@pytest.mark.parametrize("msg,action,ticker", [
    ("watch pypl", "add", "PYPL"),
    ("Add BRK.B to my list", "add", "BRK.B"),
    ("unwatch V", "remove", "V"),
    ("remove netflix", "remove", "NETFLIX"),
])
def test_watchlist_rules(msg, action, ticker):
    r = mock_response(msg)
    assert r.trades == []
    assert [(c.action, c.ticker) for c in r.watchlist_changes] == [(action, ticker)]
    assert r.message == f"Mock: executing {action} {ticker}."


@pytest.mark.parametrize("msg", ["hello", "how is my portfolio?", "", "buyer beware"])
def test_fallback_greeting(msg):
    r = mock_response(msg)
    assert r.message == GREETING
    assert r.trades == [] and r.watchlist_changes == []
