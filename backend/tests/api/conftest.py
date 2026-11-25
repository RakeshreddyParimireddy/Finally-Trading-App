import pytest
from fastapi.testclient import TestClient

from app.context import AppContext
from app.main import create_app
from app.market import PriceCache
from tests.services.fakes import FakeMarketSource


@pytest.fixture
def fake_ctx():
    cache = PriceCache()
    return AppContext(price_cache=cache, market_source=FakeMarketSource(cache))


@pytest.fixture
def client(tmp_path, monkeypatch, fake_ctx):
    monkeypatch.setenv("FINALLY_DB_PATH", str(tmp_path / "finally.db"))
    app = create_app(ctx=fake_ctx, snapshot_interval=3600, static_dir=tmp_path / "no-static")
    with TestClient(app) as c:  # runs the lifespan (init_db, source.start, snapshot)
        yield c
