"""Chat flow against the real app.db and app.services (mock LLM, no network)."""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

db = pytest.importorskip("app.db")
pytest.importorskip("app.services")
context = pytest.importorskip("app.context")

from app.llm.router import router  # noqa: E402
from app.market import PriceCache  # noqa: E402


class StubSource:
    """Minimal MarketDataSource: tracks tickers, prices come from the cache directly."""

    def __init__(self, cache):
        self.cache = cache
        self.tickers: set[str] = set()

    async def start(self, tickers):
        self.tickers.update(tickers)

    async def stop(self):
        pass

    async def add_ticker(self, ticker):
        self.tickers.add(ticker)

    async def remove_ticker(self, ticker):
        self.tickers.discard(ticker)

    def get_tickers(self):
        return sorted(self.tickers)


@pytest.fixture
def http(tmp_path, monkeypatch):
    monkeypatch.setenv("LLM_MOCK", "true")
    monkeypatch.setenv("FINALLY_DB_PATH", str(tmp_path / "chat.db"))
    db.init_db(tmp_path / "chat.db")
    cache = PriceCache()
    for t, p in {"AAPL": 190.0, "NVDA": 880.0}.items():
        cache.update(t, p)
    app = FastAPI()
    app.include_router(router)
    app.state.ctx = context.AppContext(price_cache=cache, market_source=StubSource(cache))
    yield TestClient(app)
    db.set_db_path(None)


def test_buy_and_sell_through_real_services(http):
    body = http.post("/api/chat", json={"message": "buy 2 AAPL"}).json()
    assert body["actions"]["trades"][0]["status"] == "executed"
    assert body["actions"]["trades"][0]["price"] == 190.0
    assert db.get_position("AAPL")["quantity"] == 2.0
    assert db.get_cash() == pytest.approx(10000.0 - 380.0)

    body = http.post("/api/chat", json={"message": "sell 5 AAPL"}).json()
    trade = body["actions"]["trades"][0]
    assert trade["status"] == "failed" and "Insufficient shares" in trade["error"]
    assert "Some actions could not be completed:\n- sell 5 AAPL: Insufficient shares" in body["content"]

    body = http.post("/api/chat", json={"message": "buy 100 NVDA"}).json()
    assert body["actions"]["trades"][0]["error"].startswith("Insufficient cash")


def test_watchlist_and_history_through_real_db(http):
    http.post("/api/chat", json={"message": "watch PYPL"})
    assert "PYPL" in db.get_watchlist()
    body = http.post("/api/chat", json={"message": "remove ZZZ"}).json()
    assert body["actions"]["watchlist_changes"][0]["status"] == "failed"

    rows = http.get("/api/chat/history").json()
    assert [m["role"] for m in rows] == ["user", "assistant"] * 2
    assert rows[0]["actions"] is None
    assert rows[1]["actions"]["watchlist_changes"][0] == {
        "ticker": "PYPL", "action": "add", "status": "executed"}
