from fastapi.testclient import TestClient

from app.main import create_app

PORTFOLIO_KEYS = {"cash_balance", "positions", "positions_value", "total_value", "unrealized_pnl"}
POSITION_KEYS = {
    "ticker",
    "quantity",
    "avg_cost",
    "current_price",
    "market_value",
    "cost_basis",
    "unrealized_pnl",
    "unrealized_pnl_percent",
}
WATCH_KEYS = {
    "ticker",
    "price",
    "previous_price",
    "session_open",
    "session_change_percent",
    "direction",
}


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_lifespan_starts_and_stops_source(tmp_path, monkeypatch, fake_ctx):
    monkeypatch.setenv("FINALLY_DB_PATH", str(tmp_path / "x.db"))
    app = create_app(ctx=fake_ctx, snapshot_interval=3600, static_dir=tmp_path / "none")
    with TestClient(app):
        assert fake_ctx.market_source.started
        assert len(fake_ctx.market_source.get_tickers()) == 10
    assert fake_ctx.market_source.stopped


def test_startup_snapshot(client):
    r = client.get("/api/portfolio/history")
    assert r.status_code == 200
    hist = r.json()
    assert len(hist) == 1
    assert hist[0]["total_value"] == 10000.0
    assert set(hist[0]) == {"total_value", "recorded_at"}


def test_get_watchlist(client):
    r = client.get("/api/watchlist")
    assert r.status_code == 200
    wl = r.json()
    assert len(wl) == 10
    assert wl[0]["ticker"] == "AAPL"
    assert all(set(row) == WATCH_KEYS for row in wl)


def test_add_and_remove_watchlist(client):
    r = client.post("/api/watchlist", json={"ticker": "pypl"})
    assert r.status_code == 200
    assert r.json()[-1]["ticker"] == "PYPL"
    # idempotent
    r = client.post("/api/watchlist", json={"ticker": "PYPL"})
    assert r.status_code == 200
    assert [x["ticker"] for x in r.json()].count("PYPL") == 1
    r = client.delete("/api/watchlist/pypl")
    assert r.status_code == 200
    assert "PYPL" not in [x["ticker"] for x in r.json()]
    r = client.delete("/api/watchlist/PYPL")
    assert r.status_code == 404
    assert isinstance(r.json()["detail"], str)


def test_add_watchlist_bad_ticker(client):
    r = client.post("/api/watchlist", json={"ticker": "bad ticker!"})
    assert r.status_code == 400
    assert isinstance(r.json()["detail"], str)


def test_add_watchlist_missing_or_empty_is_400(client):
    for payload in ({}, {"ticker": ""}, {"ticker": "   "}, {"ticker": None}, {"ticker": 12}):
        r = client.post("/api/watchlist", json=payload)
        assert r.status_code == 400, payload
        assert isinstance(r.json()["detail"], str)
    r = client.post("/api/watchlist", content=b"not json", headers={"content-type": "application/json"})
    assert r.status_code == 400


def test_get_portfolio(client):
    r = client.get("/api/portfolio")
    assert r.status_code == 200
    body = r.json()
    assert set(body) == PORTFOLIO_KEYS
    assert body["cash_balance"] == 10000.0
    assert body["positions"] == []


def test_trade_buy_and_sell(client):
    r = client.post("/api/portfolio/trade", json={"ticker": "AAPL", "side": "buy", "quantity": 10})
    assert r.status_code == 200
    body = r.json()
    assert set(body) == {"trade", "portfolio"}
    assert set(body["trade"]) == {"id", "ticker", "side", "quantity", "price", "executed_at"}
    assert set(body["portfolio"]) == PORTFOLIO_KEYS
    assert set(body["portfolio"]["positions"][0]) == POSITION_KEYS
    assert body["portfolio"]["cash_balance"] == 8100.0

    r = client.post("/api/portfolio/trade", json={"ticker": "AAPL", "side": "sell", "quantity": 10})
    assert r.status_code == 200
    assert r.json()["portfolio"]["positions"] == []
    assert r.json()["portfolio"]["cash_balance"] == 10000.0

    # startup snapshot + one per trade
    assert len(client.get("/api/portfolio/history").json()) == 3


