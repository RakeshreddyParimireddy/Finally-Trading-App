"""Tests for session_open / session_change_percent and the stream router factory."""

from fastapi import FastAPI

from app.market import PriceCache, PriceUpdate, create_stream_router


class TestPriceUpdateSession:
    def test_session_fields_in_to_dict(self):
        u = PriceUpdate(
            ticker="AAPL", price=190.5, previous_price=190.42, timestamp=1.0, session_open=189.0
        )
        d = u.to_dict()
        assert d["session_open"] == 189.0
        assert d["session_change_percent"] == round((190.5 - 189.0) / 189.0 * 100, 4)

    def test_session_open_defaults_to_previous_price(self):
        u = PriceUpdate(ticker="AAPL", price=101.0, previous_price=100.0, timestamp=1.0)
        assert u.session_open is None
        assert u.to_dict()["session_open"] == 100.0
        assert u.session_change_percent == 1.0

    def test_zero_session_open(self):
        u = PriceUpdate(ticker="X", price=5.0, previous_price=5.0, timestamp=1.0, session_open=0.0)
        assert u.session_change_percent == 0.0


class TestPriceCacheSession:
    def test_first_price_is_session_open(self):
        cache = PriceCache()
        first = cache.update("AAPL", 100.0)
        assert first.session_open == 100.0
        assert first.session_change_percent == 0.0
        cache.update("AAPL", 105.0)
        latest = cache.update("AAPL", 110.0)
        assert latest.session_open == 100.0
        assert latest.session_change_percent == 10.0
        assert cache.get_session_open("AAPL") == 100.0

    def test_session_open_per_ticker(self):
        cache = PriceCache()
        cache.update("AAPL", 100.0)
        cache.update("MSFT", 400.0)
        assert cache.get("MSFT").session_open == 400.0
        assert cache.get_session_open("NOPE") is None

    def test_session_open_survives_remove(self):
        cache = PriceCache()
        cache.update("AAPL", 100.0)
        cache.remove("AAPL")
        u = cache.update("AAPL", 120.0)
        assert u.session_open == 100.0
        assert u.previous_price == 120.0

    def test_session_open_rounded(self):
        cache = PriceCache()
        u = cache.update("AAPL", 100.123456)
        assert u.session_open == 100.12


class TestStreamRouterFactory:
    def test_called_twice_does_not_duplicate_routes(self):
        r1 = create_stream_router(PriceCache())
        r2 = create_stream_router(PriceCache())
        assert r1 is not r2
        assert len(r1.routes) == 1
        assert len(r2.routes) == 1

    def test_mounts_prices_path(self):
        app = FastAPI()
        app.include_router(create_stream_router(PriceCache()))
        paths = [getattr(r, "path", None) for r in app.routes]
        assert paths.count("/api/stream/prices") == 1