def test_trade_errors(client):
    cases = [
        ({"ticker": "AAPL", "side": "buy", "quantity": 1000}, 400, "Insufficient cash"),
        ({"ticker": "AAPL", "side": "sell", "quantity": 1}, 400, "Insufficient shares"),
        ({"ticker": "AAPL", "side": "hold", "quantity": 1}, 400, "Invalid side"),
        ({"ticker": "AAPL", "side": "buy", "quantity": 0}, 400, "Quantity"),
        ({"ticker": "AAPL", "side": "buy", "quantity": "x"}, 400, "Quantity"),
        ({"ticker": "123", "side": "buy", "quantity": 1}, 400, "Invalid ticker"),
        ({"ticker": "ZZZZ", "side": "buy", "quantity": 1}, 409, "Price unavailable for ZZZZ"),
        ({"ticker": "PYPL", "side": "sell", "quantity": 5}, 409, "Price unavailable for PYPL"),
        ({"ticker": "AAPL", "side": "buy"}, 400, "quantity"),
        ({"side": "buy", "quantity": 1}, 400, "ticker"),
        ({"ticker": "", "side": "buy", "quantity": 1}, 400, "Invalid ticker"),
        ({"ticker": None, "side": "buy", "quantity": 1}, 400, "Ticker"),
    ]
    for payload, status, fragment in cases:
        r = client.post("/api/portfolio/trade", json=payload)
        assert r.status_code == status, (payload, r.text)
        detail = r.json()["detail"]
        assert isinstance(detail, str)
        assert fragment in detail, (payload, detail)


def test_stream_route_registered(client):
    paths = [getattr(r, "path", None) for r in client.app.routes]
    assert paths.count("/api/stream/prices") == 1


def test_create_app_twice_no_duplicate_routes(tmp_path, fake_ctx):
    create_app(ctx=fake_ctx, static_dir=tmp_path / "none")
    app = create_app(ctx=fake_ctx, static_dir=tmp_path / "none")
    paths = [getattr(r, "path", None) for r in app.routes]
    assert paths.count("/api/stream/prices") == 1
    assert paths.count("/api/portfolio/trade") == 1


def test_static_mount(tmp_path, monkeypatch, fake_ctx):
    monkeypatch.setenv("FINALLY_DB_PATH", str(tmp_path / "s.db"))
    static = tmp_path / "static"
    static.mkdir()
    (static / "index.html").write_text("<html>FinAlly</html>")
    app = create_app(ctx=fake_ctx, snapshot_interval=3600, static_dir=static)
    with TestClient(app) as c:
        r = c.get("/")
        assert r.status_code == 200
        assert "FinAlly" in r.text
        # API routes still win over the static mount
        assert c.get("/api/health").json() == {"status": "ok"}


def test_unknown_api_path_is_json_404_with_static_404_page(tmp_path, monkeypatch, fake_ctx):
    monkeypatch.setenv("FINALLY_DB_PATH", str(tmp_path / "s.db"))
    static = tmp_path / "static"
    static.mkdir()
    (static / "index.html").write_text("<html>FinAlly</html>")
    (static / "404.html").write_text("<html>Next 404</html>")
    app = create_app(ctx=fake_ctx, snapshot_interval=3600, static_dir=static)
    with TestClient(app) as c:
        for method in ("get", "post", "delete"):
            r = getattr(c, method)("/api/nope/deeper")
            assert r.status_code == 404
            assert r.headers["content-type"].startswith("application/json")
            assert r.json() == {"detail": "Not Found"}
        # Real API routes and the static site are unaffected
        assert c.get("/api/health").json() == {"status": "ok"}
        assert c.get("/api/chat/history").status_code == 200
        assert "FinAlly" in c.get("/").text
        assert c.get("/missing-page").status_code == 404
